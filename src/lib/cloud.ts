import { supabase, SUPABASE_ENABLED } from './supabase'
import type { ClothingItem, OutfitSuggestion, StyleImage } from '../types'
import type { AppConfig } from './storage'

export interface UserData {
  wardrobe?: ClothingItem[]
  outfits?: OutfitSuggestion[]
  styles?: StyleImage[]
  profilePhotos?: string[]
}

const TABLES = {
  wardrobe: 'wardrobe_items',
  outfits: 'outfits',
  styles: 'styles',
  settings: 'user_settings',
} as const

const LEGACY_TABLES = {
  outfits: 'outfit_suggestions',
  styles: 'style_images',
  settings: 'user_config',
} as const

const BUCKETS = {
  wardrobe: 'wardrobe',
  styles: 'styles',
  profile: 'profile',
} as const

function requireSupabase() {
  if (!SUPABASE_ENABLED || !supabase) throw new Error('Supabase is not configured.')
  return supabase
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  if (!dataUrl.startsWith('data:') && !dataUrl.startsWith('blob:')) throw new Error('Expected a data URL image.')
  const res = await fetch(dataUrl)
  return res.blob()
}

async function uploadImage(bucket: string, path: string, dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith('data:') && !dataUrl.startsWith('blob:')) return dataUrl
  const client = requireSupabase()
  const blob = await dataUrlToBlob(dataUrl)
  const { error } = await client.storage
    .from(bucket)
    .upload(path, blob, {
      upsert: true,
      contentType: blob.type || 'image/jpeg',
      cacheControl: '31536000',
    })
  if (error) throw new Error(`Supabase Storage upload failed (${bucket}): ${error.message}`)
  return client.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

export async function uploadClothingImage(userId: string, itemId: string, base64: string): Promise<string> {
  return uploadImage(BUCKETS.wardrobe, `${userId}/${itemId}.jpg`, base64)
}

export async function uploadStyleImage(userId: string, imageId: string, base64: string): Promise<string> {
  return uploadImage(BUCKETS.styles, `${userId}/${imageId}.jpg`, base64)
}

export async function uploadProfilePhoto(userId: string, base64: string, photoId: string = crypto.randomUUID()): Promise<string> {
  const url = await uploadImage(BUCKETS.profile, `${userId}/${photoId}.jpg`, base64)
  return url.startsWith('data:') ? url : `${url}?t=${Date.now()}`
}

export async function saveProfilePhotosCloud(userId: string, photos: string[]): Promise<void> {
  if (!SUPABASE_ENABLED || !supabase) return
  const urls = photos.filter(Boolean).slice(0, 5)
  const { error } = await supabase.from(TABLES.settings).upsert({
    user_id: userId,
    profile_photos: urls,
  })
  if (error) throw new Error(error.message)
}

function itemToRow(item: ClothingItem, userId: string) {
  return {
    id: item.id,
    user_id: userId,
    name: item.name,
    category: item.category,
    color: item.color || '',
    image: item.image,
    tags: item.tags,
    wear_count: item.wearCount ?? 0,
    last_worn: item.lastWorn ?? null,
    uploaded_at: item.uploadedAt,
  }
}

function rowToItem(row: Record<string, unknown>): ClothingItem {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    category: row.category as ClothingItem['category'],
    color: String(row.color ?? ''),
    image: String(row.image ?? ''),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    uploadedAt: String(row.uploaded_at ?? new Date().toISOString()),
    wearCount: Number(row.wear_count ?? 0),
    lastWorn: row.last_worn ? String(row.last_worn) : undefined,
  }
}

function outfitToRow(outfit: OutfitSuggestion, userId: string) {
  return {
    id: outfit.id,
    user_id: userId,
    date: outfit.date,
    item_ids: outfit.itemIds,
    description: outfit.description,
    style_notes: outfit.styleNotes,
    occasion: outfit.occasion,
    preview_image: outfit.previewImage ?? null,
    generated_at: outfit.generatedAt,
  }
}

