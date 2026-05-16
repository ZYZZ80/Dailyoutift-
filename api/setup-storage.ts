import { adminClient, cors, env, type ApiRequest, type ApiResponse } from './lib/account.js'

const REQUIRED_BUCKETS = ['wardrobe', 'profile', 'styles'] as const

export default async function handler(req: ApiRequest, res: ApiResponse) {
  cors(req, res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const { serviceRoleKey } = env()
  const admin = adminClient()
  if (!serviceRoleKey || !admin) {
    return res.status(503).json({ error: 'not_configured' })
  }

  const results = await Promise.all(REQUIRED_BUCKETS.map(async (bucket) => {
    const { error } = await admin.storage.createBucket(bucket, { public: true })
    if (!error || error.message.toLowerCase().includes('already exists')) {
      return { bucket, ok: true }
    }
    return { bucket, ok: false, error: error.message }
  }))

  return res.status(results.every((item) => item.ok) ? 200 : 500).json({ ok: results.every((item) => item.ok), buckets: results })
}
