import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import DataDrivenGraph from '@/components/aws/DataDrivenGraph'
import NodeTypeFilter from '@/components/aws/NodeTypeFilter'
import Navigation from '@/components/Navigation'
import { useScenarioPlayer } from '@/hooks/useScenarioPlayer'
import ScenarioSelector from '@/components/scenarios/ScenarioSelector'
import ScenarioPlayer from '@/components/scenarios/ScenarioPlayer'
import type { Scenario } from '@/types/scenario'
import type { GraphDefinition } from '@/types/graph-type'
import { getAvailableNodeTypes } from '@/utils/graphFilters'

// Import graph definitions
import awsGlobalInfrastructure from '@/data/graphs/aws-global-infrastructure.json'
import ec2ScenarioPlayground from '@/data/graphs/ec2-scenario-playground.json'

export default function AWSVisualizerPage() {
  // URL state for graph and scenario selection
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedGraphId = searchParams.get('graph')
  const selectedScenarioId = searchParams.get('scenario')

  // URL update helpers
  const setSelectedGraphId = useCallback((graphId: string | null) => {
    setSearchParams(prev => {
      if (graphId) {
        prev.set('graph', graphId)
      } else {
        prev.delete('graph')
      }
      // Clear scenario when graph changes (different graphs have different scenarios)
      prev.delete('scenario')
      return prev
    }, { replace: true })
  }, [setSearchParams])

  const setSelectedScenarioId = useCallback((scenarioId: string | null) => {
    setSearchParams(prev => {
      if (scenarioId) {
        prev.set('scenario', scenarioId)
      } else {
        prev.delete('scenario')
      }
      return prev
    }, { replace: true })
  }, [setSearchParams])

  // Graph state
  const [graphs, setGraphs] = useState<GraphDefinition[]>([])

  // Derive selected graph with validation
  const selectedGraph = useMemo(() => {
    if (!selectedGraphId) return null
    return graphs.find(g => g.id === selectedGraphId) || null
  }, [graphs, selectedGraphId])

  // Node type filtering state
  const [visibleNodeTypes, setVisibleNodeTypes] = useState<Set<string>>(new Set())

  // Get available node types for the selected graph
  const availableNodeTypes = useMemo(() => {
    if (!selectedGraph) return new Set<string>()
    return getAvailableNodeTypes(selectedGraph)
  }, [selectedGraph])

  // Scenario state
  const [allScenarios, setAllScenarios] = useState<Scenario[]>([])

  // Filter scenarios by selected graph
  const availableScenarios = selectedGraphId
    ? allScenarios.filter(s => s.graphId === selectedGraphId)
    : []

  // Derive selected scenario with validation
  const selectedScenario = useMemo(() => {
    if (!selectedScenarioId || !selectedGraphId) return null
    return availableScenarios.find(s => s.id === selectedScenarioId) || null
  }, [availableScenarios, selectedScenarioId, selectedGraphId])

  // Scenario player hook
  const {
    isPlaying,
    isPaused,
    currentTimeMs,
    nodeStates,
    animatingEdges,
    play,
    pause,
    reset,
    seek,
    toggleNodeState
  } = useScenarioPlayer(selectedScenario)

  // Load graphs on mount
  useEffect(() => {
    const loadedGraphs: GraphDefinition[] = [
      awsGlobalInfrastructure as GraphDefinition,
      ec2ScenarioPlayground as GraphDefinition
    ]
    setGraphs(loadedGraphs)

    // Only set default if no graph param in URL
    if (!searchParams.get('graph') && loadedGraphs.length > 0) {
      setSearchParams(prev => {
        prev.set('graph', loadedGraphs[0].id)
        return prev
      }, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // Load scenarios on mount
  useEffect(() => {
    import('@/data/scenarios/sample-playbooks.json').then(data => {
      setAllScenarios(data.scenarios)
    })
  }, [])

  // Initialize node type filter when graph changes
  useEffect(() => {
    if (selectedGraph) {
      setVisibleNodeTypes(getAvailableNodeTypes(selectedGraph))
    }
  }, [selectedGraph])

  // Toggle node type visibility
  const toggleNodeType = (type: string) => {
    setVisibleNodeTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  return (
    <div className="min-h-screen bg-[#fafafa] text-[#1a1a1a] font-mono">
      <header className="p-4 border-b border-[#e5e5e5] flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-[#666] hover:text-[#333]">←</Link>
          <Navigation />
        </div>

        <div className="flex items-center gap-4">
          {/* Graph selector */}
          {graphs.length > 0 && (
            <select
              value={selectedGraphId || ''}
              onChange={(e) => setSelectedGraphId(e.target.value)}
              className="font-mono text-xs border border-[#e5e5e5] rounded px-3 py-1.5 bg-white cursor-pointer hover:border-[#999]"
            >
              {graphs.map(graph => (
                <option key={graph.id} value={graph.id}>
                  {graph.name}
                </option>
              ))}
            </select>
          )}

          {/* Node type filter */}
          {selectedGraph && availableNodeTypes.size > 0 && (
            <>
              <div className="w-px h-6 bg-[#e5e5e5]" />
              <NodeTypeFilter
                availableTypes={availableNodeTypes}
                visibleTypes={visibleNodeTypes}
                onToggle={toggleNodeType}
              />
            </>
          )}

          {/* Scenario selector - only show if graph has scenarios */}
          {availableScenarios.length > 0 && (
            <>
              <div className="w-px h-6 bg-[#e5e5e5]" />
              <ScenarioSelector
                scenarios={availableScenarios}
                selectedId={selectedScenarioId}
                onSelect={setSelectedScenarioId}
              />
            </>
          )}
        </div>
      </header>

      <main className="relative h-[calc(100vh-57px)]">
        {selectedGraph ? (
          <DataDrivenGraph
            graphDefinition={selectedGraph}
            nodeStates={nodeStates}
            animatingEdges={animatingEdges}
            onNodeStateToggle={toggleNodeState}
            visibleNodeTypes={visibleNodeTypes}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-[#999] text-sm">
            Loading graphs...
          </div>
        )}

        {/* Graph description overlay - only show when no scenario selected */}
        {selectedGraph && !selectedScenario && (
          <div className="absolute bottom-4 left-4 bg-white border border-[#e5e5e5] rounded p-3 max-w-md font-mono text-xs shadow-lg">
            <div className="font-semibold mb-1">{selectedGraph.name}</div>
            <div className="text-[#666]">{selectedGraph.description}</div>
            {availableScenarios.length > 0 && (
              <div className="text-[#888] text-[10px] mt-2">
                {availableScenarios.length} scenario{availableScenarios.length !== 1 ? 's' : ''} available
              </div>
            )}
          </div>
        )}

        {/* Scenario player at bottom-center */}
        {selectedScenario && (
          <ScenarioPlayer
            scenario={selectedScenario}
            isPlaying={isPlaying}
            isPaused={isPaused}
            currentTimeMs={currentTimeMs}
            onPlay={play}
            onPause={pause}
            onReset={reset}
            onSeek={seek}
          />
        )}
      </main>
    </div>
  )
}
