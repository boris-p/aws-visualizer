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
import type { Token, WaitPointState } from "@/types/token";
import { filterGraphByNodeTypes } from "@/utils/graphFilters";
import TokenFlowEdge from "@/components/graph/TokenFlowEdge";
import TokenAwareNode from "@/components/graph/TokenAwareNode";

// Register custom edge types
const edgeTypes = {
  tokenFlow: TokenFlowEdge,
};

// Register custom node types
const nodeTypes = {
  tokenAware: TokenAwareNode,
} as const;

interface DataDrivenGraphProps {
  graphDefinition: GraphDefinition
  nodeStates?: Map<string, NodeState>
  onNodeStateToggle?: (nodeId: string, newState: 'available' | 'unavailable') => void
  animatingEdges?: Set<string>
  visibleNodeTypes?: Set<string>
  tokens?: Token[]
  currentTimeMs?: number
  waitPoints?: Map<string, WaitPointState>
}

export default function DataDrivenGraph({
  graphDefinition,
  nodeStates,
  onNodeStateToggle,
  animatingEdges,
  visibleNodeTypes,
  tokens = [],
  currentTimeMs = 0,
  waitPoints,
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
      type: 'tokenFlow', // Use custom edge type for token visualization
      style: edge.style || {},
      data: {
        tokens: [],
        currentTimeMs: 0,
        isActive: false,
      }
    }))

    setNodes(flowNodes)
    setEdges(flowEdges)
  }, [graphDefinition, visibleNodeTypes, setNodes, setEdges])

  // Apply node states (failures, availability changes) and waiting tokens
  useEffect(() => {
    setNodes(nds => nds.map(node => {
      const state = nodeStates?.get(node.id)

      // Determine if node is in active request path
      const isInActivePath = animatingEdges && Array.from(animatingEdges).some(edgeId =>
        edgeId.includes(node.id)
      )

      const isUnavailable = state?.status === 'unavailable'
      const isDegraded = state?.status === 'degraded'

      // Get waiting tokens for this node
      const waitingTokens = tokens.filter(
        t => t.status === 'waiting' && t.waitingAtNode === node.id
      ).sort((a, b) => (a.waitPosition || 0) - (b.waitPosition || 0))

      // Use tokenAware node type if this node has a wait point or waiting tokens
      const hasWaitPoint = waitPoints?.has(node.id)
      const useTokenAwareNode = hasWaitPoint || waitingTokens.length > 0

      // Build className from state (only for default nodes, tokenAware handles its own)
      const classNames = useTokenAwareNode ? '' : [
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
        type: useTokenAwareNode ? 'tokenAware' : undefined,
        data: {
          ...node.data,
          label,
          state: state?.status,
          waitingTokens,
          currentTimeMs,
        },
        className: classNames,
      }
    }))
  }, [nodeStates, animatingEdges, tokens, waitPoints, currentTimeMs, setNodes])

  // Apply edge animations and tokens
  useEffect(() => {
    setEdges(eds => eds.map(edge => {
      const isActive = animatingEdges && (
        animatingEdges.has(edge.id) ||
        animatingEdges.has(`${edge.source}-${edge.target}`) ||
        animatingEdges.has(`${edge.target}-${edge.source}`)
      )

      // Find tokens on this edge
      const edgeTokens = tokens.filter(token => {
        if (token.status !== 'traveling') return false
        const sourceNode = token.path[token.currentEdgeIndex]
        const targetNode = token.path[token.currentEdgeIndex + 1]
        return sourceNode === edge.source && targetNode === edge.target
      })

      // Edge is active if it has tokens or is in animatingEdges
      const hasTokens = edgeTokens.length > 0
      const showAsActive = isActive || hasTokens

      return {
        ...edge,
        animated: false, // We handle animation in custom edge
        className: showAsActive ? 'edge-active-flow' : '',
        data: {
          ...edge.data,
          tokens: edgeTokens,
          currentTimeMs,
          isActive: showAsActive,
        },
        // Only override style when active - let default edge color show otherwise
        style: showAsActive ? {
          ...edge.style,
          stroke: '#0066cc',
          strokeWidth: 2,
        } : edge.style
      }
    }))
  }, [animatingEdges, tokens, currentTimeMs, setEdges])

  // Handle node click for interactive nodes
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
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
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
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
