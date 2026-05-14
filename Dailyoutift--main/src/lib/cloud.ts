/**
 * Cloud sync layer — Supabase Database + Storage
 * All functions are no-ops if Supabase is not configured.
 */
import { supabase, SUPABASE_ENABLED } from './supabase'
import type { ClothingItem, ClothingCategory } from '../types'
import type { AppConfig } from './storage'

// ── Helpers ──────────────────────────────────────────────────────────────────

async function base64ToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms)
  })
  try { return await Promise.race([promise, timeout]) }
  finally { if (timer) clearTimeout(timer) }
}

// ── Row mappers ───────────────────────────────────────────────────────────────

type DbRow = Record<string, unknown>

function toDbItem(userId: string, item: ClothingItem): DbRow {
  return {
    id: item.id,
    user_id: userId,
    name: item.name,
    category: item.category,
    color: item.color,
    image: item.image,
    tags: item.tags,
    uploaded_at: item.uploadedAt,
    wear_count: item.wearCount ?? 0,
    last_worn: item.lastWorn ?? null,
  }
}

function fromDbItem(row: DbRow): ClothingItem {
  return {
    id: row.id as string,
    name: row.name as string,
    category: row.category as ClothingCategory,
    color: (row.color as string) ?? '',
    image: (row.image as string) ?? '',
    tags: (row.tags as string[]) ?? [],
    uploadedAt: (row.uploaded_at as string) ?? new Date().toISOString(),
    wearCount: (row.wear_count as number) ?? 0,
    lastWorn: row.last_worn as string | undefined,
  }
}

function toDbOutfit(userId: string, outfit: import('../types').OutfitSuggestion): DbRow {
  return {
    id: outfit.id,
    user_id: userId,
    date: outfit.date,
    item_ids: outfit.itemIds,
    description: outfit.description,
    style_notes: outfit.styleNotes,
    occasion: outfit.occasion,
    generated_at: outfit.generatedAt,
    preview_image: outfit.previewImage ?? null,
  }
}

function fromDbOutfit(row: DbRow): import('../types').OutfitSuggestion {
  return {
    id: row.id as string,
    date: row.date as string,
    itemIds: (row.item_ids as string[]) ?? [],
    description: (row.description as string) ?? '',
    styleNotes: (row.style_notes as string) ?? '',
    occasion: (row.occasion as string) ?? 'Casual',
    generatedAt: (row.generated_at as string) ?? new Date().toISOString(),
    previewImage: row.preview_image as string | undefined,
  }
}

function toDbConfig(userId: string, config: AppConfig): DbRow {
  return {
    user_id: userId,
    provider: config.provider,
    api_key: config.apiKey,
    ollama_url: config.ollamaUrl,
    ollama_model: config.ollamaModel,
  }
}

function fromDbConfig(row: DbRow): AppConfig {
  return {
    provider: (row.provider as AppConfig['provider']) ?? 'proxy',
    apiKey: (row.api_key as string) ?? '',
    ollamaUrl: (row.ollama_url as string) ?? 'http://localhost:11434',
    ollamaModel: (row.ollama_model as string) ?? 'moondream',
  }
}

// ── Image upload ──────────────────────────────────────────────────────────────

/** Upload a clothing item image to Storage. Returns public URL (or original base64 on failure). */
export async function uploadClothingImage(
  userId: string,
  itemId: string,
  base64: string,
): Promise<string> {
  if (!SUPABASE_ENABLED || !supabase) return base64
  const blob = await base64ToBlob(base64)
  const path = `${userId}/${itemId}.jpg`
  try {
    const upload = supabase.storage.from('wardrobe').upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: true,
    })
    await withTimeout(upload, 15000, 'Image upload')
    const { data } = supabase.storage.from('wardrobe').getPublicUrl(path)
    return data.publicUrl
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`Supabase Storage failed: ${msg}`)
  }
}

