import type { NodeState } from './graph'

export enum NodeType {
  AWS_ROOT = 'aws-root',
  PARTITION = 'partition',
  REGION = 'region',
  AVAILABILITY_ZONE = 'az',
  DATA_CENTER = 'dc',
  EDGE_LOCATION = 'edge',
  // Future node types (commented for clarity):
  // EC2_INSTANCE = 'ec2-instance',
  // LOAD_BALANCER = 'load-balancer',
  // RDS_INSTANCE = 'rds-instance',
  // LAMBDA_FUNCTION = 'lambda',
  // S3_BUCKET = 's3',
}

export interface NodeTypeConfig {
  type: NodeType
  canHaveChildren: boolean
  canBeInteractive: boolean
  canFail: boolean
  defaultState: NodeState['status']
  renderConfig: {
    minWidth: number
    fontSize: string
    borderWidth: number
    hasStatusIndicator: boolean
  }
  failureBehavior?: {
    affectsChildren: boolean
    affectsParent: boolean
    isolationLevel: 'full' | 'partial' | 'none'
  }
}

export const NODE_TYPE_REGISTRY: Record<NodeType, NodeTypeConfig> = {
  [NodeType.AWS_ROOT]: {
    type: NodeType.AWS_ROOT,
    canHaveChildren: true,
    canBeInteractive: false,
    canFail: false,
    defaultState: 'available',
    renderConfig: {
      minWidth: 100,
      fontSize: '18px',
      borderWidth: 3,
      hasStatusIndicator: false
    }
  },
  [NodeType.PARTITION]: {
    type: NodeType.PARTITION,
    canHaveChildren: true,
    canBeInteractive: false,
    canFail: false,
    defaultState: 'available',
    renderConfig: {
      minWidth: 120,
      fontSize: '14px',
      borderWidth: 2,
      hasStatusIndicator: false
    }
  },
  [NodeType.REGION]: {
    type: NodeType.REGION,
    canHaveChildren: true,
    canBeInteractive: false,
    canFail: true,
    defaultState: 'available',
    renderConfig: {
      minWidth: 100,
      fontSize: '12px',
      borderWidth: 2,
      hasStatusIndicator: true
    },
    failureBehavior: {
      affectsChildren: true,
      affectsParent: false,
      isolationLevel: 'full'
    }
  },
  [NodeType.AVAILABILITY_ZONE]: {
    type: NodeType.AVAILABILITY_ZONE,
    canHaveChildren: true,
    canBeInteractive: true,
    canFail: true,
    defaultState: 'available',
    renderConfig: {
      minWidth: 90,
      fontSize: '11px',
      borderWidth: 1.5,
      hasStatusIndicator: true
    },
    failureBehavior: {
      affectsChildren: true,
      affectsParent: false,
      isolationLevel: 'full'
    }
  },
  [NodeType.DATA_CENTER]: {
    type: NodeType.DATA_CENTER,
    canHaveChildren: false,
    canBeInteractive: true,
    canFail: true,
    defaultState: 'available',
    renderConfig: {
      minWidth: 40,
      fontSize: '10px',
      borderWidth: 1,
      hasStatusIndicator: true
    },
    failureBehavior: {
      affectsChildren: false,
      affectsParent: true,
      isolationLevel: 'none'
    }
  },
  [NodeType.EDGE_LOCATION]: {
    type: NodeType.EDGE_LOCATION,
    canHaveChildren: false,
    canBeInteractive: false,
    canFail: true,
    defaultState: 'available',
    renderConfig: {
      minWidth: 80,
      fontSize: '10px',
      borderWidth: 1,
      hasStatusIndicator: true
    },
    failureBehavior: {
      affectsChildren: false,
      affectsParent: false,
      isolationLevel: 'none'
    }
  }
}
