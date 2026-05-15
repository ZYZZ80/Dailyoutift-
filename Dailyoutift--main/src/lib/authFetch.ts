import { supabase } from './supabase'

async function waitForSessionToken(timeoutMs = 2500): Promise<string | null> {
  const client = supabase
  if (!client) return null

  const first = await client.auth.getSession()
  let token = first.data.session?.access_token ?? null
  if (token) return token

  const refreshed = await client.auth.refreshSession().catch(() => null)
  token = refreshed?.data.session?.access_token ?? null
  if (token) return token

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      subscription.unsubscribe()
      resolve(null)
    }, timeoutMs)
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      const nextToken = session?.access_token ?? null
      if (!nextToken) return
      window.clearTimeout(timer)
      subscription.unsubscribe()
      resolve(nextToken)
    })
  })
}

export async function authHeaders(base: Record<string, string> = {}) {
  const token = await waitForSessionToken()
  return token ? { ...base, Authorization: `Bearer ${token}` } : base
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const existing = Object.fromEntries(new Headers(init.headers).entries())
  return fetch(input, {
    ...init,
    headers: await authHeaders(existing),
  })
}
