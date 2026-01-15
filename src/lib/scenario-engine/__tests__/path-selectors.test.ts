import { describe, it, expect, beforeEach } from 'vitest'
import { algorithmRegistry } from '@/lib/algorithm-registry'
import type { PathSelector } from '@/types/scenario-engine'
import {
  createMockContext,
  createMockScenario,
  createMockFlow,
  createMockNodeState,
  createMockGraph,
} from './test-utils'

// Get path selectors from registry to avoid circular dependency
const staticPathSelector = algorithmRegistry.getPathSelector('static')!
const healthiestPathSelector = algorithmRegistry.getPathSelector('healthiest')!
const primaryAwarePathSelector = algorithmRegistry.getPathSelector('primary-aware')!
const geoAwarePathSelector = algorithmRegistry.getPathSelector('geo-aware')!

describe('Path Selectors', () => {
  describe('staticPathSelector', () => {
    it('returns configured path when all nodes are available', () => {
      const flow = createMockFlow({
        path: ['client', 'region', 'az-1', 'db-1'],
      })
      const context = createMockContext()

      const result = staticPathSelector.computePath(flow, context)

      expect(result).toEqual(['client', 'region', 'az-1', 'db-1'])
    })

    it('truncates path at first unavailable node (includes the unavailable node)', () => {
      const flow = createMockFlow({
        path: ['client', 'region', 'az-1', 'db-1'],
      })
      const context = createMockContext({
        nodeStates: new Map([
          ['az-1', createMockNodeState({ id: 'az-1', status: 'unavailable' })],
        ]),
      })

      const result = staticPathSelector.computePath(flow, context)

      // Should include the unavailable node but stop there
      expect(result).toEqual(['client', 'region', 'az-1'])
    })

    it('uses failover path when primary path is blocked', () => {
      const flow = createMockFlow({
        path: ['client', 'region', 'az-1', 'db-1'],
        failoverPath: ['client', 'region', 'az-2', 'db-2'],
      })
      const context = createMockContext({
        nodeStates: new Map([
          ['az-1', createMockNodeState({ id: 'az-1', status: 'unavailable' })],
        ]),
      })

      const result = staticPathSelector.computePath(flow, context)

      expect(result).toEqual(['client', 'region', 'az-2', 'db-2'])
    })

    it('truncates if failover path is also blocked', () => {
      const flow = createMockFlow({
        path: ['client', 'region', 'az-1', 'db-1'],
        failoverPath: ['client', 'region', 'az-2', 'db-2'],
      })
      const context = createMockContext({
        nodeStates: new Map([
          ['az-1', createMockNodeState({ id: 'az-1', status: 'unavailable' })],
          ['az-2', createMockNodeState({ id: 'az-2', status: 'unavailable' })],
        ]),
      })

      const result = staticPathSelector.computePath(flow, context)

      // Failover path is blocked too, so truncate at first unavailable in primary path
      expect(result).toEqual(['client', 'region', 'az-1'])
    })

    it('handles empty path gracefully', () => {
      const flow = createMockFlow({ path: [] })
      const context = createMockContext()

      const result = staticPathSelector.computePath(flow, context)

      expect(result).toEqual([])
    })

    it('handles undefined path gracefully', () => {
      const flow = createMockFlow({ path: undefined as unknown as string[] })
      const context = createMockContext()

      const result = staticPathSelector.computePath(flow, context)

      expect(result).toEqual([])
    })

    it('treats degraded nodes as available (does not truncate)', () => {
      const flow = createMockFlow({
        path: ['client', 'region', 'az-1', 'db-1'],
      })
      const context = createMockContext({
        nodeStates: new Map([
          ['az-1', createMockNodeState({ id: 'az-1', status: 'degraded' })],
        ]),
      })

      const result = staticPathSelector.computePath(flow, context)

      // Degraded is not unavailable, path continues
      expect(result).toEqual(['client', 'region', 'az-1', 'db-1'])
    })
  })

  describe('healthiestPathSelector', () => {
    it('uses load balancer to select from candidates', () => {
      const flow = createMockFlow({
        path: ['client', 'region', 'alb'],
        pathConstraints: {
          candidates: ['az-1', 'az-2', 'az-3'],
        },
      })
      const context = createMockContext({
        scenario: createMockScenario({
          requestFlows: [flow],
          algorithms: {
            loadBalancer: { type: 'round-robin' },
          },
        }),
        graphTopology: createMockGraph({
          nodes: [
            { id: 'client', label: 'Client', type: 'client', position: { x: 0, y: 0 } },
            { id: 'region', label: 'Region', type: 'region', position: { x: 100, y: 0 } },
            { id: 'alb', label: 'ALB', type: 'alb', position: { x: 200, y: 0 } },
            { id: 'az-1', label: 'AZ 1', type: 'az', position: { x: 300, y: 0 } },
            { id: 'az-2', label: 'AZ 2', type: 'az', position: { x: 300, y: 50 } },
            { id: 'az-3', label: 'AZ 3', type: 'az', position: { x: 300, y: 100 } },
          ],
          edges: [],
        }),
        algorithmState: new Map([['round-robin', { index: 0 }]]),
      })

      const result = healthiestPathSelector.computePath(flow, context)

      // Round-robin at index 0 selects first candidate
      expect(result).toContain('az-1')
    })

    it('skips unavailable candidates', () => {
      const flow = createMockFlow({
        path: ['client', 'region', 'alb'],
        pathConstraints: {
          candidates: ['az-1', 'az-2', 'az-3'],
        },
      })
      const context = createMockContext({
        scenario: createMockScenario({
          requestFlows: [flow],
          algorithms: {
            loadBalancer: { type: 'round-robin' },
          },
        }),
        nodeStates: new Map([
          ['az-1', createMockNodeState({ id: 'az-1', status: 'unavailable' })],
        ]),
        algorithmState: new Map([['round-robin', { index: 0 }]]),
      })

      const result = healthiestPathSelector.computePath(flow, context)

      // az-1 is unavailable, should select az-2
      expect(result).toContain('az-2')
      expect(result).not.toContain('az-1')
    })

    it('falls back to first candidate when all unavailable', () => {
      const flow = createMockFlow({
        path: ['client', 'region', 'alb'],
        pathConstraints: {
          candidates: ['az-1', 'az-2'],
        },
      })
      const context = createMockContext({
        scenario: createMockScenario({
          requestFlows: [flow],
          algorithms: {
            loadBalancer: { type: 'round-robin' },
          },
        }),
        nodeStates: new Map([
          ['az-1', createMockNodeState({ id: 'az-1', status: 'unavailable' })],
          ['az-2', createMockNodeState({ id: 'az-2', status: 'unavailable' })],
        ]),
        algorithmState: new Map([['round-robin', { index: 0 }]]),
      })

      const result = healthiestPathSelector.computePath(flow, context)

      // All unavailable, falls back to first candidate
      expect(result).toContain('az-1')
    })

    it('append mode: adds selected candidate to base path', () => {
      const flow = createMockFlow({
        path: ['client', 'region', 'alb'],
        pathConstraints: {
          candidates: ['az-1', 'az-2'],
        },
      })
      const context = createMockContext({
        scenario: createMockScenario({
          requestFlows: [flow],
          algorithms: {
            loadBalancer: { type: 'round-robin' },
          },
        }),
        graphTopology: createMockGraph({
          nodes: [
            { id: 'client', label: 'Client', type: 'client', position: { x: 0, y: 0 } },
            { id: 'region', label: 'Region', type: 'region', position: { x: 100, y: 0 } },
            { id: 'alb', label: 'ALB', type: 'alb', position: { x: 200, y: 0 } },
            { id: 'az-1', label: 'AZ 1', type: 'az', position: { x: 300, y: 0 } },
            { id: 'az-2', label: 'AZ 2', type: 'az', position: { x: 300, y: 50 } },
          ],
          edges: [],
        }),
        algorithmState: new Map([['round-robin', { index: 0 }]]),
      })

      const result = healthiestPathSelector.computePath(flow, context)

      // Base path + selected candidate appended
      expect(result[0]).toBe('client')
      expect(result[1]).toBe('region')
      expect(result[2]).toBe('alb')
      expect(result[3]).toBe('az-1')
    })

    it('replace mode: swaps candidate in path with selected', () => {
      const flow = createMockFlow({
        path: ['client', 'region', 'az-placeholder'],
        pathConstraints: {
          candidates: ['az-placeholder', 'az-1', 'az-2'],
        },
      })
      const context = createMockContext({
        scenario: createMockScenario({
          requestFlows: [flow],
          algorithms: {
            loadBalancer: { type: 'round-robin' },
          },
        }),
        algorithmState: new Map([['round-robin', { index: 1 }]]),
      })

      const result = healthiestPathSelector.computePath(flow, context)

      // Should replace az-placeholder with selected candidate (az-1 at index 1)
      expect(result).toContain('az-1')
    })

    it('falls back to static path when no load balancer configured', () => {
      const flow = createMockFlow({
        path: ['client', 'region', 'az-1'],
      })
      const context = createMockContext({
        scenario: createMockScenario({
          requestFlows: [flow],
          // No algorithms configured
        }),
      })

      const result = healthiestPathSelector.computePath(flow, context)

      expect(result).toEqual(['client', 'region', 'az-1'])
    })
  })

  describe('primaryAwarePathSelector', () => {
    it('routes to node with metadata.role === "primary"', () => {
      const flow = createMockFlow({
        path: ['client', 'endpoint', 'region'],
      })
      const context = createMockContext({
        nodeStates: new Map([
          ['db-writer', createMockNodeState({
            id: 'db-writer',
            metadata: { role: 'primary' }
          })],
          ['db-reader', createMockNodeState({
            id: 'db-reader',
            metadata: { role: 'standby' }
          })],
        ]),
        graphTopology: createMockGraph({
          nodes: [
            { id: 'client', label: 'Client', type: 'client', position: { x: 0, y: 0 } },
            { id: 'endpoint', label: 'Endpoint', type: 'dns-endpoint', position: { x: 100, y: 0 } },
            { id: 'region', label: 'Region', type: 'region', position: { x: 200, y: 0 } },
            { id: 'az-1', label: 'AZ 1', type: 'az', position: { x: 300, y: 0 } },
            { id: 'az-2', label: 'AZ 2', type: 'az', position: { x: 300, y: 50 } },
            { id: 'db-writer', label: 'Writer', type: 'aurora-writer', position: { x: 400, y: 0 } },
            { id: 'db-reader', label: 'Reader', type: 'aurora-reader', position: { x: 400, y: 50 } },
          ],
          edges: [
            { id: 'e1', source: 'az-1', target: 'db-writer' },
            { id: 'e2', source: 'az-2', target: 'db-reader' },
          ],
        }),
      })

      const result = primaryAwarePathSelector.computePath(flow, context)

      expect(result).toContain('db-writer')
      expect(result).toContain('az-1') // The AZ containing the primary
    })

    it('finds correct AZ for primary node', () => {
      const flow = createMockFlow({
        path: ['client', 'endpoint', 'region'],
      })
      const context = createMockContext({
        nodeStates: new Map([
          ['db-primary', createMockNodeState({
            id: 'db-primary',
            metadata: { role: 'primary' }
          })],
        ]),
        graphTopology: createMockGraph({
          nodes: [
            { id: 'client', label: 'Client', type: 'client', position: { x: 0, y: 0 } },
            { id: 'endpoint', label: 'Endpoint', type: 'dns-endpoint', position: { x: 100, y: 0 } },
            { id: 'region', label: 'Region', type: 'region', position: { x: 200, y: 0 } },
            { id: 'az-1', label: 'AZ 1', type: 'az', position: { x: 300, y: 0 } },
            { id: 'az-2', label: 'AZ 2', type: 'az', position: { x: 300, y: 50 } },
            { id: 'db-primary', label: 'Primary', type: 'aurora-writer', position: { x: 400, y: 50 } },
          ],
          edges: [
            { id: 'e1', source: 'az-2', target: 'db-primary' }, // Primary is in az-2
          ],
        }),
      })

      const result = primaryAwarePathSelector.computePath(flow, context)

      // Path should go through az-2 (where primary is)
      expect(result).toEqual(['client', 'endpoint', 'region', 'az-2', 'db-primary'])
    })

    it('truncates path when primary AZ is unavailable', () => {
      const flow = createMockFlow({
        path: ['client', 'endpoint', 'region'],
      })
      const context = createMockContext({
        nodeStates: new Map([
          ['db-primary', createMockNodeState({
            id: 'db-primary',
            metadata: { role: 'primary' }
          })],
          ['az-1', createMockNodeState({
            id: 'az-1',
            status: 'unavailable'
          })],
        ]),
        graphTopology: createMockGraph({
          nodes: [
            { id: 'client', label: 'Client', type: 'client', position: { x: 0, y: 0 } },
            { id: 'endpoint', label: 'Endpoint', type: 'dns-endpoint', position: { x: 100, y: 0 } },
            { id: 'region', label: 'Region', type: 'region', position: { x: 200, y: 0 } },
            { id: 'az-1', label: 'AZ 1', type: 'az', position: { x: 300, y: 0 } },
            { id: 'db-primary', label: 'Primary', type: 'aurora-writer', position: { x: 400, y: 0 } },
          ],
          edges: [
            { id: 'e1', source: 'az-1', target: 'db-primary' },
          ],
        }),
      })

      const result = primaryAwarePathSelector.computePath(flow, context)

      // Path should truncate at the unavailable AZ
      expect(result).toEqual(['client', 'endpoint', 'region', 'az-1'])
      expect(result).not.toContain('db-primary')
    })

    it('falls back to static path when no primary exists', () => {
      const flow = createMockFlow({
        path: ['client', 'endpoint', 'region'],
      })
      const context = createMockContext({
        nodeStates: new Map([
          // No node has role: "primary"
          ['db-reader', createMockNodeState({
            id: 'db-reader',
            metadata: { role: 'standby' }
          })],
        ]),
      })

      const result = primaryAwarePathSelector.computePath(flow, context)

      // Falls back to static path
      expect(result).toEqual(['client', 'endpoint', 'region'])
    })

    it('handles dynamic role changes after promote event', () => {
      const flow = createMockFlow({
        path: ['client', 'endpoint', 'region'],
      })

      // Initially db-writer is primary
      const context1 = createMockContext({
        nodeStates: new Map([
          ['db-writer', createMockNodeState({
            id: 'db-writer',
            metadata: { role: 'primary' }
          })],
          ['db-reader', createMockNodeState({
            id: 'db-reader',
            metadata: { role: 'standby' }
          })],
        ]),
        graphTopology: createMockGraph({
          nodes: [
            { id: 'client', label: 'Client', type: 'client', position: { x: 0, y: 0 } },
            { id: 'endpoint', label: 'Endpoint', type: 'dns-endpoint', position: { x: 100, y: 0 } },
            { id: 'region', label: 'Region', type: 'region', position: { x: 200, y: 0 } },
            { id: 'az-1', label: 'AZ 1', type: 'az', position: { x: 300, y: 0 } },
            { id: 'az-2', label: 'AZ 2', type: 'az', position: { x: 300, y: 50 } },
            { id: 'db-writer', label: 'Writer', type: 'aurora-writer', position: { x: 400, y: 0 } },
            { id: 'db-reader', label: 'Reader', type: 'aurora-reader', position: { x: 400, y: 50 } },
          ],
          edges: [
            { id: 'e1', source: 'az-1', target: 'db-writer' },
            { id: 'e2', source: 'az-2', target: 'db-reader' },
          ],
        }),
      })

      const result1 = primaryAwarePathSelector.computePath(flow, context1)
      expect(result1).toContain('db-writer')
      expect(result1).toContain('az-1')

      // After promotion, db-reader becomes primary
      const context2 = createMockContext({
        nodeStates: new Map([
          ['db-writer', createMockNodeState({
            id: 'db-writer',
            metadata: { role: 'standby' }
          })],
          ['db-reader', createMockNodeState({
            id: 'db-reader',
            metadata: { role: 'primary' }
          })],
        ]),
        graphTopology: context1.graphTopology,
      })

      const result2 = primaryAwarePathSelector.computePath(flow, context2)
      expect(result2).toContain('db-reader')
      expect(result2).toContain('az-2')
    })
  })

  describe('geoAwarePathSelector', () => {
    it('delegates to healthiest path selector', () => {
      const flow = createMockFlow({
        path: ['client', 'region', 'az-1'],
      })
      const context = createMockContext()

      // geoAwarePathSelector currently delegates to healthiestPathSelector
      const geoResult = geoAwarePathSelector.computePath(flow, context)
      const healthiestResult = healthiestPathSelector.computePath(flow, context)

      expect(geoResult).toEqual(healthiestResult)
    })
  })

  describe('algorithmRegistry integration', () => {
    it('returns static path selector by id', () => {
      const selector = algorithmRegistry.getPathSelector('static')
      expect(selector).toBeDefined()
      expect(selector?.id).toBe('static')
    })

    it('returns healthiest path selector by id', () => {
      const selector = algorithmRegistry.getPathSelector('healthiest')
      expect(selector).toBeDefined()
      expect(selector?.id).toBe('healthiest')
    })

    it('returns primary-aware path selector by id', () => {
      const selector = algorithmRegistry.getPathSelector('primary-aware')
      expect(selector).toBeDefined()
      expect(selector?.id).toBe('primary-aware')
    })

    it('returns geo-aware path selector by id', () => {
      const selector = algorithmRegistry.getPathSelector('geo-aware')
      expect(selector).toBeDefined()
      expect(selector?.id).toBe('geo-aware')
    })
  })
})
