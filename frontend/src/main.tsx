import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ServerWakeupGate from './components/ServerWakeupGate.tsx'
import { installSheetDrag } from './lib/native/sheets'
import { installPullToRefresh } from './lib/native/pullToRefresh'

// Native-app touch behaviour, app-wide: drag a window down to close it, pull a tab down to refresh.
installSheetDrag()
installPullToRefresh()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ServerWakeupGate>
      <App />
    </ServerWakeupGate>
  </StrictMode>,
)
