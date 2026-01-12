import type { LoadBalancer, ScenarioExecutionContext } from '@/types/scenario-engine'

// Round-robin load balancer - cycles through healthy candidates
export const roundRobinLoadBalancer: LoadBalancer = {
  id: 'round-robin',
  selectNode(candidates: string[], context: ScenarioExecutionContext): string {
    // Get or initialize round-robin state
    const state = (context.algorithmState.get('round-robin') as { index: number }) || { index: 0 }

    // Filter to healthy candidates only
    const healthyCandidates = candidates.filter(id => {
      const nodeState = context.nodeStates.get(id)
      return !nodeState || nodeState.status !== 'unavailable'
    })

    if (healthyCandidates.length === 0) {
      // Fallback to first candidate if all are unavailable
      return candidates[0]
    }

    // Select next node in round-robin order
    const selected = healthyCandidates[state.index % healthyCandidates.length]

    // Update state for next call
    context.algorithmState.set('round-robin', { index: state.index + 1 })

    return selected
  }
}

// Least connections load balancer - selects node with fewest active connections
export const leastConnectionsLoadBalancer: LoadBalancer = {
  id: 'least-connections',
  selectNode(candidates: string[], context: ScenarioExecutionContext): string {
    const connections = (context.algorithmState.get('connections') as Map<string, number>) || new Map()

    // Filter to healthy candidates
    const healthyCandidates = candidates.filter(id => {
      const nodeState = context.nodeStates.get(id)
      return !nodeState || nodeState.status !== 'unavailable'
    })

    if (healthyCandidates.length === 0) {
      return candidates[0]
    }

    // Find node with fewest connections
    let minNode = healthyCandidates[0]
    let minConns = connections.get(minNode) || 0

    for (const node of healthyCandidates) {
      const conns = connections.get(node) || 0
      if (conns < minConns) {
        minNode = node
        minConns = conns
      }
    }

    // Increment connection count for selected node
    connections.set(minNode, minConns + 1)
    context.algorithmState.set('connections', connections)

    return minNode
  }
}

// Weighted load balancer - selects based on configured weights
export const weightedLoadBalancer: LoadBalancer = {
  id: 'weighted',
  selectNode(candidates: string[], context: ScenarioExecutionContext): string {
    const weights = (context.algorithmState.get('weights') as Map<string, number>) || new Map()

    // Filter to healthy candidates with their weights
    const healthyCandidates = candidates.filter(id => {
      const nodeState = context.nodeStates.get(id)
      return !nodeState || nodeState.status !== 'unavailable'
    })

    if (healthyCandidates.length === 0) {
      return candidates[0]
    }

    // Calculate total weight
    let totalWeight = 0
    for (const node of healthyCandidates) {
      totalWeight += weights.get(node) || 1
    }

    // Random weighted selection
    let random = Math.random() * totalWeight
    for (const node of healthyCandidates) {
      random -= weights.get(node) || 1
      if (random <= 0) {
        return node
      }
    }

    return healthyCandidates[0]
  }
}
