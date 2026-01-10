import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Scenario } from '@/types/scenario'

interface ScenarioSelectorProps {
  scenarios: Scenario[]
  selectedId: string | null
  onSelect: (scenarioId: string) => void
}

export default function ScenarioSelector({ scenarios, selectedId, onSelect }: ScenarioSelectorProps) {
  return (
    <Select value={selectedId || undefined} onValueChange={onSelect}>
      <SelectTrigger className="w-[280px] font-mono text-xs">
        <SelectValue placeholder="Select scenario" />
      </SelectTrigger>
      <SelectContent>
        {scenarios.map(scenario => (
          <SelectItem key={scenario.id} value={scenario.id} className="font-mono text-xs">
            {scenario.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