/** Upload profile photo. Returns public URL. */
export async function uploadProfilePhoto(userId: string, base64: string): Promise<string> {
  if (!SUPABASE_ENABLED || !supabase) return base64
  const blob = await base64ToBlob(base64)
  const path = `${userId}/profile.jpg`
  try {
    const upload = supabase.storage.from('profile').upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: true,
    })
    await withTimeout(upload, 15000, 'Profile upload')
    const { data } = supabase.storage.from('profile').getPublicUrl(path)
    return data.publicUrl
  } catch {
    return base64
  }
}

/** Get profile photo public URL from Storage. */
export async function getProfilePhotoCloud(userId: string): Promise<string> {
  if (!SUPABASE_ENABLED || !supabase) return ''
  try {
    const { data } = supabase.storage.from('profile').getPublicUrl(`${userId}/profile.jpg`)
    // Verify the object exists with a lightweight HEAD request
    const res = await fetch(data.publicUrl, { method: 'HEAD' })
    return res.ok ? data.publicUrl : ''
  } catch {
    return ''
  }
}

/** Upload generated style / try-on image to Storage. Returns public URL. */
export async function uploadStylePreviewImage(
  userId: string,
  outfitId: string,
  imageDataUrl: string,
): Promise<string> {
  if (!SUPABASE_ENABLED || !supabase) return imageDataUrl
  if (!imageDataUrl.startsWith('data:')) return imageDataUrl
  const blob = await base64ToBlob(imageDataUrl)
  const path = `${userId}/${outfitId}.png`
  try {
    const upload = supabase.storage.from('styles').upload(path, blob, {
      contentType: blob.type || 'image/png',
      upsert: true,
    })
    await withTimeout(upload, 20000, 'Style image upload')
    const { data } = supabase.storage.from('styles').getPublicUrl(path)
    return data.publicUrl
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`Style image upload failed: ${msg}`)
  }
}

/** Upload a try-on result image to the styles Storage bucket. Returns public URL (or original on failure). */
export async function uploadStyleImage(
  userId: string,
  styleId: string,
  imageDataUrl: string,
): Promise<string> {
  if (!SUPABASE_ENABLED || !supabase) return imageDataUrl
  if (!imageDataUrl.startsWith('data:')) return imageDataUrl
  const blob = await base64ToBlob(imageDataUrl)
  const path = `${userId}/${styleId}.png`
  try {
    const upload = supabase.storage.from('styles').upload(path, blob, {
      contentType: 'image/png',
      upsert: true,
    })
    await withTimeout(upload, 20000, 'Style image upload')
    const { data } = supabase.storage.from('styles').getPublicUrl(path)
    return data.publicUrl
  } catch {
    return imageDataUrl
  }
}

/** Fetch try-on style images from the styles table. */
export async function getStylesCloud(userId: string): Promise<import('../types').StyleImage[]> {
  if (!SUPABASE_ENABLED || !supabase) return []
  const { data } = await supabase
    .from('styles')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  return (data ?? []).map((row) => ({
    id: row.id as string,
    image: (row.image as string) ?? '',
    itemIds: (row.item_ids as string[]) ?? [],
    outfitId: row.outfit_id as string | undefined,
    source: (row.source as string) ?? 'try-on',
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
  }))
}

/** Save a try-on style result to the styles table. */
export async function saveStyleCloud(
  userId: string,
  style: import('../types').StyleImage,
): Promise<void> {
  if (!SUPABASE_ENABLED || !supabase) return
  await supabase.from('styles').upsert({
    id: style.id,
    user_id: userId,
    image: style.image,
    item_ids: style.itemIds,
    outfit_id: style.outfitId ?? null,
    source: style.source,
    created_at: style.createdAt,
  })
}

// ── Wardrobe ──────────────────────────────────────────────────────────────────

/** Save a wardrobe item to the DB, uploading any base64 image to Storage first.
 *  Returns the item with the final image URL (Supabase public URL or original). */
export async function addItemCloud(userId: string, item: ClothingItem): Promise<ClothingItem> {
  if (!SUPABASE_ENABLED || !supabase) return item
  let savedItem = item
  // If the image is still base64, upload it to the wardrobe Storage bucket first
  if (item.image.startsWith('data:')) {
    try {
      const url = await uploadClothingImage(userId, item.id, item.image)
      savedItem = { ...item, image: url }
    } catch { /* keep base64 if Storage upload fails */ }
  }
  await supabase.from('wardrobe_items').upsert(toDbItem(userId, savedItem))
  return savedItem
}

