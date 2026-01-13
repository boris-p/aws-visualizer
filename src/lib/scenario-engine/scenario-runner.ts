import type { Scenario, ScenarioEvent } from '@/types/scenario'
import type { NodeState } from '@/types/graph'
import type { GraphDefinition } from '@/types/graph-type'
import type {
  ScenarioExecutionContext,
  ScenarioSnapshot,
  EventResult
} from '@/types/scenario-engine'
import type { WaitPoint } from '@/types/token'
import { processEvent } from './event-handlers'
import { TokenEngine } from './token-engine'

export class ScenarioRunner {
  private scenario: Scenario
  private graphTopology: GraphDefinition
  private currentTimeMs: number = 0
  private nodeStates: Map<string, NodeState> = new Map()
  private activeFlowId: string | null = null
  private processedEventIds: Set<string> = new Set()
  private algorithmState: Map<string, unknown> = new Map()
  private tokenEngine: TokenEngine = new TokenEngine()

  constructor(scenario: Scenario, graphTopology?: GraphDefinition) {
    this.scenario = scenario
    this.graphTopology = graphTopology || { id: '', name: '', description: '', nodes: [], edges: [] }
    this.initializeTokenEngine()
  }

  // Initialize token engine with scenario config
  private initializeTokenEngine(): void {
    // Set up config from scenario
    const config = this.scenario.tokenFlowConfig
    if (config) {
      this.tokenEngine.setConfig({
        defaultEdgeDurationMs: config.defaultEdgeDurationMs,
        edgeTimings: config.edgeTimings || [],
        waitPoints: config.waitPoints || [],
        tokenTypes: config.tokenTypes || [],
      })

      // Set up wait points
      if (config.waitPoints) {
        for (const waitPoint of config.waitPoints) {
          this.tokenEngine.setupWaitPoint(waitPoint)
        }
      }
    }

    // Also check for legacy particleConfig and queueAtNodes
    const legacyConfig = this.scenario.particleConfig
    if (legacyConfig) {
      this.tokenEngine.setConfig({
        defaultEdgeDurationMs: legacyConfig.edgeLatencyMs || 1500,
      })
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
          this.tokenEngine.setupWaitPoint(waitPoint)
        }
      }
    }
  }

  // Get current execution context for algorithms and handlers
  private getContext(): ScenarioExecutionContext {
    return {
      scenario: this.scenario,
      currentTimeMs: this.currentTimeMs,
      nodeStates: this.nodeStates,
      graphTopology: this.graphTopology,
      algorithmState: this.algorithmState
    }
  }

  // Apply event result to current state
  private applyResult(result: EventResult): void {
    // Apply node state changes
    for (const [nodeId, changes] of result.nodeStateChanges) {
      const existing = this.nodeStates.get(nodeId)
      this.nodeStates.set(nodeId, {
        id: nodeId,
        status: 'available',
        isAnimating: false,
        ...existing,
        ...changes
      } as NodeState)
    }

    // Note: We no longer store animatingEdges from events
    // Edge highlighting is now derived from active tokens in getSnapshot()
    // This ensures edges and tokens are always in sync by definition

    // Update active flow
    if (result.activeFlowId) {
      this.activeFlowId = result.activeFlowId
    }
  }

  // Get events that should be processed up to a given time
  private getEventsUpTo(timeMs: number): ScenarioEvent[] {
    return this.scenario.events
      .filter(e => e.timestampMs <= timeMs)
      .sort((a, b) => a.timestampMs - b.timestampMs)
  }

  // Reset state to initial
  reset(): void {
    this.currentTimeMs = 0
    this.nodeStates.clear()
    this.activeFlowId = null
    this.processedEventIds.clear()
    this.algorithmState.clear()
    this.tokenEngine.reset()
  }

  // Emit a token for a route-request event using a pre-computed path
  private emitTokenForEvent(event: ScenarioEvent, path: string[]): void {
    if (event.action !== 'route-request') return
    if (path.length < 2) return

    // Determine token type based on scenario or default to http-request
    const tokenTypeId = this.scenario.tokenFlowConfig?.tokenTypes?.[0]?.id || 'http-request'
    const token = this.tokenEngine.emit(tokenTypeId, path, event.timestampMs)
    console.log(`[ScenarioRunner] Emitted token ${token.id} for event ${event.id} with path: [${path.join(' -> ')}]`)
  }

  // Seek to a specific time, rebuilding state from scratch
  seekTo(timeMs: number): ScenarioSnapshot {
    // Reset state
    this.reset()
    this.currentTimeMs = timeMs

    // Get all events up to this time
    const events = this.getEventsUpTo(timeMs)

    // Process events in order
    for (const event of events) {
      const context = this.getContext()
      const result = processEvent(event, context)

      // Apply node state changes from all events
      for (const [nodeId, changes] of result.nodeStateChanges) {
        const existing = this.nodeStates.get(nodeId)
        this.nodeStates.set(nodeId, {
          id: nodeId,
          status: 'available',
          isAnimating: false,
          ...existing,
          ...changes
        } as NodeState)
      }

      // Emit token for route-request events
      if (event.action === 'route-request') {
        if (result.computedPath && result.computedPath.length >= 2) {
          this.emitTokenForEvent(event, result.computedPath)
        }
        if (result.activeFlowId) {
          this.activeFlowId = result.activeFlowId
        }
      }

      this.processedEventIds.add(event.id)
    }

    // Update token engine with current node states before advancing
    this.tokenEngine.setNodeStates(this.nodeStates)

    // Advance token engine to current time
    this.tokenEngine.advanceTo(timeMs)

    // Edge highlighting is derived from tokens in getSnapshot()
    return this.getSnapshot()
  }

  // Advance time incrementally (for animation loop)
  advanceTo(timeMs: number): ScenarioSnapshot {
    // Find new events since last time
    const newEvents = this.scenario.events
      .filter(e =>
        e.timestampMs > this.currentTimeMs &&
        e.timestampMs <= timeMs &&
        !this.processedEventIds.has(e.id)
      )
      .sort((a, b) => a.timestampMs - b.timestampMs) // Sort by timestamp to ensure correct order

    if (newEvents.length > 0) {
      console.log(`[ScenarioRunner] advanceTo(${timeMs}): processing ${newEvents.length} new events`)
    }

    this.currentTimeMs = timeMs

    // Process new events
    for (const event of newEvents) {
      console.log(`[ScenarioRunner] Processing event: ${event.id} (action=${event.action}, timestampMs=${event.timestampMs})`)
      const context = this.getContext()
      const result = processEvent(event, context)
      this.applyResult(result)
      this.processedEventIds.add(event.id)

      // Log node states after applying result
      console.log(`[ScenarioRunner] After applying result, nodeStates:`,
        Array.from(this.nodeStates.entries()).map(([k, v]) => `${k}=${v.status}`).join(', '))

      // Emit token for route-request events using the same computed path
      if (event.action === 'route-request' && result.computedPath && result.computedPath.length >= 2) {
        this.emitTokenForEvent(event, result.computedPath)
      }
    }

    // Update token engine with current node states before advancing
    // This allows tokens to fail when they try to enter unavailable nodes
    this.tokenEngine.setNodeStates(this.nodeStates)

    // Advance token engine
    this.tokenEngine.advanceTo(timeMs)

    return this.getSnapshot()
  }

  // Compute active edges from tokens - ensures edges and tokens are always in sync
  private computeActiveEdgesFromTokens(): Set<string> {
    const activeEdges = new Set<string>()
    const tokens = this.tokenEngine.getTokens()

    for (const token of tokens) {
      if (token.status === 'traveling') {
        // Token is currently on an edge
        const sourceNode = token.path[token.currentEdgeIndex]
        const targetNode = token.path[token.currentEdgeIndex + 1]
        if (sourceNode && targetNode) {
          activeEdges.add(`${sourceNode}-${targetNode}`)
        }
      } else if (token.status === 'waiting') {
        // Token is waiting at a node - highlight edges leading TO that node
        // This shows where the token came from
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
    // Derive active edges from tokens - this ensures they're always in sync
    const activeEdges = this.computeActiveEdgesFromTokens()

    return {
      timeMs: this.currentTimeMs,
      nodeStates: new Map(this.nodeStates),
      animatingEdges: activeEdges, // Use token-derived edges, not event-based
      activeFlowId: this.activeFlowId,
      processedEventIds: new Set(this.processedEventIds),
      tokens: this.tokenEngine.getTokens(),
      waitPoints: this.tokenEngine.getWaitPoints()
    }
  }

  // Convenience getters
  getNodeState(nodeId: string): NodeState | undefined {
    return this.nodeStates.get(nodeId)
  }

  getActiveFlowId(): string | null {
    return this.activeFlowId
  }

  getCurrentTime(): number {
    return this.currentTimeMs
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
