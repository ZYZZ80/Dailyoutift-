import { authFetch } from './authFetch'

export interface AccountStatus {
  plan: 'free' | 'pro'
  status: string
  used: number
  limit: number | null
  stripeCustomerId?: string | null
}

export async function getAccountStatus(): Promise<AccountStatus | null> {
  const res = await authFetch('/api/me')
  if (!res.ok) return null
  const data = await res.json() as { account?: AccountStatus }
  return data.account ?? null
}

export async function openCheckout() {
  const res = await authFetch('/api/create-checkout-session', { method: 'POST' })
  const data = await res.json().catch(() => ({})) as { url?: string; details?: string; error?: string }
  if (!res.ok || !data.url) throw new Error(data.details ?? data.error ?? 'Billing is not configured yet.')
  window.location.href = data.url
}

export async function openBillingPortal() {
  const res = await authFetch('/api/billing-portal', { method: 'POST' })
  const data = await res.json().catch(() => ({})) as { url?: string; details?: string; error?: string }
  if (!res.ok || !data.url) throw new Error(data.details ?? data.error ?? 'Billing portal is not available yet.')
  window.location.href = data.url
}

export function trackEvent(event: string, metadata: Record<string, unknown> = {}) {
  authFetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, metadata }),
  }).catch(() => {})
}
