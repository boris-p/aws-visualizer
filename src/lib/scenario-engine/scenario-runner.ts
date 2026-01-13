import type { Scenario, ScenarioEvent } from '@/types/scenario'
import type { NodeState } from '@/types/graph'
import type { GraphDefinition } from '@/types/graph-type'
import type {
  ScenarioExecutionContext,
  ScenarioSnapshot,
  EventResult,
} from '@/types/scenario-engine'
import type { WaitPoint, Token, TokenFlowConfig, WaitPointState } from '@/types/token'
import { processEvent } from './event-handlers'
import {
  SimulationStateStore,
  TokenManager,
  NodeManager,
  WaitPointManager,
  createInitialSimulationState,
} from '@/lib/state'
import type { SimulationState } from '@/lib/state'
import {
  DEFAULT_TOKEN_FLOW_CONFIG,
  getEdgeDuration,
  calculateTokenProgress,
} from '@/types/token'

export class ScenarioRunner {
  private scenario: Scenario
  private graphTopology: GraphDefinition

  // New state management system
  private store: SimulationStateStore<SimulationState>
  private tokenManager: TokenManager
  private nodeManager: NodeManager
  private waitPointManager: WaitPointManager

  // Token engine configuration
  private config: TokenFlowConfig = DEFAULT_TOKEN_FLOW_CONFIG
  private nextTokenId: number = 0

  constructor(scenario: Scenario, graphTopology?: GraphDefinition) {
    this.scenario = scenario
    this.graphTopology = graphTopology || {
      id: '',
      name: '',
      description: '',
      nodes: [],
      edges: [],
    }

    // Initialize state store and managers
    this.store = new SimulationStateStore(createInitialSimulationState())
    this.tokenManager = new TokenManager(this.store)
    this.nodeManager = new NodeManager(this.store)
    this.waitPointManager = new WaitPointManager(this.store)

    this.initializeConfig()
  }

  // Initialize token engine configuration from scenario
  private initializeConfig(): void {
    const config = this.scenario.tokenFlowConfig
    if (config) {
      this.config = {
        ...DEFAULT_TOKEN_FLOW_CONFIG,
        defaultEdgeDurationMs:
          config.defaultEdgeDurationMs ?? DEFAULT_TOKEN_FLOW_CONFIG.defaultEdgeDurationMs,
        edgeTimings: config.edgeTimings || [],
        waitPoints: config.waitPoints || [],
        tokenTypes: config.tokenTypes || [],
      }

      // Set up wait points
      if (config.waitPoints) {
        for (const waitPoint of config.waitPoints) {
          this.waitPointManager.setup(waitPoint)
        }
      }
    }

    // Also check for legacy particleConfig
    const legacyConfig = this.scenario.particleConfig
    if (legacyConfig) {
      this.config = {
        ...this.config,
        defaultEdgeDurationMs: legacyConfig.edgeLatencyMs || 1500,
      }
    }

    // Set up queues at nodes specified in request flows
    for (const flow of this.scenario.requestFlows) {
      if (flow.queueAtNodes) {
        for (const nodeId of flow.queueAtNodes) {
          const waitPoint: WaitPoint = {
            nodeId,
            type: 'queue',
            processIntervalMs: legacyConfig?.queueProcessingMs || 800,
            strategy: 'fifo',
          }
          this.waitPointManager.setup(waitPoint)
        }
      }
    }

    // Save initial state checkpoint at t=0
    this.store.checkpoint(0)
  }

  // Get current execution context for algorithms and handlers
  private getContext(): ScenarioExecutionContext {
    // Build nodeStates map from node manager for algorithm compatibility
    const nodeStates = new Map<string, NodeState>()
    for (const node of this.nodeManager.getAll()) {
      nodeStates.set(node.id, node)
    }

    return {
      scenario: this.scenario,
      currentTimeMs: this.store.getTimeMs(),
      nodeStates,
      graphTopology: this.graphTopology,
      algorithmState: this.store.getState().algorithmState,
    }
  }

  // Apply event result to current state
  private applyResult(result: EventResult): void {
    // Apply node state changes
    for (const [nodeId, changes] of result.nodeStateChanges) {
      const existing = this.nodeManager.get(nodeId)
      if (existing) {
        this.nodeManager.update(nodeId, changes)
      } else {
        this.nodeManager.set(nodeId, {
          id: nodeId,
          status: 'available',
          isAnimating: false,
          ...changes,
        } as NodeState)
      }
    }

    // Update active flow
    if (result.activeFlowId) {
      this.store.updateSlice(
        'algorithmState',
        (state) => new Map(state).set('activeFlowId', result.activeFlowId)
      )
    }
  }

