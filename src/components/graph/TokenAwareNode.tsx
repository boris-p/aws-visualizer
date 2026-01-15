import { Handle, Position } from '@xyflow/react'
import type { Token } from '@/types/token'
import { getTokenType } from '@/types/token'

interface TokenAwareNodeData {
  label: string
  waitingTokens?: Token[]
  state?: string
  type?: string
  isInteractive?: boolean
  currentTimeMs?: number
}

interface TokenAwareNodeProps {
  data: TokenAwareNodeData
  selected?: boolean
}

// Max tokens to show individually before collapsing
const MAX_VISIBLE_TOKENS = 3

// Minimum time (ms) a token must be waiting before showing in the indicator
// This prevents flickering when tokens pass through quickly
const MIN_WAIT_TIME_MS = 200

export default function TokenAwareNode({ data, selected }: TokenAwareNodeProps) {
  const allWaitingTokens = (data.waitingTokens || []) as Token[]
  const currentTimeMs = (data.currentTimeMs || 0) as number
  const isUnavailable = data.state === 'unavailable'
  const isDegraded = data.state === 'degraded'

  // Filter to only show tokens that have been waiting long enough
  // This prevents flickering when tokens pass through quickly without actually queueing
  const waitingTokens = allWaitingTokens.filter(token => {
    const waitDuration = currentTimeMs - token.currentSegmentStartMs
    return waitDuration >= MIN_WAIT_TIME_MS
  })

  const count = waitingTokens.length

  // Determine display mode based on count
  const showIndividual = count > 0 && count <= MAX_VISIBLE_TOKENS
  const showOverflow = count > MAX_VISIBLE_TOKENS && count <= 6
  const showBar = count > 6

  // Build class names
  const nodeClasses = [
    'token-aware-node',
    isUnavailable ? 'unavailable' : '',
    isDegraded ? 'degraded' : '',
    selected ? 'selected' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={nodeClasses}>
      <Handle type="target" position={Position.Left} />

      <div className="node-content">
        <div className="node-label">{data.label}</div>
      </div>

      <Handle type="source" position={Position.Right} />

      {/* Token indicator - only show if tokens present */}
      {count > 0 && (
        <div className="token-indicator">
          {showIndividual && (
            <div className="token-row">
              {waitingTokens.slice(0, MAX_VISIBLE_TOKENS).map((token, idx) => {
                const tokenType = getTokenType(token.typeId)
                return (
                  <div
                    key={token.id}
                    className="token-dot"
                    style={{ animationDelay: `${idx * 0.15}s` }}
                  >
                    <svg width="12" height="12" viewBox="-6 -6 12 12">
                      <circle
                        r={5}
                        fill={tokenType.color}
                        className="token-circle"
                      />
                    </svg>
                  </div>
                )
              })}
            </div>
          )}

          {showOverflow && (
            <div className="token-row">
              {waitingTokens.slice(0, MAX_VISIBLE_TOKENS).map((token, idx) => {
                const tokenType = getTokenType(token.typeId)
                return (
                  <div
                    key={token.id}
                    className="token-dot"
                    style={{ animationDelay: `${idx * 0.15}s` }}
                  >
                    <svg width="12" height="12" viewBox="-6 -6 12 12">
                      <circle
                        r={5}
                        fill={tokenType.color}
                        className="token-circle"
                      />
                    </svg>
                  </div>
                )
              })}
              <span className="overflow-badge">+{count - MAX_VISIBLE_TOKENS}</span>
            </div>
          )}

          {showBar && (
            <div className="token-bar-container">
              <div className="token-bar">
                <div
                  className="token-bar-fill"
                  style={{ width: `${Math.min(100, (count / 20) * 100)}%` }}
                />
              </div>
              <span className="token-count">{count}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
