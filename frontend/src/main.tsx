import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ServerWakeupGate from './components/ServerWakeupGate.tsx'
import PrepApp from './PrepApp.tsx'

// /prep (preparers) and /driver (delivery drivers) are the warehouse screens: none of the office tabs.
const path = window.location.pathname.replace(/\/+$/, '')
const warehouseRole = path === '/prep' ? 'preparer' : path === '/driver' ? 'driver' : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ServerWakeupGate>
      {warehouseRole ? <PrepApp role={warehouseRole} /> : <App />}
    </ServerWakeupGate>
  </StrictMode>,
)
