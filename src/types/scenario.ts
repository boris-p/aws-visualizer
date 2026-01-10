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
  action: 'fail' | 'recover' | 'degrade' | 'route-request'
  targetType: NodeTargetType
  targetId: string
  failureType?: FailureType
  severity?: 'low' | 'medium' | 'high'
  cascadeEffect?: {
    propagateToChildren: boolean
    propagateToParent: boolean
    affectedResourceIds: string[]
  }
  metadata?: Record<string, any>
}

export interface RequestFlow {
  id: string
  sourceLocation: string
  targetServiceId: string
  path: string[]
  latencyMs: number
  status: 'success' | 'failed' | 'degraded'
  routingStrategy: 'cloudfront' | 'direct' | 'vpc'
  failoverPath?: string[]
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
}
