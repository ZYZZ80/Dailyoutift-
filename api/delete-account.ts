import { adminClient, cors, env, getUser, type ApiRequest, type ApiResponse } from './lib/account.js'

export default async function handler(req: ApiRequest, res: ApiResponse) {
  cors(req, res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const { serviceRoleKey } = env()
  const admin = adminClient()
  if (!serviceRoleKey || !admin) {
    return res.status(503).json({
      error: 'not_configured',
      details: 'Delete account needs SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in Vercel.',
    })
  }

  const auth = await getUser(req)
  if ('error' in auth) return res.status(auth.error === 'missing_token' ? 401 : 503).json({ error: auth.error })
  const userId = auth.user.id

  try {
    const deleteRows = async (table: string) => {
      try {
        await admin.from(table).delete().eq('user_id', userId)
      } catch {
        // Optional legacy tables may not exist in every Supabase project.
      }
    }

    await Promise.all([
      deleteRows('styles'),
      deleteRows('outfits'),
      deleteRows('wardrobe_items'),
      deleteRows('user_settings'),
      deleteRows('style_images'),
      deleteRows('outfit_suggestions'),
      deleteRows('user_config'),
    ])

    await Promise.all(['wardrobe', 'styles', 'profile'].map(async (bucket) => {
      const { data } = await admin.storage.from(bucket).list(userId, { limit: 1000 })
      const paths = (data ?? []).map((item) => `${userId}/${item.name}`)
      if (paths.length > 0) await admin.storage.from(bucket).remove(paths)
    }))

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
    if (deleteError) throw deleteError
    return res.status(200).json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ error: 'delete_failed', details: message.substring(0, 180) })
  }
}
