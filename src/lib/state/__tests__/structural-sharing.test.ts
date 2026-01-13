import { describe, it, expect, beforeEach } from 'vitest'
import { SimulationStateStore } from '../simulation-state-store'
import type { SimulationState } from '../types'
import { createInitialSimulationState } from '../types'
import type { Token } from '@/types/token'
import type { NodeState } from '@/types/graph'

describe('Structural Sharing Memory Efficiency', () => {
  let store: SimulationStateStore<SimulationState>

  beforeEach(() => {
    store = new SimulationStateStore(createInitialSimulationState())
  })

  it('shares unchanged Map references', () => {
    const initialNodes = store.getState().nodes
    const initialWaitPoints = store.getState().waitPoints

    // Only update tokens
    const token: Token = {
      id: 'token-1',
      typeId: 'http-request',
      path: ['a', 'b', 'c'],
      currentEdgeIndex: 0,
      status: 'traveling',
      emittedAtMs: 0,
      currentSegmentStartMs: 0,
      currentSegmentDurationMs: 1000,
      progress: 0,
    }

    store.updateSlice('tokens', (t) => new Map(t).set('token-1', token))
    store.checkpoint(1000)

    // Verify structural sharing - nodes unchanged, same reference
    expect(store.getState().nodes).toBe(initialNodes)
    expect(store.getState().waitPoints).toBe(initialWaitPoints)

    // Tokens changed - different reference
    expect(store.getState().tokens).not.toBe(new Map())
    expect(store.getState().tokens.get('token-1')).toBe(token)
  })

  it('maintains references across checkpoint restores', () => {
    // Create initial state with a node
    const node: NodeState = {
      id: 'node-1',
      status: 'available',
      isAnimating: false,
    }
    store.updateSlice('nodes', (n) => new Map(n).set('node-1', node))
    store.checkpoint(1000) // First checkpoint has the node

    // Add a token (nodes unchanged)
    const token: Token = {
      id: 'token-1',
      typeId: 'http-request',
      path: ['a', 'b'],
      currentEdgeIndex: 0,
      status: 'traveling',
      emittedAtMs: 0,
      currentSegmentStartMs: 0,
      currentSegmentDurationMs: 1000,
      progress: 0,
    }
    store.updateSlice('tokens', (t) => new Map(t).set('token-1', token))
    store.checkpoint(2000)

    // Update node (tokens unchanged from 2000)
    store.updateSlice('nodes', (n) => {
      const next = new Map(n)
      next.set('node-1', { ...node, status: 'unavailable' })
      return next
    })
    store.checkpoint(3000)

    // Get references at each checkpoint
    store.restoreTo(1000)
    const nodesAt1000 = store.getState().nodes
    const tokensAt1000 = store.getState().tokens

    store.restoreTo(2000)
    const nodesAt2000 = store.getState().nodes
    const tokensAt2000 = store.getState().tokens

    store.restoreTo(3000)
    const nodesAt3000 = store.getState().nodes
    const tokensAt3000 = store.getState().tokens

    // Nodes: same at 1000 and 2000 (only token changed), different at 3000
    expect(nodesAt1000).toBe(nodesAt2000)
    expect(nodesAt2000).not.toBe(nodesAt3000)

    // Tokens: different at 1000 and 2000, same at 2000 and 3000 (only node changed)
    expect(tokensAt1000).not.toBe(tokensAt2000)
    expect(tokensAt2000).toBe(tokensAt3000)
  })

  it('shares object references within Maps', () => {
    const node: NodeState = {
      id: 'node-1',
      status: 'available',
      isAnimating: false,
    }

    store.updateSlice('nodes', (n) => new Map(n).set('node-1', node))
    store.checkpoint(1000)

    // Add processedEventId (nodes map unchanged)
    store.updateSlice('processedEventIds', (ids) => new Set(ids).add('event-1'))
    store.checkpoint(2000)

    // The node object itself should be the same reference at both checkpoints
    store.restoreTo(1000)
    const nodeRef1 = store.getState().nodes.get('node-1')

    store.restoreTo(2000)
    const nodeRef2 = store.getState().nodes.get('node-1')

    expect(nodeRef1).toBe(nodeRef2)
    expect(nodeRef1).toBe(node) // Still the original object
  })

  it('memory grows O(changes) not O(checkpoints * size)', () => {
    // Create a large initial state
    const initialNodes = new Map<string, NodeState>()
    for (let i = 0; i < 100; i++) {
      initialNodes.set(`node-${i}`, {
        id: `node-${i}`,
        status: 'available',
        isAnimating: false,
      })
    }
    store.updateSlice('nodes', () => initialNodes)
    store.checkpoint(0)

    // Track unique node Map references
    const uniqueNodeRefs = new Set<Map<string, NodeState>>()
    uniqueNodeRefs.add(store.getState().nodes)

    // Create 50 checkpoints, only changing counter (not nodes)
    for (let i = 1; i <= 50; i++) {
      store.updateSlice('processedEventIds', (ids) => new Set(ids).add(`event-${i}`))
      store.checkpoint(i * 1000)

      // All checkpoints should share the same nodes Map reference
      store.restoreTo(i * 1000)
      uniqueNodeRefs.add(store.getState().nodes)
    }

    // Should only have 1 unique nodes Map (structural sharing)
    expect(uniqueNodeRefs.size).toBe(1)

    // Now make one nodes change
    store.updateSlice('nodes', (n) => {
      const next = new Map(n)
      next.set('node-0', { ...n.get('node-0')!, status: 'unavailable' })
      return next
    })
    store.checkpoint(51000)
    uniqueNodeRefs.add(store.getState().nodes)

    // Now should have 2 unique nodes Maps
    expect(uniqueNodeRefs.size).toBe(2)
  })

  it('Set updates create new references', () => {
    store.checkpoint(0)

    store.updateSlice('processedEventIds', (ids) => new Set(ids).add('e1'))
    store.checkpoint(1000)

    store.restoreTo(0)
    const idsAt0 = store.getState().processedEventIds

    store.restoreTo(1000)
    const idsAt1000 = store.getState().processedEventIds

    expect(idsAt0).not.toBe(idsAt1000)
    expect(idsAt0.size).toBe(0)
    expect(idsAt1000.size).toBe(1)
  })

  it('algorithmState changes preserve other slices', () => {
    const node: NodeState = {
      id: 'node-1',
      status: 'available',
      isAnimating: false,
    }
    store.updateSlice('nodes', (n) => new Map(n).set('node-1', node))
    const nodesRef = store.getState().nodes
    store.checkpoint(1000)

    // Update algorithm state (heavy data)
    store.updateSlice('algorithmState', (s) => {
      const next = new Map(s)
      next.set('routingTable', { routes: new Array(1000).fill('route') })
      return next
    })
    store.checkpoint(2000)

    // Nodes should still be same reference
    expect(store.getState().nodes).toBe(nodesRef)
  })

  describe('token lifecycle with structural sharing', () => {
    it('token updates only affect tokens Map', () => {
      // Setup initial state with a node
      const node: NodeState = {
        id: 'node-1',
        status: 'available',
        isAnimating: false,
      }
      store.updateSlice('nodes', (n) => new Map(n).set('node-1', node))
      store.checkpoint(1000)

      // Capture nodesRef after checkpoint
      const nodesRef = store.getState().nodes

      // Emit token
      const token: Token = {
        id: 'token-1',
        typeId: 'http-request',
        path: ['a', 'b', 'c'],
        currentEdgeIndex: 0,
        status: 'traveling',
        emittedAtMs: 1000,
        currentSegmentStartMs: 1000,
        currentSegmentDurationMs: 1500,
        progress: 0,
      }
      store.updateSlice('tokens', (t) => new Map(t).set('token-1', token))
      store.checkpoint(2000)

      // Update token position
      store.updateSlice('tokens', (t) => {
        const next = new Map(t)
        const existing = t.get('token-1')!
        next.set('token-1', { ...existing, currentEdgeIndex: 1, progress: 0 })
        return next
      })
      store.checkpoint(3000)

      // Complete token
      store.updateSlice('tokens', (t) => {
        const next = new Map(t)
        const existing = t.get('token-1')!
        next.set('token-1', { ...existing, status: 'completed' })
        return next
      })
      store.checkpoint(4000)

      // Nodes should be unchanged throughout (all checkpoints share same nodes)
      store.restoreTo(1000)
      expect(store.getState().nodes).toBe(nodesRef)

      store.restoreTo(2000)
      expect(store.getState().nodes).toBe(nodesRef)

      store.restoreTo(3000)
      expect(store.getState().nodes).toBe(nodesRef)

      store.restoreTo(4000)
      expect(store.getState().nodes).toBe(nodesRef)
    })
  })
})
