import type { PartitionId } from '@/types/aws'
import awsGeoData from '@/data/aws-geo.json'

interface PartitionFilterProps {
  visiblePartitions: Set<PartitionId>
  onToggle: (id: PartitionId) => void
}

export default function PartitionFilter({
  visiblePartitions,
  onToggle,
}: PartitionFilterProps) {
  return (
    <div className="flex gap-4 text-xs">
      {awsGeoData.partitions.map((partition) => (
        <label
          key={partition.id}
          className="flex items-center gap-1.5 cursor-pointer"
        >
          <input
            type="checkbox"
            checked={visiblePartitions.has(partition.id as PartitionId)}
            onChange={() => onToggle(partition.id as PartitionId)}
            className="accent-current"
            style={{ accentColor: partition.color }}
          />
          <span style={{ color: partition.color }}>{partition.id}</span>
        </label>
      ))}
    </div>
  )
}
