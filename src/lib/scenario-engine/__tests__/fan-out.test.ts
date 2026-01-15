import { describe, it, expect } from 'vitest'
import { ScenarioRunner } from '../scenario-runner'
import {
  createMockScenario,
  createMockEvent,
  createMockFlow,
} from './test-utils'

// Helper to create a graph for fan-out testing (RDS-like topology)
function createFanOutGraph() {
  return {
    id: 'fan-out-test',
    name: 'Fan-Out Test Graph',
    description: 'Graph for testing fan-out token behavior',
    nodes: [
      { id: 'client', label: 'Client', type: 'client', position: { x: 0, y: 100 } },
      { id: 'region', label: 'Region', type: 'region', position: { x: 100, y: 100 } },
      { id: 'primary', label: 'Primary', type: 'rds-primary', position: { x: 200, y: 100 } },
      { id: 'replica-1', label: 'Replica 1', type: 'rds-standby', position: { x: 300, y: 50 } },
      { id: 'replica-2', label: 'Replica 2', type: 'rds-standby', position: { x: 300, y: 150 } },
    ],
    edges: [
      { id: 'e1', source: 'client', target: 'region' },
      { id: 'e2', source: 'region', target: 'primary' },
      { id: 'e3', source: 'primary', target: 'replica-1' },
      { id: 'e4', source: 'primary', target: 'replica-2' },
    ],
  }
}

