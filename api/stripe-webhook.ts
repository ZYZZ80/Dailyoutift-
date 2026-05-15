import crypto from 'node:crypto'
import { adminClient, env, type ApiRequest, type ApiResponse } from './lib/account.js'

function verifyStripeSignature(payload: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(',').map((part) => {
    const [key, value] = part.split('=')
    return [key, value]
  }))
  const timestamp = parts.t
  const signature = parts.v1
  if (!timestamp || !signature) return false
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex')
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

function rawBody(req: ApiRequest) {
  if (typeof req.body === 'string') return req.body
  return JSON.stringify(req.body ?? {})
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })
  const { stripeWebhookSecret } = env()
  const admin = adminClient()
  if (!stripeWebhookSecret || !admin) return res.status(503).json({ error: 'not_configured' })

  const payload = rawBody(req)
  const signature = String(req.headers['stripe-signature'] ?? '')
  if (!verifyStripeSignature(payload, signature, stripeWebhookSecret)) {
    return res.status(401).json({ error: 'invalid_signature' })
  }

  const event = JSON.parse(payload)
  const type = String(event.type ?? '')
  const object = event.data?.object ?? {}
  const userId = object.metadata?.user_id ?? object.client_reference_id

  if (type === 'checkout.session.completed' && userId) {
    await admin.from('subscriptions').upsert({
      user_id: userId,
      stripe_customer_id: object.customer,
      stripe_subscription_id: object.subscription,
      status: 'active',
      price_id: null,
      updated_at: new Date().toISOString(),
    })
  }

  if (type.startsWith('customer.subscription.')) {
    const subscription = object
    const customerId = subscription.customer
    const status = subscription.status ?? 'inactive'
    const priceId = subscription.items?.data?.[0]?.price?.id ?? null
    const periodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null
    const { data } = await admin.from('subscriptions').select('user_id').eq('stripe_customer_id', customerId).maybeSingle()
    if (data?.user_id) {
      await admin.from('subscriptions').upsert({
        user_id: data.user_id,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        status,
        price_id: priceId,
        current_period_end: periodEnd,
        updated_at: new Date().toISOString(),
      })
    }
  }

  return res.status(200).json({ received: true })
}
