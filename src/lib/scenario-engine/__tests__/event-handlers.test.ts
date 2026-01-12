import { describe, it, expect } from 'vitest'
import {
  failEventHandler,
  recoverEventHandler,
  degradeEventHandler,
  routeRequestHandler,
  processEvent
} from '../event-handlers'
import {
  createMockContext,
  createMockEvent,
  createMockScenario,
  createMockFlow
} from './test-utils'

describe('failEventHandler', () => {
  it('marks node as unavailable', () => {
    const event = createMockEvent({
      id: 'az1-fails',
      action: 'fail',
      targetType: 'az',
      targetId: 'az-us-east-1-use1-az1'
    })
    const context = createMockContext()

    const result = failEventHandler.handle(event, context)

    expect(result.nodeStateChanges.get('az-us-east-1-use1-az1')).toMatchObject({
      status: 'unavailable',
      isAnimating: true,
      animationType: 'failure'
    })
  })

  it('uses custom failureMessage when provided', () => {
    const event = createMockEvent({
      action: 'fail',
      targetId: 'az-1',
      failureMessage: 'Custom failure message'
    })
    const context = createMockContext()

    const result = failEventHandler.handle(event, context)

    expect(result.nodeStateChanges.get('az-1')?.sublabel).toBe('Custom failure message')
  })

  it('uses default message based on target type', () => {
    const event = createMockEvent({
      action: 'fail',
      targetType: 'az',
      targetId: 'az-1'
    })
    const context = createMockContext()

    const result = failEventHandler.handle(event, context)

    expect(result.nodeStateChanges.get('az-1')?.sublabel).toBe('AZ Unavailable')
  })
})

describe('recoverEventHandler', () => {
  it('marks node as available', () => {
    const event = createMockEvent({
      action: 'recover',
      targetId: 'az-1'
    })
    const context = createMockContext()

    const result = recoverEventHandler.handle(event, context)

    expect(result.nodeStateChanges.get('az-1')).toMatchObject({
      status: 'available',
      isAnimating: false
    })
  })

  it('clears sublabel on recovery', () => {
    const event = createMockEvent({
      action: 'recover',
      targetId: 'az-1'
    })
    const context = createMockContext()

    const result = recoverEventHandler.handle(event, context)

    expect(result.nodeStateChanges.get('az-1')?.sublabel).toBeUndefined()
  })
})

describe('degradeEventHandler', () => {
  it('marks node as degraded', () => {
    const event = createMockEvent({
      action: 'degrade',
      targetId: 'az-1'
    })
    const context = createMockContext()

    const result = degradeEventHandler.handle(event, context)

    expect(result.nodeStateChanges.get('az-1')).toMatchObject({
      status: 'degraded',
      sublabel: 'Degraded',
      isAnimating: true,
      animationType: 'pulse'
    })
  })
})

describe('routeRequestHandler', () => {
  it('highlights edges along the flow path', () => {
    const flow = createMockFlow({
      id: 'test-flow',
      path: ['edge-sfo', 'region-us-east-1', 'az-us-east-1-use1-az1']
    })
    const event = createMockEvent({
      action: 'route-request',
      targetId: 'web-service',
      flowId: 'test-flow'
    })
    const context = createMockContext({
      scenario: createMockScenario({
        requestFlows: [flow]
      })
    })

    const result = routeRequestHandler.handle(event, context)

    expect(result.edgeHighlights.has('edge-sfo-region-us-east-1')).toBe(true)
    expect(result.edgeHighlights.has('region-us-east-1-az-us-east-1-use1-az1')).toBe(true)
    expect(result.activeFlowId).toBe('test-flow')
  })

  it('returns empty result when flow not found', () => {
    const event = createMockEvent({
      action: 'route-request',
      targetId: 'nonexistent-service'
    })
    const context = createMockContext()

    const result = routeRequestHandler.handle(event, context)

    expect(result.edgeHighlights.size).toBe(0)
    expect(result.activeFlowId).toBeNull()
  })
})

describe('processEvent', () => {
  it('dispatches to correct handler based on action', () => {
    const failEvent = createMockEvent({ action: 'fail', targetId: 'node-1' })
    const recoverEvent = createMockEvent({ action: 'recover', targetId: 'node-1' })
    const context = createMockContext()

    const failResult = processEvent(failEvent, context)
    expect(failResult.nodeStateChanges.get('node-1')?.status).toBe('unavailable')

    const recoverResult = processEvent(recoverEvent, context)
    expect(recoverResult.nodeStateChanges.get('node-1')?.status).toBe('available')
  })

  it('returns empty result for unknown action', () => {
    const event = createMockEvent({ action: 'unknown-action' as any })
    const context = createMockContext()

    const result = processEvent(event, context)

    expect(result.nodeStateChanges.size).toBe(0)
    expect(result.edgeHighlights.size).toBe(0)
  })
})
