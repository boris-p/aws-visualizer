import type { RequestFlow, Scenario, ScenarioEvent } from '@/types/scenario'
import type { NodeState } from '@/types/graph'

export class AWSRoutingEngine {
  /**
   * Calculate request path based on AWS routing rules
   */
  static calculatePath(
    sourceLocation: string,
    targetServiceId: string,
    useCloudFront: boolean,
    availableNodes: Map<string, NodeState>
  ): string[] {
    // AWS-accurate logic:
    // 1. Start from nearest edge location (if CloudFront enabled)
    // 2. Route to region containing service
    // 3. Select healthy AZ using round-robin/least-conn
    // 4. Route to healthy instance in selected AZ

    const path: string[] = []

    // For simplicity, return empty path
    // This will be populated based on scenario's RequestFlow paths
    return path
  }

  /**
   * Calculate failover path when primary fails
   */
  static calculateFailoverPath(
    primaryPath: string[],
    failedNodeId: string,
    availableNodes: Map<string, NodeState>
  ): string[] | null {
    // AWS-accurate failover logic:
    // - If edge fails: route to next closest edge
    // - If AZ fails: route to next healthy AZ in same region
    // - If region fails: return null (no cross-region failover without config)

    // Find the index of the failed node in the path
    const failedIndex = primaryPath.indexOf(failedNodeId)
    if (failedIndex === -1) {
      return primaryPath // Failed node not in path, keep original
    }

    // If it's an AZ failure, find alternative AZ
    if (failedNodeId.startsWith('az-')) {
      // Extract region from AZ ID
      const regionMatch = failedNodeId.match(/az-([\w-]+)-\w+$/)
      if (regionMatch) {
        const regionId = regionMatch[1]
        // Find alternative healthy AZ in same region
        for (const [nodeId, state] of availableNodes) {
          if (nodeId.startsWith(`az-${regionId}-`) &&
              nodeId !== failedNodeId &&
              state.status === 'available') {
            // Replace failed AZ with healthy one
            const newPath = [...primaryPath]
            newPath[failedIndex] = nodeId
            return newPath
          }
        }
      }
    }

    return null // No failover available
  }

  /**
   * Simulate health check detection delay (60-90s for ALB)
   */
  static getHealthCheckDelayMs(failureType: string): number {
    switch (failureType) {
      case 'az-outage':
        return 60000 // 60 seconds
      case 'instance-failure':
        return 30000 // 30 seconds
      case 'network-partition':
        return 45000 // 45 seconds
      default:
        return 30000
    }
  }

  /**
   * Propagate failure to child resources (AWS isolation model)
   */
  static propagateFailure(
    failedNodeId: string,
    nodeType: string,
    allNodes: Map<string, any>
  ): string[] {
    const affectedIds: string[] = []

    // AZ failure → all instances/DCs in AZ
    if (nodeType === 'az' || failedNodeId.startsWith('az-')) {
      for (const nodeId of allNodes.keys()) {
        // Find data centers in this AZ
        if (nodeId.startsWith('dc-') && nodeId.includes(failedNodeId.replace('az-', ''))) {
          affectedIds.push(nodeId)
        }
      }
    }

    // Region failure → all AZs in region
    if (nodeType === 'region' || failedNodeId.startsWith('region-')) {
      const regionPart = failedNodeId.replace('region-', '')
      for (const nodeId of allNodes.keys()) {
        if (nodeId.startsWith('az-') && nodeId.includes(regionPart)) {
          affectedIds.push(nodeId)
        }
      }
    }

    return affectedIds
  }
}
