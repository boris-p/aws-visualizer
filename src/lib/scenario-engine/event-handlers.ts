import type { ScenarioEvent } from '@/types/scenario'
import type {
  EventHandler,
  EventResult,
  ScenarioExecutionContext,
  PathSelector
} from '@/types/scenario-engine'
import { getDefaultFailureMessage } from '@/types/scenario-engine'
import { algorithmRegistry } from '@/lib/algorithm-registry'

// Create empty result helper
function createEmptyResult(): EventResult {
  return {
    nodeStateChanges: new Map(),
    edgeHighlights: new Set(),
    activeFlowId: null
  }
}

// Fail event handler - marks a node as unavailable
export const failEventHandler: EventHandler = {
  action: 'fail',
  handle(event: ScenarioEvent, _context: ScenarioExecutionContext): EventResult {
    const result = createEmptyResult()

    result.nodeStateChanges.set(event.targetId, {
      id: event.targetId,
      status: 'unavailable',
      sublabel: event.failureMessage || getDefaultFailureMessage(event.targetType),
      isAnimating: true,
      animationType: 'failure',
      lastStateChange: event.timestampMs
    })

    return result
  }
}

// Recover event handler - marks a node as available again
export const recoverEventHandler: EventHandler = {
  action: 'recover',
  handle(event: ScenarioEvent, _context: ScenarioExecutionContext): EventResult {
    const result = createEmptyResult()

    result.nodeStateChanges.set(event.targetId, {
      id: event.targetId,
      status: 'available',
      sublabel: undefined, // Clear sublabel on recovery
      isAnimating: false,
      animationType: undefined,
      lastStateChange: event.timestampMs
    })

    return result
  }
}

// Degrade event handler - marks a node as degraded
export const degradeEventHandler: EventHandler = {
  action: 'degrade',
  handle(event: ScenarioEvent, _context: ScenarioExecutionContext): EventResult {
    const result = createEmptyResult()

    result.nodeStateChanges.set(event.targetId, {
      id: event.targetId,
      status: 'degraded',
      sublabel: event.failureMessage || 'Degraded',
      isAnimating: true,
      animationType: 'pulse',
      lastStateChange: event.timestampMs
    })

    return result
  }
}

// Route request handler - computes path and highlights edges
export const routeRequestHandler: EventHandler = {
  action: 'route-request',
  handle(event: ScenarioEvent, context: ScenarioExecutionContext): EventResult {
    const result = createEmptyResult()
    const { scenario } = context

    // Find the flow - by explicit flowId or by matching targetId
    const flow = event.flowId
      ? scenario.requestFlows.find(f => f.id === event.flowId)
      : scenario.requestFlows.find(f => f.targetServiceId === event.targetId)

    if (!flow) {
      return result
    }

    result.activeFlowId = flow.id

    // Get path selector - use algorithm if configured, otherwise static
    let pathSelector: PathSelector | undefined

    if (scenario.algorithms?.pathSelector) {
      pathSelector = algorithmRegistry.getPathSelector(scenario.algorithms.pathSelector.type)
    }

    // Fall back to static path selector
    if (!pathSelector) {
      pathSelector = algorithmRegistry.getPathSelector('static')
    }

    // Compute the path
    const path = pathSelector?.computePath(flow, context) || flow.path || []

    // Create edge highlights from path
    for (let i = 0; i < path.length - 1; i++) {
      const edgeId = `${path[i]}-${path[i + 1]}`
      result.edgeHighlights.add(edgeId)
    }

    // Mark nodes in path as active (in the active path animation)
    for (const nodeId of path) {
      const existingState = context.nodeStates.get(nodeId)
      // Only update if node is available (don't override failure states)
      if (!existingState || existingState.status === 'available') {
        result.nodeStateChanges.set(nodeId, {
          id: nodeId,
          status: 'available',
          isAnimating: true,
          animationType: 'request-flow',
          lastStateChange: event.timestampMs
        })
      }
    }

    return result
  }
}

// Registry of all built-in handlers
const handlers: Map<string, EventHandler> = new Map([
  ['fail', failEventHandler],
  ['recover', recoverEventHandler],
  ['degrade', degradeEventHandler],
  ['route-request', routeRequestHandler]
])

// Get handler for an action
export function getEventHandler(action: string): EventHandler | undefined {
  return handlers.get(action)
}

// Register a custom handler
export function registerEventHandler(handler: EventHandler): void {
  handlers.set(handler.action, handler)
}

// Process a single event and return the result
export function processEvent(
  event: ScenarioEvent,
  context: ScenarioExecutionContext
): EventResult {
  const handler = getEventHandler(event.action)

  if (!handler) {
    console.warn(`No handler for action: ${event.action}`)
    return createEmptyResult()
  }

  return handler.handle(event, context)
}
