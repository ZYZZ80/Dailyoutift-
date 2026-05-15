const STALE_RELOAD_KEY = 'daily-stylist-stale-reload-at'
const STALE_RELOAD_WINDOW_MS = 30_000

export function isStaleBundleError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('Loading chunk') ||
    message.includes('ChunkLoadError')
  )
}

export async function clearAppShellCache() {
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }

    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    }
  } catch {
    // Best effort only. User wardrobe/history lives in the signed-in app account.
  }
}

export async function recoverFromStaleBundle(error: unknown): Promise<boolean> {
  if (!isStaleBundleError(error)) return false

  const lastReload = Number(sessionStorage.getItem(STALE_RELOAD_KEY) || '0')
  const now = Date.now()
  if (now - lastReload < STALE_RELOAD_WINDOW_MS) return false

  sessionStorage.setItem(STALE_RELOAD_KEY, String(now))
  await clearAppShellCache()

  const url = new URL(window.location.href)
  url.searchParams.set('appVersion', String(now))
  window.location.replace(url.toString())
  return true
}
