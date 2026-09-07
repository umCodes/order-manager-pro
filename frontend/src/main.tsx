import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ServerWakeupGate from './components/ServerWakeupGate.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ServerWakeupGate>
      <App />
    </ServerWakeupGate>
  </StrictMode>,
)
