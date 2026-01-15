import { describe, it, expect } from 'vitest'
import { promoteEventHandler, processEvent } from '../event-handlers'
import { ScenarioRunner } from '../scenario-runner'
import {
  createMockContext,
  createMockScenario,
  createMockEvent,
  createMockFlow,
  createMockNodeState,
  createMockGraph,
} from './test-utils'

describe('promoteEventHandler', () => {
  it('sets metadata.role on target node', () => {
    const event = createMockEvent({
      action: 'promote',
      targetId: 'db-reader',
      promotionRole: 'primary',
    })
    const context = createMockContext({
      nodeStates: new Map([
        ['db-reader', createMockNodeState({ id: 'db-reader' })],
      ]),
    })

    const result = promoteEventHandler.handle(event, context)

    const nodeChange = result.nodeStateChanges.get('db-reader')
    expect(nodeChange).toBeDefined()
    expect(nodeChange?.metadata?.role).toBe('primary')
  })

  it('demotes previous node with same role to standby', () => {
    const event = createMockEvent({
      action: 'promote',
      targetId: 'db-reader',
      promotionRole: 'primary',
    })
    const context = createMockContext({
      nodeStates: new Map([
        ['db-writer', createMockNodeState({
          id: 'db-writer',
          metadata: { role: 'primary' },
        })],
        ['db-reader', createMockNodeState({
          id: 'db-reader',
          metadata: { role: 'standby' },
        })],
      ]),
    })

    const result = promoteEventHandler.handle(event, context)

    // db-writer should be demoted
    const writerChange = result.nodeStateChanges.get('db-writer')
    expect(writerChange).toBeDefined()
    expect(writerChange?.metadata?.role).toBe('standby')

    // db-reader should be promoted
    const readerChange = result.nodeStateChanges.get('db-reader')
    expect(readerChange).toBeDefined()
    expect(readerChange?.metadata?.role).toBe('primary')
  })

  it('sets sublabel to "Primary" for primary role', () => {
    const event = createMockEvent({
      action: 'promote',
      targetId: 'db-node',
      promotionRole: 'primary',
    })
    const context = createMockContext({
      nodeStates: new Map([
        ['db-node', createMockNodeState({ id: 'db-node' })],
      ]),
    })

    const result = promoteEventHandler.handle(event, context)

    const nodeChange = result.nodeStateChanges.get('db-node')
    expect(nodeChange?.sublabel).toBe('Primary')
  })

  it('clears sublabel for demoted node', () => {
    const event = createMockEvent({
      action: 'promote',
      targetId: 'db-reader',
      promotionRole: 'primary',
    })
    const context = createMockContext({
      nodeStates: new Map([
        ['db-writer', createMockNodeState({
          id: 'db-writer',
          metadata: { role: 'primary' },
          sublabel: 'Primary',
        })],
        ['db-reader', createMockNodeState({ id: 'db-reader' })],
      ]),
    })

    const result = promoteEventHandler.handle(event, context)

    const writerChange = result.nodeStateChanges.get('db-writer')
    expect(writerChange?.sublabel).toBeUndefined()
  })

  it('triggers promotion animation type', () => {
    const event = createMockEvent({
      action: 'promote',
      targetId: 'db-node',
      promotionRole: 'primary',
    })
    const context = createMockContext({
      nodeStates: new Map([
        ['db-node', createMockNodeState({ id: 'db-node' })],
      ]),
    })

    const result = promoteEventHandler.handle(event, context)

    const nodeChange = result.nodeStateChanges.get('db-node')
    expect(nodeChange?.isAnimating).toBe(true)
    expect(nodeChange?.animationType).toBe('promotion')
  })

  it('defaults to primary role when promotionRole not specified', () => {
    const event = createMockEvent({
      action: 'promote',
      targetId: 'db-node',
      // No promotionRole specified
    })
    const context = createMockContext({
      nodeStates: new Map([
        ['db-node', createMockNodeState({ id: 'db-node' })],
      ]),
    })

    const result = promoteEventHandler.handle(event, context)

    const nodeChange = result.nodeStateChanges.get('db-node')
    expect(nodeChange?.metadata?.role).toBe('primary')
  })

  it('handles non-primary roles (e.g., writer, leader)', () => {
    const event = createMockEvent({
      action: 'promote',
      targetId: 'db-node',
      promotionRole: 'leader',
    })
    const context = createMockContext({
      nodeStates: new Map([
        ['old-leader', createMockNodeState({
          id: 'old-leader',
          metadata: { role: 'leader' },
        })],
        ['db-node', createMockNodeState({ id: 'db-node' })],
      ]),
    })

    const result = promoteEventHandler.handle(event, context)

    // Old leader demoted
    const oldLeaderChange = result.nodeStateChanges.get('old-leader')
    expect(oldLeaderChange?.metadata?.role).toBe('standby')

    // New leader promoted
    const nodeChange = result.nodeStateChanges.get('db-node')
    expect(nodeChange?.metadata?.role).toBe('leader')
    // Non-primary roles don't get "Primary" sublabel
    expect(nodeChange?.sublabel).toBeUndefined()
  })

  it('preserves existing metadata when promoting', () => {
    const event = createMockEvent({
      action: 'promote',
      targetId: 'db-node',
      promotionRole: 'primary',
    })
    const context = createMockContext({
      nodeStates: new Map([
        ['db-node', createMockNodeState({
          id: 'db-node',
          metadata: { region: 'us-east-1', customField: 'value' },
        })],
      ]),
    })

    const result = promoteEventHandler.handle(event, context)

    const nodeChange = result.nodeStateChanges.get('db-node')
    expect(nodeChange?.metadata?.role).toBe('primary')
    expect(nodeChange?.metadata?.region).toBe('us-east-1')
    expect(nodeChange?.metadata?.customField).toBe('value')
  })

  it('sets node status to available when promoting', () => {
    const event = createMockEvent({
      action: 'promote',
      targetId: 'db-node',
      promotionRole: 'primary',
    })
    const context = createMockContext({
      nodeStates: new Map([
        ['db-node', createMockNodeState({
          id: 'db-node',
          status: 'degraded', // Was degraded before promotion
        })],
      ]),
    })

    const result = promoteEventHandler.handle(event, context)

    const nodeChange = result.nodeStateChanges.get('db-node')
    expect(nodeChange?.status).toBe('available')
  })

  it('does not demote nodes with different roles', () => {
    const event = createMockEvent({
      action: 'promote',
      targetId: 'db-reader',
      promotionRole: 'primary',
    })
    const context = createMockContext({
      nodeStates: new Map([
        ['db-writer', createMockNodeState({
          id: 'db-writer',
          metadata: { role: 'writer' }, // Different role, not 'primary'
        })],
        ['db-reader', createMockNodeState({ id: 'db-reader' })],
      ]),
    })

    const result = promoteEventHandler.handle(event, context)

    // db-writer should NOT be changed (has 'writer' role, not 'primary')
    expect(result.nodeStateChanges.has('db-writer')).toBe(false)

    // db-reader should be promoted
    const readerChange = result.nodeStateChanges.get('db-reader')
    expect(readerChange?.metadata?.role).toBe('primary')
  })
})

