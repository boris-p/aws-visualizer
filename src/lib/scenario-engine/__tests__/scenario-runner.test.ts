import { describe, it, expect, beforeEach } from 'vitest'
import { ScenarioRunner } from '../scenario-runner'
import {
  createMockScenario,
  createMockEvent,
  createMockFlow,
  createMockGraph
} from './test-utils'

describe('ScenarioRunner', () => {
  describe('seekTo', () => {
    it('processes all events up to the given time', () => {
      const scenario = createMockScenario({
        events: [
          createMockEvent({ id: 'e1', timestampMs: 1000, action: 'fail', targetId: 'az-1' }),
          createMockEvent({ id: 'e2', timestampMs: 2000, action: 'fail', targetId: 'az-2' }),
          createMockEvent({ id: 'e3', timestampMs: 3000, action: 'fail', targetId: 'az-3' })
        ]
      })

      const runner = new ScenarioRunner(scenario)

      // Seek to 2500ms - should process e1 and e2, not e3
      const snapshot = runner.seekTo(2500)

      expect(snapshot.nodeStates.get('az-1')?.status).toBe('unavailable')
      expect(snapshot.nodeStates.get('az-2')?.status).toBe('unavailable')
      expect(snapshot.nodeStates.get('az-3')).toBeUndefined()
    })

    it('handles failure and recovery correctly', () => {
      const scenario = createMockScenario({
        events: [
          createMockEvent({ id: 'e1', timestampMs: 1000, action: 'fail', targetId: 'az-1' }),
          createMockEvent({ id: 'e2', timestampMs: 2000, action: 'recover', targetId: 'az-1' })
        ]
      })

      const runner = new ScenarioRunner(scenario)

      // Before recovery
      let snapshot = runner.seekTo(1500)
      expect(snapshot.nodeStates.get('az-1')?.status).toBe('unavailable')

      // After recovery
      snapshot = runner.seekTo(2500)
      expect(snapshot.nodeStates.get('az-1')?.status).toBe('available')
    })

    it('handles route-request and highlights edges', () => {
      const flow = createMockFlow({
        id: 'req-normal',
        path: ['edge-sfo', 'region-us-east-1', 'az-us-east-1-use1-az1']
      })
      const scenario = createMockScenario({
        events: [
          createMockEvent({
            id: 'e1',
            timestampMs: 1000,
            action: 'route-request',
            targetId: 'web-service',
            flowId: 'req-normal'
          })
        ],
        requestFlows: [flow]
      })

      const runner = new ScenarioRunner(scenario)
      const snapshot = runner.seekTo(2000)

      expect(snapshot.activeFlowId).toBe('req-normal')
      expect(snapshot.animatingEdges.has('edge-sfo-region-us-east-1')).toBe(true)
      expect(snapshot.animatingEdges.has('region-us-east-1-az-us-east-1-use1-az1')).toBe(true)
    })

    it('resets state when seeking backwards', () => {
      const scenario = createMockScenario({
        events: [
          createMockEvent({ id: 'e1', timestampMs: 1000, action: 'fail', targetId: 'az-1' }),
          createMockEvent({ id: 'e2', timestampMs: 3000, action: 'fail', targetId: 'az-2' })
        ]
      })

      const runner = new ScenarioRunner(scenario)

      // Seek forward
      runner.seekTo(4000)
      expect(runner.getNodeState('az-1')?.status).toBe('unavailable')
      expect(runner.getNodeState('az-2')?.status).toBe('unavailable')

      // Seek backwards - should rebuild state
      runner.seekTo(2000)
      expect(runner.getNodeState('az-1')?.status).toBe('unavailable')
      expect(runner.getNodeState('az-2')).toBeUndefined()
    })
  })

  describe('advanceTo', () => {
    it('processes only new events since last time', () => {
      const scenario = createMockScenario({
        events: [
          createMockEvent({ id: 'e1', timestampMs: 1000, action: 'fail', targetId: 'az-1' }),
          createMockEvent({ id: 'e2', timestampMs: 2000, action: 'fail', targetId: 'az-2' })
        ]
      })

      const runner = new ScenarioRunner(scenario)

      // Initial seek to 1500
      runner.seekTo(1500)
      expect(runner.getNodeState('az-1')?.status).toBe('unavailable')
      expect(runner.getNodeState('az-2')).toBeUndefined()

      // Advance to 2500 - should only process e2
      runner.advanceTo(2500)
      expect(runner.getNodeState('az-1')?.status).toBe('unavailable')
      expect(runner.getNodeState('az-2')?.status).toBe('unavailable')
    })
  })

  describe('reset', () => {
    it('clears all state', () => {
      const scenario = createMockScenario({
        events: [
          createMockEvent({ id: 'e1', timestampMs: 1000, action: 'fail', targetId: 'az-1' })
        ]
      })

      const runner = new ScenarioRunner(scenario)
      runner.seekTo(2000)
      expect(runner.getNodeState('az-1')?.status).toBe('unavailable')

      runner.reset()

      expect(runner.getNodeState('az-1')).toBeUndefined()
      expect(runner.getCurrentTime()).toBe(0)
      expect(runner.getActiveFlowId()).toBeNull()
    })
  })

  describe('sublabels', () => {
    it('sets sublabel on fail event', () => {
      const scenario = createMockScenario({
        events: [
          createMockEvent({
            id: 'e1',
            timestampMs: 1000,
            action: 'fail',
            targetType: 'az',
            targetId: 'az-1',
            failureMessage: 'AZ Unavailable'
          })
        ]
      })

      const runner = new ScenarioRunner(scenario)
      runner.seekTo(2000)

      expect(runner.getNodeState('az-1')?.sublabel).toBe('AZ Unavailable')
    })

    it('clears sublabel on recover event', () => {
      const scenario = createMockScenario({
        events: [
          createMockEvent({
            id: 'e1',
            timestampMs: 1000,
            action: 'fail',
            targetId: 'az-1',
            failureMessage: 'AZ Unavailable'
          }),
          createMockEvent({
            id: 'e2',
            timestampMs: 2000,
            action: 'recover',
            targetId: 'az-1'
          })
        ]
      })

      const runner = new ScenarioRunner(scenario)

      runner.seekTo(1500)
      expect(runner.getNodeState('az-1')?.sublabel).toBe('AZ Unavailable')

      runner.seekTo(2500)
      expect(runner.getNodeState('az-1')?.sublabel).toBeUndefined()
    })
  })
})
