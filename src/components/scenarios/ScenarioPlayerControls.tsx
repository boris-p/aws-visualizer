import { Button } from '@/components/ui/button'

interface ScenarioPlayerControlsProps {
  isPlaying: boolean
  currentTimeMs: number
  durationMs: number
  onPlay: () => void
  onPause: () => void
  onReset: () => void
}

export default function ScenarioPlayerControls({
  isPlaying,
  currentTimeMs,
  durationMs,
  onPlay,
  onPause,
  onReset
}: ScenarioPlayerControlsProps) {
  const progress = durationMs > 0 ? (currentTimeMs / durationMs) * 100 : 0
  const currentSec = Math.floor(currentTimeMs / 1000)
  const totalSec = Math.floor(durationMs / 1000)

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {!isPlaying ? (
          <Button
            onClick={onPlay}
            size="sm"
            variant="outline"
            className="font-mono text-xs w-8 h-8 p-0"
          >
            ▶
          </Button>
        ) : (
          <Button
            onClick={onPause}
            size="sm"
            variant="outline"
            className="font-mono text-xs w-8 h-8 p-0"
          >
            ⏸
          </Button>
        )}
        <Button
          onClick={onReset}
          size="sm"
          variant="outline"
          className="font-mono text-xs w-8 h-8 p-0"
        >
          ↺
        </Button>
      </div>

      <div className="flex items-center gap-2 text-xs text-[#666]">
        <span>{currentSec}s / {totalSec}s</span>
        <div className="w-24 h-1 bg-[#e5e5e5] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#0066cc] transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  )
}
