import { adminClient, cors, env, getUser, type ApiRequest, type ApiResponse } from './lib/account.js'

export default async function handler(req: ApiRequest, res: ApiResponse) {
  cors(req, res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })
  const auth = await getUser(req)
  if ('error' in auth) return res.status(auth.error === 'missing_token' ? 401 : 503).json({ error: auth.error })

  const { stripeSecretKey, stripePriceId, appUrl } = env()
  if (!stripeSecretKey || !stripePriceId) return res.status(503).json({ error: 'billing_not_configured' })

  const admin = adminClient()
  const existing = admin
    ? await admin.from('subscriptions').select('stripe_customer_id').eq('user_id', auth.user.id).maybeSingle()
    : null

  const params = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': stripePriceId,
    'line_items[0][quantity]': '1',
    success_url: `${appUrl}/?billing=success`,
    cancel_url: `${appUrl}/?billing=cancelled`,
    client_reference_id: auth.user.id,
    'metadata[user_id]': auth.user.id,
    customer_email: auth.user.email ?? '',
  })
  const customerId = existing?.data?.stripe_customer_id
  if (customerId) {
    params.delete('customer_email')
    params.set('customer', customerId)
  }

  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  })
  const data = await stripeRes.json() as { url?: string; error?: { message?: string } }
  if (!stripeRes.ok || !data.url) return res.status(502).json({ error: 'stripe_failed', details: data.error?.message ?? 'Stripe checkout failed' })
  return res.status(200).json({ ok: true, url: data.url })
}
