import { describe, it, expect, beforeEach } from 'vitest'
import { SimulationStateStore } from '../simulation-state-store'
import { TokenManager } from '../token-manager'
import type { SimulationState } from '../types'
import { createInitialSimulationState } from '../types'
import type { Token } from '@/types/token'

function createTestToken(id: string, overrides?: Partial<Token>): Token {
  return {
    id,
    typeId: 'http-request',
    path: ['a', 'b', 'c'],
    currentEdgeIndex: 0,
    status: 'traveling',
    emittedAtMs: 0,
    currentSegmentStartMs: 0,
    currentSegmentDurationMs: 1000,
    progress: 0,
    ...overrides,
  }
}

describe('TokenManager', () => {
  let store: SimulationStateStore<SimulationState>
  let manager: TokenManager

  beforeEach(() => {
    store = new SimulationStateStore(createInitialSimulationState())
    manager = new TokenManager(store)
  })

  describe('basic CRUD', () => {
    it('add creates new token', () => {
      const token = createTestToken('token-1')
      manager.add(token)

      expect(manager.get('token-1')).toEqual(token)
      expect(manager.count()).toBe(1)
    })

    it('add throws on duplicate', () => {
      const token = createTestToken('token-1')
      manager.add(token)

      expect(() => manager.add(token)).toThrow('Token token-1 already exists')
    })

    it('get retrieves existing token', () => {
      const token = createTestToken('token-1')
      manager.add(token)

      const retrieved = manager.get('token-1')
      expect(retrieved).toEqual(token)
    })

    it('get returns undefined for missing token', () => {
      expect(manager.get('nonexistent')).toBeUndefined()
    })

    it('has checks existence', () => {
      expect(manager.has('token-1')).toBe(false)

      manager.add(createTestToken('token-1'))
      expect(manager.has('token-1')).toBe(true)
    })

    it('update modifies token immutably', () => {
      const token = createTestToken('token-1', { status: 'traveling' })
      manager.add(token)

      manager.update('token-1', { status: 'completed' })

      expect(manager.get('token-1')?.status).toBe('completed')
      // Original token unchanged
      expect(token.status).toBe('traveling')
    })

    it('update is no-op for missing token', () => {
      manager.update('nonexistent', { status: 'completed' })
      expect(manager.get('nonexistent')).toBeUndefined()
    })

    it('remove deletes token', () => {
      manager.add(createTestToken('token-1'))
      expect(manager.has('token-1')).toBe(true)

      manager.remove('token-1')
      expect(manager.has('token-1')).toBe(false)
    })

    it('remove is no-op for missing token', () => {
      const countBefore = manager.count()
      manager.remove('nonexistent')
      expect(manager.count()).toBe(countBefore)
    })

    it('getAll returns all tokens', () => {
      manager.add(createTestToken('token-1'))
      manager.add(createTestToken('token-2'))
      manager.add(createTestToken('token-3'))

      const all = manager.getAll()
      expect(all).toHaveLength(3)
      expect(all.map((t) => t.id).sort()).toEqual(['token-1', 'token-2', 'token-3'])
    })

    it('clear removes all tokens', () => {
      manager.add(createTestToken('token-1'))
      manager.add(createTestToken('token-2'))
      expect(manager.count()).toBe(2)

      manager.clear()
      expect(manager.count()).toBe(0)
    })
  })

  describe('query methods', () => {
    beforeEach(() => {
      manager.add(createTestToken('t1', { status: 'traveling' }))
      manager.add(createTestToken('t2', { status: 'waiting', waitingAtNode: 'alb' }))
      manager.add(createTestToken('t3', { status: 'completed' }))
      manager.add(createTestToken('t4', { status: 'failed' }))
      manager.add(createTestToken('t5', { status: 'traveling' }))
    })

    it('getByStatus filters correctly', () => {
      expect(manager.getByStatus('traveling')).toHaveLength(2)
      expect(manager.getByStatus('waiting')).toHaveLength(1)
      expect(manager.getByStatus('completed')).toHaveLength(1)
      expect(manager.getByStatus('failed')).toHaveLength(1)
    })

    it('getActive returns traveling and waiting', () => {
      const active = manager.getActive()
      expect(active).toHaveLength(3)
      expect(active.every((t) => t.status === 'traveling' || t.status === 'waiting')).toBe(
        true
      )
    })

    it('getWaitingAt filters by node', () => {
      manager.add(
        createTestToken('t6', {
          status: 'waiting',
          waitingAtNode: 'alb',
          waitPosition: 1,
        })
      )

      const waiting = manager.getWaitingAt('alb')
      expect(waiting).toHaveLength(2)
      // Should be sorted by position
      expect(waiting[0].waitPosition ?? 0).toBeLessThanOrEqual(waiting[1].waitPosition ?? 0)
    })

    it('getOnEdge finds tokens on specific edge', () => {
      // Add token on edge x->y (unique path different from beforeEach tokens)
      manager.add(
        createTestToken('edge-token', {
          status: 'traveling',
          path: ['x', 'y', 'z'],
          currentEdgeIndex: 0,
        })
      )

      expect(manager.getOnEdge('x', 'y')).toHaveLength(1)
      expect(manager.getOnEdge('y', 'z')).toHaveLength(0)
    })
  })

  describe('bulk operations', () => {
    it('bulkUpdate modifies multiple tokens', () => {
      manager.add(createTestToken('t1', { progress: 0 }))
      manager.add(createTestToken('t2', { progress: 0 }))
      manager.add(createTestToken('t3', { progress: 0 }))

      manager.bulkUpdate([
        { id: 't1', changes: { progress: 0.5 } },
        { id: 't2', changes: { progress: 0.7 } },
      ])

      expect(manager.get('t1')?.progress).toBe(0.5)
      expect(manager.get('t2')?.progress).toBe(0.7)
      expect(manager.get('t3')?.progress).toBe(0)
    })

    it('bulkUpdate ignores missing tokens', () => {
      manager.add(createTestToken('t1'))

      manager.bulkUpdate([
        { id: 't1', changes: { progress: 0.5 } },
        { id: 'nonexistent', changes: { progress: 0.5 } },
      ])

      expect(manager.get('t1')?.progress).toBe(0.5)
    })

    it('failTokensAtNode fails waiting and traveling tokens', () => {
      manager.add(
        createTestToken('waiting', {
          status: 'waiting',
          waitingAtNode: 'az1',
        })
      )
      manager.add(
        createTestToken('traveling-to', {
          status: 'traveling',
          path: ['region', 'az1'],
          currentEdgeIndex: 0,
        })
      )
      manager.add(
        createTestToken('traveling-away', {
          status: 'traveling',
          path: ['az1', 'instance'],
          currentEdgeIndex: 0,
        })
      )
      manager.add(
        createTestToken('other', {
          status: 'traveling',
          path: ['az2', 'instance'],
          currentEdgeIndex: 0,
        })
      )

      manager.failTokensAtNode('az1')

      expect(manager.get('waiting')?.status).toBe('failed')
      expect(manager.get('traveling-to')?.status).toBe('failed')
      expect(manager.get('traveling-away')?.status).toBe('traveling') // Not affected
      expect(manager.get('other')?.status).toBe('traveling')
    })
  })

  describe('operations after restore', () => {
    it('operations work correctly after checkpoint restore', () => {
      manager.add(createTestToken('t1', { status: 'traveling' }))
      store.checkpoint(1000)

      manager.add(createTestToken('t2', { status: 'traveling' }))
      manager.update('t1', { status: 'completed' })
      store.checkpoint(2000)

      // Restore to earlier checkpoint
      store.restoreTo(1000)

      // Should see state at t=1000
      expect(manager.count()).toBe(1)
      expect(manager.has('t1')).toBe(true)
      expect(manager.has('t2')).toBe(false)
      expect(manager.get('t1')?.status).toBe('traveling')

      // Operations should still work
      manager.update('t1', { progress: 0.5 })
      expect(manager.get('t1')?.progress).toBe(0.5)
    })

    it('new operations after restore do not affect old checkpoints', () => {
      manager.add(createTestToken('t1'))
      store.checkpoint(1000)

      // Restore and modify
      store.restoreTo(1000)
      manager.update('t1', { status: 'failed' })

      // Original checkpoint unchanged
      store.restoreTo(1000)
      expect(manager.get('t1')?.status).toBe('traveling')
    })
  })

  describe('immutability', () => {
    it('update does not mutate original token object', () => {
      const original = createTestToken('t1', { status: 'traveling', progress: 0 })
      manager.add(original)

      manager.update('t1', { status: 'completed', progress: 1 })

      // Original object unchanged
      expect(original.status).toBe('traveling')
      expect(original.progress).toBe(0)

      // Store has new value
      expect(manager.get('t1')?.status).toBe('completed')
    })

    it('getAll returns different array on each call', () => {
      manager.add(createTestToken('t1'))

      const arr1 = manager.getAll()
      const arr2 = manager.getAll()

      expect(arr1).not.toBe(arr2)
      expect(arr1).toEqual(arr2)
    })
  })
})
