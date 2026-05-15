import { cors, env, getAccount, getUser, type ApiRequest, type ApiResponse } from './lib/account.js'

export default async function handler(req: ApiRequest, res: ApiResponse) {
  cors(req, res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })
  const auth = await getUser(req)
  if ('error' in auth) return res.status(auth.error === 'missing_token' ? 401 : 503).json({ error: auth.error })
  const { stripeSecretKey, appUrl } = env()
  if (!stripeSecretKey) return res.status(503).json({ error: 'billing_not_configured' })
  const account = await getAccount(auth.user.id)
  if (!account.stripeCustomerId) return res.status(400).json({ error: 'no_customer' })

  const params = new URLSearchParams({
    customer: String(account.stripeCustomerId),
    return_url: `${appUrl}/?billing=portal`,
  })
  const stripeRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  })
  const data = await stripeRes.json() as { url?: string; error?: { message?: string } }
  if (!stripeRes.ok || !data.url) return res.status(502).json({ error: 'stripe_failed', details: data.error?.message ?? 'Stripe portal failed' })
  return res.status(200).json({ ok: true, url: data.url })
}
