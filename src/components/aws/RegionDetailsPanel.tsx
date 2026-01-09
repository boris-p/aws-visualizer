import type { Region } from '@/types/aws'
import awsGeoData from '@/data/aws-geo.json'
import AZList from './AZList'
import GenericDetailsPanel from './GenericDetailsPanel'

interface RegionDetailsPanelProps {
  region: Region
  onClose: () => void
}

export default function RegionDetailsPanel({
  region,
  onClose,
}: RegionDetailsPanelProps) {
  const partition = awsGeoData.partitions.find((p) =>
    p.regions.some((r) => r.id === region.id)
  )

  return (
    <GenericDetailsPanel title="region details" onClose={onClose}>
      <div>
        <div className="text-[#0066cc] font-semibold">{region.id}</div>
        <div className="text-[#666] text-xs">{region.name}</div>
      </div>

      <div className="text-xs">
        <span className="text-[#666]">partition: </span>
        <span style={{ color: partition?.color }}>{partition?.id}</span>
      </div>

      <div className="text-xs">
        <span className="text-[#666]">coords: </span>
        <span className="text-[#888]">
          {region.lat.toFixed(2)}, {region.lon.toFixed(2)}
        </span>
      </div>

      <div className="border-t border-[#e5e5e5] pt-3">
        <div className="text-[#666] text-xs mb-2">availability zones</div>
        <AZList azs={region.azs} />
      </div>

      <div className="border-t border-[#e5e5e5] pt-3 text-[#888] text-xs">
        each az contains 1+ physically separate data centers (not addressable)
      </div>
    </GenericDetailsPanel>
  )
}
