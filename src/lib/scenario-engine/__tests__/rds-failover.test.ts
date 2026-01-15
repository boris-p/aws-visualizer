import { describe, it, expect } from 'vitest'
import { ScenarioRunner } from '../scenario-runner'
import rdsScenario from '@/data/scenarios/rds-az-failure-failover.json'
import rdsGraph from '@/data/graphs/rds-multi-az-cluster.json'
import type { Scenario } from '@/types/scenario'
import type { GraphDefinition } from '@/types/graph-type'

describe('RDS AZ Failure Failover Scenario', () => {
  const scenario = rdsScenario as unknown as Scenario
  const graph = rdsGraph as unknown as GraphDefinition

  it('should have correct graph structure', () => {
    // Check nodes exist
    const nodeIds = graph.nodes.map(n => n.id)
    expect(nodeIds).toContain('client')
    expect(nodeIds).toContain('rds-endpoint')
    expect(nodeIds).toContain('region-us-east-1')
    expect(nodeIds).toContain('az-use1-az1')
    expect(nodeIds).toContain('az-use1-az2')
    expect(nodeIds).toContain('rds-writer')
    expect(nodeIds).toContain('rds-reader-1')

    // Check edges exist
    const edgeIds = graph.edges.map(e => `${e.source}->${e.target}`)
    expect(edgeIds).toContain('client->rds-endpoint')
    expect(edgeIds).toContain('rds-endpoint->region-us-east-1')
    expect(edgeIds).toContain('region-us-east-1->az-use1-az1')
    expect(edgeIds).toContain('region-us-east-1->az-use1-az2')
    expect(edgeIds).toContain('az-use1-az1->rds-writer')
    expect(edgeIds).toContain('az-use1-az2->rds-reader-1')

    // Check replication edges exist
    expect(edgeIds).toContain('rds-writer->rds-reader-1')
    expect(edgeIds).toContain('rds-writer->rds-reader-2')
    expect(edgeIds).toContain('rds-reader-1->rds-reader-2')
  })

  it('should promote rds-writer to primary at t=0', () => {
    const runner = new ScenarioRunner(scenario, graph)
    const snapshot = runner.seekTo(100) // Just after t=0 promote event

    const writerState = snapshot.nodeStates.get('rds-writer')
    console.log('Writer state at t=100:', writerState)

    expect(writerState?.metadata?.role).toBe('primary')
  })

  it('should route write-1 through AZ1 to rds-writer', () => {
    const runner = new ScenarioRunner(scenario, graph)

    // Seek to after write-1 is emitted (t=500) but still traveling
    const snapshot = runner.seekTo(600)

    console.log('Tokens at t=600:', snapshot.tokens)

    // Should have a token
    expect(snapshot.tokens.length).toBeGreaterThan(0)

    const token = snapshot.tokens[0]
    console.log('Token path:', token.path)

    // Path should be: client -> endpoint -> region -> az1 -> writer
    expect(token.path).toContain('client')
    expect(token.path).toContain('rds-endpoint')
    expect(token.path).toContain('region-us-east-1')
    expect(token.path).toContain('az-use1-az1')
    expect(token.path).toContain('rds-writer')
  })

  it('should fail token at AZ1 when AZ1 is unavailable', () => {
    const runner = new ScenarioRunner(scenario, graph)

    // Seek to after AZ1 fails (t=5000) and write-4 is emitted (t=6000)
    const snapshot = runner.seekTo(6500)

    console.log('Node states at t=6500:')
    for (const [id, state] of snapshot.nodeStates) {
      console.log(`  ${id}: status=${state.status}, role=${state.metadata?.role}`)
    }

    console.log('Tokens at t=6500:', snapshot.tokens.map(t => ({
      id: t.id,
      path: t.path,
      status: t.status,
      currentEdgeIndex: t.currentEdgeIndex
    })))

    // AZ1 should be unavailable
    const az1State = snapshot.nodeStates.get('az-use1-az1')
    expect(az1State?.status).toBe('unavailable')

    // Find the write-4 token (should be the most recent)
    const recentTokens = snapshot.tokens.filter(t => t.emittedAtMs === 6000)
    console.log('Tokens emitted at t=6000:', recentTokens)

    // The token path should end at AZ1 (truncated due to unavailability)
    if (recentTokens.length > 0) {
      const token = recentTokens[0]
      console.log('Write-4 token path:', token.path)
      // Path should be truncated: client -> endpoint -> region -> az1
      expect(token.path[token.path.length - 1]).toBe('az-use1-az1')
    }
  })

  it('should route to rds-reader-1 after failover at t=10000', () => {
    const runner = new ScenarioRunner(scenario, graph)

    // Seek to after failover (t=10000) and write-6 is emitted (t=11000)
    const snapshot = runner.seekTo(11500)

    console.log('Node states at t=11500:')
    for (const [id, state] of snapshot.nodeStates) {
      if (state.metadata?.role) {
        console.log(`  ${id}: status=${state.status}, role=${state.metadata?.role}`)
      }
    }

    // rds-reader-1 should now be primary
    const reader1State = snapshot.nodeStates.get('rds-reader-1')
    console.log('Reader-1 state:', reader1State)
    expect(reader1State?.metadata?.role).toBe('primary')

    // rds-writer should be demoted to standby
    const writerState = snapshot.nodeStates.get('rds-writer')
    console.log('Writer state:', writerState)
    expect(writerState?.metadata?.role).toBe('standby')

    // Find the write-6 token
    const recentTokens = snapshot.tokens.filter(t => t.emittedAtMs === 11000)
    console.log('Tokens emitted at t=11000:', recentTokens.map(t => ({
      path: t.path,
      status: t.status
    })))

    if (recentTokens.length > 0) {
      const token = recentTokens[0]
      // Path should now go through AZ2 to reader-1
      expect(token.path).toContain('az-use1-az2')
      expect(token.path).toContain('rds-reader-1')
    }
  })

  it('should replicate from rds-reader-1 to rds-reader-2 after failover', () => {
    const runner = new ScenarioRunner(scenario, graph)

    // Let write-6 complete its journey and trigger fan-out
    // Write-6 emitted at t=11000, path: client -> endpoint -> region -> az2 -> reader1
    // Each edge takes 800ms, so 4 edges = 3200ms
    // Token arrives at reader-1 at t=11000 + 3200 = 14200
    // Then fan-out creates child token to reader-2

    const snapshot = runner.seekTo(15000)

    console.log('All tokens at t=15000:')
    for (const token of snapshot.tokens) {
      console.log(`  ${token.id}: path=${token.path.join('->')}, status=${token.status}, type=${token.typeId}`)
      if (token.parentTokenId) {
        console.log(`    parentTokenId=${token.parentTokenId}`)
      }
    }

    // Look for replication tokens (type: replication)
    const replicationTokens = snapshot.tokens.filter(t => t.typeId === 'replication')
    console.log('Replication tokens:', replicationTokens.length)

    // Should have at least one replication token from reader-1 to reader-2
    const reader1ToReader2 = replicationTokens.find(t =>
      t.path.includes('rds-reader-1') && t.path.includes('rds-reader-2')
    )
    console.log('Reader1 -> Reader2 replication:', reader1ToReader2)

    expect(reader1ToReader2).toBeDefined()
    if (reader1ToReader2) {
      expect(reader1ToReader2.path).toEqual(['rds-reader-1', 'rds-reader-2'])
    }
  })
})
