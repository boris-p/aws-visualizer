import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import AWSGeographyPage from './pages/AWSGeographyPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/aws-geography" element={<AWSGeographyPage />} />
    </Routes>
  )
}

export default App
