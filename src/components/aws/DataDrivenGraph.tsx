import { useEffect, useCallback, useRef } from "react";
import {
  ReactFlow,
  type Node,
  type Edge,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "@/styles/scenario-animations.css";
import type { NodeState } from "@/types/graph";
import type { GraphDefinition } from "@/types/graph-type";
import { filterGraphByNodeTypes } from "@/utils/graphFilters";

interface DataDrivenGraphProps {
  graphDefinition: GraphDefinition
  nodeStates?: Map<string, NodeState>
  onNodeStateToggle?: (nodeId: string, newState: string) => void
  animatingEdges?: Set<string>
  visibleNodeTypes?: Set<string>
}

export default function DataDrivenGraph({
  graphDefinition,
  nodeStates,
  onNodeStateToggle,
  animatingEdges,
  visibleNodeTypes
}: DataDrivenGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Keep refs to the original graph nodes for label lookup
  const graphNodesRef = useRef<GraphDefinition['nodes']>([]);

  // Apply filtering and convert to React Flow format on graph/filter change
  useEffect(() => {
    let filteredGraph = graphDefinition;
    if (visibleNodeTypes && visibleNodeTypes.size > 0) {
      filteredGraph = filterGraphByNodeTypes(graphDefinition, visibleNodeTypes)
    }

    // Store for label lookup
    graphNodesRef.current = filteredGraph.nodes;

    const flowNodes: Node[] = filteredGraph.nodes.map(node => ({
      id: node.id,
      data: {
        label: node.label,
        type: node.type,
        isInteractive: node.isInteractive || false,
        ...node.metadata
      },
      position: node.position,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      style: node.style || {}
    }))

    const flowEdges: Edge[] = filteredGraph.edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.type || 'smoothstep',
      style: edge.style || {}
    }))

    setNodes(flowNodes)
    setEdges(flowEdges)
  }, [graphDefinition, visibleNodeTypes, setNodes, setEdges])

  // Apply node states (failures, availability changes)
  useEffect(() => {
    setNodes(nds => nds.map(node => {
      const state = nodeStates?.get(node.id)

      // Determine if node is in active request path
      const isInActivePath = animatingEdges && Array.from(animatingEdges).some(edgeId =>
        edgeId.includes(node.id)
      )

      const isUnavailable = state?.status === 'unavailable'
      const isDegraded = state?.status === 'degraded'

      // Build className from state
      const classNames = [
        isUnavailable ? 'node-unavailable' : '',
        isDegraded ? 'node-degraded' : '',
        isInActivePath && !isUnavailable ? 'node-active-path' : ''
      ].filter(Boolean).join(' ')

      // Get original label from graph definition
      const originalNode = graphNodesRef.current.find(n => n.id === node.id)
      const originalLabel = originalNode?.label || ''

      // Compose label with sublabel if present
      const label = state?.sublabel
        ? `${originalLabel}\n${state.sublabel}`
        : originalLabel

      return {
        ...node,
        data: {
          ...node.data,
          label,
          state: state?.status,
        },
        className: classNames,
      }
    }))
  }, [nodeStates, animatingEdges, setNodes])

  // Apply edge animations
  useEffect(() => {
    setEdges(eds => eds.map(edge => {
      const isActive = animatingEdges && (
        animatingEdges.has(edge.id) ||
        animatingEdges.has(`${edge.source}-${edge.target}`) ||
        animatingEdges.has(`${edge.target}-${edge.source}`)
      )

      return {
        ...edge,
        animated: isActive,
        className: isActive ? 'edge-active-flow' : '',
        style: {
          ...edge.style,
          stroke: isActive ? '#0066cc' : '#e5e5e5',
          strokeWidth: isActive ? 3 : 1,
        }
      }
    }))
  }, [animatingEdges, setEdges])

  // Handle node click for interactive nodes
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (node.data.isInteractive && onNodeStateToggle) {
      const currentState = nodeStates?.get(node.id)?.status || 'available'
      const newState = currentState === 'available' ? 'unavailable' : 'available'
      onNodeStateToggle(node.id, newState)
    }
  }, [onNodeStateToggle, nodeStates])

  return (
    <div className="w-full h-full bg-[#fafafa]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        fitView
        minZoom={0.3}
        maxZoom={1.2}
        defaultEdgeOptions={{
          animated: false,
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#e5e5e5" gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
