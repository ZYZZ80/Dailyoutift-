import { cors, getAccount, getUser } from './lib/account.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  cors(req, res, 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' })
  const auth = await getUser(req)
  if ('error' in auth) return res.status(auth.error === 'missing_token' ? 401 : 503).json({ error: auth.error })
  const account = await getAccount(auth.user.id)
  return res.status(200).json({ ok: true, user: { id: auth.user.id, email: auth.user.email }, account })
}
