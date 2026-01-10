import type { GraphDefinition, GraphNode, GraphEdge } from '@/types/graph-type'

/**
 * Filters a graph definition based on visible node types.
 * When a node type is filtered out, all downstream nodes connected to it are also filtered out.
 *
 * @param graphDefinition - The original graph definition
 * @param visibleTypes - Set of node types that should be visible
 * @returns Filtered graph definition with only visible nodes and their edges
 */
export function filterGraphByNodeTypes(
  graphDefinition: GraphDefinition,
  visibleTypes: Set<string>
): GraphDefinition {
  // First, identify all nodes that should be visible
  const visibleNodeIds = new Set<string>()

  // Build adjacency map for efficient downstream traversal
  const downstreamMap = new Map<string, Set<string>>()
  graphDefinition.edges.forEach(edge => {
    if (!downstreamMap.has(edge.source)) {
      downstreamMap.set(edge.source, new Set())
    }
    downstreamMap.get(edge.source)!.add(edge.target)
  })

  // Find all nodes that should be filtered out (and their downstream nodes)
  const filteredOutNodes = new Set<string>()

  function markDownstreamAsFiltered(nodeId: string) {
    if (filteredOutNodes.has(nodeId)) return
    filteredOutNodes.add(nodeId)

    const downstream = downstreamMap.get(nodeId)
    if (downstream) {
      downstream.forEach(downstreamId => {
        markDownstreamAsFiltered(downstreamId)
      })
    }
  }

  // Mark nodes with filtered types and all their downstream nodes
  graphDefinition.nodes.forEach(node => {
    if (!visibleTypes.has(node.type)) {
      markDownstreamAsFiltered(node.id)
    }
  })

  // Add all nodes that aren't filtered out to visible set
  graphDefinition.nodes.forEach(node => {
    if (!filteredOutNodes.has(node.id)) {
      visibleNodeIds.add(node.id)
    }
  })

  // Filter nodes
  const filteredNodes = graphDefinition.nodes.filter(node =>
    visibleNodeIds.has(node.id)
  )

  // Filter edges - only keep edges where both source and target are visible
  const filteredEdges = graphDefinition.edges.filter(edge =>
    visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
  )

  return {
    ...graphDefinition,
    nodes: filteredNodes,
    edges: filteredEdges
  }
}

/**
 * Gets all unique node types from a graph definition
 * @param graphDefinition - The graph definition
 * @returns Set of all node types present in the graph
 */
export function getAvailableNodeTypes(graphDefinition: GraphDefinition): Set<string> {
  return new Set(graphDefinition.nodes.map(node => node.type))
}
