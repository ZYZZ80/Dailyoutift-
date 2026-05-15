import { createClient } from '@supabase/supabase-js'

type AnyRow = Record<string, unknown>
type AdminClient = ReturnType<typeof createClient<any>>

function isImage(value: unknown): value is string {
  return typeof value === 'string' && (
    value.startsWith('data:image/') ||
    value.startsWith('http') ||
    value.includes('/storage/v1/object/') ||
    value.includes('/storage/v1/render/image/')
  )
}

function matchesUser(row: AnyRow, userId: string) {
  const candidates = [row.user_id, row.userId, row.uid, row.owner_id, row.ownerId, row.auth_uid]
  return candidates.some((value) => String(value ?? '') === userId)
}

function sourceFrom(value: unknown): 'daily-preview' | 'outfit-builder' | 'try-on' {
  const raw = String(value ?? '').toLowerCase()
  if (raw.includes('try')) return 'try-on'
  if (raw.includes('builder')) return 'outfit-builder'
  return 'daily-preview'
}

function styleFromRow(row: AnyRow, fallbackId: string, fallbackSource?: unknown) {
  const image =
    row.image ??
    row.image_url ??
    row.imageUrl ??
    row.url ??
    row.preview_image ??
    row.previewImage ??
    row.generated_image ??
    row.generatedImage ??
    row.imageBase64 ??
    row.result
  if (!isImage(image)) return null
  const itemIds = row.item_ids ?? row.itemIds ?? row.items
  return {
    id: String(row.id ?? row.style_id ?? row.styleId ?? fallbackId),
    image,
    itemIds: Array.isArray(itemIds) ? itemIds.map((item) => typeof item === 'object' && item && 'id' in item ? String((item as { id: unknown }).id) : String(item)) : [],
    outfitId: row.outfit_id || row.outfitId ? String(row.outfit_id ?? row.outfitId) : undefined,
    source: sourceFrom(row.source ?? row.type ?? row.kind ?? fallbackSource),
    createdAt: String(row.created_at ?? row.createdAt ?? row.generated_at ?? row.generatedAt ?? row.date ?? row.timestamp ?? new Date().toISOString()),
  }
}

async function readTable(admin: AdminClient, table: string, userId: string, fallbackSource?: unknown) {
  try {
    const { data, error } = await admin.from(table).select('*').limit(1000)
    if (error) return []
    return (data ?? [])
      .filter((row) => matchesUser(row as AnyRow, userId))
      .map((row, index) => styleFromRow(row as AnyRow, `${table}-${index}`, fallbackSource))
      .filter(Boolean)
  } catch {
    return []
  }
}

async function readStorage(admin: AdminClient, bucket: string, userId: string) {
  try {
    const { data, error } = await admin.storage.from(bucket).list(userId, { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } })
    if (error) return []
    return (data ?? [])
      .filter((item) => item.name && !item.name.endsWith('/'))
      .map((item) => {
        const path = `${userId}/${item.name}`
        const image = admin.storage.from(bucket).getPublicUrl(path).data.publicUrl
        return {
          id: `storage-${bucket}-${item.name.replace(/[^a-z0-9_.-]/gi, '-')}`,
          image,
          itemIds: [],
          source: sourceFrom(item.name),
          createdAt: item.created_at ?? item.updated_at ?? new Date().toISOString(),
        }
      })
  } catch {
    return []
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  const origin = req.headers.origin ?? ''
  const allowed = ['https://daily-outfit-stylist.vercel.app', 'http://localhost:5173', 'http://localhost:4173']
  res.setHeader('Access-Control-Allow-Origin', allowed.includes(origin) ? origin : 'https://daily-outfit-stylist.vercel.app')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' })

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return res.status(503).json({ error: 'not_configured' })

  const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'missing_token' })

  const authClient = createClient(supabaseUrl, anonKey)
  const { data: userData, error: userError } = await authClient.auth.getUser(token)
  if (userError || !userData.user) return res.status(401).json({ error: 'invalid_token' })

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const userId = userData.user.id

  const chunks = await Promise.all([
    readTable(admin, 'styles', userId),
    readTable(admin, 'style_images', userId),
    readTable(admin, 'outfits', userId, 'daily-preview'),
    readTable(admin, 'outfit_suggestions', userId, 'daily-preview'),
    readStorage(admin, 'styles', userId),
  ])

  const seen = new Set<string>()
  const styles = chunks.flat().filter((style): style is NonNullable<typeof style> => {
    if (!style) return false
    const key = `${style.id}:${style.image}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 1000)

  return res.status(200).json({ ok: true, styles })
}
