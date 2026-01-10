import type { Scenario } from '@/types/scenario'

export default function ScenarioInfo({ scenario }: { scenario: Scenario }) {
  return (
    <div className="absolute top-4 left-4 bg-white border border-[#e5e5e5] rounded p-3 max-w-md font-mono text-xs shadow-lg">
      <div className="font-semibold mb-1">{scenario.name}</div>
      <div className="text-[#666] mb-2">{scenario.description}</div>
      <div className="text-[#888] text-[10px]">
        Expected: {scenario.expectedOutcome}
      </div>
    </div>
  )
}
