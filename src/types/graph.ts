export interface NodeState {
  id: string
  status: 'available' | 'unavailable' | 'degraded'
  sublabel?: string // Text shown under node (e.g., "AZ Unavailable")
  metadata?: Record<string, unknown> // Arbitrary metadata (e.g., { role: "primary" })
  isAnimating: boolean
  animationType?: 'request-flow' | 'pulse' | 'failure' | 'promotion'
  lastStateChange?: number
  manualOverride?: boolean
}

export interface EdgeState {
  id: string
  isAnimating: boolean
  animationSpeed: 'slow' | 'normal' | 'fast'
  flowDirection: 'forward' | 'reverse'
}