describe('promote event integration with ScenarioRunner', () => {
  function createPromoteTestGraph() {
    return {
      id: 'promote-test',
      name: 'Promote Test Graph',
      description: 'Graph for testing promotion',
      nodes: [
        { id: 'client', label: 'Client', type: 'client', position: { x: 0, y: 100 } },
        { id: 'endpoint', label: 'Endpoint', type: 'dns-endpoint', position: { x: 100, y: 100 } },
        { id: 'region', label: 'Region', type: 'region', position: { x: 200, y: 100 } },
        { id: 'az-1', label: 'AZ 1', type: 'az', position: { x: 300, y: 50 } },
        { id: 'az-2', label: 'AZ 2', type: 'az', position: { x: 300, y: 150 } },
        { id: 'db-writer', label: 'Writer', type: 'aurora-writer', position: { x: 400, y: 50 } },
        { id: 'db-reader', label: 'Reader', type: 'aurora-reader', position: { x: 400, y: 150 } },
      ],
      edges: [
        { id: 'e1', source: 'client', target: 'endpoint' },
        { id: 'e2', source: 'endpoint', target: 'region' },
        { id: 'e3', source: 'region', target: 'az-1' },
        { id: 'e4', source: 'region', target: 'az-2' },
        { id: 'e5', source: 'az-1', target: 'db-writer' },
        { id: 'e6', source: 'az-2', target: 'db-reader' },
      ],
    }
  }

  it('integrates with primary-aware path selector after promotion', () => {
    const scenario = createMockScenario({
      events: [
        createMockEvent({
          id: 'init-primary',
          timestampMs: 0,
          action: 'promote',
          targetId: 'db-writer',
          promotionRole: 'primary',
        }),
        createMockEvent({
          id: 'write-1',
          timestampMs: 500,
          action: 'route-request',
          targetId: 'db-writer',
          flowId: 'write-flow',
        }),
      ],
      requestFlows: [
        createMockFlow({
          id: 'write-flow',
          targetServiceId: 'db-writer',
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

    const runner = new ScenarioRunner(scenario, createPromoteTestGraph())
    const snapshot = runner.seekTo(600)

    // Token should be traveling to db-writer through az-1
    const token = snapshot.tokens.find(t => t.path.includes('db-writer'))
    expect(token).toBeDefined()
    expect(token?.path).toContain('az-1')
    expect(token?.path).toContain('db-writer')
  })

  it('routes to new primary after failover promotion', () => {
    const scenario = createMockScenario({
      events: [
        // Initially db-writer is primary
        createMockEvent({
          id: 'init-primary',
          timestampMs: 0,
          action: 'promote',
          targetId: 'db-writer',
          promotionRole: 'primary',
        }),
        // AZ-1 fails
        createMockEvent({
          id: 'fail-az1',
          timestampMs: 1000,
          action: 'fail',
          targetType: 'az',
          targetId: 'az-1',
        }),
        // Promote db-reader to primary
        createMockEvent({
          id: 'failover',
          timestampMs: 2000,
          action: 'promote',
          targetId: 'db-reader',
          promotionRole: 'primary',
        }),
        // Send write after failover
        createMockEvent({
          id: 'write-1',
          timestampMs: 3000,
          action: 'route-request',
          targetId: 'db-reader',
          flowId: 'write-flow',
        }),
      ],
      requestFlows: [
        createMockFlow({
          id: 'write-flow',
          targetServiceId: 'db-writer',
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

    const runner = new ScenarioRunner(scenario, createPromoteTestGraph())

    // Check state after failover
    const snapshot = runner.seekTo(3100)

    // db-reader should now be primary
    const readerState = snapshot.nodeStates.get('db-reader')
    expect(readerState?.metadata?.role).toBe('primary')

    // db-writer should be standby
    const writerState = snapshot.nodeStates.get('db-writer')
    expect(writerState?.metadata?.role).toBe('standby')

    // Token should be routing to db-reader through az-2
    const token = snapshot.tokens.find(t => t.emittedAtMs === 3000)
    expect(token).toBeDefined()
    expect(token?.path).toContain('az-2')
    expect(token?.path).toContain('db-reader')
  })
})
