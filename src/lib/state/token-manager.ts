/**
 * TokenManager - Manages token state through the SimulationStateStore
 *
 * Provides a clean API for token CRUD operations while maintaining
 * immutability and structural sharing through the underlying store.
 */

import type { Token } from '@/types/token'
import type { SimulationState } from './types'
import type { SimulationStateStore } from './simulation-state-store'

export class TokenManager {
  constructor(private store: SimulationStateStore<SimulationState>) {}

  /**
   * Get a token by ID.
   */
  get(id: string): Token | undefined {
    return this.store.getState().tokens.get(id)
  }

  /**
   * Get all tokens.
   */
  getAll(): Token[] {
    return Array.from(this.store.getState().tokens.values())
  }

  /**
   * Get all token IDs.
   */
  getIds(): string[] {
    return Array.from(this.store.getState().tokens.keys())
  }

  /**
   * Check if a token exists.
   */
  has(id: string): boolean {
    return this.store.getState().tokens.has(id)
  }

  /**
   * Get the count of tokens.
   */
  count(): number {
    return this.store.getState().tokens.size
  }

  /**
   * Add a new token.
   * Throws if token with same ID already exists.
   */
  add(token: Token): void {
    if (this.has(token.id)) {
      throw new Error(`Token ${token.id} already exists`)
    }

    this.store.updateSlice('tokens', (tokens) => {
      const next = new Map(tokens)
      next.set(token.id, token)
      return next
    })
  }

  /**
   * Update an existing token.
   * Merges changes with existing token state.
   * No-op if token doesn't exist.
   */
  update(id: string, changes: Partial<Token>): void {
    this.store.updateSlice('tokens', (tokens) => {
      const existing = tokens.get(id)
      if (!existing) return tokens

      const next = new Map(tokens)
      next.set(id, { ...existing, ...changes })
      return next
    })
  }

  /**
   * Remove a token by ID.
   * No-op if token doesn't exist.
   */
  remove(id: string): void {
    this.store.updateSlice('tokens', (tokens) => {
      if (!tokens.has(id)) return tokens

      const next = new Map(tokens)
      next.delete(id)
      return next
    })
  }

  /**
   * Remove all tokens.
   */
  clear(): void {
    this.store.updateSlice('tokens', () => new Map())
  }

  /**
   * Get tokens by status.
   */
  getByStatus(status: Token['status']): Token[] {
    return this.getAll().filter((t) => t.status === status)
  }

  /**
   * Get tokens currently traveling on a specific edge.
   */
  getOnEdge(sourceNode: string, targetNode: string): Token[] {
    return this.getAll().filter((token) => {
      if (token.status !== 'traveling') return false
      const source = token.path[token.currentEdgeIndex]
      const target = token.path[token.currentEdgeIndex + 1]
      return source === sourceNode && target === targetNode
    })
  }

  /**
   * Get tokens waiting at a specific node.
   */
  getWaitingAt(nodeId: string): Token[] {
    return this.getAll()
      .filter((t) => t.status === 'waiting' && t.waitingAtNode === nodeId)
      .sort((a, b) => (a.waitPosition || 0) - (b.waitPosition || 0))
  }

  /**
   * Get active tokens (traveling or waiting).
   */
  getActive(): Token[] {
    return this.getAll().filter(
      (t) => t.status === 'traveling' || t.status === 'waiting'
    )
  }

  /**
   * Bulk update multiple tokens.
   * More efficient than calling update() multiple times.
   */
  bulkUpdate(updates: Array<{ id: string; changes: Partial<Token> }>): void {
    this.store.updateSlice('tokens', (tokens) => {
      let changed = false
      const next = new Map(tokens)

      for (const { id, changes } of updates) {
        const existing = tokens.get(id)
        if (existing) {
          next.set(id, { ...existing, ...changes })
          changed = true
        }
      }

      return changed ? next : tokens
    })
  }

  /**
   * Set tokens to fail if they're heading to or at an unavailable node.
   */
  failTokensAtNode(nodeId: string): void {
    this.store.updateSlice('tokens', (tokens) => {
      let changed = false
      const next = new Map(tokens)

      for (const [id, token] of tokens) {
        // Fail if waiting at the node
        if (token.status === 'waiting' && token.waitingAtNode === nodeId) {
          next.set(id, { ...token, status: 'failed' })
          changed = true
          continue
        }

        // Fail if traveling toward the node
        if (token.status === 'traveling') {
          const targetNode = token.path[token.currentEdgeIndex + 1]
          if (targetNode === nodeId) {
            next.set(id, { ...token, status: 'failed' })
            changed = true
          }
        }
      }

      return changed ? next : tokens
    })
  }
}
