import type { Scenario, ScenarioEvent, RequestFlow } from './scenario'
import type { NodeState } from './graph'
import type { GraphDefinition } from './graph-type'
import type { Token, WaitPointState } from './token'

// Execution context passed to all event handlers and algorithms
export interface ScenarioExecutionContext {
  scenario: Scenario
  currentTimeMs: number
  nodeStates: Map<string, NodeState>
  graphTopology: GraphDefinition
  algorithmState: Map<string, unknown> // Persistent state per algorithm
}

// Result of processing an event
export interface EventResult {
  nodeStateChanges: Map<string, Partial<NodeState>>
  edgeHighlights: Set<string>
  activeFlowId: string | null
  derivedEvents?: ScenarioEvent[] // Events to emit (for cascading effects)
  computedPath?: string[] // The path computed for route-request events (for token visualization)
}

// Event handler interface
export interface EventHandler {
  action: string
  handle(event: ScenarioEvent, context: ScenarioExecutionContext): EventResult
}

// Algorithm interfaces
export interface LoadBalancer {
  id: string
  selectNode(
    candidates: string[],
    context: ScenarioExecutionContext
  ): string
}

export interface PathSelector {
  id: string
  computePath(
    flow: RequestFlow,
    context: ScenarioExecutionContext
  ): string[]
}

export interface FailoverStrategy {
  id: string
  computeFailover(
    primaryPath: string[],
    failedNodeId: string,
    context: ScenarioExecutionContext
  ): string[] | null
}

export interface ConsensusAlgorithm {
  id: string
  canRead(availableNodes: string[], config: QuorumConfig): boolean
  canWrite(availableNodes: string[], config: QuorumConfig): boolean
}

export interface QuorumConfig {
  totalNodes: number
  readQuorum: number
  writeQuorum: number
}

// Algorithm reference in scenario definition
export interface AlgorithmRef {
  type: string
  config?: Record<string, unknown>
}

// Scenario state snapshot at a point in time
export interface ScenarioSnapshot {
  timeMs: number
  nodeStates: Map<string, NodeState>
  animatingEdges: Set<string>
  activeFlowId: string | null
  processedEventIds: Set<string>
  // Token flow state
  tokens: Token[]
  waitPoints: Map<string, WaitPointState>
}

// Default failure messages by target type
export const DEFAULT_FAILURE_MESSAGES: Record<string, string> = {
  az: 'AZ Unavailable',
  region: 'Region Down',
  instance: 'Instance Failed',
  service: 'Service Unavailable',
  database: 'Database Offline',
  default: 'Unavailable'
}

export function getDefaultFailureMessage(targetType?: string): string {
  return DEFAULT_FAILURE_MESSAGES[targetType || 'default'] || DEFAULT_FAILURE_MESSAGES.default
}
