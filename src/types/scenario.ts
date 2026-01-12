export type NodeTargetType = 'region' | 'az' | 'instance' | 'service' | 'edge-location'

export type FailureType =
  | 'az-outage'
  | 'instance-failure'
  | 'network-partition'
  | 'throttling'
  | 'degradation'

export interface ScenarioEvent {
  id: string
  timestampMs: number
  action: 'fail' | 'recover' | 'degrade' | 'route-request' | string // Extensible for custom actions
  targetType: NodeTargetType
  targetId: string
  failureType?: FailureType
  severity?: 'low' | 'medium' | 'high'
  flowId?: string  // Explicit reference to RequestFlow.id for route-request events
  failureMessage?: string // Sublabel text shown under failed nodes
  cascadeEffect?: {
    propagateToChildren: boolean
    propagateToParent: boolean
    affectedResourceIds: string[]
  }
  algorithmRef?: string // Reference to algorithm in registry
  algorithmParams?: Record<string, unknown> // Parameters for the algorithm
  metadata?: Record<string, unknown>
}

export interface RequestFlow {
  id: string
  sourceLocation: string
  targetServiceId: string
  path?: string[] // Static path (optional if using computePath)
  latencyMs: number
  status: 'success' | 'failed' | 'degraded'
  routingStrategy: 'cloudfront' | 'direct' | 'vpc'
  failoverPath?: string[]
  visualState?: 'primary' | 'failover' | 'degraded' | 'failed'  // Visual indication for UI
  computePath?: boolean // If true, use pathSelector algorithm instead of static path
  pathConstraints?: {
    preferredAz?: string
    excludeNodes?: string[]
    candidates?: string[] // Nodes to choose from for load balancing
  }
}

// Algorithm reference in scenario definition
export interface AlgorithmRef {
  type: string // Algorithm ID (e.g., "round-robin", "majority-quorum")
  config?: Record<string, unknown> // Algorithm-specific configuration
}

export interface Scenario {
  id: string
  name: string
  description: string
  graphId: string
  infrastructureId: string
  events: ScenarioEvent[]
  requestFlows: RequestFlow[]
  durationMs: number
  expectedOutcome: string
  awsContext: {
    useCloudFront: boolean
    useMultiAz: boolean
    useAutoScaling: boolean
    healthCheckEnabled: boolean
  }
  // Algorithm configuration for dynamic scenarios
  algorithms?: {
    loadBalancer?: AlgorithmRef
    pathSelector?: AlgorithmRef
    failoverStrategy?: AlgorithmRef
    consensus?: AlgorithmRef
  }
}
