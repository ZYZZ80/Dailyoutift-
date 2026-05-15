import { adminClient, cors, getUser, type ApiRequest, type ApiResponse } from './lib/account.js'

type AnyRow = Record<string, unknown>
type AdminClient = NonNullable<ReturnType<typeof adminClient>>

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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  cors(req, res, 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' })

  const auth = await getUser(req)
  if ('error' in auth) return res.status(auth.error === 'missing_token' ? 401 : 503).json({ error: auth.error })
  const admin = adminClient()
  if (!admin) return res.status(503).json({ error: 'not_configured' })
  const userId = auth.user.id

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
