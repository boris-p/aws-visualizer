import type { TokenType, TokenStatus } from '@/types/token'

interface TokenShapeProps {
  tokenType: TokenType
  status: TokenStatus
  className?: string
  style?: React.CSSProperties
}

// Get status-based color override
function getStatusColor(status: TokenStatus, baseColor: string): string {
  switch (status) {
    case 'failed':
      return '#ef4444' // red
    case 'completed':
      return '#10b981' // green
    case 'waiting':
      return '#f59e0b' // amber
    default:
      return baseColor
  }
}

// Render different shapes based on token type
export default function TokenShape({
  tokenType,
  status,
  className = '',
  style = {},
}: TokenShapeProps) {
  const color = getStatusColor(status, tokenType.color)
  const size = tokenType.size

  const baseStyle: React.CSSProperties = {
    ...style,
    filter: status === 'traveling' ? 'drop-shadow(0 0 4px rgba(59, 130, 246, 0.5))' : undefined,
  }

  switch (tokenType.shape) {
    case 'circle':
      return (
        <circle
          r={size}
          fill={color}
          className={`token-shape token-${status} ${className}`}
          style={baseStyle}
        />
      )

    case 'square':
      return (
        <rect
          x={-size}
          y={-size}
          width={size * 2}
          height={size * 2}
          fill={color}
          className={`token-shape token-${status} ${className}`}
          style={baseStyle}
        />
      )

    case 'diamond':
      // Diamond is a rotated square
      return (
        <rect
          x={-size}
          y={-size}
          width={size * 2}
          height={size * 2}
          fill={color}
          transform="rotate(45)"
          className={`token-shape token-${status} ${className}`}
          style={baseStyle}
        />
      )

    case 'triangle':
      // Equilateral triangle pointing right
      const h = size * 1.5
      const points = `${h},0 ${-h / 2},${size} ${-h / 2},${-size}`
      return (
        <polygon
          points={points}
          fill={color}
          className={`token-shape token-${status} ${className}`}
          style={baseStyle}
        />
      )

    default:
      return (
        <circle
          r={size}
          fill={color}
          className={`token-shape token-${status} ${className}`}
          style={baseStyle}
        />
      )
  }
}

// Positioned token shape for use in edges
interface PositionedTokenShapeProps extends TokenShapeProps {
  x: number
  y: number
}

export function PositionedTokenShape({
  x,
  y,
  tokenType,
  status,
  className,
  style,
}: PositionedTokenShapeProps) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <TokenShape
        tokenType={tokenType}
        status={status}
        className={className}
        style={style}
      />
    </g>
  )
}
