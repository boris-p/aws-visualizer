import { describe, it, expect, beforeEach } from 'vitest'
import { SimulationStateStore } from '../simulation-state-store'

// Simple test state shape
interface TestState {
  nodes: Map<string, { id: string; status: string }>
  tokens: Map<string, { id: string; position: number }>
  counter: number
}

function createInitialState(): TestState {
  return {
    nodes: new Map(),
    tokens: new Map(),
    counter: 0,
  }
}

describe('SimulationStateStore', () => {
  let store: SimulationStateStore<TestState>

  beforeEach(() => {
    store = new SimulationStateStore(createInitialState())
  })

  describe('basic operations', () => {
    it('initializes with provided state', () => {
      const state = store.getState()
      expect(state.nodes.size).toBe(0)
      expect(state.tokens.size).toBe(0)
      expect(state.counter).toBe(0)
    })

    it('getState returns current state', () => {
      const state = store.getState()
      expect(state).toBeDefined()
      expect(state.nodes).toBeInstanceOf(Map)
    })

    it('getTimeMs returns current time', () => {
      expect(store.getTimeMs()).toBe(0)
    })

    it('updateSlice modifies only the specified slice', () => {
      store.updateSlice('counter', () => 5)

      const state = store.getState()
      expect(state.counter).toBe(5)
      expect(state.nodes.size).toBe(0)
      expect(state.tokens.size).toBe(0)
    })

    it('updateSlice preserves other slices (same reference)', () => {
      const stateBefore = store.getState()
      const nodesBefore = stateBefore.nodes
      const tokensBefore = stateBefore.tokens

      store.updateSlice('counter', () => 10)

      const stateAfter = store.getState()
      // Nodes and tokens should be same reference (structural sharing)
      expect(stateAfter.nodes).toBe(nodesBefore)
      expect(stateAfter.tokens).toBe(tokensBefore)
      // Counter changed
      expect(stateAfter.counter).toBe(10)
    })

    it('multiple updateSlice calls accumulate correctly', () => {
      store.updateSlice('counter', () => 1)
      store.updateSlice('counter', (c) => c + 1)
      store.updateSlice('counter', (c) => c + 1)

      expect(store.getState().counter).toBe(3)
    })

    it('updateSlice with Map creates new reference', () => {
      const nodesBefore = store.getState().nodes

      store.updateSlice('nodes', (nodes) => {
        const next = new Map(nodes)
        next.set('n1', { id: 'n1', status: 'available' })
        return next
      })

      const nodesAfter = store.getState().nodes
      expect(nodesAfter).not.toBe(nodesBefore)
      expect(nodesAfter.get('n1')?.status).toBe('available')
    })

    it('updateSlice does not create new state if slice unchanged', () => {
      const stateBefore = store.getState()

      // Return same reference - no change
      store.updateSlice('nodes', (nodes) => nodes)

      const stateAfter = store.getState()
      expect(stateAfter).toBe(stateBefore)
    })
  })

  describe('checkpointing', () => {
    it('checkpoint saves state at specified time', () => {
      store.updateSlice('counter', () => 5)
      store.checkpoint(1000)

      expect(store.getCheckpointCount()).toBe(1)
      expect(store.getTimeMs()).toBe(1000)
    })

    it('checkpoint times are retrievable', () => {
      store.checkpoint(1000)
      store.checkpoint(2000)
      store.checkpoint(3000)

      expect(store.getCheckpointTimes()).toEqual([1000, 2000, 3000])
    })

    it('restoreTo finds exact checkpoint', () => {
      store.updateSlice('counter', () => 1)
      store.checkpoint(1000)

      store.updateSlice('counter', () => 2)
      store.checkpoint(2000)

      store.updateSlice('counter', () => 3)
      store.checkpoint(3000)

      const result = store.restoreTo(2000)

      expect(result.checkpointTimeMs).toBe(2000)
      expect(store.getState().counter).toBe(2)
      expect(store.getTimeMs()).toBe(2000)
    })

    it('restoreTo finds checkpoint before target time', () => {
      store.updateSlice('counter', () => 1)
      store.checkpoint(1000)

      store.updateSlice('counter', () => 2)
      store.checkpoint(2000)

      // Target between checkpoints
      const result = store.restoreTo(1500)

      expect(result.checkpointTimeMs).toBe(1000)
      expect(store.getState().counter).toBe(1)
    })

    it('restoreTo returns checkpoint time', () => {
      store.checkpoint(1000)
      store.checkpoint(2000)

      const result = store.restoreTo(1800)
      expect(result.checkpointTimeMs).toBe(1000)
    })

    it('restoreTo to time 0 works', () => {
      store.updateSlice('counter', () => 5)
      store.checkpoint(1000)

      const result = store.restoreTo(0)

      expect(result.checkpointTimeMs).toBe(0)
      expect(store.getState().counter).toBe(0) // Initial state
    })

    it('restoreTo to time after all checkpoints uses last', () => {
      store.updateSlice('counter', () => 1)
      store.checkpoint(1000)

      store.updateSlice('counter', () => 2)
      store.checkpoint(2000)

      const result = store.restoreTo(5000)

      expect(result.checkpointTimeMs).toBe(2000)
      expect(store.getState().counter).toBe(2)
    })

    it('restoreTo with no checkpoints returns initial state', () => {
      store.updateSlice('counter', () => 5)

      const result = store.restoreTo(1000)

      expect(result.checkpointTimeMs).toBe(0)
      expect(store.getState().counter).toBe(0)
    })

    it('restoreTo negative time returns initial state', () => {
      store.updateSlice('counter', () => 5)
      store.checkpoint(1000)

      const result = store.restoreTo(-500)

      expect(result.checkpointTimeMs).toBe(0)
      expect(store.getState().counter).toBe(0)
    })

    it('clearCheckpoints removes all checkpoints', () => {
      store.updateSlice('counter', () => 5)
      store.checkpoint(1000)
      store.checkpoint(2000)
      store.checkpoint(3000)

      store.clearCheckpoints()

      expect(store.getCheckpointCount()).toBe(0)
      expect(store.getCheckpointTimes()).toEqual([])
      expect(store.getTimeMs()).toBe(0)
      expect(store.getState().counter).toBe(0)
    })
  })

  describe('structural sharing', () => {
    it('unchanged slices share references between checkpoints', () => {
      const initialNodes = store.getState().nodes

      // Only update counter, not nodes
      store.updateSlice('counter', () => 1)
      store.checkpoint(1000)

      store.updateSlice('counter', () => 2)
      store.checkpoint(2000)

      // Restore to first checkpoint
      store.restoreTo(1000)
      const nodesAt1000 = store.getState().nodes

      // Restore to second checkpoint
      store.restoreTo(2000)
      const nodesAt2000 = store.getState().nodes

      // Nodes unchanged - should be same reference
      expect(nodesAt1000).toBe(initialNodes)
      expect(nodesAt2000).toBe(initialNodes)
    })

    it('changed slices have new references', () => {
      store.checkpoint(0) // Initial checkpoint

      store.updateSlice('nodes', (nodes) => {
        const next = new Map(nodes)
        next.set('n1', { id: 'n1', status: 'available' })
        return next
      })
      store.checkpoint(1000)

      store.restoreTo(0)
      const nodesAt0 = store.getState().nodes

      store.restoreTo(1000)
      const nodesAt1000 = store.getState().nodes

      expect(nodesAt1000).not.toBe(nodesAt0)
      expect(nodesAt0.size).toBe(0)
      expect(nodesAt1000.size).toBe(1)
    })

    it('objects within unchanged Maps share references', () => {
      // Add a node
      store.updateSlice('nodes', (nodes) => {
        const next = new Map(nodes)
        next.set('n1', { id: 'n1', status: 'available' })
        return next
      })
      store.checkpoint(1000)

      // Update only counter (not nodes)
      store.updateSlice('counter', () => 5)
      store.checkpoint(2000)

      // Both checkpoints should have same node object reference
      store.restoreTo(1000)
      const nodeAt1000 = store.getState().nodes.get('n1')

      store.restoreTo(2000)
      const nodeAt2000 = store.getState().nodes.get('n1')

      expect(nodeAt1000).toBe(nodeAt2000)
    })
  })

  describe('time travel determinism', () => {
    it('state at time T is same via any seek path', () => {
      // Build up state over time
      store.updateSlice('counter', () => 1)
      store.updateSlice('nodes', (n) => new Map(n).set('a', { id: 'a', status: 'ok' }))
      store.checkpoint(1000)

      store.updateSlice('counter', () => 2)
      store.checkpoint(2000)

      store.updateSlice('counter', () => 3)
      store.checkpoint(3000)

      store.updateSlice('counter', () => 4)
      store.checkpoint(4000)

      // Path 1: direct to t=2000
      store.restoreTo(2000)
      const s1Counter = store.getState().counter
      const s1Nodes = store.getState().nodes

      // Path 2: t=4000 then t=2000
      store.restoreTo(4000)
      store.restoreTo(2000)
      const s2Counter = store.getState().counter
      const s2Nodes = store.getState().nodes

      // Path 3: t=1000 then t=2000
      store.restoreTo(1000)
      store.restoreTo(2000)
      const s3Counter = store.getState().counter
      const s3Nodes = store.getState().nodes

      expect(s1Counter).toBe(s2Counter)
      expect(s2Counter).toBe(s3Counter)

      // With structural sharing, unchanged slices should be same reference
      expect(s1Nodes).toBe(s2Nodes)
      expect(s2Nodes).toBe(s3Nodes)
    })

    it('forward-backward-forward produces consistent state', () => {
      store.updateSlice('counter', () => 1)
      store.checkpoint(1000)

      store.updateSlice('counter', () => 2)
      store.checkpoint(2000)

      store.updateSlice('counter', () => 3)
      store.checkpoint(3000)

      // Forward to 3000
      store.restoreTo(3000)
      expect(store.getState().counter).toBe(3)

      // Backward to 1000
      store.restoreTo(1000)
      expect(store.getState().counter).toBe(1)

      // Forward to 2000
      store.restoreTo(2000)
      expect(store.getState().counter).toBe(2)

      // Back to 3000
      store.restoreTo(3000)
      expect(store.getState().counter).toBe(3)
    })

    it('multiple rapid seeks produce correct state', () => {
      for (let i = 1; i <= 10; i++) {
        store.updateSlice('counter', () => i)
        store.checkpoint(i * 1000)
      }

      // Rapid random seeks
      store.restoreTo(5000)
      expect(store.getState().counter).toBe(5)

      store.restoreTo(8000)
      expect(store.getState().counter).toBe(8)

      store.restoreTo(2000)
      expect(store.getState().counter).toBe(2)

      store.restoreTo(10000)
      expect(store.getState().counter).toBe(10)

      store.restoreTo(1000)
      expect(store.getState().counter).toBe(1)

      store.restoreTo(7000)
      expect(store.getState().counter).toBe(7)
    })
  })

  describe('edge cases', () => {
    it('handles many checkpoints efficiently', () => {
      // Create 100 checkpoints
      for (let i = 0; i < 100; i++) {
        store.updateSlice('counter', () => i)
        store.checkpoint(i * 100)
      }

      expect(store.getCheckpointCount()).toBe(100)

      // Seek should still be fast (binary search)
      store.restoreTo(5050) // Between 50 and 51
      expect(store.getState().counter).toBe(50)

      store.restoreTo(9900)
      expect(store.getState().counter).toBe(99)

      store.restoreTo(50)
      expect(store.getState().counter).toBe(0)
    })

    it('handles duplicate checkpoint times by using latest', () => {
      store.updateSlice('counter', () => 1)
      store.checkpoint(1000)

      store.updateSlice('counter', () => 2)
      store.checkpoint(1000) // Same time!

      // Should use the latest checkpoint at 1000
      store.restoreTo(1000)
      expect(store.getState().counter).toBe(2)
    })

    it('setTimeMs updates time without affecting state', () => {
      store.updateSlice('counter', () => 5)

      store.setTimeMs(1000)

      expect(store.getTimeMs()).toBe(1000)
      expect(store.getState().counter).toBe(5)
    })

    it('getInitialState returns the original state', () => {
      store.updateSlice('counter', () => 100)
      store.checkpoint(1000)

      const initial = store.getInitialState()
      expect(initial.counter).toBe(0)
    })
  })
})
