import awsGeoData from '@/data/aws-geo.json'

export default function PartitionLegend() {
  return (
    <div className="absolute bottom-4 left-4 text-xs font-mono space-y-1">
      {awsGeoData.partitions.map((partition) => (
        <div key={partition.id} className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: partition.color }}
          />
          <span className="text-[#666]">{partition.label}</span>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-[#16a34a]" />
        <span className="text-[#666]">Edge Locations (CloudFront)</span>
      </div>
      <div className="text-[#888] mt-2">dot size = az/PoP count</div>
    </div>
  )
}
