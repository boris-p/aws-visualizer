/**
 * WaitPointManager - Manages wait point state through the SimulationStateStore
 *
 * Handles queue state at nodes - which tokens are waiting, processing order,
 * and timing for when tokens are released.
 */

import type { WaitPoint, WaitPointState } from '@/types/token'
import type { SimulationState } from './types'
import type { SimulationStateStore } from './simulation-state-store'

export class WaitPointManager {
  constructor(private store: SimulationStateStore<SimulationState>) {}

  /**
   * Get a wait point's state by node ID.
   */
  get(nodeId: string): WaitPointState | undefined {
    return this.store.getState().waitPoints.get(nodeId)
  }

  /**
   * Get all wait point states.
   */
  getAll(): WaitPointState[] {
    return Array.from(this.store.getState().waitPoints.values())
  }

  /**
   * Check if a wait point exists at a node.
   */
  has(nodeId: string): boolean {
    return this.store.getState().waitPoints.has(nodeId)
  }

  /**
   * Get the count of wait points.
   */
  count(): number {
    return this.store.getState().waitPoints.size
  }

  /**
   * Set up a wait point at a node.
   */
  setup(config: WaitPoint): void {
    const state: WaitPointState = {
      nodeId: config.nodeId,
      tokenIds: [],
      lastProcessedMs: 0,
      config,
    }

    this.store.updateSlice('waitPoints', (waitPoints) => {
      const next = new Map(waitPoints)
      next.set(config.nodeId, state)
      return next
    })
  }

  /**
   * Remove a wait point.
   */
  remove(nodeId: string): void {
    this.store.updateSlice('waitPoints', (waitPoints) => {
      if (!waitPoints.has(nodeId)) return waitPoints

      const next = new Map(waitPoints)
      next.delete(nodeId)
      return next
    })
  }

  /**
   * Clear all wait points.
   */
  clear(): void {
    this.store.updateSlice('waitPoints', () => new Map())
  }

  /**
   * Add a token to a wait point's queue.
   * Returns the token's position in queue.
   */
  enqueue(nodeId: string, tokenId: string, timeMs: number): number {
    let position = -1

    this.store.updateSlice('waitPoints', (waitPoints) => {
      const existing = waitPoints.get(nodeId)
      if (!existing) return waitPoints

      // Don't add duplicate
      if (existing.tokenIds.includes(tokenId)) {
        position = existing.tokenIds.indexOf(tokenId)
        return waitPoints
      }

      position = existing.tokenIds.length
      const next = new Map(waitPoints)
      next.set(nodeId, {
        ...existing,
        tokenIds: [...existing.tokenIds, tokenId],
        // Initialize lastProcessedMs if this is first token
        lastProcessedMs:
          existing.tokenIds.length === 0 ? timeMs : existing.lastProcessedMs,
      })
      return next
    })

    return position
  }

  /**
   * Remove and return the next token from the queue (FIFO).
   * Updates lastProcessedMs to releaseTime.
   */
  dequeue(nodeId: string, releaseTime: number): string | undefined {
    let tokenId: string | undefined

    this.store.updateSlice('waitPoints', (waitPoints) => {
      const existing = waitPoints.get(nodeId)
      if (!existing || existing.tokenIds.length === 0) return waitPoints

      tokenId = existing.tokenIds[0]
      const next = new Map(waitPoints)
      next.set(nodeId, {
        ...existing,
        tokenIds: existing.tokenIds.slice(1),
        lastProcessedMs: releaseTime,
      })
      return next
    })

    return tokenId
  }

  /**
   * Remove a specific token from the queue (for failures).
   */
  removeToken(nodeId: string, tokenId: string): void {
    this.store.updateSlice('waitPoints', (waitPoints) => {
      const existing = waitPoints.get(nodeId)
      if (!existing) return waitPoints

      const idx = existing.tokenIds.indexOf(tokenId)
      if (idx === -1) return waitPoints

      const next = new Map(waitPoints)
      next.set(nodeId, {
        ...existing,
        tokenIds: existing.tokenIds.filter((id) => id !== tokenId),
      })
      return next
    })
  }

  /**
   * Get the queue length at a wait point.
   */
  getQueueLength(nodeId: string): number {
    return this.get(nodeId)?.tokenIds.length ?? 0
  }

  /**
   * Get the token IDs waiting at a node.
   */
  getWaitingTokenIds(nodeId: string): string[] {
    return this.get(nodeId)?.tokenIds ?? []
  }

  /**
   * Check if enough time has passed to release the next token.
   */
  canRelease(nodeId: string, currentTimeMs: number): boolean {
    const state = this.get(nodeId)
    if (!state || state.tokenIds.length === 0) return false

    const elapsed = currentTimeMs - state.lastProcessedMs
    return elapsed >= state.config.processIntervalMs
  }

  /**
   * Get the time when the next token can be released.
   */
  getNextReleaseTime(nodeId: string): number | undefined {
    const state = this.get(nodeId)
    if (!state || state.tokenIds.length === 0) return undefined

    return state.lastProcessedMs + state.config.processIntervalMs
  }

  /**
   * Update positions of remaining tokens after dequeue.
   * This is informational - actual order is determined by tokenIds array.
   */
  getTokenPosition(nodeId: string, tokenId: string): number {
    const state = this.get(nodeId)
    if (!state) return -1
    return state.tokenIds.indexOf(tokenId)
  }

  /**
   * Check if queue has capacity for more tokens.
   */
  hasCapacity(nodeId: string): boolean {
    const state = this.get(nodeId)
    if (!state) return false
    if (state.config.capacity === undefined) return true
    return state.tokenIds.length < state.config.capacity
  }

  /**
   * Reset a wait point's queue (clear tokens but keep config).
   */
  resetQueue(nodeId: string): void {
    this.store.updateSlice('waitPoints', (waitPoints) => {
      const existing = waitPoints.get(nodeId)
      if (!existing) return waitPoints

      const next = new Map(waitPoints)
      next.set(nodeId, {
        ...existing,
        tokenIds: [],
        lastProcessedMs: 0,
      })
      return next
    })
  }

  /**
   * Reset all wait point queues (keep configs).
   */
  resetAllQueues(): void {
    this.store.updateSlice('waitPoints', (waitPoints) => {
      const next = new Map(waitPoints)
      for (const [nodeId, state] of waitPoints) {
        next.set(nodeId, {
          ...state,
          tokenIds: [],
          lastProcessedMs: 0,
        })
      }
      return next
    })
  }
}
