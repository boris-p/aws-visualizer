interface GenericTooltipProps {
  x: number
  y: number
  title: string
  subtitle?: string
  info?: string
  color?: string
}

export default function GenericTooltip({
  x,
  y,
  title,
  subtitle,
  info,
  color = '#666',
}: GenericTooltipProps) {
  return (
    <div
      className="fixed z-50 bg-white border border-[#e5e5e5] shadow-lg px-2 py-1.5 font-mono text-xs pointer-events-none"
      style={{
        left: x + 12,
        top: y + 12,
      }}
    >
      <div style={{ color }} className="font-semibold">{title}</div>
      {subtitle && <div className="text-[#666]">{subtitle}</div>}
      {info && <div className="text-[#888]">{info}</div>}
    </div>
  )
}
