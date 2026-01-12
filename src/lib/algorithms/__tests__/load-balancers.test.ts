import { describe, it, expect, beforeEach } from 'vitest'
import {
  roundRobinLoadBalancer,
  leastConnectionsLoadBalancer
} from '../load-balancers'
import { createMockContext, createMockNodeState } from '@/lib/scenario-engine/__tests__/test-utils'

describe('roundRobinLoadBalancer', () => {
  beforeEach(() => {
    // Reset algorithm state between tests
  })

  it('cycles through candidates in order', () => {
    const candidates = ['az-1', 'az-2', 'az-3']
    const context = createMockContext()

    expect(roundRobinLoadBalancer.selectNode(candidates, context)).toBe('az-1')
    expect(roundRobinLoadBalancer.selectNode(candidates, context)).toBe('az-2')
    expect(roundRobinLoadBalancer.selectNode(candidates, context)).toBe('az-3')
    expect(roundRobinLoadBalancer.selectNode(candidates, context)).toBe('az-1')
  })

  it('skips unavailable nodes', () => {
    const candidates = ['az-1', 'az-2', 'az-3']
    const context = createMockContext({
      nodeStates: new Map([
        ['az-2', createMockNodeState({ id: 'az-2', status: 'unavailable' })]
      ])
    })

    // Should skip az-2 entirely
    expect(roundRobinLoadBalancer.selectNode(candidates, context)).toBe('az-1')
    expect(roundRobinLoadBalancer.selectNode(candidates, context)).toBe('az-3')
    expect(roundRobinLoadBalancer.selectNode(candidates, context)).toBe('az-1')
  })

  it('returns first candidate when all are unavailable', () => {
    const candidates = ['az-1', 'az-2']
    const context = createMockContext({
      nodeStates: new Map([
        ['az-1', createMockNodeState({ id: 'az-1', status: 'unavailable' })],
        ['az-2', createMockNodeState({ id: 'az-2', status: 'unavailable' })]
      ])
    })

    // Fallback to first candidate
    expect(roundRobinLoadBalancer.selectNode(candidates, context)).toBe('az-1')
  })

  it('treats degraded nodes as available', () => {
    const candidates = ['az-1', 'az-2']
    const context = createMockContext({
      nodeStates: new Map([
        ['az-1', createMockNodeState({ id: 'az-1', status: 'degraded' })]
      ])
    })

    // az-1 is degraded but still available for selection
    expect(roundRobinLoadBalancer.selectNode(candidates, context)).toBe('az-1')
    expect(roundRobinLoadBalancer.selectNode(candidates, context)).toBe('az-2')
  })
})

describe('leastConnectionsLoadBalancer', () => {
  it('selects node with fewest connections', () => {
    const candidates = ['az-1', 'az-2', 'az-3']
    const context = createMockContext()

    // First selection should pick az-1 (all have 0 connections)
    expect(leastConnectionsLoadBalancer.selectNode(candidates, context)).toBe('az-1')

    // Now az-1 has 1 connection, others have 0
    expect(leastConnectionsLoadBalancer.selectNode(candidates, context)).toBe('az-2')
    expect(leastConnectionsLoadBalancer.selectNode(candidates, context)).toBe('az-3')

    // All have 1 connection, round-robin behavior
    expect(leastConnectionsLoadBalancer.selectNode(candidates, context)).toBe('az-1')
  })

  it('skips unavailable nodes', () => {
    const candidates = ['az-1', 'az-2']
    const context = createMockContext({
      nodeStates: new Map([
        ['az-1', createMockNodeState({ id: 'az-1', status: 'unavailable' })]
      ])
    })

    // Should only select az-2
    expect(leastConnectionsLoadBalancer.selectNode(candidates, context)).toBe('az-2')
    expect(leastConnectionsLoadBalancer.selectNode(candidates, context)).toBe('az-2')
  })
})
