/**
 * Time Travel Tests for AZ Failure Scenario
 *
 * These tests verify that seeking forward and backward in time
 * produces consistent, deterministic state using the new
 * SimulationStateStore with checkpointing.
 */

import { describe, it, expect } from 'vitest'
import { ScenarioRunner } from '../scenario-runner'
import type { Scenario } from '@/types/scenario'

// Create a scenario matching az-failure-failover-detailed
function createAZFailureScenario(): Scenario {
  return {
    id: 'az-failure-test',
    name: 'AZ Failure Test',
    description: 'Test scenario for time travel',
    graphId: 'test-graph',
    durationMs: 30000,
    tokenFlowConfig: {
      defaultEdgeDurationMs: 1500,
      tokenTypes: [
        { id: 'http-request', shape: 'circle', color: '#3b82f6', size: 8 },
      ],
      waitPoints: [
        {
          nodeId: 'alb-main',
          type: 'queue',
          processIntervalMs: 800,
          strategy: 'fifo',
        },
      ],
      edgeTimings: [],
    },
    algorithms: {
      pathSelector: { type: 'healthiest' },
      loadBalancer: { type: 'round-robin' },
    },
    events: [
      // Normal traffic before failure
      {
        id: 'req-1',
        timestampMs: 500,
        action: 'route-request',
        targetType: 'service',
        targetId: 'web-service',
        flowId: 'normal-request',
      },
      {
        id: 'req-2',
        timestampMs: 1500,
        action: 'route-request',
        targetType: 'service',
        targetId: 'web-service',
        flowId: 'normal-request',
      },
      {
        id: 'req-3',
        timestampMs: 2500,
        action: 'route-request',
        targetType: 'service',
        targetId: 'web-service',
        flowId: 'normal-request',
      },
      {
        id: 'req-4',
        timestampMs: 3500,
        action: 'route-request',
        targetType: 'service',
        targetId: 'web-service',
        flowId: 'normal-request',
      },

      // AZ1 fails
      {
        id: 'az1-fails',
        timestampMs: 6000,
        action: 'fail',
        targetType: 'az',
        targetId: 'az-us-east-1-use1-az1',
        failureMessage: 'AZ Unavailable',
      },

      // Traffic during failure (should go to AZ2 only)
      {
        id: 'req-5',
        timestampMs: 7000,
        action: 'route-request',
        targetType: 'service',
        targetId: 'web-service',
        flowId: 'normal-request',
      },
      {
        id: 'req-6',
        timestampMs: 8000,
        action: 'route-request',
        targetType: 'service',
        targetId: 'web-service',
        flowId: 'normal-request',
      },
      {
        id: 'req-7',
        timestampMs: 9000,
        action: 'route-request',
        targetType: 'service',
        targetId: 'web-service',
        flowId: 'normal-request',
      },

      // AZ1 recovers
      {
        id: 'az1-recovers',
        timestampMs: 18000,
        action: 'recover',
        targetType: 'az',
        targetId: 'az-us-east-1-use1-az1',
      },

      // Traffic after recovery (should round-robin again)
      {
        id: 'req-8',
        timestampMs: 19000,
        action: 'route-request',
        targetType: 'service',
        targetId: 'web-service',
        flowId: 'normal-request',
      },
      {
        id: 'req-9',
        timestampMs: 20000,
        action: 'route-request',
        targetType: 'service',
        targetId: 'web-service',
        flowId: 'normal-request',
      },
    ],
    requestFlows: [
      {
        id: 'normal-request',
        sourceLocation: 'User (San Francisco)',
        targetServiceId: 'web-service',
        path: ['edge-sfo', 'region-us-east-1', 'alb-main'],
        latencyMs: 100,
        status: 'success',
        routingStrategy: 'cloudfront',
        pathConstraints: {
          candidates: ['az-us-east-1-use1-az1', 'az-us-east-1-use1-az2'],
        },
        queueAtNodes: ['alb-main'],
      },
    ],
    expectedOutcome: 'Test',
    awsContext: {
      useCloudFront: true,
      useMultiAz: true,
      useAutoScaling: false,
      healthCheckEnabled: true,
    },
  }
}

