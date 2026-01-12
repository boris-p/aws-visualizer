import type { ConsensusAlgorithm, QuorumConfig } from '@/types/scenario-engine'

// Majority quorum - standard quorum-based consensus
export const majorityQuorum: ConsensusAlgorithm = {
  id: 'majority-quorum',
  canRead(availableNodes: string[], config: QuorumConfig): boolean {
    return availableNodes.length >= config.readQuorum
  },
  canWrite(availableNodes: string[], config: QuorumConfig): boolean {
    return availableNodes.length >= config.writeQuorum
  }
}

// Strict quorum - requires all nodes for writes
export const strictQuorum: ConsensusAlgorithm = {
  id: 'strict-quorum',
  canRead(availableNodes: string[], config: QuorumConfig): boolean {
    return availableNodes.length >= config.readQuorum
  },
  canWrite(availableNodes: string[], config: QuorumConfig): boolean {
    return availableNodes.length === config.totalNodes
  }
}

// Eventually consistent - always allows reads, needs majority for writes
export const eventuallyConsistent: ConsensusAlgorithm = {
  id: 'eventually-consistent',
  canRead(_availableNodes: string[], _config: QuorumConfig): boolean {
    // Reads always succeed in eventually consistent systems
    return true
  },
  canWrite(availableNodes: string[], _config: QuorumConfig): boolean {
    // Writes succeed if at least one node is available
    return availableNodes.length > 0
  }
}
