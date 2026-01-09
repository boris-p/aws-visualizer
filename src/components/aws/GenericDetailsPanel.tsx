import { ReactNode } from 'react'

interface GenericDetailsPanelProps {
  title: string
  onClose: () => void
  children: ReactNode
}

export default function GenericDetailsPanel({
  title,
  onClose,
  children,
}: GenericDetailsPanelProps) {
  return (
    <div className="absolute top-4 right-4 w-80 bg-white border border-[#e5e5e5] shadow-lg font-mono text-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#e5e5e5]">
        <span className="text-[#666]">{title}</span>
        <button
          onClick={onClose}
          className="text-[#666] hover:text-[#333] text-xs"
        >
          [x]
        </button>
      </div>
      <div className="p-3 space-y-3">
        {children}
      </div>
    </div>
  )
}
