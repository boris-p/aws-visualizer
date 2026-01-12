import { useState, useEffect, useCallback, useRef } from 'react'
import type { Scenario } from '@/types/scenario'
import type { NodeState } from '@/types/graph'
import type { GraphDefinition } from '@/types/graph-type'
import { ScenarioRunner } from '@/lib/scenario-engine'

interface ScenarioPlayerState {
  isPlaying: boolean
  isPaused: boolean
  currentTimeMs: number
  currentStepIndex: number
  nodeStates: Map<string, NodeState>
  animatingEdges: Set<string>
  activeFlowId: string | null
}

export function useScenarioPlayer(scenario: Scenario | null, graphTopology?: GraphDefinition) {
  const [state, setState] = useState<ScenarioPlayerState>({
    isPlaying: false,
    isPaused: false,
    currentTimeMs: 0,
    currentStepIndex: 0,
    nodeStates: new Map(),
    animatingEdges: new Set(),
    activeFlowId: null
  })

  const animationFrameRef = useRef<number>()
  const lastTimestampRef = useRef<number>(0)
  const currentTimeMsRef = useRef<number>(0) // Track time in ref for animation loop

  // Create scenario runner instance
  const runnerRef = useRef<ScenarioRunner | null>(null)

  // Create or update runner when scenario changes - also reset UI state
  useEffect(() => {
    if (scenario) {
      runnerRef.current = new ScenarioRunner(scenario, graphTopology)
      currentTimeMsRef.current = 0

      // Reset UI state when scenario changes
      setState({
        isPlaying: false,
        isPaused: false,
        currentTimeMs: 0,
        currentStepIndex: 0,
        nodeStates: new Map(),
        animatingEdges: new Set(),
        activeFlowId: null
      })
    } else {
      runnerRef.current = null
    }
  }, [scenario, graphTopology])

  // Play function
  const play = useCallback(() => {
    setState(s => ({ ...s, isPlaying: true, isPaused: false }))
    lastTimestampRef.current = performance.now()
  }, [])

  // Pause function
  const pause = useCallback(() => {
    setState(s => ({ ...s, isPlaying: false, isPaused: true }))
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
  }, [])

  // Reset function
  const reset = useCallback(() => {
    const runner = runnerRef.current
    if (runner) {
      runner.reset()
    }

    currentTimeMsRef.current = 0

    setState({
      isPlaying: false,
      isPaused: false,
      currentTimeMs: 0,
      currentStepIndex: 0,
      nodeStates: new Map(),
      animatingEdges: new Set(),
      activeFlowId: null
    })

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
  }, [])

  // Animation loop - uses runner.advanceTo for incremental updates
  useEffect(() => {
    const runner = runnerRef.current
    if (!runner || !scenario || !state.isPlaying) return

    const animate = (timestamp: number) => {
      const deltaMs = timestamp - lastTimestampRef.current
      lastTimestampRef.current = timestamp

      // Use ref for current time to avoid stale closure
      const newTimeMs = currentTimeMsRef.current + deltaMs
      currentTimeMsRef.current = newTimeMs

      // Check if scenario completed
      if (newTimeMs >= scenario.durationMs) {
        runner.seekTo(scenario.durationMs)
        const snapshot = runner.getSnapshot()
        setState(s => ({
          ...s,
          isPlaying: false,
          currentTimeMs: scenario.durationMs,
          nodeStates: snapshot.nodeStates,
          animatingEdges: snapshot.animatingEdges,
          activeFlowId: snapshot.activeFlowId,
          currentStepIndex: snapshot.processedEventIds.size
        }))
        return
      }

      // Advance runner and sync state
      runner.advanceTo(newTimeMs)
      const snapshot = runner.getSnapshot()

      setState(s => ({
        ...s,
        currentTimeMs: newTimeMs,
        nodeStates: snapshot.nodeStates,
        animatingEdges: snapshot.animatingEdges,
        activeFlowId: snapshot.activeFlowId,
        currentStepIndex: snapshot.processedEventIds.size
      }))

      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [scenario, state.isPlaying]) // Removed state.currentTimeMs from deps

  // Seek to specific time - uses runner.seekTo for full state rebuild
  const seek = useCallback((timeMs: number) => {
    const runner = runnerRef.current
    if (!runner || !scenario) return

    const clampedTime = Math.max(0, Math.min(timeMs, scenario.durationMs))

    // Update ref for animation loop
    currentTimeMsRef.current = clampedTime

    // Runner handles full state rebuild on seek
    runner.seekTo(clampedTime)
    const snapshot = runner.getSnapshot()

    setState(s => ({
      ...s,
      currentTimeMs: clampedTime,
      nodeStates: snapshot.nodeStates,
      animatingEdges: snapshot.animatingEdges,
      activeFlowId: snapshot.activeFlowId,
      currentStepIndex: snapshot.processedEventIds.size
    }))

    lastTimestampRef.current = performance.now()
  }, [scenario])

  // Manual node state override (for testing/debugging)
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
    seek,
    toggleNodeState
  }
}
