import type { Scenario, ScenarioEvent, RequestFlow } from '@/types/scenario'
import type { NodeState } from '@/types/graph'
import type { GraphDefinition } from '@/types/graph-type'
import type { ScenarioExecutionContext } from '@/types/scenario-engine'

// Create a mock execution context with sensible defaults
export function createMockContext(
  overrides?: Partial<ScenarioExecutionContext>
): ScenarioExecutionContext {
  return {
    scenario: createMockScenario(),
    currentTimeMs: 0,
    nodeStates: new Map(),
    graphTopology: { nodes: [], edges: [] },
    algorithmState: new Map(),
    ...overrides
  }
}

// Create a minimal mock scenario
export function createMockScenario(overrides?: Partial<Scenario>): Scenario {
  return {
    id: 'test-scenario',
    name: 'Test Scenario',
    description: 'A test scenario',
    graphId: 'test-graph',
    infrastructureId: 'test-infra',
    events: [],
    requestFlows: [],
    durationMs: 10000,
    expectedOutcome: 'Test outcome',
    awsContext: {
      useCloudFront: false,
      useMultiAz: false,
      useAutoScaling: false,
      healthCheckEnabled: false
    },
    ...overrides
  }
}

// Create a mock event
export function createMockEvent(overrides?: Partial<ScenarioEvent>): ScenarioEvent {
  return {
    id: 'test-event',
    timestampMs: 1000,
    action: 'fail',
    targetType: 'az',
    targetId: 'test-az',
    ...overrides
  }
}

// Create a mock request flow
export function createMockFlow(overrides?: Partial<RequestFlow>): RequestFlow {
  return {
    id: 'test-flow',
    sourceLocation: 'edge-sfo',
    targetServiceId: 'web-service',
    path: ['edge-sfo', 'region-us-east-1', 'az-us-east-1-use1-az1'],
    latencyMs: 50,
    status: 'success',
    routingStrategy: 'cloudfront',
    ...overrides
  }
}

// Create a mock node state
export function createMockNodeState(overrides?: Partial<NodeState>): NodeState {
  return {
    id: 'test-node',
    status: 'available',
    isAnimating: false,
    ...overrides
  }
}

// Create a mock graph topology
export function createMockGraph(overrides?: Partial<GraphDefinition>): GraphDefinition {
  return {
    nodes: [
      { id: 'edge-sfo', label: 'Edge SFO', type: 'edge-location', position: { x: 0, y: 0 } },
      { id: 'region-us-east-1', label: 'US East 1', type: 'region', position: { x: 100, y: 0 } },
      { id: 'az-us-east-1-use1-az1', label: 'AZ 1', type: 'az', position: { x: 200, y: 0 } },
      { id: 'az-us-east-1-use1-az2', label: 'AZ 2', type: 'az', position: { x: 200, y: 100 } }
    ],
    edges: [
      { id: 'e1', source: 'edge-sfo', target: 'region-us-east-1' },
      { id: 'e2', source: 'region-us-east-1', target: 'az-us-east-1-use1-az1' },
      { id: 'e3', source: 'region-us-east-1', target: 'az-us-east-1-use1-az2' }
    ],
    ...overrides
  }
}