  // Get events that should be processed up to a given time
  private getEventsUpTo(timeMs: number): ScenarioEvent[] {
    return this.scenario.events
      .filter((e) => e.timestampMs <= timeMs)
      .sort((a, b) => a.timestampMs - b.timestampMs)
  }

  // Emit a token for a route-request event
  private emitToken(path: string[], timeMs: number): Token {
    const id = `token-${this.nextTokenId++}`
    const tokenTypeId =
      this.scenario.tokenFlowConfig?.tokenTypes?.[0]?.id || 'http-request'

    // Get duration for first edge
    const firstEdgeDuration =
      path.length > 1
        ? getEdgeDuration(path[0], path[1], this.config)
        : this.config.defaultEdgeDurationMs

    const token: Token = {
      id,
      typeId: tokenTypeId,
      path,
      currentEdgeIndex: 0,
      status: 'traveling',
      emittedAtMs: timeMs,
      currentSegmentStartMs: timeMs,
      currentSegmentDurationMs: firstEdgeDuration,
      progress: 0,
    }

    this.tokenManager.add(token)
    return token
  }

  // Check if a node is unavailable
  private isNodeUnavailable(nodeId: string): boolean {
    return this.nodeManager.isUnavailable(nodeId)
  }

  // Advance all tokens to a given time
  private advanceTokens(timeMs: number): void {
    // We need to iterate because:
    // 1. Advancing tokens may add them to wait points
    // 2. Processing wait points may release tokens that need advancing
    // Keep iterating until state stabilizes
    const maxIterations = 100 // Safety limit
    let iteration = 0

    while (iteration < maxIterations) {
      iteration++
      const tokensBefore = this.tokenManager.getAll().map((t) => `${t.id}:${t.status}:${t.currentEdgeIndex}`).join(',')

      // First advance all traveling tokens
      for (const token of this.tokenManager.getByStatus('traveling')) {
        this.advanceToken(token, timeMs)
      }

      // Then process wait points (release tokens that have waited long enough)
      this.processWaitPoints(timeMs)

      // Check if state changed
      const tokensAfter = this.tokenManager.getAll().map((t) => `${t.id}:${t.status}:${t.currentEdgeIndex}`).join(',')
      if (tokensBefore === tokensAfter) {
        break // State stabilized
      }
    }

    if (iteration === maxIterations) {
      console.warn(`[advanceTokens] Hit max iterations at timeMs=${timeMs}`)
    }

    // Clean up completed/failed tokens after a delay
    this.cleanupTokens(timeMs)
  }

  // Advance a single token, potentially through multiple edges
  private advanceToken(token: Token, timeMs: number): void {
    let currentToken = token

    // Keep advancing until we're not past the end of an edge
    while (currentToken.status === 'traveling') {
      const progress = calculateTokenProgress(currentToken, timeMs)

      if (progress >= 1) {
        // Calculate when this edge actually ended
        const edgeEndTime =
          currentToken.currentSegmentStartMs + currentToken.currentSegmentDurationMs
        this.moveToNextSegment(currentToken.id, edgeEndTime)

        // Get updated token state
        const updated = this.tokenManager.get(currentToken.id)
        if (!updated || updated.status !== 'traveling') break
        currentToken = updated
      } else {
        // Still on this edge, update progress and stop
        this.tokenManager.update(currentToken.id, { progress })
        break
      }
    }
  }

  // Move token to next segment or complete it
  private moveToNextSegment(tokenId: string, timeMs: number): void {
    const token = this.tokenManager.get(tokenId)
    if (!token) return

    const nextEdgeIndex = token.currentEdgeIndex + 1

    // Check if we've reached the end of the path
    if (nextEdgeIndex >= token.path.length - 1) {
      this.tokenManager.update(tokenId, { status: 'completed', progress: 1 })
      return
    }

    // Get the node we just arrived at
    const arrivedAtNode = token.path[nextEdgeIndex]

    // Check if the next node in path is unavailable - fail the token
    const nextNode = token.path[nextEdgeIndex + 1]
    if (nextNode && this.isNodeUnavailable(nextNode)) {
      this.tokenManager.update(tokenId, { status: 'failed' })
      return
    }

    // Also check if the arrived node is unavailable
    if (this.isNodeUnavailable(arrivedAtNode)) {
      this.tokenManager.update(tokenId, { status: 'failed' })
      return
    }

    // Check for wait point at arrived node
    if (this.waitPointManager.has(arrivedAtNode)) {
      this.enterWaitPoint(tokenId, arrivedAtNode, timeMs)
    } else {
      this.startNextEdge(tokenId, nextEdgeIndex, timeMs)
    }
  }

