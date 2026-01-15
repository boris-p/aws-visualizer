import { type NodeType, NodeType as NodeTypeValues } from './graph-nodes'

export interface InfrastructureResource {
  id: string
  name: string
  type: string
  nodeType: NodeType
  parentId?: string
}

export interface EC2Instance extends InfrastructureResource {
  type: 'ec2'
  nodeType: typeof NodeTypeValues.DATA_CENTER
  regionId: string
  azId: string
  instanceType: string
  state: 'running' | 'stopped' | 'terminated'
  health: 'healthy' | 'degraded' | 'unhealthy'
  ipAddress?: string
}

export interface Service {
  id: string
  name: string
  type: 'web-server' | 'api' | 'database'
  regionId: string
  azId?: string
  instances: EC2Instance[]
  loadBalanced: boolean
  multiAz: boolean
  targetAzs?: string[]
}

export interface InfrastructureConfig {
  id: string
  name: string
  description: string
  services: Service[]
  redundancyConfig: {
    multiAz: boolean
    crossRegion: boolean
    autoScaling: boolean
  }
}
