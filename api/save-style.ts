import { adminClient, cors, getUser, type ApiRequest, type ApiResponse } from './lib/account.js'

type StyleSource = 'daily-preview' | 'outfit-builder' | 'try-on' | 'imported'

interface SaveStyleBody {
  style?: {
    id?: string
    image?: string
    itemIds?: string[]
    outfitId?: string
    source?: StyleSource
    createdAt?: string
  }
}

function isSchemaCacheError(error: { message?: string; code?: string } | null | undefined) {
  const message = String(error?.message ?? '').toLowerCase()
  return (
    message.includes('does not exist') ||
    message.includes('could not find') ||
    message.includes('schema cache') ||
    error?.code === '42P01' ||
    error?.code === 'PGRST204'
  )
}

function dataUrlToBuffer(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/)
  if (!match) throw new Error('invalid_data_url')
  const mimeType = match[1] || 'image/jpeg'
  const body = match[3] || ''
  const buffer = match[2] ? Buffer.from(body, 'base64') : Buffer.from(decodeURIComponent(body))
  return { buffer, mimeType }
}

async function ensureStylesBucket(admin: NonNullable<ReturnType<typeof adminClient>>) {
  const { error } = await admin.storage.createBucket('styles', { public: true })
  if (error && !error.message.toLowerCase().includes('already exists')) throw error
}

export default async function handler(req: ApiRequest<SaveStyleBody>, res: ApiResponse) {
  cors(req, res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const auth = await getUser(req)
  if ('error' in auth) return res.status(auth.error === 'missing_token' ? 401 : 503).json({ error: auth.error })

  const admin = adminClient()
  if (!admin) return res.status(503).json({ error: 'not_configured' })

  const userId = auth.user.id
  const input = req.body?.style
  const id = input?.id || crypto.randomUUID()
  const image = input?.image || ''
  const source: StyleSource = input?.source || 'daily-preview'
  if (!image) return res.status(400).json({ error: 'missing_image' })

  try {
    let finalImage = image
    if (image.startsWith('data:')) {
      await ensureStylesBucket(admin)
      const { buffer, mimeType } = dataUrlToBuffer(image)
      const path = `${userId}/${id}.jpg`
      const { error: uploadError } = await admin.storage.from('styles').upload(path, buffer, {
        upsert: true,
        contentType: mimeType || 'image/jpeg',
        cacheControl: '31536000',
      })
      if (uploadError) throw uploadError
      finalImage = admin.storage.from('styles').getPublicUrl(path).data.publicUrl
    }

    const style = {
      id,
      image: finalImage,
      itemIds: Array.isArray(input?.itemIds) ? input.itemIds.map(String) : [],
      outfitId: input?.outfitId || undefined,
      source,
      createdAt: input?.createdAt || new Date().toISOString(),
    }
    const row = {
      id: style.id,
      user_id: userId,
      image: style.image,
      item_ids: style.itemIds,
      outfit_id: style.outfitId ?? null,
      source: style.source,
      created_at: style.createdAt,
    }

    const { error } = await admin.from('styles').upsert(row)
    if (error) {
      if (!isSchemaCacheError(error)) throw error
      const legacy = await admin.from('style_images').upsert(row)
      if (legacy.error) throw legacy.error
    }

    return res.status(200).json({ ok: true, style })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ error: 'save_style_failed', details: message.substring(0, 180) })
  }
}
