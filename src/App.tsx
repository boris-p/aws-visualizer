import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import AWSGeographyPage from './pages/AWSGeographyPage'
import AWSHierarchyPage from './pages/AWSHierarchyPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/aws-geography" element={<AWSGeographyPage />} />
      <Route path="/aws-hierarchy" element={<AWSHierarchyPage />} />
    </Routes>
  )
}

export default App
