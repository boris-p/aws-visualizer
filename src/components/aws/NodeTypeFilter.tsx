interface NodeTypeFilterProps {
  availableTypes: Set<string>
  visibleTypes: Set<string>
  onToggle: (type: string) => void
}

export default function NodeTypeFilter({
  availableTypes,
  visibleTypes,
  onToggle
}: NodeTypeFilterProps) {
  if (availableTypes.size === 0) return null

  const sortedTypes = Array.from(availableTypes).sort()

  // Color mapping for different node types
  const typeColors: Record<string, string> = {
    'root': '#0066cc',
    'partition': '#0066cc',
    'partition-cn': '#dc2626',
    'partition-gov': '#ea580c',
    'region': '#0066cc',
    'az': '#888',
    'dc': '#999',
    'edge': '#16a34a',
    'custom': '#666'
  }

  // Label mapping for display names
  const typeLabels: Record<string, string> = {
    'root': 'root',
    'partition': 'aws',
    'partition-cn': 'aws-cn',
    'partition-gov': 'aws-us-gov',
    'region': 'region',
    'az': 'az',
    'dc': 'dc',
    'edge': 'edge',
    'custom': 'custom'
  }

  return (
    <div className="flex items-center gap-3">
      {sortedTypes.map(type => {
        const isVisible = visibleTypes.has(type)
        const color = typeColors[type] || '#666'
        const label = typeLabels[type] || type

        return (
          <label
            key={type}
            className="flex items-center gap-2 text-xs cursor-pointer"
          >
            <input
              type="checkbox"
              checked={isVisible}
              onChange={() => onToggle(type)}
              className="w-3.5 h-3.5 cursor-pointer"
              style={{ accentColor: color }}
            />
            <span style={{ color: isVisible ? color : '#ccc' }}>
              {label}
            </span>
          </label>
        )
      })}
    </div>
  )
}
