import type { AZ } from '@/types/aws'

interface AZListProps {
  azs: AZ[]
}

export default function AZList({ azs }: AZListProps) {
  return (
    <div className="space-y-1">
      {azs.map((az) => (
        <div key={az.id} className="flex items-baseline gap-2">
          <span className="text-[#1a1a1a]">{az.id}</span>
          <span className="text-[#999] text-xs">
            ({az.letters.join(', ')})*
          </span>
        </div>
      ))}
      <div className="text-[#888] text-xs mt-2">
        * az letter names vary by account
      </div>
    </div>
  )
}
