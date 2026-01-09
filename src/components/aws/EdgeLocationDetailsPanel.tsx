import GenericDetailsPanel from './GenericDetailsPanel'

interface EdgeLocation {
  city: string
  country: string
  lat: number
  lon: number
  count: number
}

interface EdgeLocationDetailsPanelProps {
  edgeLocation: EdgeLocation
  onClose: () => void
}

export default function EdgeLocationDetailsPanel({
  edgeLocation,
  onClose,
}: EdgeLocationDetailsPanelProps) {
  return (
    <GenericDetailsPanel title="edge location details" onClose={onClose}>
      <div>
        <div className="text-[#16a34a] font-semibold">{edgeLocation.city}</div>
        <div className="text-[#666] text-xs">{edgeLocation.country}</div>
      </div>

      <div className="text-xs">
        <span className="text-[#666]">type: </span>
        <span className="text-[#16a34a]">CloudFront Edge Location</span>
      </div>

      <div className="text-xs">
        <span className="text-[#666]">coords: </span>
        <span className="text-[#888]">
          {edgeLocation.lat.toFixed(2)}, {edgeLocation.lon.toFixed(2)}
        </span>
      </div>

      <div className="border-t border-[#e5e5e5] pt-3">
        <div className="text-[#666] text-xs mb-2">points of presence</div>
        <div className="text-[#1a1a1a] font-semibold">{edgeLocation.count} PoPs</div>
      </div>

      <div className="border-t border-[#e5e5e5] pt-3 text-[#888] text-xs">
        edge locations cache content closer to users for lower latency via cloudfront cdn
      </div>
    </GenericDetailsPanel>
  )
}
