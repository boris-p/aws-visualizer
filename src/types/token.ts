// Generic token flow visualization types
// Supports HTTP requests, DB writes, messages, auth tokens, etc.

// Token appearance definition - configured per scenario
export interface TokenType {
  id: string
  shape: 'circle' | 'square' | 'diamond' | 'triangle'
  color: string
  size: number
  label?: string
}

// Token status in the flow
export type TokenStatus = 'traveling' | 'waiting' | 'completed' | 'failed'

// Active token instance flowing through the graph
export interface Token {
  id: string
  typeId: string // References a TokenType
  path: string[] // Node IDs to traverse
  currentEdgeIndex: number // Which edge (0 = path[0]→path[1])
  status: TokenStatus

  // Timing
  emittedAtMs: number
  currentSegmentStartMs: number
  currentSegmentDurationMs: number

  // Wait state (when status === 'waiting')
  waitingAtNode?: string
  waitPosition?: number // Position in queue (0 = front)

  // Fan-out tracking (for replication patterns)
  parentTokenId?: string
  childTokenIds?: string[]

  // Computed progress (0-1) along current segment
  progress: number
}

// Wait point configuration - where tokens pause
export interface WaitPoint {
  nodeId: string
  type: 'queue' | 'processing' | 'fanout-wait'
  capacity?: number // Max tokens (optional, undefined = unlimited)
  processIntervalMs: number // Time between releasing tokens
  strategy: 'fifo' | 'priority' | 'batch'
}

// Runtime state of a wait point
export interface WaitPointState {
  nodeId: string
  tokenIds: string[] // Ordered list of waiting token IDs
  lastProcessedMs: number // When we last released a token
  config: WaitPoint
}

// Edge timing configuration
export interface EdgeTiming {
  sourceNode: string
  targetNode: string
  durationMs: number
}

// Full token flow configuration for a scenario
export interface TokenFlowConfig {
  tokenTypes: TokenType[]
  waitPoints: WaitPoint[]
  edgeTimings: EdgeTiming[]
  defaultEdgeDurationMs: number
}

// Default token types for common use cases
export const DEFAULT_TOKEN_TYPES: TokenType[] = [
  { id: 'http-request', shape: 'circle', color: '#3b82f6', size: 8 },
  { id: 'db-write', shape: 'square', color: '#8b5cf6', size: 10 },
  { id: 'message', shape: 'diamond', color: '#10b981', size: 8 },
  { id: 'auth-token', shape: 'triangle', color: '#f59e0b', size: 8 },
  { id: 'sync-op', shape: 'circle', color: '#eab308', size: 8 },
]

// Default configuration
export const DEFAULT_TOKEN_FLOW_CONFIG: TokenFlowConfig = {
  tokenTypes: DEFAULT_TOKEN_TYPES,
  waitPoints: [],
  edgeTimings: [],
  defaultEdgeDurationMs: 1500, // Slow enough to observe (1.5s per edge)
}

// Helper to get token type by ID
export function getTokenType(typeId: string, config?: TokenFlowConfig): TokenType {
  const types = config?.tokenTypes || DEFAULT_TOKEN_TYPES
  return types.find(t => t.id === typeId) || DEFAULT_TOKEN_TYPES[0]
}

// Helper to get edge duration
export function getEdgeDuration(
  sourceNode: string,
  targetNode: string,
  config?: TokenFlowConfig
): number {
  if (!config) return DEFAULT_TOKEN_FLOW_CONFIG.defaultEdgeDurationMs

  const timing = config.edgeTimings.find(
    t => t.sourceNode === sourceNode && t.targetNode === targetNode
  )
  return timing?.durationMs ?? config.defaultEdgeDurationMs
}

// Calculate progress (0-1) for a token at a given time
export function calculateTokenProgress(token: Token, currentTimeMs: number): number {
  if (token.status === 'waiting') return 0
  if (token.status === 'completed') return 1
  if (token.status === 'failed') return token.progress

  const elapsed = currentTimeMs - token.currentSegmentStartMs
  return Math.min(1, Math.max(0, elapsed / token.currentSegmentDurationMs))
}
