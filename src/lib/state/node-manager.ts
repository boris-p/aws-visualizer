/**
 * NodeManager - Manages node state through the SimulationStateStore
 *
 * Handles node status (available, unavailable, degraded) and related
 * state like sublabels.
 */

import type { NodeState } from '@/types/graph'
import type { SimulationState } from './types'
import type { SimulationStateStore } from './simulation-state-store'

export class NodeManager {
  private store: SimulationStateStore<SimulationState>

  constructor(store: SimulationStateStore<SimulationState>) {
    this.store = store
  }

  /**
   * Get a node's state by ID.
   */
  get(id: string): NodeState | undefined {
    return this.store.getState().nodes.get(id)
  }

  /**
   * Get all node states.
   */
  getAll(): NodeState[] {
    return Array.from(this.store.getState().nodes.values())
  }

  /**
   * Get all node IDs that have state.
   */
  getIds(): string[] {
    return Array.from(this.store.getState().nodes.keys())
  }

  /**
   * Check if a node has state.
   */
  has(id: string): boolean {
    return this.store.getState().nodes.has(id)
  }

  /**
   * Get the count of nodes with state.
   */
  count(): number {
    return this.store.getState().nodes.size
  }

  /**
   * Set a node's state.
   * Creates new state if node doesn't exist.
   */
  set(id: string, state: NodeState): void {
    this.store.updateSlice('nodes', (nodes) => {
      const next = new Map(nodes)
      next.set(id, state)
      return next
    })
  }

  /**
   * Update a node's state.
   * Merges changes with existing state.
   * Creates new state if node doesn't exist.
   */
  update(id: string, changes: Partial<NodeState>): void {
    this.store.updateSlice('nodes', (nodes) => {
      const existing = nodes.get(id)
      const next = new Map(nodes)

      if (existing) {
        next.set(id, { ...existing, ...changes })
      } else {
        next.set(id, {
          id,
          status: 'available',
          isAnimating: false,
          ...changes,
        } as NodeState)
      }

      return next
    })
  }

  /**
   * Remove a node's state.
   * No-op if node doesn't have state.
   */
  remove(id: string): void {
    this.store.updateSlice('nodes', (nodes) => {
      if (!nodes.has(id)) return nodes

      const next = new Map(nodes)
      next.delete(id)
      return next
    })
  }

  /**
   * Clear all node states.
   */
  clear(): void {
    this.store.updateSlice('nodes', () => new Map())
  }

  /**
   * Mark a node as failed (unavailable).
   */
  fail(id: string, sublabel?: string): void {
    this.update(id, {
      status: 'unavailable',
      sublabel,
      lastStateChange: this.store.getTimeMs(),
    })
  }

  /**
   * Mark a node as recovered (available).
   */
  recover(id: string): void {
    this.update(id, {
      status: 'available',
      sublabel: undefined,
      lastStateChange: this.store.getTimeMs(),
    })
  }

  /**
   * Mark a node as degraded.
   */
  degrade(id: string, sublabel?: string): void {
    this.update(id, {
      status: 'degraded',
      sublabel,
      lastStateChange: this.store.getTimeMs(),
    })
  }

  /**
   * Check if a node is unavailable.
   */
  isUnavailable(id: string): boolean {
    return this.get(id)?.status === 'unavailable'
  }

  /**
   * Check if a node is available.
   */
  isAvailable(id: string): boolean {
    const state = this.get(id)
    return !state || state.status === 'available'
  }

  /**
   * Get all unavailable nodes.
   */
  getUnavailable(): NodeState[] {
    return this.getAll().filter((n) => n.status === 'unavailable')
  }

  /**
   * Get all available nodes.
   */
  getAvailable(): NodeState[] {
    return this.getAll().filter((n) => n.status === 'available')
  }

  /**
   * Get all degraded nodes.
   */
  getDegraded(): NodeState[] {
    return this.getAll().filter((n) => n.status === 'degraded')
  }
}
