import type {
  LoadBalancer,
  PathSelector,
  FailoverStrategy,
  ConsensusAlgorithm,
  FanOutStrategy
} from '@/types/scenario-engine'

import {
  roundRobinLoadBalancer,
  leastConnectionsLoadBalancer,
  weightedLoadBalancer
} from './algorithms/load-balancers'

import {
  staticPathSelector,
  healthiestPathSelector,
  geoAwarePathSelector,
  primaryAwarePathSelector
} from './algorithms/path-selectors'

import {
  sameRegionFailover,
  crossRegionFailover,
  noFailover
} from './algorithms/failover-strategies'

import {
  majorityQuorum,
  strictQuorum,
  eventuallyConsistent
} from './algorithms/consensus'

import {
  quorumReplication,
  broadcastReplication,
  noFanOut
} from './algorithms/fan-out-strategies'

class AlgorithmRegistry {
  private loadBalancers = new Map<string, LoadBalancer>()
  private pathSelectors = new Map<string, PathSelector>()
  private failoverStrategies = new Map<string, FailoverStrategy>()
  private consensusAlgorithms = new Map<string, ConsensusAlgorithm>()
  private fanOutStrategies = new Map<string, FanOutStrategy>()

  constructor() {
    // Register built-in algorithms
    this.registerDefaults()
  }

  private registerDefaults(): void {
    // Load balancers
    this.registerLoadBalancer(roundRobinLoadBalancer)
    this.registerLoadBalancer(leastConnectionsLoadBalancer)
    this.registerLoadBalancer(weightedLoadBalancer)

    // Path selectors
    this.registerPathSelector(staticPathSelector)
    this.registerPathSelector(healthiestPathSelector)
    this.registerPathSelector(geoAwarePathSelector)
    this.registerPathSelector(primaryAwarePathSelector)

    // Failover strategies
    this.registerFailoverStrategy(sameRegionFailover)
    this.registerFailoverStrategy(crossRegionFailover)
    this.registerFailoverStrategy(noFailover)

    // Consensus algorithms
    this.registerConsensusAlgorithm(majorityQuorum)
    this.registerConsensusAlgorithm(strictQuorum)
    this.registerConsensusAlgorithm(eventuallyConsistent)

    // Fan-out strategies
    this.registerFanOutStrategy(quorumReplication)
    this.registerFanOutStrategy(broadcastReplication)
    this.registerFanOutStrategy(noFanOut)
  }

  // Load Balancers
  registerLoadBalancer(algo: LoadBalancer): void {
    this.loadBalancers.set(algo.id, algo)
  }

  getLoadBalancer(id: string): LoadBalancer | undefined {
    return this.loadBalancers.get(id)
  }

  // Path Selectors
  registerPathSelector(algo: PathSelector): void {
    this.pathSelectors.set(algo.id, algo)
  }

  getPathSelector(id: string): PathSelector | undefined {
    return this.pathSelectors.get(id)
  }

  // Failover Strategies
  registerFailoverStrategy(algo: FailoverStrategy): void {
    this.failoverStrategies.set(algo.id, algo)
  }

  getFailoverStrategy(id: string): FailoverStrategy | undefined {
    return this.failoverStrategies.get(id)
  }

  // Consensus Algorithms
  registerConsensusAlgorithm(algo: ConsensusAlgorithm): void {
    this.consensusAlgorithms.set(algo.id, algo)
  }

  getConsensusAlgorithm(id: string): ConsensusAlgorithm | undefined {
    return this.consensusAlgorithms.get(id)
  }

  // Fan-out Strategies
  registerFanOutStrategy(algo: FanOutStrategy): void {
    this.fanOutStrategies.set(algo.id, algo)
  }

  getFanOutStrategy(id: string): FanOutStrategy | undefined {
    return this.fanOutStrategies.get(id)
  }

  // List available algorithms
  listLoadBalancers(): string[] {
    return Array.from(this.loadBalancers.keys())
  }

  listPathSelectors(): string[] {
    return Array.from(this.pathSelectors.keys())
  }

  listFailoverStrategies(): string[] {
    return Array.from(this.failoverStrategies.keys())
  }

  listConsensusAlgorithms(): string[] {
    return Array.from(this.consensusAlgorithms.keys())
  }

  listFanOutStrategies(): string[] {
    return Array.from(this.fanOutStrategies.keys())
  }
}

// Singleton instance
export const algorithmRegistry = new AlgorithmRegistry()
