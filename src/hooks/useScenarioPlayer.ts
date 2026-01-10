import { useState, useEffect, useCallback, useRef } from 'react'
import type { Scenario } from '@/types/scenario'
import type { NodeState } from '@/types/graph'

interface ScenarioPlayerState {
  isPlaying: boolean
  isPaused: boolean
  currentTimeMs: number
  currentStepIndex: number
  nodeStates: Map<string, NodeState>
  animatingEdges: Set<string>
}

export function useScenarioPlayer(scenario: Scenario | null) {
  const [state, setState] = useState<ScenarioPlayerState>({
    isPlaying: false,
    isPaused: false,
    currentTimeMs: 0,
    currentStepIndex: 0,
    nodeStates: new Map(),
    animatingEdges: new Set()
  })

  const animationFrameRef = useRef<number>()
  const lastTimestampRef = useRef<number>(0)

  // Play/Pause/Reset functions
  const play = useCallback(() => {
    setState(s => ({ ...s, isPlaying: true, isPaused: false }))
    lastTimestampRef.current = performance.now()
  }, [])

  const pause = useCallback(() => {
    setState(s => ({ ...s, isPlaying: false, isPaused: true }))
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
  }, [])

  const reset = useCallback(() => {
    setState({
      isPlaying: false,
      isPaused: false,
      currentTimeMs: 0,
      currentStepIndex: 0,
      nodeStates: new Map(),
      animatingEdges: new Set()
    })
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
  }, [])

  // Animation loop
  useEffect(() => {
    if (!scenario || !state.isPlaying) return

    const animate = (timestamp: number) => {
      const deltaMs = timestamp - lastTimestampRef.current
      lastTimestampRef.current = timestamp

      setState(s => {
        const newTimeMs = s.currentTimeMs + deltaMs

        // Check if scenario completed
        if (newTimeMs >= scenario.durationMs) {
          return { ...s, isPlaying: false, currentTimeMs: scenario.durationMs }
        }

        // Process events at current timestamp
        const eventsToProcess = scenario.events.filter(
          e => e.timestampMs <= newTimeMs && e.timestampMs > s.currentTimeMs
        )

        const newNodeStates = new Map(s.nodeStates)
        const newAnimatingEdges = new Set(s.animatingEdges)

        eventsToProcess.forEach(event => {
          switch (event.action) {
            case 'fail':
              newNodeStates.set(event.targetId, {
                id: event.targetId,
                status: 'unavailable',
                isAnimating: true,
                animationType: 'failure',
                lastStateChange: newTimeMs
              })
              break
            case 'recover':
              newNodeStates.set(event.targetId, {
                id: event.targetId,
                status: 'available',
                isAnimating: true,
                animationType: 'pulse',
                lastStateChange: newTimeMs
              })
              // Remove from nodeStates after recovery
              setTimeout(() => {
                setState(s => {
                  const updated = new Map(s.nodeStates)
                  updated.delete(event.targetId)
                  return { ...s, nodeStates: updated }
                })
              }, 1000)
              break
            case 'route-request': {
              // Find path and animate edges
              const flow = scenario.requestFlows.find(f => f.targetServiceId === event.targetId)
              if (flow) {
                // Add edges to animation set
                flow.path.forEach((nodeId, idx) => {
                  if (idx < flow.path.length - 1) {
                    const edgeId = `${nodeId}-${flow.path[idx + 1]}`
                    // Try both directions for edge matching
                    newAnimatingEdges.add(edgeId)
                    newAnimatingEdges.add(`${flow.path[idx + 1]}-${nodeId}`)
                  }
                })
                // Clear animation after flow duration
                setTimeout(() => {
                  setState(s => {
                    const updatedEdges = new Set(s.animatingEdges)
                    flow.path.forEach((nodeId, idx) => {
                      if (idx < flow.path.length - 1) {
                        updatedEdges.delete(`${nodeId}-${flow.path[idx + 1]}`)
                        updatedEdges.delete(`${flow.path[idx + 1]}-${nodeId}`)
                      }
                    })
                    return { ...s, animatingEdges: updatedEdges }
                  })
                }, flow.latencyMs)
              }
              break
            }
          }
        })

        return {
          ...s,
          currentTimeMs: newTimeMs,
          currentStepIndex: scenario.events.findIndex(e => e.timestampMs > newTimeMs),
          nodeStates: newNodeStates,
          animatingEdges: newAnimatingEdges
        }
      })

      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [scenario, state.isPlaying])

  // Manual node state override
  const toggleNodeState = useCallback((nodeId: string, newState: 'available' | 'unavailable') => {
    setState(s => {
      const newNodeStates = new Map(s.nodeStates)
      newNodeStates.set(nodeId, {
        id: nodeId,
        status: newState,
        isAnimating: false,
        manualOverride: true,
        lastStateChange: s.currentTimeMs
      })
      return { ...s, nodeStates: newNodeStates }
    })
  }, [])

  return {
    ...state,
    play,
    pause,
    reset,
    toggleNodeState
  }
}
