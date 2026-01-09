import { useState } from 'react'
import { Link } from 'react-router-dom'
import WorldMap, { type EdgeLocation } from '@/components/aws/WorldMap'
import PartitionFilter from '@/components/aws/PartitionFilter'
import PartitionLegend from '@/components/aws/PartitionLegend'
import RegionDetailsPanel from '@/components/aws/RegionDetailsPanel'
import EdgeLocationDetailsPanel from '@/components/aws/EdgeLocationDetailsPanel'
import HierarchyModal from '@/components/aws/HierarchyModal'
import { Button } from '@/components/ui/button'
import type { Region, PartitionId } from '@/types/aws'

export default function AWSGeographyPage() {
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null)
  const [selectedEdgeLocation, setSelectedEdgeLocation] = useState<EdgeLocation | null>(null)
  const [visiblePartitions, setVisiblePartitions] = useState<Set<PartitionId>>(
    new Set(['aws', 'aws-cn', 'aws-us-gov'])
  )
  const [showHierarchy, setShowHierarchy] = useState(false)
  const [showEdgeLocations, setShowEdgeLocations] = useState(false)

  const togglePartition = (id: PartitionId) => {
    setVisiblePartitions((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div className="min-h-screen bg-[#fafafa] text-[#1a1a1a] font-mono">
      <header className="p-4 border-b border-[#e5e5e5] flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-[#666] hover:text-[#333]">←</Link>
          <h1 className="text-sm">aws-geography</h1>
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHierarchy(true)}
            className="font-mono text-xs"
          >
            view hierarchy
          </Button>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={showEdgeLocations}
              onChange={(e) => setShowEdgeLocations(e.target.checked)}
              className="w-3.5 h-3.5 accent-[#16a34a] cursor-pointer"
            />
            <span className="text-[#16a34a]">edge locations</span>
          </label>
          <PartitionFilter
            visiblePartitions={visiblePartitions}
            onToggle={togglePartition}
          />
        </div>
      </header>

      <main className="relative h-[calc(100vh-57px)]">
        <WorldMap
          visiblePartitions={visiblePartitions}
          onSelectRegion={(region) => {
            setSelectedRegion(region)
            setSelectedEdgeLocation(null)
          }}
          selectedRegion={selectedRegion}
          showEdgeLocations={showEdgeLocations}
          onSelectEdgeLocation={(edgeLoc) => {
            setSelectedEdgeLocation(edgeLoc)
            setSelectedRegion(null)
          }}
          selectedEdgeLocation={selectedEdgeLocation}
        />
        <PartitionLegend />
        {selectedRegion && (
          <RegionDetailsPanel
            region={selectedRegion}
            onClose={() => setSelectedRegion(null)}
          />
        )}
        {selectedEdgeLocation && (
          <EdgeLocationDetailsPanel
            edgeLocation={selectedEdgeLocation}
            onClose={() => setSelectedEdgeLocation(null)}
          />
        )}
      </main>

      <HierarchyModal
        open={showHierarchy}
        onClose={() => setShowHierarchy(false)}
      />
    </div>
  )
}
