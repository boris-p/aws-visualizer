import { describe, it, expect } from 'vitest'
import { ScenarioRunner } from '../scenario-runner'
import auroraWriteQuorumScenario from '@/data/scenarios/aurora-write-quorum.json'
import auroraRegionalFailoverScenario from '@/data/scenarios/aurora-regional-failover.json'
import auroraReadScalingScenario from '@/data/scenarios/aurora-read-scaling.json'
import auroraGraph from '@/data/graphs/aurora-global-database.json'
import type { Scenario } from '@/types/scenario'
import type { GraphDefinition } from '@/types/graph-type'

describe('Aurora Global Database', () => {
  const graph = auroraGraph as unknown as GraphDefinition

  describe('Graph Structure', () => {
    it('should have client and endpoints', () => {
      const nodeIds = graph.nodes.map(n => n.id)

      expect(nodeIds).toContain('client')
      expect(nodeIds).toContain('global-writer-endpoint')
      expect(nodeIds).toContain('us-reader-endpoint')
      expect(nodeIds).toContain('eu-reader-endpoint')
    })

    it('should have 2 regions with 2 AZs each', () => {
      const nodeIds = graph.nodes.map(n => n.id)

      expect(nodeIds).toContain('region-us-east-1')
      expect(nodeIds).toContain('region-eu-west-1')

      expect(nodeIds).toContain('us-az-1')
      expect(nodeIds).toContain('us-az-2')

      expect(nodeIds).toContain('eu-az-1')
      expect(nodeIds).toContain('eu-az-2')
    })

    it('should have compute instances: 1 writer + 1 US reader + 2 EU readers', () => {
      const nodeIds = graph.nodes.map(n => n.id)

      expect(nodeIds).toContain('us-writer')
      expect(nodeIds).toContain('us-reader-1')

      expect(nodeIds).toContain('eu-reader-1')
      expect(nodeIds).toContain('eu-reader-2')
    })

    it('should have shared storage nodes per region', () => {
      const nodeIds = graph.nodes.map(n => n.id)

      expect(nodeIds).toContain('us-shared-storage')
      expect(nodeIds).toContain('eu-shared-storage')
    })

    it('should have cross-region replication edge between storage nodes', () => {
      const replicationEdge = graph.edges.find(e => e.id === 'cross-region-replication')
      expect(replicationEdge).toBeDefined()
      expect(replicationEdge?.source).toBe('us-shared-storage')
      expect(replicationEdge?.target).toBe('eu-shared-storage')
    })
  })

  describe('Write Quorum Scenario', () => {
    const scenario = auroraWriteQuorumScenario as unknown as Scenario

    it('should set us-writer as primary at t=0', () => {
      const runner = new ScenarioRunner(scenario, graph)
      const snapshot = runner.seekTo(100)

      const writerState = snapshot.nodeStates.get('us-writer')
      expect(writerState?.metadata?.role).toBe('primary')
    })

    it('should route writes through global writer endpoint to storage', () => {
      const runner = new ScenarioRunner(scenario, graph)
      const snapshot = runner.seekTo(1500)

      const tokens = snapshot.tokens.filter(t => t.typeId === 'write')
      expect(tokens.length).toBeGreaterThan(0)

      const token = tokens[0]
      expect(token.path).toContain('client')
      expect(token.path).toContain('global-writer-endpoint')
      expect(token.path).toContain('region-us-east-1')
      expect(token.path).toContain('us-az-1')
      expect(token.path).toContain('us-writer')
      expect(token.path).toContain('us-shared-storage')
    })

    it('should show write token completing at storage', () => {
      const runner = new ScenarioRunner(scenario, graph)
      // write-1 emitted at 1000ms, 5 edges × 600ms = 3000ms to reach us-shared-storage
      const snapshot = runner.seekTo(4500)

      // Write token should have completed at storage
      const completedWriteTokens = snapshot.tokens.filter(
        t => t.typeId === 'write' && t.status === 'completed'
      )
      expect(completedWriteTokens.length).toBeGreaterThan(0)

      // Verify it completed at storage
      const token = completedWriteTokens[0]
      expect(token.path[token.path.length - 1]).toBe('us-shared-storage')
    })

    it('should fail AZ-1 and cascade to writer', () => {
      const runner = new ScenarioRunner(scenario, graph)
      const snapshot = runner.seekTo(18500)

      const az1State = snapshot.nodeStates.get('us-az-1')
      expect(az1State?.status).toBe('unavailable')

      const writerState = snapshot.nodeStates.get('us-writer')
      expect(writerState?.status).toBe('unavailable')
    })

    it('should promote us-reader-1 to primary after AZ-1 failure', () => {
      const runner = new ScenarioRunner(scenario, graph)
      const snapshot = runner.seekTo(21500)

      const reader1State = snapshot.nodeStates.get('us-reader-1')
      expect(reader1State?.metadata?.role).toBe('primary')

      const writerState = snapshot.nodeStates.get('us-writer')
      expect(writerState?.metadata?.role).toBe('standby')
    })

    it('should route writes to us-reader-1 and storage after failover', () => {
      const runner = new ScenarioRunner(scenario, graph)
      const snapshot = runner.seekTo(24500)

      const tokens = snapshot.tokens.filter(t => t.emittedAtMs === 24000)
      expect(tokens.length).toBeGreaterThan(0)

      const token = tokens[0]
      expect(token.path).toContain('us-az-2')
      expect(token.path).toContain('us-reader-1')
      expect(token.path).toContain('us-shared-storage')
    })
  })

  describe('Regional Failover Scenario', () => {
    const scenario = auroraRegionalFailoverScenario as unknown as Scenario

    it('should trigger cross-region replication when write reaches storage', () => {
      const runner = new ScenarioRunner(scenario, graph)
      // write-1 emitted at 1000ms, travels to us-shared-storage
      // Fan-out triggers at storage node, creating replication tokens
      const snapshot = runner.seekTo(5500)

      // Should have the original write token AND replication child tokens
      const writeTokens = snapshot.tokens.filter(t => t.typeId === 'write')
      const replicationTokens = snapshot.tokens.filter(t => t.typeId === 'replication')

      expect(writeTokens.length).toBeGreaterThan(0)
      expect(replicationTokens.length).toBeGreaterThan(0)

      // Replication tokens should go to EU storage
      const paths = replicationTokens.map(t => t.path.join('->'))
      expect(paths.some(p => p.includes('eu-shared-storage'))).toBe(true)
    })

    it('should fail entire US region with cascading failures', () => {
      const runner = new ScenarioRunner(scenario, graph)
      const snapshot = runner.seekTo(14500)

      const regionState = snapshot.nodeStates.get('region-us-east-1')
      expect(regionState?.status).toBe('unavailable')

      // All US AZs should be unavailable
      expect(snapshot.nodeStates.get('us-az-1')?.status).toBe('unavailable')
      expect(snapshot.nodeStates.get('us-az-2')?.status).toBe('unavailable')

      // All US instances and storage should be unavailable
      expect(snapshot.nodeStates.get('us-writer')?.status).toBe('unavailable')
      expect(snapshot.nodeStates.get('us-reader-1')?.status).toBe('unavailable')
      expect(snapshot.nodeStates.get('us-shared-storage')?.status).toBe('unavailable')
    })

    it('should promote eu-reader-1 to primary', () => {
      const runner = new ScenarioRunner(scenario, graph)
      const snapshot = runner.seekTo(18500)

      const euReader1State = snapshot.nodeStates.get('eu-reader-1')
      expect(euReader1State?.metadata?.role).toBe('primary')
    })

    it('should route writes to EU storage after failover', () => {
      const runner = new ScenarioRunner(scenario, graph)
      const snapshot = runner.seekTo(22500)

      const tokens = snapshot.tokens.filter(t => t.emittedAtMs === 22000)
      expect(tokens.length).toBeGreaterThan(0)

      const token = tokens[0]
      expect(token.path).toContain('region-eu-west-1')
      expect(token.path).toContain('eu-az-1')
      expect(token.path).toContain('eu-reader-1')
      expect(token.path).toContain('eu-shared-storage')
    })
  })

  describe('Read Scaling Scenario', () => {
    const scenario = auroraReadScalingScenario as unknown as Scenario

    it('should route reads to US reader via US reader endpoint', () => {
      const runner = new ScenarioRunner(scenario, graph)
      const snapshot = runner.seekTo(1500)

      const tokens = snapshot.tokens.filter(t => t.emittedAtMs === 1000)
      expect(tokens.length).toBeGreaterThan(0)

      const token = tokens[0]
      expect(token.path).toContain('us-reader-endpoint')
      expect(token.path).toContain('region-us-east-1')
      expect(token.path).toContain('us-az-2')
      expect(token.path).toContain('us-reader-1')
    })

    it('should fail over to EU readers when US reader AZ fails', () => {
      const runner = new ScenarioRunner(scenario, graph)
      const snapshot = runner.seekTo(17500)

      // US reader AZ should be unavailable
      expect(snapshot.nodeStates.get('us-az-2')?.status).toBe('unavailable')

      const tokens = snapshot.tokens.filter(t => t.emittedAtMs === 17000)
      expect(tokens.length).toBeGreaterThan(0)

      const token = tokens[0]
      expect(token.path).toContain('eu-reader-endpoint')
      expect(token.path).toContain('region-eu-west-1')
      expect(token.path).toContain('eu-reader-1')
    })

    it('should return to US reader after recovery', () => {
      const runner = new ScenarioRunner(scenario, graph)
      const snapshot = runner.seekTo(33500)

      // US reader AZ should be recovered
      expect(snapshot.nodeStates.get('us-az-2')?.status).toBe('available')

      const tokens = snapshot.tokens.filter(t => t.emittedAtMs === 33000)
      expect(tokens.length).toBeGreaterThan(0)

      const token = tokens[0]
      expect(token.path).toContain('us-reader-endpoint')
      expect(token.path).toContain('us-reader-1')
    })
  })
})
