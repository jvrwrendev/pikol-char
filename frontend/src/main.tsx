import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'sonner'
import { App } from '@/app/App'
import { AppStateProvider } from '@/app/AppState'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppStateProvider><App /><Toaster position="bottom-right" closeButton duration={3500} /></AppStateProvider>
  </React.StrictMode>,
)
