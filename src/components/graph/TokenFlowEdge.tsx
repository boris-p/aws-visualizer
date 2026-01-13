import type React from 'react'
import {
  BaseEdge,
  getSmoothStepPath,
  type EdgeProps,
  type Edge,
} from '@xyflow/react'
import type { Token } from '@/types/token'
import { getTokenType, calculateTokenProgress } from '@/types/token'
import { PositionedTokenShape } from './TokenShape'

// Extended edge data including tokens
export interface TokenFlowEdgeData extends Record<string, unknown> {
  tokens?: Token[]
  currentTimeMs?: number
  isActive?: boolean
}

// Edge type for TokenFlow edges
export type TokenFlowEdge = Edge<TokenFlowEdgeData, 'tokenFlow'>

// Calculate position along an SVG path at a given progress (0-1)
function getPointAtProgress(
  pathString: string,
  progress: number
): { x: number; y: number } | null {
  // Create a temporary path element to measure
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', pathString)

  const totalLength = path.getTotalLength()
  const point = path.getPointAtLength(totalLength * progress)

  return { x: point.x, y: point.y }
}

export default function TokenFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  markerEnd,
}: EdgeProps<TokenFlowEdge>) {
  // Get the edge path
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const tokens = (data?.tokens ?? []) as Token[]
  const currentTimeMs = (data?.currentTimeMs ?? 0) as number
  const isActive = (data?.isActive ?? false) as boolean

  // Calculate positions for each token
  const tokenPositions = tokens
    .filter((token: Token) => token.status === 'traveling')
    .map((token: Token) => {
      const progress = calculateTokenProgress(token, currentTimeMs)
      const position = getPointAtProgress(edgePath, progress)
      return { token, position, progress }
    })
    .filter((tp: { token: Token; position: { x: number; y: number } | null; progress: number }) => tp.position !== null)

  // Use style color if provided, otherwise default to visible gray
  const defaultStroke = (style?.stroke as string) || '#b1b1b7'
  const defaultStrokeWidth = (style?.strokeWidth as number) || 1

  return (
    <>
      {/* Base edge line */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...(style as React.CSSProperties),
          stroke: isActive ? '#0066cc' : defaultStroke,
          strokeWidth: isActive ? 2 : defaultStrokeWidth,
        }}
        markerEnd={markerEnd as string}
      />

      {/* Active flow indicator (dashed animation) */}
      {isActive && (
        <path
          d={edgePath}
          fill="none"
          stroke="#0066cc"
          strokeWidth={2}
          strokeDasharray="8 4"
          className="edge-active-flow-animation"
        />
      )}

      {/* Render tokens on this edge */}
      {tokenPositions.map(({ token, position }: { token: Token; position: { x: number; y: number } | null }) => {
        if (!position) return null
        const tokenType = getTokenType(token.typeId)

        return (
          <g key={token.id} className="token-on-edge">
            <PositionedTokenShape
              x={position.x}
              y={position.y}
              tokenType={tokenType}
              status={token.status}
            />
          </g>
        )
      })}
    </>
  )
}
