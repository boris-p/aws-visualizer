import type { FanOutStrategy, FanOutResult, FanOutConfig, ScenarioExecutionContext } from '@/types/scenario-engine'

// Helper to check if a node should trigger fan-out based on type or role
function shouldTriggerFanOut(
  nodeId: string,
  context: ScenarioExecutionContext,
  config?: FanOutConfig
): boolean {
  const { graphTopology, nodeStates } = context
  const node = graphTopology.nodes.find(n => n.id === nodeId)
  const nodeState = nodeStates.get(nodeId)

  // If nodeRoles is configured, check the runtime role from metadata
  if (config?.nodeRoles && config.nodeRoles.length > 0) {
    const role = nodeState?.metadata?.role as string | undefined
    if (role && config.nodeRoles.includes(role)) {
      return true
    }
  }

  // If nodeTypes is configured, check the static node type
  if (config?.nodeTypes && config.nodeTypes.length > 0 && node) {
    if (config.nodeTypes.includes(node.type)) {
      return true
    }
  }

  // If neither is configured, don't trigger
  if (!config?.nodeRoles?.length && !config?.nodeTypes?.length) {
    return false
  }

  return false
}

// Quorum-based replication: fan out to all outgoing edges from node,
// complete when quorum children complete
export const quorumReplication: FanOutStrategy = {
  id: 'quorum-replication',

  computeFanOut(
    nodeId: string,
    context: ScenarioExecutionContext,
    config?: FanOutConfig
  ): FanOutResult {
    const { graphTopology, nodeStates } = context

    // Find all outgoing edges from this node
    const outgoingEdges = graphTopology.edges.filter(e => e.source === nodeId)

    if (outgoingEdges.length === 0) {
      return { shouldFanOut: false, childPaths: [], quorumRequired: 0 }
    }

    // Check if this node should trigger fan-out (by type or role)
    if (!shouldTriggerFanOut(nodeId, context, config)) {
      return { shouldFanOut: false, childPaths: [], quorumRequired: 0 }
    }

    // Build child paths (each is just [source, target] for one-hop replication)
    const childPaths: string[][] = []
    for (const edge of outgoingEdges) {
      // Skip edges to unavailable nodes
      const targetState = nodeStates.get(edge.target)
      if (targetState?.status === 'unavailable') {
        continue
      }
      childPaths.push([nodeId, edge.target])
    }

    // Default quorum: majority (ceil of half)
    const totalChildren = outgoingEdges.length
    const defaultQuorum = Math.ceil(totalChildren / 2)
    const quorumRequired = config?.quorumRequired ?? defaultQuorum

    return {
      shouldFanOut: childPaths.length > 0,
      childPaths,
      childTypeId: config?.childTypeId,
      quorumRequired: Math.min(quorumRequired, childPaths.length), // Can't require more than available
    }
  },
}

// Broadcast replication: fan out to all, require all to complete
// Unlike quorum replication, this fails if ANY target is unavailable
export const broadcastReplication: FanOutStrategy = {
  id: 'broadcast-replication',

  computeFanOut(
    nodeId: string,
    context: ScenarioExecutionContext,
    config?: FanOutConfig
  ): FanOutResult {
    const { graphTopology } = context

    // Find all outgoing edges from this node
    const outgoingEdges = graphTopology.edges.filter(e => e.source === nodeId)

    if (outgoingEdges.length === 0) {
      return { shouldFanOut: false, childPaths: [], quorumRequired: 0 }
    }

    // Check if this node should trigger fan-out (by type or role)
    // For broadcast-replication without explicit config, fan out at any node with outgoing edges
    const hasExplicitConfig = config?.nodeRoles?.length || config?.nodeTypes?.length
    if (hasExplicitConfig && !shouldTriggerFanOut(nodeId, context, config)) {
      return { shouldFanOut: false, childPaths: [], quorumRequired: 0 }
    }

    // Build child paths - include all edges, even to unavailable nodes
    // The runner will create failed child tokens for unavailable targets
    const childPaths: string[][] = []
    for (const edge of outgoingEdges) {
      childPaths.push([nodeId, edge.target])
    }

    // Broadcast requires ALL children to complete
    return {
      shouldFanOut: childPaths.length > 0,
      childPaths,
      childTypeId: config?.childTypeId,
      quorumRequired: childPaths.length,
    }
  },
}

// No fan-out: tokens complete at destination without replication
export const noFanOut: FanOutStrategy = {
  id: 'none',

  computeFanOut(): FanOutResult {
    return { shouldFanOut: false, childPaths: [], quorumRequired: 0 }
  },
}