export async function removeItemCloud(userId: string, itemId: string): Promise<void> {
  if (!SUPABASE_ENABLED || !supabase) return
  await supabase.from('wardrobe_items').delete().eq('id', itemId).eq('user_id', userId)
}

export async function getWardrobeCloud(userId: string): Promise<ClothingItem[]> {
  if (!SUPABASE_ENABLED || !supabase) return []
  const { data } = await supabase.from('wardrobe_items').select('*').eq('user_id', userId)
  return (data ?? []).map(fromDbItem)
}

// ── Outfits ───────────────────────────────────────────────────────────────────

export async function saveOutfitCloud(
  userId: string,
  outfit: import('../types').OutfitSuggestion,
): Promise<void> {
  if (!SUPABASE_ENABLED || !supabase) return
  await supabase.from('outfits').upsert(toDbOutfit(userId, outfit))
}

export async function getOutfitsCloud(
  userId: string,
): Promise<import('../types').OutfitSuggestion[]> {
  if (!SUPABASE_ENABLED || !supabase) return []
  const { data } = await supabase
    .from('outfits')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(90)
  return (data ?? []).map(fromDbOutfit)
}

// ── Config ────────────────────────────────────────────────────────────────────

export async function saveConfigCloud(userId: string, config: AppConfig): Promise<void> {
  if (!SUPABASE_ENABLED || !supabase) return
  await supabase.from('user_settings').upsert(toDbConfig(userId, config))
}

export async function getConfigCloud(userId: string): Promise<AppConfig | null> {
  if (!SUPABASE_ENABLED || !supabase) return null
  const { data } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single()
  return data ? fromDbConfig(data as DbRow) : null
}

// ── Full sync (cloud → local) ─────────────────────────────────────────────────

export interface CloudSnapshot {
  wardrobe: ClothingItem[]
  outfits: import('../types').OutfitSuggestion[]
  config: AppConfig | null
  profilePhoto: string
}

export async function syncFromCloud(userId: string): Promise<CloudSnapshot> {
  const [wardrobe, outfits, config, profilePhoto] = await Promise.all([
    getWardrobeCloud(userId),
    getOutfitsCloud(userId),
    getConfigCloud(userId),
    getProfilePhotoCloud(userId),
  ])
  return { wardrobe, outfits, config, profilePhoto }
}

// ── Live sync (same account across PC / iPad) ─────────────────────────────────

export function subscribeToCloud(
  userId: string,
  onData: (snapshot: CloudSnapshot) => void,
): () => void {
  if (!SUPABASE_ENABLED || !supabase) return () => {}
  const sb = supabase

  let wardrobe: ClothingItem[] = []
  let outfits: import('../types').OutfitSuggestion[] = []
  let config: AppConfig | null = null
  let profilePhoto = ''
  let wardrobeLoaded = false
  let outfitsLoaded = false

  const emit = () => {
    if (!wardrobeLoaded || !outfitsLoaded) return
    onData({ wardrobe, outfits, config, profilePhoto })
  }

  const channel = sb
    .channel(`user-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'wardrobe_items', filter: `user_id=eq.${userId}` },
      async () => {
        wardrobe = await getWardrobeCloud(userId)
        wardrobeLoaded = true
        emit()
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'outfits', filter: `user_id=eq.${userId}` },
      async () => {
        outfits = await getOutfitsCloud(userId)
        outfitsLoaded = true
        emit()
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'user_settings', filter: `user_id=eq.${userId}` },
      async () => {
        config = await getConfigCloud(userId)
        emit()
      },
    )
    .subscribe(async () => {
      // Initial load once channel is ready
      wardrobe = await getWardrobeCloud(userId)
      wardrobeLoaded = true
      outfits = await getOutfitsCloud(userId)
      outfitsLoaded = true
      config = await getConfigCloud(userId)
      profilePhoto = await getProfilePhotoCloud(userId)
      emit()
    })

  return () => { sb.removeChannel(channel) }
}
