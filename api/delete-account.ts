import { createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  const origin = req.headers.origin ?? ''
  const allowed = ['https://daily-outfit-stylist.vercel.app', 'http://localhost:5173', 'http://localhost:4173']
  if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin)
  else res.setHeader('Access-Control-Allow-Origin', 'https://daily-outfit-stylist.vercel.app')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return res.status(503).json({
      error: 'not_configured',
      details: 'Delete account needs SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in Vercel.',
    })
  }

  const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'missing_token' })

  const authClient = createClient(supabaseUrl, anonKey)
  const { data: userData, error: userError } = await authClient.auth.getUser(token)
  if (userError || !userData.user) return res.status(401).json({ error: 'invalid_token' })

  const userId = userData.user.id
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

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
