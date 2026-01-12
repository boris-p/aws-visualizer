import type { Scenario, ScenarioEvent } from '@/types/scenario'
import type { NodeState } from '@/types/graph'
import type { GraphDefinition } from '@/types/graph-type'
import type {
  ScenarioExecutionContext,
  ScenarioSnapshot,
  EventResult
} from '@/types/scenario-engine'
import { processEvent } from './event-handlers'

export class ScenarioRunner {
  private scenario: Scenario
  private graphTopology: GraphDefinition
  private currentTimeMs: number = 0
  private nodeStates: Map<string, NodeState> = new Map()
  private animatingEdges: Set<string> = new Set()
  private activeFlowId: string | null = null
  private processedEventIds: Set<string> = new Set()
  private algorithmState: Map<string, unknown> = new Map()

  constructor(scenario: Scenario, graphTopology?: GraphDefinition) {
    this.scenario = scenario
    this.graphTopology = graphTopology || { nodes: [], edges: [] }
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

    // Update edge highlights
    this.animatingEdges = result.edgeHighlights

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
    this.animatingEdges.clear()
    this.activeFlowId = null
    this.processedEventIds.clear()
    this.algorithmState.clear()
  }

  // Seek to a specific time, rebuilding state from scratch
  seekTo(timeMs: number): ScenarioSnapshot {
    // Reset state
    this.reset()
    this.currentTimeMs = timeMs

    // Get all events up to this time
    const events = this.getEventsUpTo(timeMs)

    // Process events in order
    // Track the most recent route-request separately for edge highlighting
    let lastRouteResult: EventResult | null = null

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

      // Track the last route-request for edge highlighting
      if (event.action === 'route-request') {
        lastRouteResult = result
      }

      this.processedEventIds.add(event.id)
    }

    // Apply edge highlights from the last route-request
    if (lastRouteResult) {
      this.animatingEdges = lastRouteResult.edgeHighlights
      this.activeFlowId = lastRouteResult.activeFlowId
    }

    return this.getSnapshot()
  }

  // Advance time incrementally (for animation loop)
  advanceTo(timeMs: number): ScenarioSnapshot {
    // Find new events since last time
    const newEvents = this.scenario.events.filter(e =>
      e.timestampMs > this.currentTimeMs &&
      e.timestampMs <= timeMs &&
      !this.processedEventIds.has(e.id)
    )

    this.currentTimeMs = timeMs

    // Process new events
    for (const event of newEvents) {
      const context = this.getContext()
      const result = processEvent(event, context)
      this.applyResult(result)
      this.processedEventIds.add(event.id)
    }

    return this.getSnapshot()
  }

  // Get current snapshot
  getSnapshot(): ScenarioSnapshot {
    return {
      timeMs: this.currentTimeMs,
      nodeStates: new Map(this.nodeStates),
      animatingEdges: new Set(this.animatingEdges),
      activeFlowId: this.activeFlowId,
      processedEventIds: new Set(this.processedEventIds)
    }
  }

  // Convenience getters
  getNodeState(nodeId: string): NodeState | undefined {
    return this.nodeStates.get(nodeId)
  }

  getAnimatingEdges(): Set<string> {
    return new Set(this.animatingEdges)
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
