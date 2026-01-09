import type { Region, Partition } from '@/types/aws'
import GenericTooltip from './GenericTooltip'

interface RegionTooltipProps {
  region: Region
  partition: Partition
  x: number
  y: number
}

export default function RegionTooltip({
  region,
  partition,
  x,
  y,
}: RegionTooltipProps) {
  return (
    <GenericTooltip
      x={x}
      y={y}
      title={region.id}
      subtitle={region.name}
      info={`${region.azs.length} AZs`}
      color={partition.color}
    />
  )
}
