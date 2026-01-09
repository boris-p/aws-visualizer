import { useState } from 'react'
import { Link } from 'react-router-dom'
import HierarchyGraph from '@/components/aws/HierarchyGraph'
import PartitionFilter from '@/components/aws/PartitionFilter'
import Navigation from '@/components/Navigation'
import type { PartitionId } from '@/types/aws'

export default function AWSHierarchyPage() {
  const [visiblePartitions, setVisiblePartitions] = useState<Set<PartitionId>>(
    new Set(['aws', 'aws-cn', 'aws-us-gov'])
  )
  const [showEdgeLocations, setShowEdgeLocations] = useState(true)
  const [showDataCenters, setShowDataCenters] = useState(false)

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
          <Navigation />
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={showEdgeLocations}
              onChange={(e) => setShowEdgeLocations(e.target.checked)}
              className="w-3.5 h-3.5 accent-[#16a34a] cursor-pointer"
            />
            <span className="text-[#16a34a]">edge locations</span>
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={showDataCenters}
              onChange={(e) => setShowDataCenters(e.target.checked)}
              className="w-3.5 h-3.5 accent-[#999] cursor-pointer"
            />
            <span className="text-[#999]">data centers</span>
          </label>
          <PartitionFilter
            visiblePartitions={visiblePartitions}
            onToggle={togglePartition}
          />
        </div>
      </header>

      <main className="h-[calc(100vh-57px)]">
        <HierarchyGraph
          visiblePartitions={visiblePartitions}
          showEdgeLocations={showEdgeLocations}
          showDataCenters={showDataCenters}
        />
      </main>
    </div>
  )
}
