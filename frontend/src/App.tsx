import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { SolutionPage } from './components/case/CasePage'
import { AppShell } from './components/layout/AppShell'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />} />
        <Route path="/solution/:id" element={<SolutionPage />} />
      </Routes>
    </BrowserRouter>
  )
}
