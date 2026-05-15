import { adminClient, cors, getUser, type ApiRequest, type ApiResponse } from './lib/account.js'

export default async function handler(req: ApiRequest, res: ApiResponse) {
  cors(req, res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })
  const auth = await getUser(req)
  if ('error' in auth) return res.status(auth.error === 'missing_token' ? 401 : 503).json({ error: auth.error })
  const admin = adminClient()
  if (!admin) return res.status(503).json({ error: 'not_configured' })
  const { event, metadata } = req.body ?? {}
  if (!event || typeof event !== 'string') return res.status(400).json({ error: 'event_required' })
  await admin.from('app_events').insert({
    user_id: auth.user.id,
    event: event.substring(0, 80),
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
    created_at: new Date().toISOString(),
  })
  return res.status(200).json({ ok: true })
}
