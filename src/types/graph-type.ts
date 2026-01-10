export interface GraphDefinition {
  id: string
  name: string
  description: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  layoutHints?: {
    direction: 'horizontal' | 'vertical'
    spacing: { x: number; y: number }
  }
}

export interface GraphNode {
  id: string
  label: string
  type: 'root' | 'partition' | 'region' | 'az' | 'dc' | 'edge' | 'custom'
  position: { x: number; y: number }
  isInteractive?: boolean
  style?: {
    background?: string
    border?: string
    borderRadius?: string
    padding?: string
    fontSize?: string
    color?: string
    minWidth?: string
    cursor?: string
    fontWeight?: string
    boxShadow?: string
  }
  metadata?: Record<string, any>
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  type?: 'smoothstep' | 'straight' | 'step'
  style?: {
    stroke?: string
    strokeWidth?: number
    opacity?: number
    strokeDasharray?: string
  }
}
