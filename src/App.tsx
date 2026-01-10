import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import AWSGeographyPage from './pages/AWSGeographyPage'
import AWSVisualizerPage from './pages/AWSVisualizerPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/aws-geography" element={<AWSGeographyPage />} />
      <Route path="/aws-visualizer" element={<AWSVisualizerPage />} />
    </Routes>
  )
}

export default App
