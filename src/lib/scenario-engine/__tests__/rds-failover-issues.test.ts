import { describe, it, expect } from 'vitest'
import { ScenarioRunner } from '../scenario-runner'
import rdsScenario from '@/data/scenarios/rds-az-failure-failover.json'
import rdsGraph from '@/data/graphs/rds-multi-az-cluster.json'
import type { Scenario } from '@/types/scenario'
import type { GraphDefinition } from '@/types/graph-type'

describe('RDS Failover - Potential Issues', () => {
  const scenario = rdsScenario as unknown as Scenario
  const graph = rdsGraph as unknown as GraphDefinition

  it('ISSUE 1: Token should fail when it reaches unavailable AZ', () => {
    const runner = new ScenarioRunner(scenario, graph)

    // At t=6000, write-4 is emitted with path ending at az-use1-az1
    // Token travels: client -> endpoint (t=6800) -> region (t=7600) -> az1 (t=8400)
    // Each edge takes 800ms

    // At t=8400, token should arrive at az-use1-az1 and FAIL
    const snapshot = runner.seekTo(8500)

    console.log('Tokens at t=8500:', snapshot.tokens.map(t => ({
      id: t.id,
      path: t.path,
      status: t.status,
      currentEdgeIndex: t.currentEdgeIndex,
      emittedAtMs: t.emittedAtMs
    })))

    // Find the write-4 token
    const write4Token = snapshot.tokens.find(t => t.emittedAtMs === 6000)

    if (write4Token) {
      console.log('Write-4 token status:', write4Token.status)
      // Token should be FAILED because it arrived at unavailable AZ
      // But the path ends at az-use1-az1, so when it "completes" the path
      // it should be marked as failed, not completed

      // ISSUE: The token path is [client, endpoint, region, az1]
      // When token completes traversing to az1, it will mark as "completed"
      // because it reached the end of its path. But az1 is unavailable!
      // We need the token to be marked as "failed" instead.
    }
  })

  it('ISSUE 2: Check if token actually fails at unavailable destination', () => {
    const runner = new ScenarioRunner(scenario, graph)

    // Let the write-4 token complete its entire path
    // Path: client -> endpoint -> region -> az1 (4 nodes, 3 edges)
    // Each edge: 800ms
    // Total: 3 * 800 = 2400ms from emission at t=6000
    // Should complete at t=8400

    const snapshotBefore = runner.seekTo(8300)
    const snapshotAfter = runner.seekTo(8600)

    const tokenBefore = snapshotBefore.tokens.find(t => t.emittedAtMs === 6000)
    const tokenAfter = snapshotAfter.tokens.find(t => t.emittedAtMs === 6000)

    console.log('Token at t=8300:', tokenBefore ? {
      status: tokenBefore.status,
      currentEdgeIndex: tokenBefore.currentEdgeIndex,
      progress: tokenBefore.progress
    } : 'not found')

    console.log('Token at t=8600:', tokenAfter ? {
      status: tokenAfter.status,
      currentEdgeIndex: tokenAfter.currentEdgeIndex
    } : 'not found or cleaned up')

    // The token should be failed, not completed
    if (tokenAfter) {
      expect(tokenAfter.status).toBe('failed')
    }
  })

  it('ISSUE 3: When path ends at unavailable node, token should fail on arrival', () => {
    const runner = new ScenarioRunner(scenario, graph)

    // Simulate step by step to see what happens
    const times = [6000, 6400, 6800, 7200, 7600, 8000, 8400, 8800]

    for (const t of times) {
      const snapshot = runner.seekTo(t)
      const token = snapshot.tokens.find(tok => tok.emittedAtMs === 6000)
      if (token) {
        const currentNode = token.path[token.currentEdgeIndex]
        const nextNode = token.path[token.currentEdgeIndex + 1]
        console.log(`t=${t}: token status=${token.status}, edgeIndex=${token.currentEdgeIndex}, ` +
          `current=${currentNode}, next=${nextNode || 'END'}, progress=${token.progress?.toFixed(2)}`)
      } else {
        console.log(`t=${t}: token not found (cleaned up?)`)
      }
    }
  })

  it('ISSUE 4: Check moveToNextSegment logic for end-of-path at unavailable node', () => {
    // When a token reaches the last node in its path:
    // - If there's a fanOut strategy that triggers, it fans out
    // - Otherwise it marks as completed
    //
    // But if the final node is unavailable, it should mark as FAILED
    // Let's check the scenario-runner.ts moveToNextSegment logic

    const runner = new ScenarioRunner(scenario, graph)
    const snapshot = runner.seekTo(8500)

    // At this point, the token should have reached az-use1-az1 (the last node in its path)
    // and should be marked as failed because az1 is unavailable

    const token = snapshot.tokens.find(t => t.emittedAtMs === 6000)
    console.log('Token at t=8500:', token)

    // The issue: moveToNextSegment checks if we've reached end of path BEFORE
    // checking if the destination is unavailable
    // Lines 277-296 in scenario-runner.ts:
    // - Line 277: if (nextEdgeIndex >= token.path.length - 1) -> marks completed
    // - Lines 302-313: checks unavailability AFTER the completion check
    //
    // This means if the path ends at an unavailable node, it gets marked as completed!
  })
})
