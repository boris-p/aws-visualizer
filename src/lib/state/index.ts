/**
 * Simulation State System
 *
 * Immutable state management with checkpointing for time-traveling simulations.
 * Uses structural sharing for memory efficiency.
 */

export { SimulationStateStore } from './simulation-state-store'
export { TokenManager } from './token-manager'
export { NodeManager } from './node-manager'
export { WaitPointManager } from './wait-point-manager'
export {
  createInitialSimulationState,
  deepCloneState,
  statesEqual,
} from './types'
export type {
  SimulationState,
  Checkpoint,
  RestoreResult,
} from './types'