function rowToOutfit(row: Record<string, unknown>): OutfitSuggestion {
  return {
    id: String(row.id),
    date: String(row.date),
    itemIds: Array.isArray(row.item_ids) ? row.item_ids.map(String) : [],
    description: String(row.description ?? ''),
    styleNotes: String(row.style_notes ?? ''),
    occasion: String(row.occasion ?? 'Casual'),
    generatedAt: String(row.generated_at ?? new Date().toISOString()),
    previewImage: row.preview_image ? String(row.preview_image) : undefined,
  }
}

function styleToRow(style: StyleImage, userId: string) {
  return {
    id: style.id,
    user_id: userId,
    image: style.image,
    item_ids: style.itemIds,
    outfit_id: style.outfitId ?? null,
    source: style.source,
    created_at: style.createdAt,
  }
}

function storageStyleUrl(userId: string, styleId: string) {
  if (!supabase || !userId || !styleId) return ''
  return supabase.storage.from(BUCKETS.styles).getPublicUrl(`${userId}/${styleId}.jpg`).data.publicUrl
}

function isLikelyExpiredImageUrl(value: string) {
  const lower = value.toLowerCase()
  return (
    lower.includes('oaidalleapiprod') ||
    lower.includes('blob.core.windows.net') ||
    lower.includes('filesystem.site') ||
    lower.includes('openai.com') && lower.includes('expires')
  )
}

function rowToStyle(row: Record<string, unknown>): StyleImage {
  const rawSource = String(row.source ?? row.type ?? row.kind ?? 'daily-preview')
  const source: StyleImage['source'] =
    rawSource === 'outfit-builder' || rawSource === 'try-on' || rawSource === 'daily-preview' || rawSource === 'tryon'
      ? (rawSource === 'tryon' ? 'try-on' : rawSource)
      : 'daily-preview'
  const id = String(row.id)
  const userId = String(row.user_id ?? row.userId ?? '')
  const rawImage = String(row.image ?? row.image_url ?? row.imageUrl ?? row.url ?? row.preview_image ?? row.previewImage ?? row.generated_image ?? row.generatedImage ?? row.imageBase64 ?? row.result ?? '')
  const image = !rawImage || isLikelyExpiredImageUrl(rawImage) ? storageStyleUrl(userId, id) || rawImage : rawImage
  const itemIds = row.item_ids ?? row.itemIds ?? row.items

  return {
    id,
    image,
    itemIds: Array.isArray(itemIds) ? itemIds.map((item) => typeof item === 'object' && item && 'id' in item ? String((item as { id: unknown }).id) : String(item)) : [],
    outfitId: row.outfit_id || row.outfitId ? String(row.outfit_id ?? row.outfitId) : undefined,
    source,
    createdAt: String(row.created_at ?? row.createdAt ?? row.generated_at ?? row.generatedAt ?? row.date ?? new Date().toISOString()),
  }
}

