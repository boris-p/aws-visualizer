import type {
  Token,
  TokenFlowConfig,
  WaitPoint,
  WaitPointState,
} from '@/types/token'
import type { NodeState } from '@/types/graph'
import {
  DEFAULT_TOKEN_FLOW_CONFIG,
  getEdgeDuration,
  calculateTokenProgress,
} from '@/types/token'

export class TokenEngine {
  private tokens: Map<string, Token> = new Map()
  private waitPoints: Map<string, WaitPointState> = new Map()
  private config: TokenFlowConfig = DEFAULT_TOKEN_FLOW_CONFIG
  private nextTokenId: number = 0
  private nodeStates: Map<string, NodeState> = new Map()

  constructor(config?: Partial<TokenFlowConfig>) {
    if (config) {
      this.config = { ...DEFAULT_TOKEN_FLOW_CONFIG, ...config }
    }
  }

  // Update node states (called by scenario runner)
  setNodeStates(nodeStates: Map<string, NodeState>): void {
    this.nodeStates = nodeStates
  }

  // Check if a node is unavailable
  private isNodeUnavailable(nodeId: string): boolean {
    const state = this.nodeStates.get(nodeId)
    return state?.status === 'unavailable'
  }

  // Set configuration
  setConfig(config: Partial<TokenFlowConfig>): void {
    this.config = { ...this.config, ...config }
  }

  // Set up a wait point at a node
  setupWaitPoint(waitPoint: WaitPoint): void {
    this.waitPoints.set(waitPoint.nodeId, {
      nodeId: waitPoint.nodeId,
      tokenIds: [],
      lastProcessedMs: 0,
      config: waitPoint,
    })
  }

  // Emit a new token into the graph
  emit(
    typeId: string,
    path: string[],
    timeMs: number,
    metadata?: Record<string, unknown>
  ): Token {
    const id = `token-${this.nextTokenId++}`

    // Get duration for first edge
    const firstEdgeDuration =
      path.length > 1
        ? getEdgeDuration(path[0], path[1], this.config)
        : this.config.defaultEdgeDurationMs

    const token: Token = {
      id,
      typeId,
      path,
      currentEdgeIndex: 0,
      status: 'traveling',
      emittedAtMs: timeMs,
      currentSegmentStartMs: timeMs,
      currentSegmentDurationMs: firstEdgeDuration,
      progress: 0,
    }

    this.tokens.set(id, token)
    return token
  }

  // Advance all tokens to a given time
  advanceTo(timeMs: number): void {
    // Process wait points first (release tokens)
    this.processWaitPoints(timeMs)

    // Then advance all traveling tokens
    for (const token of this.tokens.values()) {
      if (token.status === 'traveling') {
        this.advanceToken(token, timeMs)
      }
    }

    // Clean up completed/failed tokens after a delay
    this.cleanupTokens(timeMs)
  }

  // Advance a single token
  private advanceToken(token: Token, timeMs: number): void {
    // Calculate progress along current edge
    token.progress = calculateTokenProgress(token, timeMs)

    // Check if we've completed the current edge
    if (token.progress >= 1) {
      this.moveToNextSegment(token, timeMs)
    }
  }

  // Move token to next segment or complete it
  private moveToNextSegment(token: Token, timeMs: number): void {
    const nextEdgeIndex = token.currentEdgeIndex + 1

    // Check if we've reached the end of the path
    if (nextEdgeIndex >= token.path.length - 1) {
      token.status = 'completed'
      token.progress = 1
      return
    }

    // Get the node we just arrived at
    const arrivedAtNode = token.path[nextEdgeIndex]

    // Check if the next node in path is unavailable - fail the token
    const nextNode = token.path[nextEdgeIndex + 1]
    if (nextNode && this.isNodeUnavailable(nextNode)) {
      console.log(`[TokenEngine] Token ${token.id} failed: next node ${nextNode} is unavailable`)
      token.status = 'failed'
      return
    }

    // Also check if the arrived node is unavailable (AZ failed while token was in transit)
    if (this.isNodeUnavailable(arrivedAtNode)) {
      console.log(`[TokenEngine] Token ${token.id} failed: arrived at unavailable node ${arrivedAtNode}`)
      token.status = 'failed'
      return
    }

    const waitPoint = this.waitPoints.get(arrivedAtNode)

    if (waitPoint) {
      // Enter the wait point (queue)
      this.enterWaitPoint(token, waitPoint, timeMs)
    } else {
      // Continue to next edge
      this.startNextEdge(token, nextEdgeIndex, timeMs)
    }
  }

  // Enter a wait point (queue)
  private enterWaitPoint(
    token: Token,
    waitPoint: WaitPointState,
    timeMs: number
  ): void {
    token.status = 'waiting'
    token.waitingAtNode = waitPoint.nodeId
    token.waitPosition = waitPoint.tokenIds.length
    token.progress = 0
    token.currentSegmentStartMs = timeMs // Track when waiting started

    waitPoint.tokenIds.push(token.id)

    // Initialize lastProcessedMs if this is the first token
    if (waitPoint.tokenIds.length === 1 && waitPoint.lastProcessedMs === 0) {
      waitPoint.lastProcessedMs = timeMs
    }
  }

