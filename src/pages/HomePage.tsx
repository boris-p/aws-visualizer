import { Link } from 'react-router-dom'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#fafafa] text-[#1a1a1a] font-mono p-8">
      <h1 className="text-2xl mb-2">aws-visualizer</h1>
      <p className="text-[#666] mb-8 text-sm">visual tools for understanding aws infrastructure</p>

      <nav className="space-y-2">
        <Link
          to="/aws-geography"
          className="block text-[#0066cc] hover:text-[#004c99] transition-colors"
        >
          → aws-geography
        </Link>
      </nav>
    </div>
  )
}
