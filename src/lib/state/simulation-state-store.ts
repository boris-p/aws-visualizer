/**
 * SimulationStateStore - Immutable state container with checkpointing
 *
 * Features:
 * - Structural sharing: unchanged slices share references between checkpoints
 * - O(1) restore to any checkpoint
 * - Memory efficient: grows O(changes) not O(checkpoints × state size)
 * - Generic: works with any state shape
 */

import type { Checkpoint, RestoreResult } from './types'

export class SimulationStateStore<T extends object> {
  private checkpoints: Array<Checkpoint<T>> = []
  private currentState: T
  private currentTimeMs: number = 0
  private initialState: T

  constructor(initialState: T) {
    // Store initial state - will be used as checkpoint 0
    this.initialState = initialState
    this.currentState = initialState
  }

  /**
   * Get current state (read-only).
   * Never mutate the returned object - use updateSlice instead.
   */
  getState(): Readonly<T> {
    return this.currentState
  }

  /**
   * Get current simulation time.
   */
  getTimeMs(): number {
    return this.currentTimeMs
  }

  /**
   * Update a slice of state using structural sharing.
   * Only the updated slice gets a new reference; other slices are preserved.
   *
   * @example
   * store.updateSlice('tokens', tokens => {
   *   const next = new Map(tokens)
   *   next.set('token-1', newToken)
   *   return next
   * })
   */
  updateSlice<K extends keyof T>(key: K, updater: (prev: T[K]) => T[K]): void {
    const newSlice = updater(this.currentState[key])

    // Only create new state object if slice actually changed
    if (newSlice !== this.currentState[key]) {
      this.currentState = {
        ...this.currentState,
        [key]: newSlice,
      }
    }
  }

  /**
   * Save a checkpoint at the specified time.
   * The current state is stored with structural sharing - unchanged slices
   * share references with previous checkpoints.
   */
  checkpoint(timeMs: number): void {
    this.currentTimeMs = timeMs
    this.checkpoints.push({
      timeMs,
      state: this.currentState, // Shallow copy - structural sharing!
    })
  }

  /**
   * Restore state to the checkpoint at or before the target time.
   * Returns the actual checkpoint time so caller can advance from there.
   *
   * @param targetTimeMs - The time to restore to
   * @returns The checkpoint time actually restored to
   */
  restoreTo(targetTimeMs: number): RestoreResult {
    // Handle no checkpoints - return to initial state
    if (this.checkpoints.length === 0) {
      this.currentState = this.initialState
      this.currentTimeMs = 0
      return { checkpointTimeMs: 0 }
    }

    // Handle time 0 or before first checkpoint
    if (targetTimeMs <= 0) {
      this.currentState = this.initialState
      this.currentTimeMs = 0
      return { checkpointTimeMs: 0 }
    }

    // Binary search for checkpoint at or before target time
    const checkpointIndex = this.findCheckpointIndex(targetTimeMs)

    if (checkpointIndex === -1) {
      // Before first checkpoint - use initial state
      this.currentState = this.initialState
      this.currentTimeMs = 0
      return { checkpointTimeMs: 0 }
    }

    const checkpoint = this.checkpoints[checkpointIndex]
    this.currentState = checkpoint.state
    this.currentTimeMs = checkpoint.timeMs

    return { checkpointTimeMs: checkpoint.timeMs }
  }

  /**
   * Find the index of the checkpoint at or before the target time.
   * Uses binary search for efficiency.
   * Returns -1 if target is before all checkpoints.
   */
  private findCheckpointIndex(targetTimeMs: number): number {
    if (this.checkpoints.length === 0) return -1

    let left = 0
    let right = this.checkpoints.length - 1
    let result = -1

    while (left <= right) {
      const mid = Math.floor((left + right) / 2)
      if (this.checkpoints[mid].timeMs <= targetTimeMs) {
        result = mid
        left = mid + 1
      } else {
        right = mid - 1
      }
    }

    return result
  }

  /**
   * Get all checkpoint times (for debugging/testing).
   */
  getCheckpointTimes(): number[] {
    return this.checkpoints.map((c) => c.timeMs)
  }

  /**
   * Get the number of checkpoints stored.
   */
  getCheckpointCount(): number {
    return this.checkpoints.length
  }

  /**
   * Clear all checkpoints and reset to initial state.
   */
  clearCheckpoints(): void {
    this.checkpoints = []
    this.currentState = this.initialState
    this.currentTimeMs = 0
  }

  /**
   * Set the current time without modifying state.
   * Used when advancing between checkpoints.
   */
  setTimeMs(timeMs: number): void {
    this.currentTimeMs = timeMs
  }

  /**
   * Replace entire state (used when restoring from checkpoint).
   * Use sparingly - prefer updateSlice for normal updates.
   */
  setState(state: T): void {
    this.currentState = state
  }

  /**
   * Get the initial state.
   */
  getInitialState(): Readonly<T> {
    return this.initialState
  }
}
