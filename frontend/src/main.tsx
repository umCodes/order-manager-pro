import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ServerWakeupGate from './components/ServerWakeupGate.tsx'
import PrepApp from './PrepApp.tsx'

// /prep is the preparers' own screen: just the shipping list, none of the office tabs.
const isPrepScreen = window.location.pathname.replace(/\/+$/, '') === '/prep'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ServerWakeupGate>
      {isPrepScreen ? <PrepApp /> : <App />}
    </ServerWakeupGate>
  </StrictMode>,
)
