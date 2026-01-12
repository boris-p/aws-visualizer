import {
  BaseEdge,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react'
import type { Token } from '@/types/token'
import { getTokenType, calculateTokenProgress } from '@/types/token'
import { PositionedTokenShape } from './TokenShape'

// Extended edge data including tokens
export interface TokenFlowEdgeData {
  tokens?: Token[]
  currentTimeMs?: number
  isActive?: boolean
  [key: string]: unknown
}

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
}: EdgeProps<TokenFlowEdgeData>) {
  // Get the edge path
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const tokens = data?.tokens || []
  const currentTimeMs = data?.currentTimeMs || 0
  const isActive = data?.isActive || false

  // Calculate positions for each token
  const tokenPositions = tokens
    .filter((token) => token.status === 'traveling')
    .map((token) => {
      const progress = calculateTokenProgress(token, currentTimeMs)
      const position = getPointAtProgress(edgePath, progress)
      return { token, position, progress }
    })
    .filter((tp) => tp.position !== null)

  // Use style color if provided, otherwise default to visible gray
  const defaultStroke = style?.stroke || '#b1b1b7'
  const defaultStrokeWidth = style?.strokeWidth || 1

  return (
    <>
      {/* Base edge line */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          stroke: isActive ? '#0066cc' : defaultStroke,
          strokeWidth: isActive ? 2 : defaultStrokeWidth,
        }}
        markerEnd={markerEnd}
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
      {tokenPositions.map(({ token, position }) => {
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
