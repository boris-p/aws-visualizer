import { describe, it, expect, beforeEach } from 'vitest'
import { SimulationStateStore } from '../simulation-state-store'
import type { SimulationState } from '../types'
import { createInitialSimulationState, deepCloneState, statesEqual } from '../types'
import type { Token } from '@/types/token'
import type { NodeState } from '@/types/graph'

/**
 * Create a store with a realistic sequence of simulation events.
 * Simulates: tokens emitted, node failure, token completion, recovery.
 */
function createStoreWithScenario(): SimulationStateStore<SimulationState> {
  const store = new SimulationStateStore(createInitialSimulationState())

  // t=0: Initial state
  store.checkpoint(0)

  // t=1000: First token emitted
  const token1: Token = {
    id: 'token-1',
    typeId: 'http-request',
    path: ['edge', 'region', 'az1'],
    currentEdgeIndex: 0,
    status: 'traveling',
    emittedAtMs: 1000,
    currentSegmentStartMs: 1000,
    currentSegmentDurationMs: 1500,
    progress: 0,
  }
  store.updateSlice('tokens', (t) => new Map(t).set('token-1', token1))
  store.updateSlice('processedEventIds', (ids) => new Set(ids).add('emit-1'))
  store.checkpoint(1000)

  // t=2000: Second token emitted
  const token2: Token = {
    id: 'token-2',
    typeId: 'http-request',
    path: ['edge', 'region', 'az1'],
    currentEdgeIndex: 0,
    status: 'traveling',
    emittedAtMs: 2000,
    currentSegmentStartMs: 2000,
    currentSegmentDurationMs: 1500,
    progress: 0,
  }
  store.updateSlice('tokens', (t) => new Map(t).set('token-2', token2))
  store.updateSlice('processedEventIds', (ids) => new Set(ids).add('emit-2'))
  store.checkpoint(2000)

  // t=3000: Token-1 advances to next edge
  store.updateSlice('tokens', (t) => {
    const next = new Map(t)
    const existing = t.get('token-1')!
    next.set('token-1', {
      ...existing,
      currentEdgeIndex: 1,
      currentSegmentStartMs: 2500,
      progress: 0.33,
    })
    return next
  })
  store.checkpoint(3000)

  // t=4000: AZ1 fails
  const failedNode: NodeState = {
    id: 'az1',
    status: 'unavailable',
    isAnimating: false,
    sublabel: 'AZ Unavailable',
  }
  store.updateSlice('nodes', (n) => new Map(n).set('az1', failedNode))
  store.updateSlice('processedEventIds', (ids) => new Set(ids).add('fail-az1'))
  store.checkpoint(4000)

  // t=5000: Token-1 fails (reached unavailable AZ)
  store.updateSlice('tokens', (t) => {
    const next = new Map(t)
    const existing = t.get('token-1')!
    next.set('token-1', { ...existing, status: 'failed' })
    return next
  })
  store.checkpoint(5000)

  // t=6000: AZ1 recovers
  store.updateSlice('nodes', (n) => {
    const next = new Map(n)
    next.set('az1', { id: 'az1', status: 'available', isAnimating: false })
    return next
  })
  store.updateSlice('processedEventIds', (ids) => new Set(ids).add('recover-az1'))
  store.checkpoint(6000)

  // t=7000: Token-2 completes
  store.updateSlice('tokens', (t) => {
    const next = new Map(t)
    const existing = t.get('token-2')!
    next.set('token-2', { ...existing, status: 'completed' })
    return next
  })
  store.checkpoint(7000)

  return store
}