  // Enter a wait point (queue)
  private enterWaitPoint(
    tokenId: string,
    nodeId: string,
    timeMs: number
  ): void {
    const position = this.waitPointManager.enqueue(nodeId, tokenId, timeMs)

    this.tokenManager.update(tokenId, {
      status: 'waiting',
      waitingAtNode: nodeId,
      waitPosition: position,
      progress: 0,
      currentSegmentStartMs: timeMs,
    })
  }

  // Start traversing the next edge
  private startNextEdge(
    tokenId: string,
    edgeIndex: number,
    timeMs: number
  ): void {
    const token = this.tokenManager.get(tokenId)
    if (!token) return

    const sourceNode = token.path[edgeIndex]
    const targetNode = token.path[edgeIndex + 1]
    const duration = getEdgeDuration(sourceNode, targetNode, this.config)

    this.tokenManager.update(tokenId, {
      currentEdgeIndex: edgeIndex,
      currentSegmentStartMs: timeMs,
      currentSegmentDurationMs: duration,
      progress: 0,
      status: 'traveling',
      waitingAtNode: undefined,
      waitPosition: undefined,
    })
  }

  // Process wait points - release tokens based on timing
  private processWaitPoints(timeMs: number): void {
    for (const waitPointState of this.waitPointManager.getAll()) {
      this.processWaitPoint(waitPointState.nodeId, timeMs)
    }
  }

  // Process a single wait point
  private processWaitPoint(nodeId: string, timeMs: number): void {
    while (this.waitPointManager.canRelease(nodeId, timeMs)) {
      const releaseTime = this.waitPointManager.getNextReleaseTime(nodeId)
      if (releaseTime === undefined) break

      const tokenId = this.waitPointManager.dequeue(nodeId, releaseTime)
      if (!tokenId) break

      const token = this.tokenManager.get(tokenId)
      if (!token) continue

      // Move to next edge
      const nextEdgeIndex = token.currentEdgeIndex + 1
      this.startNextEdge(tokenId, nextEdgeIndex, releaseTime)

      // Update positions of remaining tokens
      const waitingTokenIds = this.waitPointManager.getWaitingTokenIds(nodeId)
      waitingTokenIds.forEach((id, idx) => {
        this.tokenManager.update(id, { waitPosition: idx })
      })
    }
  }

  // Clean up old completed/failed tokens
  private cleanupTokens(timeMs: number): void {
    const cleanupDelay = 800

    for (const token of this.tokenManager.getAll()) {
      if (token.status === 'completed' || token.status === 'failed') {
        const completionTime =
          token.currentSegmentStartMs + token.currentSegmentDurationMs
        if (timeMs - completionTime > cleanupDelay) {
          this.tokenManager.remove(token.id)
        }
      }
    }
  }

  // Reset state to initial
  reset(): void {
    this.store.restoreTo(0)
    this.nextTokenId = 0
  }

  // Seek to a specific time, using checkpoints for efficiency
  seekTo(timeMs: number): ScenarioSnapshot {
    // Restore to the nearest checkpoint at or before the target time
    this.store.restoreTo(timeMs)

    // Reset token ID counter based on restored state
    const tokens = this.tokenManager.getAll()
    const maxId = tokens.reduce((max, t) => {
      const num = parseInt(t.id.replace('token-', ''), 10)
      return isNaN(num) ? max : Math.max(max, num)
    }, -1)
    this.nextTokenId = maxId + 1

    // Get events that need to be processed from checkpoint to target
    const allEvents = this.getEventsUpTo(timeMs)
    const processedIds = this.store.getState().processedEventIds

    // Process only events not yet processed (since checkpoint)
    for (const event of allEvents) {
      if (processedIds.has(event.id)) continue

      const context = this.getContext()
      const result = processEvent(event, context)
      this.applyResult(result)

      // Emit token for route-request events
      if (
        event.action === 'route-request' &&
        result.computedPath &&
        result.computedPath.length >= 2
      ) {
        this.emitToken(result.computedPath, event.timestampMs)
      }

      // Mark event as processed
      this.store.updateSlice(
        'processedEventIds',
        (ids) => new Set([...ids, event.id])
      )

      // Checkpoint after each event
      this.store.checkpoint(event.timestampMs)
    }

    // Update store time
    this.store.setTimeMs(timeMs)

    // Advance tokens to current time
    this.advanceTokens(timeMs)

    return this.getSnapshot()
  }