describe('Fan-Out Token Support', () => {
  describe('basic fan-out', () => {
    it('creates child tokens when parent arrives at fan-out node', () => {
      const scenario = createMockScenario({
        events: [
          createMockEvent({
            id: 'write-1',
            timestampMs: 0,
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

      const runner = new ScenarioRunner(scenario, createFanOutGraph())

      // Token emitted at t=0, travels client→region (500ms) → primary (500ms)
      // Arrives at primary at t=1000, should trigger fan-out
      const snapshot = runner.seekTo(1100)

      // Should have parent token + 2 child tokens
      expect(snapshot.tokens.length).toBeGreaterThanOrEqual(3)

      // Find parent and children
      const parentToken = snapshot.tokens.find(t => t.path.join(',') === 'client,region,primary')
      expect(parentToken).toBeDefined()
      expect(parentToken?.childTokenIds).toHaveLength(2)

      // Children should be traveling
      const childTokens = snapshot.tokens.filter(t => t.parentTokenId === parentToken?.id)
      expect(childTokens).toHaveLength(2)
      expect(childTokens.every(t => t.status === 'traveling')).toBe(true)
    })

    it('child tokens travel their respective paths', () => {
      const scenario = createMockScenario({
        events: [
          createMockEvent({
            id: 'write-1',
            timestampMs: 0,
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

      const runner = new ScenarioRunner(scenario, createFanOutGraph())

      // After fan-out, children travel to replicas
      // Parent arrives at t=1000, children start traveling
      // Children complete at t=1500
      const snapshot = runner.seekTo(1600)

      const childTokens = snapshot.tokens.filter(t => t.parentTokenId !== undefined)
      expect(childTokens.every(t => t.status === 'completed')).toBe(true)

      // Verify each child traveled to correct destination
      const paths = childTokens.map(t => t.path.join(','))
      expect(paths).toContain('primary,replica-1')
      expect(paths).toContain('primary,replica-2')
    })
  })

  describe('quorum behavior', () => {
    it('parent completes when quorum is met (1 of 2)', () => {
      const scenario = createMockScenario({
        events: [
          createMockEvent({
            id: 'write-1',
            timestampMs: 0,
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
            config: { nodeTypes: ['rds-primary'], quorumRequired: 1 },
          },
        },
        tokenFlowConfig: {
          defaultEdgeDurationMs: 500,
          edgeTimings: [
            { sourceNode: 'primary', targetNode: 'replica-1', durationMs: 300 },
            { sourceNode: 'primary', targetNode: 'replica-2', durationMs: 800 },
          ],
        },
      })

      const runner = new ScenarioRunner(scenario, createFanOutGraph())

      // Parent arrives at primary at t=1000
      // Child 1 (fast): completes at t=1300
      // Child 2 (slow): completes at t=1800
      // Quorum (1) met at t=1300

      // Just after first child completes
      const snapshotAtQuorum = runner.seekTo(1350)
      const parentToken = snapshotAtQuorum.tokens.find(t =>
        t.path.join(',') === 'client,region,primary' && t.childTokenIds !== undefined
      )
      expect(parentToken?.status).toBe('completed')

      // Second child should still be traveling
      const slowChild = snapshotAtQuorum.tokens.find(t =>
        t.path.join(',') === 'primary,replica-2'
      )
      expect(slowChild?.status).toBe('traveling')
    })

    it('parent waits when quorum requires all children', () => {
      const scenario = createMockScenario({
        events: [
          createMockEvent({
            id: 'write-1',
            timestampMs: 0,
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
            type: 'broadcast-replication', // Requires all
          },
        },
        tokenFlowConfig: {
          defaultEdgeDurationMs: 500,
          edgeTimings: [
            { sourceNode: 'primary', targetNode: 'replica-1', durationMs: 300 },
            { sourceNode: 'primary', targetNode: 'replica-2', durationMs: 800 },
          ],
        },
      })

      const runner = new ScenarioRunner(scenario, createFanOutGraph())

      // After first child completes but before second
      const snapshotMidway = runner.seekTo(1350)
      const parentMidway = snapshotMidway.tokens.find(t =>
        t.path.join(',') === 'client,region,primary' && t.childTokenIds !== undefined
      )
      expect(parentMidway?.status).toBe('waiting')

      // After both complete
      const snapshotFinal = runner.seekTo(1900)
      const parentFinal = snapshotFinal.tokens.find(t =>
        t.path.join(',') === 'client,region,primary' && t.childTokenIds !== undefined
      )
      expect(parentFinal?.status).toBe('completed')
    })

    it('defaults to majority quorum when quorumRequired not specified', () => {
      const scenario = createMockScenario({
        events: [
          createMockEvent({
            id: 'write-1',
            timestampMs: 0,
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
            config: { nodeTypes: ['rds-primary'] }, // No quorumRequired - defaults to majority
          },
        },
        tokenFlowConfig: {
          defaultEdgeDurationMs: 500,
          edgeTimings: [
            { sourceNode: 'primary', targetNode: 'replica-1', durationMs: 300 },
            { sourceNode: 'primary', targetNode: 'replica-2', durationMs: 800 },
          ],
        },
      })

      const runner = new ScenarioRunner(scenario, createFanOutGraph())

      // With 2 children, majority quorum is ceil(2/2) = 1
      // So after first child completes, parent should complete
      const snapshotAfterFirst = runner.seekTo(1350)
      const parent = snapshotAfterFirst.tokens.find(t => t.childTokenIds !== undefined)
      expect(parent?.status).toBe('completed')
    })
  })

  describe('failure scenarios', () => {
    it('parent fails if not enough children can complete (replica unavailable)', () => {
      const scenario = createMockScenario({
        events: [
          // Start the write
          createMockEvent({
            id: 'write-1',
            timestampMs: 0,
            action: 'route-request',
            targetId: 'primary',
            flowId: 'write-flow',
          }),
          // Fail replica-2 before tokens arrive
          createMockEvent({
            id: 'fail-replica',
            timestampMs: 500,
            action: 'fail',
            targetType: 'instance',
            targetId: 'replica-2',
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
            type: 'broadcast-replication', // Requires all (2)
          },
        },
        tokenFlowConfig: {
          defaultEdgeDurationMs: 500,
        },
      })

      const runner = new ScenarioRunner(scenario, createFanOutGraph())

      // Parent arrives at t=1000, creates children
      // replica-2 is unavailable, so only 1 child can be created
      // Since broadcast requires all (2), parent should fail
      const snapshot = runner.seekTo(1600)

      const parentToken = snapshot.tokens.find(t => t.childTokenIds !== undefined)
      expect(parentToken?.status).toBe('failed')
    })

    it('children continue traveling even after parent completes (for visualization)', () => {
      const scenario = createMockScenario({
        events: [
          createMockEvent({
            id: 'write-1',
            timestampMs: 0,
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
            config: { nodeTypes: ['rds-primary'], quorumRequired: 1 },
          },
        },
        tokenFlowConfig: {
          defaultEdgeDurationMs: 500,
          edgeTimings: [
            { sourceNode: 'primary', targetNode: 'replica-1', durationMs: 300 },
            { sourceNode: 'primary', targetNode: 'replica-2', durationMs: 1000 },
          ],
        },
      })

      const runner = new ScenarioRunner(scenario, createFanOutGraph())

      // After first child completes (quorum met), parent completes
      // But slow child should still be traveling
      const snapshotDuringLag = runner.seekTo(1500)

      const parentToken = snapshotDuringLag.tokens.find(t => t.childTokenIds !== undefined)
      expect(parentToken?.status).toBe('completed')

      const slowChild = snapshotDuringLag.tokens.find(t =>
        t.path.join(',') === 'primary,replica-2'
      )
      expect(slowChild?.status).toBe('traveling')

      // Eventually the slow child completes too
      const snapshotLater = runner.seekTo(2100)
      const slowChildLater = snapshotLater.tokens.find(t =>
        t.path.join(',') === 'primary,replica-2'
      )
      expect(slowChildLater?.status).toBe('completed')
    })
  })

  describe('child token types', () => {
    it('uses specified childTypeId for child tokens', () => {
      const scenario = createMockScenario({
        events: [
          createMockEvent({
            id: 'write-1',
            timestampMs: 0,
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
            config: { nodeTypes: ['rds-primary'], childTypeId: 'replication' },
          },
        },
        tokenFlowConfig: {
          defaultEdgeDurationMs: 500,
          tokenTypes: [
            { id: 'db-write', shape: 'square', color: '#8b5cf6', size: 10 },
            { id: 'replication', shape: 'diamond', color: '#a855f7', size: 8 },
          ],
        },
      })

      const runner = new ScenarioRunner(scenario, createFanOutGraph())
      const snapshot = runner.seekTo(1100)

      const childTokens = snapshot.tokens.filter(t => t.parentTokenId !== undefined)
      expect(childTokens.every(t => t.typeId === 'replication')).toBe(true)
    })

    it('inherits parent typeId when childTypeId not specified', () => {
      const scenario = createMockScenario({
        events: [
          createMockEvent({
            id: 'write-1',
            timestampMs: 0,
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
            config: { nodeTypes: ['rds-primary'] },
          },
        },
        tokenFlowConfig: {
          defaultEdgeDurationMs: 500,
          tokenTypes: [
            { id: 'db-write', shape: 'square', color: '#8b5cf6', size: 10 },
          ],
        },
      })

      const runner = new ScenarioRunner(scenario, createFanOutGraph())
      const snapshot = runner.seekTo(1100)

      const parentToken = snapshot.tokens.find(t => t.childTokenIds !== undefined)
      const childTokens = snapshot.tokens.filter(t => t.parentTokenId !== undefined)

      expect(childTokens.every(t => t.typeId === parentToken?.typeId)).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('handles token that does not hit any fan-out node', () => {
      const scenario = createMockScenario({
        events: [
          createMockEvent({
            id: 'write-1',
            timestampMs: 0,
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
            config: { nodeTypes: ['some-other-type'] }, // Not matching 'rds-primary'
          },
        },
        tokenFlowConfig: {
          defaultEdgeDurationMs: 500,
        },
      })

      const runner = new ScenarioRunner(scenario, createFanOutGraph())
      const snapshot = runner.seekTo(1100)

      // Token should complete normally without fan-out
      const tokens = snapshot.tokens.filter(t => t.status === 'completed')
      expect(tokens).toHaveLength(1)
      expect(tokens[0].childTokenIds).toBeUndefined()
    })

    it('handles no fan-out algorithm configured', () => {
      const scenario = createMockScenario({
        events: [
          createMockEvent({
            id: 'write-1',
            timestampMs: 0,
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
        // No algorithms.fanOut configured
        tokenFlowConfig: {
          defaultEdgeDurationMs: 500,
        },
      })

      const runner = new ScenarioRunner(scenario, createFanOutGraph())
      const snapshot = runner.seekTo(1100)

      // Token should complete normally without fan-out
      const tokens = snapshot.tokens.filter(t => t.status === 'completed')
      expect(tokens).toHaveLength(1)
      expect(tokens[0].childTokenIds).toBeUndefined()
    })

    it('handles multiple tokens hitting the same fan-out node', () => {
      const scenario = createMockScenario({
        events: [
          createMockEvent({
            id: 'write-1',
            timestampMs: 0,
            action: 'route-request',
            targetId: 'primary',
            flowId: 'write-flow',
          }),
          createMockEvent({
            id: 'write-2',
            timestampMs: 200,
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
            config: { nodeTypes: ['rds-primary'], quorumRequired: 1 },
          },
        },
        tokenFlowConfig: {
          defaultEdgeDurationMs: 500,
        },
      })

      const runner = new ScenarioRunner(scenario, createFanOutGraph())
      const snapshot = runner.seekTo(1500)

      // Should have 2 parent tokens + 4 child tokens (2 per parent)
      const parentTokens = snapshot.tokens.filter(t => t.childTokenIds !== undefined)
      expect(parentTokens).toHaveLength(2)

      const childTokens = snapshot.tokens.filter(t => t.parentTokenId !== undefined)
      expect(childTokens).toHaveLength(4)
    })
  })

  describe('nodeRoles configuration', () => {
    // Graph with runtime roles (set via metadata, not static node type)
    function createRoleBasedGraph() {
      return {
        id: 'role-test',
        name: 'Role-Based Test Graph',
        description: 'Graph for testing role-based fan-out',
        nodes: [
          { id: 'client', label: 'Client', type: 'client', position: { x: 0, y: 100 } },
          { id: 'region', label: 'Region', type: 'region', position: { x: 100, y: 100 } },
          // All DBs have same type, role is determined at runtime
          { id: 'db-1', label: 'DB 1', type: 'aurora-instance', position: { x: 200, y: 50 } },
          { id: 'db-2', label: 'DB 2', type: 'aurora-instance', position: { x: 200, y: 100 } },
          { id: 'db-3', label: 'DB 3', type: 'aurora-instance', position: { x: 200, y: 150 } },
          { id: 'replica-1', label: 'Replica 1', type: 'aurora-replica', position: { x: 300, y: 50 } },
          { id: 'replica-2', label: 'Replica 2', type: 'aurora-replica', position: { x: 300, y: 150 } },
        ],
        edges: [
          { id: 'e1', source: 'client', target: 'region' },
          { id: 'e2', source: 'region', target: 'db-1' },
          // Replication from db-1 (when primary) to replicas
          { id: 'e3', source: 'db-1', target: 'replica-1' },
          { id: 'e4', source: 'db-1', target: 'replica-2' },
          // Replication from db-2 (when primary) to replicas
          { id: 'e5', source: 'db-2', target: 'replica-1' },
          { id: 'e6', source: 'db-2', target: 'replica-2' },
        ],
      }
    }

    it('triggers fan-out when metadata.role matches nodeRoles config', () => {
      const scenario = createMockScenario({
        events: [
          // Promote db-1 to primary
          createMockEvent({
            id: 'promote-db1',
            timestampMs: 0,
            action: 'promote',
            targetId: 'db-1',
            promotionRole: 'primary',
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
            path: ['client', 'region', 'db-1'],
          }),
        ],
        algorithms: {
          fanOut: {
            type: 'quorum-replication',
            config: { nodeRoles: ['primary'], quorumRequired: 1 },
          },
        },
        tokenFlowConfig: {
          defaultEdgeDurationMs: 500,
        },
      })

      const runner = new ScenarioRunner(scenario, createRoleBasedGraph())

      // Token arrives at db-1 at t=1100 (100ms emit + 2 edges × 500ms)
      const snapshot = runner.seekTo(1200)

      // Should have fan-out because db-1 has role: 'primary'
      const parentToken = snapshot.tokens.find(t => t.childTokenIds !== undefined)
      expect(parentToken).toBeDefined()
      expect(parentToken?.childTokenIds).toHaveLength(2) // 2 replicas
    })

    it('does NOT trigger fan-out when role does not match nodeRoles', () => {
      const scenario = createMockScenario({
        events: [
          // Promote db-1 to standby (not primary)
          createMockEvent({
            id: 'set-standby',
            timestampMs: 0,
            action: 'promote',
            targetId: 'db-1',
            promotionRole: 'standby',
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
            path: ['client', 'region', 'db-1'],
          }),
        ],
        algorithms: {
          fanOut: {
            type: 'quorum-replication',
            config: { nodeRoles: ['primary'], quorumRequired: 1 },
          },
        },
        tokenFlowConfig: {
          defaultEdgeDurationMs: 500,
        },
      })

      const runner = new ScenarioRunner(scenario, createRoleBasedGraph())
      const snapshot = runner.seekTo(1200)

      // Should NOT have fan-out because db-1 has role: 'standby', not 'primary'
      const parentToken = snapshot.tokens.find(t => t.childTokenIds !== undefined)
      expect(parentToken).toBeUndefined()

      // Token should complete without children
      const completedToken = snapshot.tokens.find(t => t.status === 'completed')
      expect(completedToken).toBeDefined()
      expect(completedToken?.childTokenIds).toBeUndefined()
    })

    it('works with nodeTypes as fallback when nodeRoles not matched', () => {
      const scenario = createMockScenario({
        events: [
          createMockEvent({
            id: 'write-1',
            timestampMs: 0,
            action: 'route-request',
            targetId: 'db-1',
            flowId: 'write-flow',
          }),
        ],
        requestFlows: [
          createMockFlow({
            id: 'write-flow',
            path: ['client', 'region', 'db-1'],
          }),
        ],
        algorithms: {
          fanOut: {
            type: 'quorum-replication',
            config: {
              nodeRoles: ['primary'], // db-1 doesn't have this role
              nodeTypes: ['aurora-instance'], // db-1 HAS this type
              quorumRequired: 1,
            },
          },
        },
        tokenFlowConfig: {
          defaultEdgeDurationMs: 500,
        },
      })

      const runner = new ScenarioRunner(scenario, createRoleBasedGraph())
      const snapshot = runner.seekTo(1100)

      // Should trigger via nodeTypes fallback
      const parentToken = snapshot.tokens.find(t => t.childTokenIds !== undefined)
      expect(parentToken).toBeDefined()
    })

    it('quorum-replication: no fan-out when neither nodeTypes nor nodeRoles configured', () => {
      const scenario = createMockScenario({
        events: [
          createMockEvent({
            id: 'write-1',
            timestampMs: 0,
            action: 'route-request',
            targetId: 'db-1',
            flowId: 'write-flow',
          }),
        ],
        requestFlows: [
          createMockFlow({
            id: 'write-flow',
            path: ['client', 'region', 'db-1'],
          }),
        ],
        algorithms: {
          fanOut: {
            type: 'quorum-replication',
            config: { quorumRequired: 1 }, // No nodeTypes or nodeRoles
          },
        },
        tokenFlowConfig: {
          defaultEdgeDurationMs: 500,
        },
      })

      const runner = new ScenarioRunner(scenario, createRoleBasedGraph())
      const snapshot = runner.seekTo(1100)

      // No fan-out without explicit config
      const parentToken = snapshot.tokens.find(t => t.childTokenIds !== undefined)
      expect(parentToken).toBeUndefined()

      // Token completes normally
      const completedToken = snapshot.tokens.find(t => t.status === 'completed')
      expect(completedToken).toBeDefined()
    })

    it('broadcast-replication: fans out at any node with outgoing edges when no config', () => {
      const scenario = createMockScenario({
        events: [
          createMockEvent({
            id: 'write-1',
            timestampMs: 0,
            action: 'route-request',
            targetId: 'db-1',
            flowId: 'write-flow',
          }),
        ],
        requestFlows: [
          createMockFlow({
            id: 'write-flow',
            path: ['client', 'region', 'db-1'],
          }),
        ],
        algorithms: {
          fanOut: {
            type: 'broadcast-replication',
            // No config - should still fan out
          },
        },
        tokenFlowConfig: {
          defaultEdgeDurationMs: 500,
        },
      })

      const runner = new ScenarioRunner(scenario, createRoleBasedGraph())
      const snapshot = runner.seekTo(1100)

      // broadcast-replication without config fans out at any node with outgoing edges
      const parentToken = snapshot.tokens.find(t => t.childTokenIds !== undefined)
      expect(parentToken).toBeDefined()
      expect(parentToken?.childTokenIds?.length).toBeGreaterThan(0)
    })

    it('handles dynamic role changes - fan-out follows current primary', () => {
      const scenario = createMockScenario({
        events: [
          // Initially db-1 is primary
          createMockEvent({
            id: 'promote-db1',
            timestampMs: 0,
            action: 'promote',
            targetId: 'db-1',
            promotionRole: 'primary',
          }),
          // First write to db-1 (primary)
          createMockEvent({
            id: 'write-1',
            timestampMs: 100,
            action: 'route-request',
            targetId: 'db-1',
            flowId: 'write-flow',
          }),
          // Failover: promote db-2 to primary
          createMockEvent({
            id: 'promote-db2',
            timestampMs: 2000,
            action: 'promote',
            targetId: 'db-2',
            promotionRole: 'primary',
          }),
          // Second write to db-2 (new primary)
          createMockEvent({
            id: 'write-2',
            timestampMs: 2100,
            action: 'route-request',
            targetId: 'db-2',
            flowId: 'write-flow-2',
          }),
        ],
        requestFlows: [
          createMockFlow({
            id: 'write-flow',
            path: ['client', 'region', 'db-1'],
          }),
          createMockFlow({
            id: 'write-flow-2',
            path: ['client', 'region', 'db-2'],
          }),
        ],
        algorithms: {
          fanOut: {
            type: 'quorum-replication',
            config: { nodeRoles: ['primary'], quorumRequired: 1 },
          },
        },
        tokenFlowConfig: {
          defaultEdgeDurationMs: 500,
        },
      })

      const runner = new ScenarioRunner(scenario, createRoleBasedGraph())

      // After first write
      const snapshot1 = runner.seekTo(1200)
      const parent1 = snapshot1.tokens.find(t =>
        t.path.includes('db-1') && t.childTokenIds !== undefined
      )
      expect(parent1).toBeDefined()
      expect(parent1?.childTokenIds).toHaveLength(2) // db-1 triggered fan-out

      // After failover and second write
      const snapshot2 = runner.seekTo(3200)

      // db-2 should now be primary
      expect(snapshot2.nodeStates.get('db-2')?.metadata?.role).toBe('primary')
      expect(snapshot2.nodeStates.get('db-1')?.metadata?.role).toBe('standby')

      // Second write should also trigger fan-out (db-2 is now primary)
      const parent2 = snapshot2.tokens.find(t =>
        t.path.includes('db-2') && t.childTokenIds !== undefined
      )
      expect(parent2).toBeDefined()
    })
  })
})
