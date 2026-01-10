import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import DataDrivenGraph from '@/components/aws/DataDrivenGraph'
import NodeTypeFilter from '@/components/aws/NodeTypeFilter'
import Navigation from '@/components/Navigation'
import { useScenarioPlayer } from '@/hooks/useScenarioPlayer'
import ScenarioSelector from '@/components/scenarios/ScenarioSelector'
import ScenarioPlayerControls from '@/components/scenarios/ScenarioPlayerControls'
import ScenarioInfo from '@/components/scenarios/ScenarioInfo'
import type { Scenario } from '@/types/scenario'
import type { GraphDefinition } from '@/types/graph-type'
import { getAvailableNodeTypes } from '@/utils/graphFilters'

// Import graph definitions
import awsGlobalInfrastructure from '@/data/graphs/aws-global-infrastructure.json'
import ec2ScenarioPlayground from '@/data/graphs/ec2-scenario-playground.json'

export default function AWSVisualizerPage() {
  // Graph state
  const [graphs, setGraphs] = useState<GraphDefinition[]>([])
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null)
  const selectedGraph = graphs.find(g => g.id === selectedGraphId) || null

  // Node type filtering state
  const [visibleNodeTypes, setVisibleNodeTypes] = useState<Set<string>>(new Set())

  // Get available node types for the selected graph
  const availableNodeTypes = useMemo(() => {
    if (!selectedGraph) return new Set<string>()
    return getAvailableNodeTypes(selectedGraph)
  }, [selectedGraph])

  // Scenario state
  const [allScenarios, setAllScenarios] = useState<Scenario[]>([])
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null)

  // Filter scenarios by selected graph
  const availableScenarios = selectedGraphId
    ? allScenarios.filter(s => s.graphId === selectedGraphId)
    : []

  const selectedScenario = availableScenarios.find(s => s.id === selectedScenarioId) || null

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
    toggleNodeState
  } = useScenarioPlayer(selectedScenario)

  // Load graphs on mount
  useEffect(() => {
    const loadedGraphs: GraphDefinition[] = [
      awsGlobalInfrastructure as GraphDefinition,
      ec2ScenarioPlayground as GraphDefinition
    ]
    setGraphs(loadedGraphs)
    // Auto-select first graph
    if (loadedGraphs.length > 0) {
      setSelectedGraphId(loadedGraphs[0].id)
    }
  }, [])

  // Load scenarios on mount
  useEffect(() => {
    import('@/data/scenarios/sample-playbooks.json').then(data => {
      setAllScenarios(data.scenarios)
    })
  }, [])

  // Reset scenario selection and initialize node type filter when graph changes
  useEffect(() => {
    setSelectedScenarioId(null)
    // Initialize all node types as visible for new graph
    if (selectedGraph) {
      setVisibleNodeTypes(getAvailableNodeTypes(selectedGraph))
    }
  }, [selectedGraphId, selectedGraph])

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

          {/* Scenario controls - only show if graph has scenarios */}
          {availableScenarios.length > 0 && (
            <>
              <div className="w-px h-6 bg-[#e5e5e5]" />
              <ScenarioSelector
                scenarios={availableScenarios}
                selectedId={selectedScenarioId}
                onSelect={setSelectedScenarioId}
              />
              {selectedScenario && (
                <ScenarioPlayerControls
                  isPlaying={isPlaying}
                  isPaused={isPaused}
                  currentTimeMs={currentTimeMs}
                  durationMs={selectedScenario.durationMs}
                  onPlay={play}
                  onPause={pause}
                  onReset={reset}
                />
              )}
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

        {/* Graph description overlay */}
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

        {/* Scenario info overlay */}
        {selectedScenario && <ScenarioInfo scenario={selectedScenario} />}
      </main>
    </div>
  )
}