describe('Time Travel - AZ Failure Scenario', () => {
  let runner: ScenarioRunner
  let scenario: Scenario

  beforeEach(() => {
    scenario = createAZFailureScenario()
    runner = new ScenarioRunner(scenario)
  })

  describe('basic time travel', () => {
    it('seek to time 0 produces clean initial state', () => {
      const snapshot = runner.seekTo(0)

      expect(snapshot.timeMs).toBe(0)
      expect(snapshot.nodeStates.size).toBe(0)
      expect(snapshot.tokens.length).toBe(0)
      expect(snapshot.processedEventIds.size).toBe(0)
    })

    it('seek forward processes events correctly', () => {
      // Before AZ failure - AZ is available (touched by route-request events)
      let snapshot = runner.seekTo(5000)
      expect(snapshot.nodeStates.get('az-us-east-1-use1-az1')?.status).toBe('available')
      expect(snapshot.processedEventIds.has('req-1')).toBe(true)
      expect(snapshot.processedEventIds.has('az1-fails')).toBe(false)

      // After AZ failure
      snapshot = runner.seekTo(7000)
      expect(snapshot.nodeStates.get('az-us-east-1-use1-az1')?.status).toBe('unavailable')
      expect(snapshot.processedEventIds.has('az1-fails')).toBe(true)
    })

    it('seek backward resets state correctly', () => {
      // First seek to after failure
      runner.seekTo(10000)
      expect(runner.getNodeState('az-us-east-1-use1-az1')?.status).toBe('unavailable')

      // Seek back to before failure - node is available (from route-request events)
      const snapshot = runner.seekTo(5000)
      expect(snapshot.nodeStates.get('az-us-east-1-use1-az1')?.status).toBe('available')
    })

    it('seek to recovery time restores node', () => {
      // Seek to after recovery
      const snapshot = runner.seekTo(19000)
      expect(snapshot.nodeStates.get('az-us-east-1-use1-az1')?.status).toBe('available')
    })
  })

  describe('state consistency across seek paths', () => {
    it('state at time T is identical regardless of seek path', () => {
      const targetTime = 10000

      // Path 1: Direct seek
      runner.seekTo(targetTime)
      const directState = runner.getSnapshot()

      // Path 2: Seek forward then back
      runner.seekTo(20000)
      runner.seekTo(targetTime)
      const forwardBackState = runner.getSnapshot()

      // Path 3: Multiple seeks
      runner.seekTo(5000)
      runner.seekTo(15000)
      runner.seekTo(targetTime)
      const zigzagState = runner.getSnapshot()

      // Compare key state properties
      expect(directState.timeMs).toBe(forwardBackState.timeMs)
      expect(directState.timeMs).toBe(zigzagState.timeMs)

      // Node states should match
      expect(directState.nodeStates.get('az-us-east-1-use1-az1')?.status).toBe(
        forwardBackState.nodeStates.get('az-us-east-1-use1-az1')?.status
      )
      expect(directState.nodeStates.get('az-us-east-1-use1-az1')?.status).toBe(
        zigzagState.nodeStates.get('az-us-east-1-use1-az1')?.status
      )

      // Processed events should match
      expect(directState.processedEventIds.size).toBe(forwardBackState.processedEventIds.size)
      expect(directState.processedEventIds.size).toBe(zigzagState.processedEventIds.size)
    })

    it('rapid back-and-forth seeking produces consistent state', () => {
      const checkpoints = [5000, 10000, 7000, 15000, 3000, 20000, 8000]

      // Seek through all checkpoints
      for (const time of checkpoints) {
        runner.seekTo(time)
      }

      // Final seek to a known time
      const snapshot = runner.seekTo(10000)

      // Should have correct state for t=10000
      expect(snapshot.nodeStates.get('az-us-east-1-use1-az1')?.status).toBe('unavailable')
      expect(snapshot.processedEventIds.has('az1-fails')).toBe(true)
      expect(snapshot.processedEventIds.has('az1-recovers')).toBe(false)
    })
  })

  describe('token state during time travel', () => {
    it('tokens are reset when seeking backward', () => {
      // Seek forward to emit some tokens
      runner.seekTo(5000)
      const tokensAtForward = runner.getSnapshot().tokens

      // Tokens should exist from route-request events
      expect(tokensAtForward.length).toBeGreaterThan(0)

      // Seek back to before any route-request
      const snapshot = runner.seekTo(400)
      expect(snapshot.tokens.length).toBe(0)
    })

    it('tokens at specific time match expected positions', () => {
      // At t=2000, req-1 (emitted at 500) should be traveling
      // First edge is edge-sfo -> region-us-east-1 with 1500ms duration
      // So at t=2000, token has been traveling for 1500ms = completed first edge
      const snapshot = runner.seekTo(2000)

      // Should have at least one token
      expect(snapshot.tokens.length).toBeGreaterThanOrEqual(1)
    })

    it('tokens fail when seeking to time where AZ is unavailable', () => {
      // Seek to time when AZ is down and tokens might be heading there
      // AZ fails at 6000, requests at 3500, 2500, 1500, 500 might be affected
      const snapshot = runner.seekTo(8000)

      // Verify AZ is down
      expect(snapshot.nodeStates.get('az-us-east-1-use1-az1')?.status).toBe('unavailable')

      // Check that any tokens heading to AZ1 are either:
      // 1. Failed (if they tried to enter the unavailable AZ)
      // 2. Completed (if they finished before the failure)
      // 3. Still traveling but before reaching the failed AZ
      const tokensToAZ1 = snapshot.tokens.filter((t) => t.path.includes('az-us-east-1-use1-az1'))
      for (const token of tokensToAZ1) {
        if (token.status === 'traveling' || token.status === 'waiting') {
          // If still active and path includes AZ1, it should be before the AZ1 node
          const az1Index = token.path.indexOf('az-us-east-1-use1-az1')
          const isBeforeAZ1 = token.currentEdgeIndex < az1Index - 1
          expect(isBeforeAZ1).toBe(true)
        }
        // If status is 'failed', 'completed', that's also acceptable
      }
    })
  })

  describe('wait point state during time travel', () => {
    it('wait point queue is consistent after seek', () => {
      // Seek to time where queue might have tokens
      const snapshot = runner.seekTo(4000)

      // Get wait point at alb-main
      const albWaitPoint = snapshot.waitPoints.get('alb-main')
      expect(albWaitPoint).toBeDefined()

      // Queue state should be deterministic
      const queuedTokenIds = albWaitPoint?.tokenIds || []

      // Seek back and forward to same time
      runner.seekTo(1000)
      runner.seekTo(4000)

      const snapshot2 = runner.getSnapshot()
      const albWaitPoint2 = snapshot2.waitPoints.get('alb-main')
      const queuedTokenIds2 = albWaitPoint2?.tokenIds || []

      // Queue should be identical
      expect(queuedTokenIds.length).toBe(queuedTokenIds2.length)
    })

    it('wait point processes tokens at correct rate', () => {
      // ALB processes tokens every 800ms
      // Tokens arrive, wait, then get released

      // At t=5000, several tokens should have been processed
      const snapshot = runner.seekTo(5000)

      // Wait point should exist
      const albWaitPoint = snapshot.waitPoints.get('alb-main')
      expect(albWaitPoint).toBeDefined()
    })

    it('wait point queue clears after seeking backward from late time', () => {
      // This test reproduces a bug where seeking backward after playing
      // past recovery shows phantom tokens in the ALB queue

      // Play past recovery (t=18000) to t=25000
      // All tokens should have completed/failed and queues should be empty
      runner.seekTo(25000)

      const lateSnapshot = runner.getSnapshot()
      const albLate = lateSnapshot.waitPoints.get('alb-main')

      // Queue should be empty - all tokens completed
      expect(albLate?.tokenIds.length || 0).toBe(0)

      // Also check no waiting tokens in the token list
      const waitingTokensLate = lateSnapshot.tokens.filter(
        t => t.status === 'waiting' && t.waitingAtNode === 'alb-main'
      )
      expect(waitingTokensLate.length).toBe(0)

      // Now seek back to before the failure (t=5000)
      runner.seekTo(5000)

      const earlySnapshot = runner.getSnapshot()
      const albEarly = earlySnapshot.waitPoints.get('alb-main')

      // The queue state should be deterministic for t=5000
      // It might have some tokens waiting (tokens emitted at 500, 1500, 2500, 3500)
      // but it should NOT have any phantom tokens from the future

      // Verify tokens in queue are only tokens that were emitted before t=5000
      const waitingTokensEarly = earlySnapshot.tokens.filter(
        t => t.status === 'waiting' && t.waitingAtNode === 'alb-main'
      )

      for (const token of waitingTokensEarly) {
        expect(token.emittedAtMs).toBeLessThan(5000)
      }

      // Seek forward again to verify consistency
      runner.seekTo(25000)

      const lateSnapshot2 = runner.getSnapshot()
      const waitingTokensLate2 = lateSnapshot2.tokens.filter(
        t => t.status === 'waiting' && t.waitingAtNode === 'alb-main'
      )

      // Should still be empty at t=25000
      expect(waitingTokensLate2.length).toBe(0)
    })
  })

  describe('sublabel state during time travel', () => {
    it('sublabel appears after fail event', () => {
      const snapshot = runner.seekTo(7000)
      expect(snapshot.nodeStates.get('az-us-east-1-use1-az1')?.sublabel).toBe('AZ Unavailable')
    })

    it('sublabel disappears after recover event', () => {
      const snapshot = runner.seekTo(19000)
      expect(snapshot.nodeStates.get('az-us-east-1-use1-az1')?.sublabel).toBeUndefined()
    })

    it('sublabel correct when seeking backward across failure', () => {
      // First seek to after failure
      runner.seekTo(10000)
      expect(runner.getNodeState('az-us-east-1-use1-az1')?.sublabel).toBe('AZ Unavailable')

      // Seek back to before failure
      runner.seekTo(5000)
      expect(runner.getNodeState('az-us-east-1-use1-az1')?.sublabel).toBeUndefined()
    })

    it('sublabel correct when seeking forward across recovery', () => {
      // Start at failure
      runner.seekTo(10000)
      expect(runner.getNodeState('az-us-east-1-use1-az1')?.sublabel).toBe('AZ Unavailable')

      // Seek past recovery
      runner.seekTo(19000)
      expect(runner.getNodeState('az-us-east-1-use1-az1')?.sublabel).toBeUndefined()
    })
  })

  describe('advanceTo after seekTo', () => {
    it('advanceTo correctly continues from seekTo position', () => {
      // Seek to initial position - AZ is available (from route-request events)
      runner.seekTo(5000)
      expect(runner.getNodeState('az-us-east-1-use1-az1')?.status).toBe('available')

      // Advance past failure
      runner.advanceTo(7000)
      expect(runner.getNodeState('az-us-east-1-use1-az1')?.status).toBe('unavailable')
    })

    it('advanceTo does not re-process events after seekTo', () => {
      // Seek to time with some events processed
      runner.seekTo(5000)
      const processedBefore = runner.getSnapshot().processedEventIds.size

      // Advance but stay before next event
      runner.advanceTo(5500)
      const processedAfter = runner.getSnapshot().processedEventIds.size

      // No new events should be processed (next event is at 6000)
      expect(processedAfter).toBe(processedBefore)
    })

    it('seekTo after advanceTo resets properly', () => {
      // Advance through time
      runner.seekTo(1000)
      runner.advanceTo(5000)
      runner.advanceTo(10000)

      // Now seek back
      const snapshot = runner.seekTo(3000)

      // State should be correct for t=3000
      // AZ is available (from route-request events at 500, 1500, 2500)
      expect(snapshot.nodeStates.get('az-us-east-1-use1-az1')?.status).toBe('available')
      expect(snapshot.processedEventIds.has('az1-fails')).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('seeking to exact event time includes that event', () => {
      // AZ fails at exactly 6000ms
      const snapshot = runner.seekTo(6000)
      expect(snapshot.nodeStates.get('az-us-east-1-use1-az1')?.status).toBe('unavailable')
      expect(snapshot.processedEventIds.has('az1-fails')).toBe(true)
    })

    it('seeking to time just before event excludes that event', () => {
      // Just before failure - AZ is available from route-request events
      const snapshot = runner.seekTo(5999)
      expect(snapshot.nodeStates.get('az-us-east-1-use1-az1')?.status).toBe('available')
      expect(snapshot.processedEventIds.has('az1-fails')).toBe(false)
    })

    it('seeking past end of scenario works', () => {
      const snapshot = runner.seekTo(50000)

      // All events should be processed
      expect(snapshot.processedEventIds.size).toBe(scenario.events.length)

      // Final state should be AZ1 recovered
      expect(snapshot.nodeStates.get('az-us-east-1-use1-az1')?.status).toBe('available')
    })

    it('seeking to same time twice produces identical state', () => {
      const time = 10000

      runner.seekTo(time)
      const snapshot1 = runner.getSnapshot()

      runner.seekTo(time)
      const snapshot2 = runner.getSnapshot()

      expect(snapshot1.timeMs).toBe(snapshot2.timeMs)
      expect(snapshot1.nodeStates.size).toBe(snapshot2.nodeStates.size)
      expect(snapshot1.processedEventIds.size).toBe(snapshot2.processedEventIds.size)
    })
  })
})