  // Advance time incrementally (for animation loop)
  advanceTo(timeMs: number): ScenarioSnapshot {
    const currentTime = this.store.getTimeMs()
    const processedIds = this.store.getState().processedEventIds

    // Find new events since last time
    const newEvents = this.scenario.events
      .filter(
        (e) =>
          e.timestampMs > currentTime &&
          e.timestampMs <= timeMs &&
          !processedIds.has(e.id)
      )
      .sort((a, b) => a.timestampMs - b.timestampMs)

    // Process new events
    for (const event of newEvents) {
      const context = this.getContext()
      const result = processEvent(event, context)
      this.applyResult(result)

      // Emit token for route-request events
      if (
        event.action === 'route-request' &&
        result.computedPath &&
        result.computedPath.length >= 2
      ) {
        this.emitToken(result.computedPath, event.timestampMs)
      }

      // Mark event as processed
      this.store.updateSlice(
        'processedEventIds',
        (ids) => new Set([...ids, event.id])
      )

      // Checkpoint after each event
      this.store.checkpoint(event.timestampMs)
    }

    // Update time
    this.store.setTimeMs(timeMs)

    // Advance tokens
    this.advanceTokens(timeMs)

    return this.getSnapshot()
  }

  // Compute active edges from tokens
  private computeActiveEdgesFromTokens(): Set<string> {
    const activeEdges = new Set<string>()
    const tokens = this.tokenManager.getAll()

    for (const token of tokens) {
      if (token.status === 'traveling') {
        const sourceNode = token.path[token.currentEdgeIndex]
        const targetNode = token.path[token.currentEdgeIndex + 1]
        if (sourceNode && targetNode) {
          activeEdges.add(`${sourceNode}-${targetNode}`)
        }
      } else if (token.status === 'waiting') {
        // Highlight edges leading TO the waiting node
        if (token.currentEdgeIndex > 0) {
          const prevSource = token.path[token.currentEdgeIndex - 1]
          const prevTarget = token.path[token.currentEdgeIndex]
          if (prevSource && prevTarget) {
            activeEdges.add(`${prevSource}-${prevTarget}`)
          }
        }
      }
    }

    return activeEdges
  }

  // Get current snapshot
  getSnapshot(): ScenarioSnapshot {
    const activeEdges = this.computeActiveEdgesFromTokens()
    const algorithmState = this.store.getState().algorithmState
    const activeFlowId = (algorithmState.get('activeFlowId') as string) || null

    // Build nodeStates map
    const nodeStates = new Map<string, NodeState>()
    for (const node of this.nodeManager.getAll()) {
      nodeStates.set(node.id, node)
    }

    // Build waitPoints map
    const waitPoints = new Map<string, WaitPointState>()
    for (const wp of this.waitPointManager.getAll()) {
      waitPoints.set(wp.nodeId, wp)
    }

    return {
      timeMs: this.store.getTimeMs(),
      nodeStates,
      animatingEdges: activeEdges,
      activeFlowId,
      processedEventIds: new Set(this.store.getState().processedEventIds),
      tokens: this.tokenManager.getAll(),
      waitPoints,
    }
  }

  // Convenience getters
  getNodeState(nodeId: string): NodeState | undefined {
    return this.nodeManager.get(nodeId)
  }

  getActiveFlowId(): string | null {
    const algorithmState = this.store.getState().algorithmState
    return (algorithmState.get('activeFlowId') as string) || null
  }

  getCurrentTime(): number {
    return this.store.getTimeMs()
  }

  getDuration(): number {
    return this.scenario.durationMs
  }

  getScenario(): Scenario {
    return this.scenario
  }

  // Set graph topology (for algorithms that need it)
  setGraphTopology(topology: GraphDefinition): void {
    this.graphTopology = topology
  }
}
