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
  action: 'fail' | 'recover' | 'degrade' | 'route-request' | 'promote' | string // Extensible for custom actions
  targetType: NodeTargetType
  targetId: string
  failureType?: FailureType
  severity?: 'low' | 'medium' | 'high'
  flowId?: string  // Explicit reference to RequestFlow.id for route-request events
  failureMessage?: string // Sublabel text shown under failed nodes
  promotionRole?: string // Role to promote to (e.g., "primary", "writer") for promote events
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
  queueAtNodes?: string[] // Nodes where particles should queue (e.g., load balancers)
}

// Algorithm reference in scenario definition
export interface AlgorithmRef {
  type: string // Algorithm ID (e.g., "round-robin", "majority-quorum")
  config?: Record<string, unknown> // Algorithm-specific configuration
}

// Legacy particle configuration (deprecated, use tokenFlowConfig)
export interface ParticleConfigRef {
  edgeLatencyMs?: number       // Default time to traverse an edge
  queueProcessingMs?: number   // Default time between queue releases
}

// Token flow configuration for scenario
export interface TokenFlowConfigRef {
  defaultEdgeDurationMs?: number
  tokenTypes?: Array<{
    id: string
    shape: 'circle' | 'square' | 'diamond' | 'triangle'
    color: string
    size: number
    label?: string
  }>
  waitPoints?: Array<{
    nodeId: string
    type: 'queue' | 'processing' | 'fanout-wait'
    capacity?: number
    processIntervalMs: number
    strategy: 'fifo' | 'priority' | 'batch'
  }>
  edgeTimings?: Array<{
    sourceNode: string
    targetNode: string
    durationMs: number
  }>
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
    fanOut?: AlgorithmRef  // Fan-out strategy for replication (e.g., quorum-replication)
  }
  // Token flow visualization configuration
  tokenFlowConfig?: TokenFlowConfigRef
  // Legacy particle configuration (deprecated)
  particleConfig?: ParticleConfigRef
}
