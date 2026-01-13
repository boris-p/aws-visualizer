import type { RequestFlow } from '@/types/scenario'
import type { PathSelector, ScenarioExecutionContext } from '@/types/scenario-engine'
import { algorithmRegistry } from '@/lib/algorithm-registry'

// Static path selector - returns the predefined path from the flow
// This is the default when no algorithm is configured
export const staticPathSelector: PathSelector = {
  id: 'static',
  computePath(flow: RequestFlow, context: ScenarioExecutionContext): string[] {
    const primaryPath = flow.path || []

    // Check each node in path - truncate at first unavailable node
    for (let i = 0; i < primaryPath.length; i++) {
      const nodeId = primaryPath[i]
      const nodeState = context.nodeStates.get(nodeId)

      if (nodeState?.status === 'unavailable') {
        // Try failover path if available
        if (flow.failoverPath && flow.failoverPath.length > 0) {
          const failoverHealthy = flow.failoverPath.every(id => {
            const state = context.nodeStates.get(id)
            return !state || state.status !== 'unavailable'
          })

          if (failoverHealthy) {
            return flow.failoverPath
          }
        }

        // Truncate path at the failed node (include it, stop there)
        // This shows the request reached the failed node but couldn't proceed
        return primaryPath.slice(0, i + 1)
      }
    }

    return primaryPath
  }
}

// Helper to find downstream nodes (e.g., DCs within an AZ) using graph topology
function findDownstreamNodes(nodeId: string, context: ScenarioExecutionContext): string[] {
  const { graphTopology } = context
  if (!graphTopology?.edges) return []

  // Find edges where this node is the source
  return graphTopology.edges
    .filter(edge => edge.source === nodeId)
    .map(edge => edge.target)
}

// Healthiest path selector - finds a path avoiding unhealthy nodes
export const healthiestPathSelector: PathSelector = {
  id: 'healthiest',
  computePath(flow: RequestFlow, context: ScenarioExecutionContext): string[] {
    const { scenario } = context

    console.log(`[PathSelector] healthiest: computing path for flow=${flow.id}`)

    // Get load balancer if configured
    const loadBalancer = scenario.algorithms?.loadBalancer
      ? algorithmRegistry.getLoadBalancer(scenario.algorithms.loadBalancer.type)
      : undefined

    // If we have path constraints with candidates, use load balancer
    const candidates = flow.pathConstraints?.candidates
    console.log(`[PathSelector] candidates=${candidates?.join(', ') || 'none'}, loadBalancer=${loadBalancer?.id || 'none'}`)

    if (loadBalancer && candidates && candidates.length > 0) {
      const selectedNode = loadBalancer.selectNode(candidates, context)
      const basePath = flow.path || []

      console.log(`[PathSelector] loadBalancer selected: ${selectedNode}`)

      // Check if any candidate is already in the path (replace mode)
      const hasCandidate = basePath.some(nodeId => candidates.includes(nodeId))

      if (hasCandidate) {
        // Replace mode: swap candidate nodes with selected
        const result = basePath.map(nodeId => {
          if (candidates.includes(nodeId)) {
            return selectedNode
          }
          return nodeId
        })
        console.log(`[PathSelector] Replace mode result: [${result.join(' -> ')}]`)
        return result
      } else {
        // Append mode: path ends before candidates (e.g., at ALB)
        // Append the selected node and find a downstream DC
        const fullPath = [...basePath, selectedNode]

        // Find DCs within the selected AZ
        const downstreamNodes = findDownstreamNodes(selectedNode, context)
        console.log(`[PathSelector] Downstream nodes from ${selectedNode}: [${downstreamNodes.join(', ')}]`)

        if (downstreamNodes.length > 0) {
          // Pick first healthy DC, or first one if all unhealthy
          const healthyDc = downstreamNodes.find(nodeId => {
            const state = context.nodeStates.get(nodeId)
            return !state || state.status !== 'unavailable'
          })
          fullPath.push(healthyDc || downstreamNodes[0])
        }

        console.log(`[PathSelector] Append mode result: [${fullPath.join(' -> ')}]`)
        return fullPath
      }
    }

    // Fall back to static path logic
    console.log(`[PathSelector] Falling back to static path selector`)
    return staticPathSelector.computePath(flow, context)
  }
}

// Geo-aware path selector - prefers geographically closer nodes
export const geoAwarePathSelector: PathSelector = {
  id: 'geo-aware',
  computePath(flow: RequestFlow, context: ScenarioExecutionContext): string[] {
    // For now, delegates to healthiest path
    // Full implementation would consider edge location and latency
    return healthiestPathSelector.computePath(flow, context)
  }
}
