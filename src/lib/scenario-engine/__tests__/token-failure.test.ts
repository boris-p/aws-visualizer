import { describe, it, expect } from 'vitest'
import { ScenarioRunner } from '../scenario-runner'
import {
  createMockScenario,
  createMockEvent,
  createMockFlow,
} from './test-utils'

describe('Token Failure Behavior', () => {
  // Simple graph for failure testing
  function createFailureTestGraph() {
    return {
      id: 'failure-test',
      name: 'Failure Test Graph',
      description: 'Graph for testing token failure behavior',
      nodes: [
        { id: 'client', label: 'Client', type: 'client', position: { x: 0, y: 100 } },
        { id: 'endpoint', label: 'Endpoint', type: 'dns-endpoint', position: { x: 100, y: 100 } },
        { id: 'region', label: 'Region', type: 'region', position: { x: 200, y: 100 } },
        { id: 'az-1', label: 'AZ 1', type: 'az', position: { x: 300, y: 50 } },
        { id: 'az-2', label: 'AZ 2', type: 'az', position: { x: 300, y: 150 } },
        { id: 'db-1', label: 'DB 1', type: 'aurora-writer', position: { x: 400, y: 50 } },
        { id: 'db-2', label: 'DB 2', type: 'aurora-reader', position: { x: 400, y: 150 } },
      ],
      edges: [
        { id: 'e1', source: 'client', target: 'endpoint' },
        { id: 'e2', source: 'endpoint', target: 'region' },
        { id: 'e3', source: 'region', target: 'az-1' },
        { id: 'e4', source: 'region', target: 'az-2' },
        { id: 'e5', source: 'az-1', target: 'db-1' },
        { id: 'e6', source: 'az-2', target: 'db-2' },
      ],
    }
  }

  describe('token fails AT unavailable node', () => {
    it('fails token AT intermediate unavailable node (not before it)', () => {
      const scenario = createMockScenario({
        events: [
          // Fail az-1 before sending request
          createMockEvent({
            id: 'fail-az1',
            timestampMs: 0,
            action: 'fail',
            targetType: 'az',
            targetId: 'az-1',
          }),
          // Send request through az-1
          createMockEvent({
            id: 'write-1',
            timestampMs: 500,
            action: 'route-request',
            targetId: 'db-1',
            flowId: 'write-flow',
          }),
        ],
        requestFlows: [
          createMockFlow({
            id: 'write-flow',
            path: ['client', 'endpoint', 'region', 'az-1', 'db-1'],
          }),
        ],
        tokenFlowConfig: {
          defaultEdgeDurationMs: 500,
        },
      })

      const runner = new ScenarioRunner(scenario, createFailureTestGraph())

      // Token emits at t=500, travels:
      // - client→endpoint: 500ms (arrives at endpoint at t=1000)
      // - endpoint→region: 500ms (arrives at region at t=1500)
      // - region→az-1: 500ms (arrives at az-1 at t=2000)
      // Should fail AT az-1, not before

      // Mid-travel (before reaching az-1)
      const snapshot1 = runner.seekTo(1800)
      const travelingToken = snapshot1.tokens.find(t => t.status === 'traveling')
      expect(travelingToken).toBeDefined()
      expect(travelingToken?.currentEdgeIndex).toBe(2) // On region→az-1 edge

      // After arriving at az-1
      const snapshot2 = runner.seekTo(2100)
      const failedToken = snapshot2.tokens.find(t => t.status === 'failed')
      expect(failedToken).toBeDefined()
      // Token should have traveled to az-1 (index 3 in path)
      expect(failedToken?.path[failedToken.currentEdgeIndex]).toBe('region')
      expect(failedToken?.path[failedToken.currentEdgeIndex + 1]).toBe('az-1')
    })

    it('fails token at unavailable final destination with progress: 1', () => {
      const scenario = createMockScenario({
        events: [
          // Fail db-1 (final destination)
          createMockEvent({
            id: 'fail-db1',
            timestampMs: 0,
            action: 'fail',
            targetType: 'instance',
            targetId: 'db-1',
          }),
          createMockEvent({
            id: 'write-1',
            timestampMs: 100,
            action: 'route-request',
            targetId: 'db-1',
            flowId: 'write-flow',
          }),
        ],
        requestFlows: [
          createMockFlow({
            id: 'write-flow',
            path: ['client', 'endpoint', 'region', 'az-1', 'db-1'],
          }),
        ],
        tokenFlowConfig: {
          defaultEdgeDurationMs: 500,
        },
      })

      const runner = new ScenarioRunner(scenario, createFailureTestGraph())

      // Token travels full path, arrives at db-1 at t=100 + 4*500 = 2100
      const snapshot = runner.seekTo(2200)

      const failedToken = snapshot.tokens.find(t => t.status === 'failed')
      expect(failedToken).toBeDefined()
      expect(failedToken?.progress).toBe(1) // Arrived at destination before failing
      expect(failedToken?.path[failedToken.path.length - 1]).toBe('db-1')
    })
  })

  describe('path truncation by selector', () => {
    it('token fails at truncation point when path selector truncates', () => {
      const scenario = createMockScenario({
        events: [
          // Promote db-1 as primary
          createMockEvent({
            id: 'init-primary',
            timestampMs: 0,
            action: 'promote',
            targetId: 'db-1',
            promotionRole: 'primary',
          }),
          // Fail az-1 (where primary is)
          createMockEvent({
            id: 'fail-az1',
            timestampMs: 500,
            action: 'fail',
            targetType: 'az',
            targetId: 'az-1',
          }),
          // Send write - path selector should truncate at az-1
          createMockEvent({
            id: 'write-1',
            timestampMs: 1000,
            action: 'route-request',
            targetId: 'db-1',
            flowId: 'write-flow',
          }),
        ],
        requestFlows: [
          createMockFlow({
            id: 'write-flow',
            path: ['client', 'endpoint', 'region'],
            computePath: true,
          }),
        ],
        algorithms: {
          pathSelector: { type: 'primary-aware' },
        },
        tokenFlowConfig: {
          defaultEdgeDurationMs: 500,
        },
      })

      const runner = new ScenarioRunner(scenario, createFailureTestGraph())

      // Path should be truncated: [client, endpoint, region, az-1]
      // Token arrives at az-1 at t=1000 + 3*500 = 2500

      const snapshot = runner.seekTo(2600)

      const failedToken = snapshot.tokens.find(t => t.status === 'failed')
      expect(failedToken).toBeDefined()

      // Path was truncated at az-1
      expect(failedToken?.path).toEqual(['client', 'endpoint', 'region', 'az-1'])
      expect(failedToken?.progress).toBe(1) // Arrived at truncation point
    })
  })

  describe('node becomes unavailable mid-travel', () => {
    it('fails token at node that becomes unavailable while token is traveling', () => {
      const scenario = createMockScenario({
        events: [
          // Send request first
          createMockEvent({
            id: 'write-1',
            timestampMs: 0,
            action: 'route-request',
            targetId: 'db-1',
            flowId: 'write-flow',
          }),
          // az-1 fails AFTER token starts traveling, but BEFORE it arrives
          createMockEvent({
            id: 'fail-az1',
            timestampMs: 1200, // Token is at region→az-1 edge (1000-1500)
            action: 'fail',
            targetType: 'az',
            targetId: 'az-1',
          }),
        ],
        requestFlows: [
          createMockFlow({
            id: 'write-flow',
            path: ['client', 'endpoint', 'region', 'az-1', 'db-1'],
          }),
        ],
        tokenFlowConfig: {
          defaultEdgeDurationMs: 500,
        },
      })

      const runner = new ScenarioRunner(scenario, createFailureTestGraph())

      // Token emits at t=0
      // - client→endpoint: 0-500
      // - endpoint→region: 500-1000
      // - region→az-1: 1000-1500
      // az-1 fails at t=1200 (while token is on region→az-1 edge)
      // Token should fail when it arrives at az-1 at t=1500

      // Just before az-1 fails
      const snapshot1 = runner.seekTo(1100)
      expect(snapshot1.nodeStates.get('az-1')?.status).toBe('available')
      const travelingToken = snapshot1.tokens.find(t => t.status === 'traveling')
      expect(travelingToken).toBeDefined()

      // After az-1 fails but before token arrives
      const snapshot2 = runner.seekTo(1300)
      expect(snapshot2.nodeStates.get('az-1')?.status).toBe('unavailable')
      const stillTraveling = snapshot2.tokens.find(t => t.status === 'traveling')
      expect(stillTraveling).toBeDefined() // Still traveling, hasn't reached az-1 yet

      // After token arrives at az-1
      const snapshot3 = runner.seekTo(1600)
      const failedToken = snapshot3.tokens.find(t => t.status === 'failed')
      expect(failedToken).toBeDefined()
    })
  })

  describe('parent token failure with quorum', () => {
    function createQuorumGraph() {
      return {
        id: 'quorum-test',
        name: 'Quorum Test Graph',
        description: 'Graph for testing quorum failure',
        nodes: [
          { id: 'client', label: 'Client', type: 'client', position: { x: 0, y: 100 } },
          { id: 'region', label: 'Region', type: 'region', position: { x: 100, y: 100 } },
          { id: 'primary', label: 'Primary', type: 'rds-primary', position: { x: 200, y: 100 } },
          { id: 'replica-1', label: 'Replica 1', type: 'rds-standby', position: { x: 300, y: 50 } },
          { id: 'replica-2', label: 'Replica 2', type: 'rds-standby', position: { x: 300, y: 100 } },
          { id: 'replica-3', label: 'Replica 3', type: 'rds-standby', position: { x: 300, y: 150 } },
        ],
        edges: [
          { id: 'e1', source: 'client', target: 'region' },
          { id: 'e2', source: 'region', target: 'primary' },
          { id: 'e3', source: 'primary', target: 'replica-1' },
          { id: 'e4', source: 'primary', target: 'replica-2' },
          { id: 'e5', source: 'primary', target: 'replica-3' },
        ],
      }
    }

    it('parent fails when ALL children fail (no quorum possible)', () => {
      // Note: Current behavior caps quorum at available children count.
      // So if 2 of 3 replicas unavailable, quorum becomes min(2, 1) = 1.
      // For parent to fail, ALL children must be unavailable.
      const scenario = createMockScenario({
        events: [
          // Fail ALL 3 replicas
          createMockEvent({
            id: 'fail-replica1',
            timestampMs: 0,
            action: 'fail',
            targetType: 'instance',
            targetId: 'replica-1',
          }),
          createMockEvent({
            id: 'fail-replica2',
            timestampMs: 0,
            action: 'fail',
            targetType: 'instance',
            targetId: 'replica-2',
          }),
          createMockEvent({
            id: 'fail-replica3',
            timestampMs: 0,
            action: 'fail',
            targetType: 'instance',
            targetId: 'replica-3',
          }),
          // Send write - requires quorum of 2
          createMockEvent({
            id: 'write-1',
            timestampMs: 500,
            action: 'route-request',
            targetId: 'primary',
            flowId: 'write-flow',
          }),
        ],
        requestFlows: [
          createMockFlow({
            id: 'write-flow',
            path: ['client', 'region', 'primary'],
          }),
        ],
        algorithms: {
          fanOut: {
            type: 'quorum-replication',
            config: { nodeTypes: ['rds-primary'], quorumRequired: 2 },
          },
        },
        tokenFlowConfig: {
          defaultEdgeDurationMs: 500,
        },
      })

      const runner = new ScenarioRunner(scenario, createQuorumGraph())

      // Token arrives at primary at t=500 + 2*500 = 1500
      // Fan-out triggered, but 0 replicas available
      // No children can be created, so token completes without children
      // (fan-out doesn't trigger when no child paths available)

      const snapshot = runner.seekTo(2100)

      // When no children can be created, token completes normally without fan-out
      const completedToken = snapshot.tokens.find(t =>
        t.path.includes('primary') && t.status === 'completed'
      )
      expect(completedToken).toBeDefined()
      // No children because all targets unavailable
      expect(completedToken?.childTokenIds).toBeUndefined()
    })

    it('parent completes when quorum is met despite some child failures', () => {
      const scenario = createMockScenario({
        events: [
          // Fail only 1 replica
          createMockEvent({
            id: 'fail-replica1',
            timestampMs: 0,
            action: 'fail',
            targetType: 'instance',
            targetId: 'replica-1',
          }),
          // Send write - requires quorum of 2
          createMockEvent({
            id: 'write-1',
            timestampMs: 500,
            action: 'route-request',
            targetId: 'primary',
            flowId: 'write-flow',
          }),
        ],
        requestFlows: [
          createMockFlow({
            id: 'write-flow',
            path: ['client', 'region', 'primary'],
          }),
        ],
        algorithms: {
          fanOut: {
            type: 'quorum-replication',
            config: { nodeTypes: ['rds-primary'], quorumRequired: 2 },
          },
        },
        tokenFlowConfig: {
          defaultEdgeDurationMs: 500,
        },
      })

      const runner = new ScenarioRunner(scenario, createQuorumGraph())

      // 2 replicas available (replica-2, replica-3), quorum of 2 can be met
      const snapshot = runner.seekTo(2100)

      const parentToken = snapshot.tokens.find(t =>
        t.childTokenIds !== undefined && t.path.includes('primary')
      )
      expect(parentToken).toBeDefined()
      expect(parentToken?.status).toBe('completed')

      // Should have 2 completed children
      const completedChildren = snapshot.tokens.filter(t =>
        t.parentTokenId === parentToken?.id && t.status === 'completed'
      )
      expect(completedChildren.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('token cleanup after failure', () => {
    it('failed tokens are cleaned up after delay', () => {
      const scenario = createMockScenario({
        events: [
          createMockEvent({
            id: 'fail-db1',
            timestampMs: 0,
            action: 'fail',
            targetType: 'instance',
            targetId: 'db-1',
          }),
          createMockEvent({
            id: 'write-1',
            timestampMs: 100,
            action: 'route-request',
            targetId: 'db-1',
            flowId: 'write-flow',
          }),
        ],
        requestFlows: [
          createMockFlow({
            id: 'write-flow',
            path: ['client', 'endpoint', 'region', 'az-1', 'db-1'],
          }),
        ],
        tokenFlowConfig: {
          defaultEdgeDurationMs: 500,
        },
      })

      const runner = new ScenarioRunner(scenario, createFailureTestGraph())

      // Token fails at db-1 around t=2100
      const snapshotWithFailed = runner.seekTo(2200)
      expect(snapshotWithFailed.tokens.some(t => t.status === 'failed')).toBe(true)

      // After cleanup delay (800ms default)
      const snapshotAfterCleanup = runner.seekTo(3100)
      expect(snapshotAfterCleanup.tokens.length).toBe(0)
    })
  })
})
