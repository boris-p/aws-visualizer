import type { FailoverStrategy, ScenarioExecutionContext } from '@/types/scenario-engine'

// Same-region failover - finds alternative path within the same region
export const sameRegionFailover: FailoverStrategy = {
  id: 'same-region-failover',
  computeFailover(
    primaryPath: string[],
    failedNodeId: string,
    context: ScenarioExecutionContext
  ): string[] | null {
    // Find the failed node's position in the path
    const failedIndex = primaryPath.indexOf(failedNodeId)
    if (failedIndex === -1) {
      return null // Node not in path
    }

    // Look for sibling nodes (same parent, different ID)
    // This requires knowledge of the graph topology
    const { graphTopology } = context

    // Find the parent of the failed node
    const failedNode = graphTopology.nodes.find(n => n.id === failedNodeId)
    if (!failedNode) {
      return null
    }

    // Find sibling nodes
    const siblingNodes = graphTopology.nodes.filter(n =>
      n.id !== failedNodeId &&
      n.type === failedNode.type &&
      // Check if sibling is healthy
      context.nodeStates.get(n.id)?.status !== 'unavailable'
    )

    if (siblingNodes.length === 0) {
      return null // No healthy siblings
    }

    // Build new path replacing failed node with first healthy sibling
    const newPath = [...primaryPath]
    newPath[failedIndex] = siblingNodes[0].id

    // Also need to update child nodes in path
    // For simplicity, find edges to update downstream path
    const edges = graphTopology.edges || []

    for (let i = failedIndex + 1; i < newPath.length; i++) {
      const currentNodeInPath = primaryPath[i]

      // Find an edge from new parent to a node of same type
      const newEdge = edges.find(e =>
        e.source === newPath[i - 1] &&
        graphTopology.nodes.find(n => n.id === e.target)?.type ===
        graphTopology.nodes.find(n => n.id === currentNodeInPath)?.type
      )

      if (newEdge) {
        newPath[i] = newEdge.target
      }
    }

    return newPath
  }
}

// Cross-region failover - fails over to a different region
export const crossRegionFailover: FailoverStrategy = {
  id: 'cross-region-failover',
  computeFailover(
    primaryPath: string[],
    _failedNodeId: string,
    context: ScenarioExecutionContext
  ): string[] | null {
    const { graphTopology } = context

    // Find region nodes
    const regionNodes = graphTopology.nodes.filter(n =>
      n.type === 'region' &&
      context.nodeStates.get(n.id)?.status !== 'unavailable'
    )

    // Find the current region in path
    const currentRegionIndex = primaryPath.findIndex(id =>
      graphTopology.nodes.find(n => n.id === id)?.type === 'region'
    )

    if (currentRegionIndex === -1 || regionNodes.length < 2) {
      return null
    }

    // Get a different region
    const currentRegionId = primaryPath[currentRegionIndex]
    const alternateRegion = regionNodes.find(r => r.id !== currentRegionId)

    if (!alternateRegion) {
      return null
    }

    // Build new path through alternate region
    // This is simplified - full implementation would do proper graph traversal
    const newPath = [...primaryPath]
    newPath[currentRegionIndex] = alternateRegion.id

    return newPath
  }
}

// No failover - returns null (request fails)
export const noFailover: FailoverStrategy = {
  id: 'none',
  computeFailover(): string[] | null {
    return null
  }
}