function mergeById<T extends { id: string }>(primary: T[], legacy: T[]): T[] {
  const seen = new Set<string>()
  return [...primary, ...legacy].filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function mergeOutfitsByDate(outfits: OutfitSuggestion[]): OutfitSuggestion[] {
  const byDate = new Map<string, OutfitSuggestion>()
  outfits.forEach((outfit) => {
    const current = byDate.get(outfit.date)
    if (!current || outfit.generatedAt > current.generatedAt) byDate.set(outfit.date, outfit)
  })
  return [...byDate.values()]
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function normalizeWardrobeForCloud(items: ClothingItem[]) {
  const idMap: Record<string, string> = {}
  const normalized = items.map((item) => {
    if (isUuid(item.id)) return item
    const id = crypto.randomUUID()
    idMap[item.id] = id
    return { ...item, id }
  })
  return { items: normalized, idMap }
}

function normalizeRecordIdsForCloud<T extends { id: string }>(items: T[]) {
  const idMap: Record<string, string> = {}
  const normalized = items.map((item) => {
    if (isUuid(item.id)) return item
    const id = crypto.randomUUID()
    idMap[item.id] = id
    return { ...item, id }
  })
  return { items: normalized, idMap }
}

export interface WardrobeImportResult {
  count: number
  items: ClothingItem[]
  idMap: Record<string, string>
}

export interface CloudImportResult<T> {
  count: number
  items: T[]
  idMap: Record<string, string>
}

async function fetchRows(table: string, userId: string, orderColumn: string, limit?: number) {
  if (!supabase) return []
  let query = supabase.from(table).select('*').eq('user_id', userId).order(orderColumn, { ascending: false })
  if (limit) query = query.limit(limit)
  const { data, error } = await query
  if (error) {
    if (isSchemaCacheError(error)) return []
    throw new Error(error.message)
  }
  return (data ?? []) as Record<string, unknown>[]
}

async function fetchSettingsRow(userId: string) {
  if (!supabase) return null
  const current = await supabase.from(TABLES.settings).select('*').eq('user_id', userId).maybeSingle()
  if (!current.error && current.data) return current.data as Record<string, unknown>
  if (current.error && !isSchemaCacheError(current.error)) throw new Error(current.error.message)
  const legacy = await supabase.from(LEGACY_TABLES.settings).select('*').eq('user_id', userId).maybeSingle()
  if (!legacy.error && legacy.data) return legacy.data as Record<string, unknown>
  if (legacy.error && !isSchemaCacheError(legacy.error)) throw new Error(legacy.error.message)
  return null
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

async function recoverStylesFromServer(): Promise<StyleImage[]> {
  if (!SUPABASE_ENABLED || !supabase) return []
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return []
  try {
    const res = await fetch('/api/recover-styles', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return []
    const json = await res.json() as { styles?: StyleImage[] }
    return (json.styles ?? []).filter((style) => style.image)
  } catch {
    return []
  }
}

export async function addItemCloud(userId: string, item: ClothingItem): Promise<void> {
  if (!SUPABASE_ENABLED || !supabase) return
  const { error } = await supabase.from(TABLES.wardrobe).upsert(itemToRow(item, userId))
  if (error) throw new Error(error.message)
}

export async function removeItemCloud(userId: string, itemId: string): Promise<void> {
  if (!SUPABASE_ENABLED || !supabase) return
  const { error } = await supabase.from(TABLES.wardrobe).delete().eq('id', itemId).eq('user_id', userId)
  if (error) throw new Error(error.message)
}

export async function importLocalWardrobeToCloud(userId: string, items: ClothingItem[]): Promise<WardrobeImportResult> {
  if (!SUPABASE_ENABLED || !supabase || items.length === 0) return { count: 0, items: [], idMap: {} }
  const normalized = normalizeWardrobeForCloud(items)
  const { error } = await supabase.from(TABLES.wardrobe).upsert(normalized.items.map((item) => itemToRow(item, userId)))
  if (error) throw new Error(error.message)
  return { count: normalized.items.length, items: normalized.items, idMap: normalized.idMap }
}

export async function importLocalOutfitsToCloud(userId: string, outfits: OutfitSuggestion[]): Promise<CloudImportResult<OutfitSuggestion>> {
  if (!SUPABASE_ENABLED || !supabase || outfits.length === 0) return { count: 0, items: [], idMap: {} }
  const idNormalized = normalizeRecordIdsForCloud(outfits)
  const normalized = await Promise.all(idNormalized.items.map(async (outfit) => {
    if (!outfit.previewImage || (!outfit.previewImage.startsWith('data:') && !outfit.previewImage.startsWith('blob:'))) return outfit
    const imageUrl = await uploadStyleImage(userId, `outfit-${outfit.id}`, outfit.previewImage)
    return { ...outfit, previewImage: imageUrl }
  }))
  const rows = normalized.map((outfit) => outfitToRow(outfit, userId))
  const { error } = await supabase.from(TABLES.outfits).upsert(rows)
  if (error) {
    if (!isSchemaCacheError(error)) throw new Error(error.message)
    const legacy = await supabase.from(LEGACY_TABLES.outfits).upsert(rows)
    if (legacy.error) throw new Error(legacy.error.message)
  }
  return { count: normalized.length, items: normalized, idMap: idNormalized.idMap }
}

export async function importLocalStylesToCloud(userId: string, styles: StyleImage[]): Promise<CloudImportResult<StyleImage>> {
  if (!SUPABASE_ENABLED || !supabase || styles.length === 0) return { count: 0, items: [], idMap: {} }
  const withImages = styles.filter((style) => style.image)
  const idNormalized = normalizeRecordIdsForCloud(withImages)
  const normalized = await Promise.all(idNormalized.items.map(async (style) => {
    const image = style.image.startsWith('data:') || style.image.startsWith('blob:')
      ? await uploadStyleImage(userId, style.id, style.image)
      : style.image
    return { ...style, image }
  }))
  if (normalized.length === 0) return { count: 0, items: [], idMap: {} }
  const rows = normalized.map((style) => styleToRow(style, userId))
  const { error } = await supabase.from(TABLES.styles).upsert(rows)
  if (error) {
    if (!isSchemaCacheError(error)) throw new Error(error.message)
    const legacy = await supabase.from(LEGACY_TABLES.styles).upsert(rows)
    if (legacy.error) throw new Error(legacy.error.message)
  }
  return { count: normalized.length, items: normalized, idMap: idNormalized.idMap }
}

export async function saveOutfitCloud(userId: string, outfit: OutfitSuggestion): Promise<void> {
  if (!SUPABASE_ENABLED || !supabase) return
  const row = outfitToRow(outfit, userId)
  const { error } = await supabase.from(TABLES.outfits).upsert(row)
  if (error) {
    if (!isSchemaCacheError(error)) throw new Error(error.message)
    const legacy = await supabase.from(LEGACY_TABLES.outfits).upsert(row)
    if (legacy.error) throw new Error(legacy.error.message)
  }
}

export async function saveStyleCloud(userId: string, style: StyleImage): Promise<void> {
  if (!SUPABASE_ENABLED || !supabase) return
  const cloudStyle = style.image.startsWith('data:') || style.image.startsWith('blob:')
    ? { ...style, image: await uploadStyleImage(userId, style.id, style.image) }
    : style
  const row = styleToRow(cloudStyle, userId)
  const { error } = await supabase.from(TABLES.styles).upsert(row)
  if (error) {
    if (!isSchemaCacheError(error)) throw new Error(error.message)
    const legacy = await supabase.from(LEGACY_TABLES.styles).upsert(row)
    if (legacy.error) throw new Error(legacy.error.message)
  }
}

export async function removeStyleCloud(userId: string, styleId: string): Promise<void> {
  if (!SUPABASE_ENABLED || !supabase) return
  const [current, legacy] = await Promise.all([
    supabase.from(TABLES.styles).delete().eq('id', styleId).eq('user_id', userId),
    supabase.from(LEGACY_TABLES.styles).delete().eq('id', styleId).eq('user_id', userId),
  ])
  const realErrors = [current.error, legacy.error].filter((error) => {
    if (!error) return false
    return !isSchemaCacheError(error)
  })
  if (realErrors[0]) throw new Error(realErrors[0].message)
}

export async function clearOutfitPreviewCloud(userId: string, outfitId: string): Promise<void> {
  if (!SUPABASE_ENABLED || !supabase) return
  const [current, legacy] = await Promise.all([
    supabase.from(TABLES.outfits).update({ preview_image: null }).eq('id', outfitId).eq('user_id', userId),
    supabase.from(LEGACY_TABLES.outfits).update({ preview_image: null }).eq('id', outfitId).eq('user_id', userId),
  ])
  const realErrors = [current.error, legacy.error].filter((error) => {
    if (!error) return false
    return !isSchemaCacheError(error)
  })
  if (realErrors[0]) throw new Error(realErrors[0].message)
}

export async function saveConfigCloud(userId: string, config: AppConfig): Promise<void> {
  if (!SUPABASE_ENABLED || !supabase) return
  const { error } = await supabase.from(TABLES.settings).upsert({
    user_id: userId,
    provider: config.provider,
    api_key: config.apiKey,
    ollama_url: config.ollamaUrl,
    ollama_model: config.ollamaModel,
  })
  if (error) throw new Error(error.message)
}

export async function getConfigCloud(userId: string): Promise<AppConfig | null> {
  if (!SUPABASE_ENABLED || !supabase) return null
  const fetchConfig = async (table: string) => {
    const { data, error } = await supabase!
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) {
      if (error.message.toLowerCase().includes('does not exist') || error.code === '42P01') return null
      throw new Error(error.message)
    }
    return data
  }
  const data = await fetchConfig(TABLES.settings) ?? await fetchConfig(LEGACY_TABLES.settings)
  if (!data) return null
  return {
    provider: data.provider,
    apiKey: data.api_key,
    ollamaUrl: data.ollama_url,
    ollamaModel: data.ollama_model,
  }
}

export function subscribeToUserData(
  userId: string,
  onData: (data: UserData) => void,
  onError: (err: Error) => void,
): () => void {
  if (!SUPABASE_ENABLED || !supabase) {
    onError(new Error('Supabase not configured'))
    return () => {}
  }

  let disposed = false
  let refreshTimer: ReturnType<typeof setTimeout> | null = null

  async function fetchAll() {
    try {
      const [wardrobeRows, outfitRows, legacyOutfitRows, styleRows, legacyStyleRows, recoveredStyles, settingsRow] = await Promise.all([
        fetchRows(TABLES.wardrobe, userId, 'uploaded_at'),
        fetchRows(TABLES.outfits, userId, 'date', 90),
        fetchRows(LEGACY_TABLES.outfits, userId, 'date', 90),
        fetchRows(TABLES.styles, userId, 'created_at', 1000),
        fetchRows(LEGACY_TABLES.styles, userId, 'created_at', 1000),
        recoverStylesFromServer(),
        fetchSettingsRow(userId),
      ])
      const outfits = mergeOutfitsByDate(mergeById(outfitRows.map(rowToOutfit), legacyOutfitRows.map(rowToOutfit)))
        .sort((a, b) => b.date.localeCompare(a.date) || b.generatedAt.localeCompare(a.generatedAt))
        .slice(0, 90)
      const styles = mergeById(mergeById(styleRows.map(rowToStyle), legacyStyleRows.map(rowToStyle)), recoveredStyles)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 1000)
      if (disposed) return
      onData({
        wardrobe: wardrobeRows.map(rowToItem),
        outfits,
        styles,
        profilePhotos: Array.isArray(settingsRow?.profile_photos) ? settingsRow.profile_photos.map(String).filter(Boolean) : [],
      })
    } catch (error) {
      if (!disposed) onError(error instanceof Error ? error : new Error(String(error)))
    }
  }

  const scheduleFetchAll = () => {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(fetchAll, 150)
  }

  fetchAll()

  const channel = supabase
    .channel(`user-data-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.wardrobe, filter: `user_id=eq.${userId}` }, scheduleFetchAll)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.outfits, filter: `user_id=eq.${userId}` }, scheduleFetchAll)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.styles, filter: `user_id=eq.${userId}` }, scheduleFetchAll)
    .on('postgres_changes', { event: '*', schema: 'public', table: LEGACY_TABLES.outfits, filter: `user_id=eq.${userId}` }, scheduleFetchAll)
    .on('postgres_changes', { event: '*', schema: 'public', table: LEGACY_TABLES.styles, filter: `user_id=eq.${userId}` }, scheduleFetchAll)
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError(new Error(`Supabase realtime ${status.toLowerCase().replace('_', ' ')}`))
      }
    })

  return () => {
    disposed = true
    if (refreshTimer) clearTimeout(refreshTimer)
    supabase!.removeChannel(channel)
  }
}
