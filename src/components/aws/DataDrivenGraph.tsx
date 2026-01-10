import { useEffect, useCallback, useMemo } from "react";
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

  // Apply filtering based on visible node types
  const filteredGraph = useMemo(() => {
    if (!visibleNodeTypes || visibleNodeTypes.size === 0) {
      return graphDefinition
    }
    return filterGraphByNodeTypes(graphDefinition, visibleNodeTypes)
  }, [graphDefinition, visibleNodeTypes])

  // Convert graph definition to React Flow nodes
  useEffect(() => {
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
  }, [filteredGraph, setNodes, setEdges])

  // Apply node states (failures, availability changes)
  useEffect(() => {
    if (!nodeStates || nodeStates.size === 0) return

    setNodes(nds => nds.map(node => {
      const state = nodeStates.get(node.id)
      if (!state) return node

      const isUnavailable = state.status === 'unavailable'
      const isDegraded = state.status === 'degraded'

      return {
        ...node,
        data: {
          ...node.data,
          state: state.status,
        },
        className: `${node.className || ''} ${isUnavailable ? 'node-unavailable' : ''} ${isDegraded ? 'node-degraded' : ''}`.trim(),
        style: {
          ...node.style,
          opacity: isUnavailable ? 0.5 : node.style?.opacity || 1,
          filter: isUnavailable ? 'grayscale(100%)' : node.style?.filter || 'none',
        }
      }
    }))
  }, [nodeStates, setNodes])

  // Apply edge animations
  useEffect(() => {
    if (!animatingEdges || animatingEdges.size === 0) return

    setEdges(eds => eds.map(edge => {
      const isAnimating = animatingEdges.has(edge.id) ||
                         animatingEdges.has(`${edge.source}-${edge.target}`) ||
                         animatingEdges.has(`${edge.target}-${edge.source}`)

      if (isAnimating) {
        return {
          ...edge,
          animated: true,
          className: 'animating',
          style: {
            ...edge.style,
            stroke: '#ff6600',
            strokeWidth: 3,
          }
        }
      }

      return {
        ...edge,
        animated: false,
        className: '',
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