describe('Time Travel Invariants', () => {
  describe('state(t) identical regardless of seek path', () => {
    it('direct vs forward-backward paths produce same state', () => {
      const store = createStoreWithScenario()

      // Path 1: Direct to t=4000
      store.restoreTo(4000)
      const s1 = deepCloneState(store.getState())

      // Path 2: t=7000 → t=4000
      store.restoreTo(7000)
      store.restoreTo(4000)
      const s2 = deepCloneState(store.getState())

      // Path 3: t=1000 → t=4000
      store.restoreTo(1000)
      store.restoreTo(4000)
      const s3 = deepCloneState(store.getState())

      expect(statesEqual(s1, s2)).toBe(true)
      expect(statesEqual(s2, s3)).toBe(true)
    })

    it('zigzag paths produce consistent state', () => {
      const store = createStoreWithScenario()

      // Take a convoluted path
      store.restoreTo(3000)
      store.restoreTo(7000)
      store.restoreTo(1000)
      store.restoreTo(5000)
      store.restoreTo(2000)
      store.restoreTo(6000)
      store.restoreTo(4000)
      const s1 = deepCloneState(store.getState())

      // Direct path
      const fresh = createStoreWithScenario()
      fresh.restoreTo(4000)
      const s2 = deepCloneState(fresh.getState())

      expect(statesEqual(s1, s2)).toBe(true)
    })
  })

  describe('state correctness at each checkpoint', () => {
    it('t=0 has no tokens or events', () => {
      const store = createStoreWithScenario()
      store.restoreTo(0)

      const state = store.getState()
      expect(state.tokens.size).toBe(0)
      expect(state.nodes.size).toBe(0)
      expect(state.processedEventIds.size).toBe(0)
    })

    it('t=1000 has first token', () => {
      const store = createStoreWithScenario()
      store.restoreTo(1000)

      const state = store.getState()
      expect(state.tokens.size).toBe(1)
      expect(state.tokens.has('token-1')).toBe(true)
      expect(state.tokens.get('token-1')?.status).toBe('traveling')
      expect(state.processedEventIds.has('emit-1')).toBe(true)
    })

    it('t=2000 has both tokens', () => {
      const store = createStoreWithScenario()
      store.restoreTo(2000)

      const state = store.getState()
      expect(state.tokens.size).toBe(2)
      expect(state.tokens.has('token-1')).toBe(true)
      expect(state.tokens.has('token-2')).toBe(true)
    })

    it('t=4000 has AZ failure', () => {
      const store = createStoreWithScenario()
      store.restoreTo(4000)

      const state = store.getState()
      expect(state.nodes.get('az1')?.status).toBe('unavailable')
      expect(state.nodes.get('az1')?.sublabel).toBe('AZ Unavailable')
      expect(state.processedEventIds.has('fail-az1')).toBe(true)
    })

    it('t=5000 has failed token', () => {
      const store = createStoreWithScenario()
      store.restoreTo(5000)

      const state = store.getState()
      expect(state.tokens.get('token-1')?.status).toBe('failed')
    })

    it('t=6000 has recovered AZ', () => {
      const store = createStoreWithScenario()
      store.restoreTo(6000)

      const state = store.getState()
      expect(state.nodes.get('az1')?.status).toBe('available')
      expect(state.processedEventIds.has('recover-az1')).toBe(true)
    })

    it('t=7000 has completed token', () => {
      const store = createStoreWithScenario()
      store.restoreTo(7000)

      const state = store.getState()
      expect(state.tokens.get('token-2')?.status).toBe('completed')
    })
  })

  describe('backward seek clears future state', () => {
    it('seeking backward removes future changes from current state', () => {
      const store = createStoreWithScenario()

      // Go to end
      store.restoreTo(7000)
      expect(store.getState().tokens.get('token-2')?.status).toBe('completed')
      expect(store.getState().processedEventIds.has('recover-az1')).toBe(true)

      // Go back before AZ failure
      store.restoreTo(3000)

      // Should not have failure or recovery events
      expect(store.getState().nodes.get('az1')).toBeUndefined()
      expect(store.getState().processedEventIds.has('fail-az1')).toBe(false)
      expect(store.getState().processedEventIds.has('recover-az1')).toBe(false)

      // Token-2 should still be traveling
      expect(store.getState().tokens.get('token-2')?.status).toBe('traveling')
    })
  })

  describe('repeated seek to same time', () => {
    it('produces identical state each time', () => {
      const store = createStoreWithScenario()

      const states: SimulationState[] = []
      for (let i = 0; i < 5; i++) {
        store.restoreTo(4000)
        states.push(deepCloneState(store.getState()))

        // Mix in other seeks
        store.restoreTo(i * 1000)
      }

      // All should be equal
      for (let i = 1; i < states.length; i++) {
        expect(statesEqual(states[0], states[i])).toBe(true)
      }
    })
  })

  describe('seek between checkpoints', () => {
    it('returns to nearest checkpoint before target', () => {
      const store = createStoreWithScenario()

      // Seek to 3500 (between 3000 and 4000)
      const result = store.restoreTo(3500)

      expect(result.checkpointTimeMs).toBe(3000)
      expect(store.getTimeMs()).toBe(3000)

      // Should have state from t=3000, not t=4000
      expect(store.getState().nodes.get('az1')).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    it('handles empty store', () => {
      const store = new SimulationStateStore(createInitialSimulationState())

      store.restoreTo(5000)
      expect(store.getState().tokens.size).toBe(0)
      expect(store.getTimeMs()).toBe(0)
    })

    it('handles seek to exact checkpoint times', () => {
      const store = createStoreWithScenario()

      // Exact times
      for (const time of [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000]) {
        const result = store.restoreTo(time)
        expect(result.checkpointTimeMs).toBe(time)
      }
    })

    it('handles very large time values', () => {
      const store = createStoreWithScenario()

      const result = store.restoreTo(1_000_000)

      // Should restore to last checkpoint
      expect(result.checkpointTimeMs).toBe(7000)
      expect(store.getState().tokens.get('token-2')?.status).toBe('completed')
    })
  })
})

describe('Time Travel Performance', () => {
  it('binary search finds checkpoint efficiently', () => {
    const store = new SimulationStateStore(createInitialSimulationState())

    // Create 1000 checkpoints
    for (let i = 0; i < 1000; i++) {
      store.updateSlice('processedEventIds', (ids) => new Set(ids).add(`e${i}`))
      store.checkpoint(i * 100)
    }

    // Seek to various positions - should be fast due to binary search
    const start = performance.now()

    for (let i = 0; i < 100; i++) {
      const targetTime = Math.floor(Math.random() * 100000)
      store.restoreTo(targetTime)
    }

    const elapsed = performance.now() - start

    // 100 random seeks should complete in < 50ms
    expect(elapsed).toBeLessThan(50)
  })
})
