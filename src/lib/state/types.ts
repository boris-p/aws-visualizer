/**
 * Simulation State Types
 *
 * Generic immutable state system for time-traveling simulations.
 * Uses structural sharing for memory efficiency - unchanged parts
 * share references between checkpoints.
 */

import type { Token, WaitPointState } from '@/types/token'
import type { NodeState } from '@/types/graph'

/**
 * Complete state of a simulation at a point in time.
 * All fields are immutable - updates create new objects.
 */
export interface SimulationState {
  /** Node states (available, unavailable, degraded) keyed by node ID */
  nodes: Map<string, NodeState>

  /** Active tokens in the simulation keyed by token ID */
  tokens: Map<string, Token>

  /** Wait point runtime state keyed by node ID */
  waitPoints: Map<string, WaitPointState>

  /** IDs of events that have been processed */
  processedEventIds: Set<string>

  /** Algorithm-specific state (routing tables, etc.) */
  algorithmState: Map<string, unknown>
}

/**
 * A checkpoint stores complete state at a specific time.
 * Uses structural sharing - only changed slices have new references.
 */
export interface Checkpoint<T> {
  timeMs: number
  state: T
}

/**
 * Result of restoring to a checkpoint.
 * Includes the checkpoint time so caller knows where to advance from.
 */
export interface RestoreResult {
  /** The actual checkpoint time restored to (may be before targetTimeMs) */
  checkpointTimeMs: number
}

/**
 * Create initial empty simulation state.
 */
export function createInitialSimulationState(): SimulationState {
  return {
    nodes: new Map(),
    tokens: new Map(),
    waitPoints: new Map(),
    processedEventIds: new Set(),
    algorithmState: new Map(),
  }
}

/**
 * Deep clone a simulation state (for testing determinism).
 * Creates completely new objects with no shared references.
 */
export function deepCloneState(state: SimulationState): SimulationState {
  return {
    nodes: new Map(
      Array.from(state.nodes.entries()).map(([k, v]) => [k, { ...v }])
    ),
    tokens: new Map(
      Array.from(state.tokens.entries()).map(([k, v]) => [k, { ...v }])
    ),
    waitPoints: new Map(
      Array.from(state.waitPoints.entries()).map(([k, v]) => [
        k,
        { ...v, tokenIds: [...v.tokenIds], config: { ...v.config } },
      ])
    ),
    processedEventIds: new Set(state.processedEventIds),
    algorithmState: new Map(state.algorithmState),
  }
}

/**
 * Check if two states are deeply equal (for testing).
 */
export function statesEqual(a: SimulationState, b: SimulationState): boolean {
  // Check nodes
  if (a.nodes.size !== b.nodes.size) return false
  for (const [id, nodeA] of a.nodes) {
    const nodeB = b.nodes.get(id)
    if (!nodeB) return false
    if (nodeA.status !== nodeB.status) return false
    if (nodeA.sublabel !== nodeB.sublabel) return false
  }

  // Check tokens
  if (a.tokens.size !== b.tokens.size) return false
  for (const [id, tokenA] of a.tokens) {
    const tokenB = b.tokens.get(id)
    if (!tokenB) return false
    if (tokenA.status !== tokenB.status) return false
    if (tokenA.currentEdgeIndex !== tokenB.currentEdgeIndex) return false
    if (tokenA.waitingAtNode !== tokenB.waitingAtNode) return false
  }

  // Check processed events
  if (a.processedEventIds.size !== b.processedEventIds.size) return false
  for (const id of a.processedEventIds) {
    if (!b.processedEventIds.has(id)) return false
  }

  // Check wait points
  if (a.waitPoints.size !== b.waitPoints.size) return false
  for (const [id, wpA] of a.waitPoints) {
    const wpB = b.waitPoints.get(id)
    if (!wpB) return false
    if (wpA.tokenIds.length !== wpB.tokenIds.length) return false
    if (wpA.lastProcessedMs !== wpB.lastProcessedMs) return false
  }

  return true
}
