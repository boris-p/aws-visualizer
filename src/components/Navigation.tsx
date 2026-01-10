import { Link, useLocation } from 'react-router-dom'

export default function Navigation() {
  const location = useLocation()

  return (
    <nav className="flex items-center gap-6 text-xs">
      <Link
        to="/aws-geography"
        className={
          location.pathname === '/aws-geography'
            ? 'text-[#1a1a1a] font-semibold'
            : 'text-[#666] hover:text-[#333]'
        }
      >
        map
      </Link>
      <Link
        to="/aws-visualizer"
        className={
          location.pathname === '/aws-visualizer'
            ? 'text-[#1a1a1a] font-semibold'
            : 'text-[#666] hover:text-[#333]'
        }
      >
        visualizer
      </Link>
    </nav>
  )
}
