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

// Healthiest path selector - finds a path avoiding unhealthy nodes
export const healthiestPathSelector: PathSelector = {
  id: 'healthiest',
  computePath(flow: RequestFlow, context: ScenarioExecutionContext): string[] {
    const { scenario } = context

    // Get load balancer if configured
    const loadBalancer = scenario.algorithms?.loadBalancer
      ? algorithmRegistry.getLoadBalancer(scenario.algorithms.loadBalancer.type)
      : undefined

    // If we have path constraints with candidates, use load balancer
    const candidates = flow.pathConstraints?.candidates
    if (loadBalancer && candidates && candidates.length > 0) {
      const selectedNode = loadBalancer.selectNode(candidates, context)

      // Build path through the selected node
      // This is a simplified version - full implementation would use graph traversal
      const basePath = flow.path || []

      // Replace the AZ/DC portion with the selected node
      const newPath = basePath.map(nodeId => {
        // If this node is one of the candidates, replace with selected
        if (candidates.includes(nodeId)) {
          return selectedNode
        }
        return nodeId
      })

      return newPath
    }

    // Fall back to static path logic
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
