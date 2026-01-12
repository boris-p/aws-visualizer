import type { Token, WaitPointState } from '@/types/token'
import { getTokenType } from '@/types/token'
import TokenShape from './TokenShape'

interface WaitPointIndicatorProps {
  waitPoint: WaitPointState
  tokens: Token[]
  nodeWidth?: number
  nodeHeight?: number
}

export default function WaitPointIndicator({
  waitPoint,
  tokens,
  nodeWidth = 150,
  nodeHeight = 50,
}: WaitPointIndicatorProps) {
  // Get tokens waiting at this node
  const waitingTokens = tokens
    .filter(
      (t) => t.status === 'waiting' && t.waitingAtNode === waitPoint.nodeId
    )
    .sort((a, b) => (a.waitPosition || 0) - (b.waitPosition || 0))

  if (waitingTokens.length === 0) {
    return null
  }

  // Position tokens to the left of the node, stacked horizontally
  const tokenSpacing = 14
  const startX = -20 // Left of the node

  return (
    <g className="wait-point-indicator">
      {/* Queue background */}
      <rect
        x={startX - waitingTokens.length * tokenSpacing - 8}
        y={nodeHeight / 2 - 12}
        width={waitingTokens.length * tokenSpacing + 16}
        height={24}
        rx={4}
        fill="rgba(245, 158, 11, 0.1)"
        stroke="rgba(245, 158, 11, 0.3)"
        strokeWidth={1}
      />

      {/* Render waiting tokens */}
      {waitingTokens.map((token, idx) => {
        const tokenType = getTokenType(token.typeId)
        const x = startX - idx * tokenSpacing
        const y = nodeHeight / 2

        return (
          <g
            key={token.id}
            transform={`translate(${x}, ${y})`}
            className="waiting-token"
          >
            <TokenShape tokenType={tokenType} status={token.status} />
          </g>
        )
      })}

      {/* Queue count badge */}
      {waitingTokens.length > 1 && (
        <g
          transform={`translate(${startX - (waitingTokens.length - 1) * tokenSpacing - 16}, ${nodeHeight / 2 - 16})`}
        >
          <circle r={8} fill="#f59e0b" />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fill="white"
            fontSize={10}
            fontWeight="bold"
          >
            {waitingTokens.length}
          </text>
        </g>
      )}
    </g>
  )
}
