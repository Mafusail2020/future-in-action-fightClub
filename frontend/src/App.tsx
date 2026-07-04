import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { CasePage } from './components/case/CasePage'
import { AppShell } from './components/layout/AppShell'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />} />
        <Route path="/case/:id" element={<CasePage />} />
      </Routes>
    </BrowserRouter>
  )
}
