import { useRef } from 'react'
import type { Scenario, ScenarioEvent } from '@/types/scenario'

interface ScenarioPlayerProps {
  scenario: Scenario
  isPlaying: boolean
  currentTimeMs: number
  onPlay: () => void
  onPause: () => void
  onReset: () => void
  onSeek: (timeMs: number) => void
}

export default function ScenarioPlayer({
  scenario,
  isPlaying,
  currentTimeMs,
  onPlay,
  onPause,
  onReset,
  onSeek
}: ScenarioPlayerProps) {
  const timelineRef = useRef<HTMLDivElement>(null)

  const progress = (currentTimeMs / scenario.durationMs) * 100
  const currentSec = Math.floor(currentTimeMs / 1000)
  const totalSec = Math.floor(scenario.durationMs / 1000)

  // Event markers positioned on timeline
  const eventMarkers = scenario.events.map(event => ({
    id: event.id,
    position: (event.timestampMs / scenario.durationMs) * 100,
    label: getEventLabel(event),
    event
  }))

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return
    const rect = timelineRef.current.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const percentage = Math.max(0, Math.min(1, clickX / rect.width))
    const newTimeMs = percentage * scenario.durationMs
    onSeek(newTimeMs)
  }

  const handleCheckpointClick = (event: ScenarioEvent, e: React.MouseEvent) => {
    e.stopPropagation()  // Prevent timeline click
    onSeek(event.timestampMs)
  }

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[55%] bg-white/95 backdrop-blur-sm border border-[#e5e5e5] rounded px-4 py-2.5 font-mono shadow-sm">
      {/* Compact header row - name, controls, time */}
      <div className="flex items-center justify-between gap-4 mb-2">
        <div className="text-sm font-medium text-[#333] truncate flex-1">
          {scenario.name}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={isPlaying ? onPause : onPlay}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#f5f5f5] transition-colors text-sm"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button
            onClick={onReset}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#f5f5f5] transition-colors text-sm"
            title="Reset"
          >
            ↺
          </button>
        </div>

        <div className="text-xs text-[#999] tabular-nums">
          {currentSec}s / {totalSec}s
        </div>
      </div>

      {/* Compact timeline */}
      <div>
        <div
          ref={timelineRef}
          onClick={handleTimelineClick}
          className="relative h-2 bg-[#e5e5e5] rounded-full cursor-pointer group"
        >
          {/* Progress fill */}
          <div
            className="absolute top-0 left-0 h-full bg-[#0066cc] rounded-full"
            style={{ width: `${progress}%` }}
          />

          {/* Event checkpoint markers */}
          {eventMarkers.map(marker => (
            <div
              key={marker.id}
              onClick={(e) => handleCheckpointClick(marker.event, e)}
              className="absolute top-1/2 -translate-y-1/2 cursor-pointer group/marker"
              style={{ left: `${marker.position}%`, transform: 'translate(-50%, -50%)' }}
            >
              {/* Compact marker dot */}
              <div className="w-2.5 h-2.5 bg-[#ff6600] rounded-full border border-white shadow-sm group-hover/marker:scale-150 transition-transform" />

              {/* Tooltip on hover */}
              <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 hidden group-hover/marker:block w-40 bg-[#1a1a1a] text-white text-[9px] rounded px-2 py-1.5 shadow-lg z-20 whitespace-nowrap">
                <div className="font-medium mb-0.5">{marker.label}</div>
                <div className="text-[8px] opacity-75">
                  {(marker.event.timestampMs / 1000).toFixed(1)}s
                  {marker.event.failureType && ` · ${marker.event.failureType}`}
                </div>
                {/* Arrow */}
                <div className="absolute top-full left-1/2 -translate-x-1/2">
                  <div className="w-0 h-0 border-l-[3px] border-r-[3px] border-t-[3px] border-transparent border-t-[#1a1a1a]" />
                </div>
              </div>
            </div>
          ))}

          {/* Current position playhead */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-[#0066cc] rounded-full border-2 border-white shadow-sm pointer-events-none"
            style={{ left: `${progress}%`, transform: 'translate(-50%, -50%)' }}
          />
        </div>

        {/* Event labels - more compact */}
        <div className="relative h-3.5 mt-1">
          {eventMarkers.map(marker => (
            <div
              key={`label-${marker.id}`}
              className="absolute text-[9px] text-[#888] whitespace-nowrap"
              style={{
                left: `${marker.position}%`,
                transform: 'translateX(-50%)'
              }}
            >
              {marker.label}
            </div>
          ))}
        </div>
      </div>

      {/* Compact description - single line */}
      <div className="text-[10px] text-[#888] mt-1.5 truncate">
        {scenario.description}
      </div>
    </div>
  )
}

function getEventLabel(event: ScenarioEvent): string {
  switch (event.action) {
    case 'route-request': return 'Request'
    case 'fail':
      if (event.targetType === 'az') return 'AZ Fail'
      if (event.targetType === 'region') return 'Region Fail'
      return 'Failure'
    case 'recover': return 'Recover'
    case 'degrade': return 'Degrade'
    default: return event.action
  }
}