  // Start traversing the next edge
  private startNextEdge(token: Token, edgeIndex: number, timeMs: number): void {
    const sourceNode = token.path[edgeIndex]
    const targetNode = token.path[edgeIndex + 1]
    const duration = getEdgeDuration(sourceNode, targetNode, this.config)

    token.currentEdgeIndex = edgeIndex
    token.currentSegmentStartMs = timeMs
    token.currentSegmentDurationMs = duration
    token.progress = 0
    token.status = 'traveling'
    token.waitingAtNode = undefined
    token.waitPosition = undefined
  }

  // Process wait points - release tokens based on timing
  private processWaitPoints(timeMs: number): void {
    for (const waitPoint of this.waitPoints.values()) {
      this.processWaitPoint(waitPoint, timeMs)
    }
  }

  // Process a single wait point
  private processWaitPoint(waitPoint: WaitPointState, timeMs: number): void {
    const { processIntervalMs } = waitPoint.config

    while (waitPoint.tokenIds.length > 0) {
      const timeSinceLastProcess = timeMs - waitPoint.lastProcessedMs

      if (timeSinceLastProcess >= processIntervalMs) {
        // Release the first token in queue
        const tokenId = waitPoint.tokenIds.shift()
        if (!tokenId) break

        const token = this.tokens.get(tokenId)
        if (!token) continue

        // Calculate when this token was released
        const releaseTime = waitPoint.lastProcessedMs + processIntervalMs

        // Move to next edge
        const nextEdgeIndex = token.currentEdgeIndex + 1
        this.startNextEdge(token, nextEdgeIndex, releaseTime)

        // Update last processed time
        waitPoint.lastProcessedMs = releaseTime

        // Update positions of remaining tokens
        waitPoint.tokenIds.forEach((id, idx) => {
          const t = this.tokens.get(id)
          if (t) t.waitPosition = idx
        })
      } else {
        break
      }
    }
  }

  // Clean up old completed/failed tokens
  private cleanupTokens(timeMs: number): void {
    const cleanupDelay = 800 // Keep visible for 800ms after completion

    for (const [id, token] of this.tokens) {
      if (token.status === 'completed' || token.status === 'failed') {
        const completionTime =
          token.currentSegmentStartMs + token.currentSegmentDurationMs
        if (timeMs - completionTime > cleanupDelay) {
          this.tokens.delete(id)
        }
      }
    }
  }

  // Mark a token as failed
  failToken(tokenId: string): void {
    const token = this.tokens.get(tokenId)
    if (token) {
      token.status = 'failed'
    }
  }

  // Fan-out: spawn child tokens from a parent
  fanOut(
    parentId: string,
    childPaths: string[][],
    typeId: string,
    timeMs: number
  ): Token[] {
    const parent = this.tokens.get(parentId)
    if (!parent) return []

    const children: Token[] = []
    const childIds: string[] = []

    for (const path of childPaths) {
      const child = this.emit(typeId, path, timeMs)
      child.parentTokenId = parentId
      children.push(child)
      childIds.push(child.id)
    }

    parent.childTokenIds = childIds
    parent.status = 'waiting' // Parent waits for children

    return children
  }

  // Reset the engine
  reset(): void {
    this.tokens.clear()
    this.nextTokenId = 0

    // Clear wait point queues but keep configuration
    for (const waitPoint of this.waitPoints.values()) {
      waitPoint.tokenIds = []
      waitPoint.lastProcessedMs = 0
    }
  }

  // Full reset including wait point configuration
  fullReset(): void {
    this.tokens.clear()
    this.waitPoints.clear()
    this.nextTokenId = 0
  }

  // Query methods
  getTokens(): Token[] {
    return Array.from(this.tokens.values())
  }

  getToken(id: string): Token | undefined {
    return this.tokens.get(id)
  }

  getTokensOnEdge(sourceNode: string, targetNode: string): Token[] {
    return this.getTokens().filter((token) => {
      if (token.status !== 'traveling') return false
      const source = token.path[token.currentEdgeIndex]
      const target = token.path[token.currentEdgeIndex + 1]
      return source === sourceNode && target === targetNode
    })
  }

  getTokensWaitingAt(nodeId: string): Token[] {
    return this.getTokens().filter(
      (token) => token.status === 'waiting' && token.waitingAtNode === nodeId
    )
  }

  getActiveTokens(): Token[] {
    return this.getTokens().filter(
      (token) => token.status === 'traveling' || token.status === 'waiting'
    )
  }

  getWaitPoints(): Map<string, WaitPointState> {
    return new Map(this.waitPoints)
  }

  getConfig(): TokenFlowConfig {
    return this.config
  }
}
