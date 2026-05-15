import { createClient } from '@supabase/supabase-js'

export const FREE_MONTHLY_GENERATIONS = Number(process.env.FREE_MONTHLY_GENERATIONS ?? 20)

export function cors(req: any, res: any, methods = 'GET, POST, OPTIONS') {
  const origin = req.headers.origin ?? ''
  const allowed = ['https://daily-outfit-stylist.vercel.app', 'http://localhost:5173', 'http://localhost:4173']
  res.setHeader('Access-Control-Allow-Origin', allowed.includes(origin) ? origin : 'https://daily-outfit-stylist.vercel.app')
  res.setHeader('Access-Control-Allow-Methods', methods)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, stripe-signature')
  res.setHeader('Cache-Control', 'no-store')
}

export function env() {
  return {
    supabaseUrl: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    stripePriceId: process.env.STRIPE_PRICE_ID,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'https://daily-outfit-stylist.vercel.app',
  }
}

export function adminClient() {
  const { supabaseUrl, serviceRoleKey } = env()
  if (!supabaseUrl || !serviceRoleKey) return null
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function getUser(req: any) {
  const { supabaseUrl, anonKey } = env()
  if (!supabaseUrl || !anonKey) return { error: 'not_configured' as const }
  const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return { error: 'missing_token' as const }
  const authClient = createClient(supabaseUrl, anonKey)
  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data.user) return { error: 'invalid_token' as const }
  return { user: data.user }
}

export function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export async function getAccount(userId: string) {
  const admin = adminClient()
  if (!admin) return { plan: 'free', status: 'free', used: 0, limit: FREE_MONTHLY_GENERATIONS }
  const currentMonth = monthKey()
  const subscriptionResult = await admin.from('subscriptions').select('*').eq('user_id', userId).maybeSingle()
  const usageResult = await admin.from('generation_usage').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('month', currentMonth)
  const subscription = subscriptionResult.error ? null : subscriptionResult.data
  const status = String(subscription?.status ?? 'free')
  const plan = status === 'active' || status === 'trialing' ? 'pro' : 'free'
  return {
    plan,
    status,
    used: usageResult.error ? 0 : usageResult.count ?? 0,
    limit: plan === 'pro' ? null : FREE_MONTHLY_GENERATIONS,
    stripeCustomerId: subscription?.stripe_customer_id ?? null,
  }
}

export async function checkAndRecordUsage(userId: string, action: string) {
  const admin = adminClient()
  if (!admin) return { ok: true, plan: 'free', used: 0, limit: FREE_MONTHLY_GENERATIONS }
  const account = await getAccount(userId)
  if (account.plan !== 'pro' && account.used >= FREE_MONTHLY_GENERATIONS) {
    return { ok: false, ...account }
  }
  const usageInsert = await admin.from('generation_usage').insert({
    user_id: userId,
    month: monthKey(),
    action,
    created_at: new Date().toISOString(),
  })
  if (usageInsert.error) {
    console.warn('generation_usage insert failed:', usageInsert.error.message)
  }
  const eventInsert = await admin.from('app_events').insert({
    user_id: userId,
    event: `generation_${action}`,
    metadata: { plan: account.plan },
    created_at: new Date().toISOString(),
  })
  if (eventInsert.error) {
    console.warn('app_events insert failed:', eventInsert.error.message)
  }
  return { ok: true, ...account, used: account.used + 1 }
}
