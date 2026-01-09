import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import HierarchyGraph from './HierarchyGraph'
import PartitionFilter from './PartitionFilter'
import type { PartitionId } from '@/types/aws'

interface HierarchyModalProps {
  open: boolean
  onClose: () => void
}

export default function HierarchyModal({ open, onClose }: HierarchyModalProps) {
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
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[90vw] h-[85vh] p-0 font-mono">
        <DialogHeader className="px-4 py-4 border-b border-[#e5e5e5] flex flex-row items-center justify-between">
          <DialogTitle className="text-sm font-normal">
            aws hierarchy
          </DialogTitle>
          <div className="flex items-center gap-4 mr-8">
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
        </DialogHeader>
        <div className="h-[calc(85vh-65px)]">
          <HierarchyGraph
            visiblePartitions={visiblePartitions}
            showEdgeLocations={showEdgeLocations}
            showDataCenters={showDataCenters}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
