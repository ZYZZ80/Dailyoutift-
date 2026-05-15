import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { recoverFromStaleBundle } from './lib/appUpdate'

const APP_VERSION = '2026-05-15-stale-bundle-recovery'

async function refreshOldAppShell() {
  if (!('localStorage' in window)) return
  if (localStorage.getItem('daily-stylist-app-version') === APP_VERSION) return
  localStorage.setItem('daily-stylist-app-version', APP_VERSION)

  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.update()))
    }
  } catch {
    // Cache refresh is best-effort; app data lives in Supabase/localStorage.
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

window.addEventListener('error', (event) => {
  void recoverFromStaleBundle(event.error || event.message)
})

window.addEventListener('unhandledrejection', (event) => {
  void recoverFromStaleBundle(event.reason)
})

setTimeout(() => { refreshOldAppShell() }, 1500)
