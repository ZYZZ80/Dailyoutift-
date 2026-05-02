/**
 * Supabase cloud layer.
 * Postgres tables are the source of truth. Storage buckets hold images.
 * localStorage is only used as cache/import source.
 */
import type { ClothingItem, OutfitSuggestion, StyleImage } from '../types'
import type { AppConfig } from './storage'
import { supabase, SUPABASE_ENABLED } from './supabase'

// ─── Helpers ────────────────────────────────────────────────────────────────

function requireClient() {
  if (!SUPABASE_ENABLED || !supabase) throw new Error('Supabase is not configured')
  return supabase
}

async function base64ToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

/** Compress base64 image to Firestore-safe size as a fallback */
function compressForFallback(dataUrl: string, maxPx = 600, quality = 0.72): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxPx || height > maxPx) {
        if (width > height) { height = Math.round((height * maxPx) / width); width = maxPx }
        else { width = Math.round((width * maxPx) / height); height = maxPx }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

async function uploadToBucket(bucket: string, path: string, base64: string): Promise<string> {
  if (!base64.startsWith('data:')) return base64 // already a URL
  try {
    const client = requireClient()
    const blob = await base64ToBlob(base64)
    const { error } = await client.storage.from(bucket).upload(path, blob, {
      contentType: blob.type || 'image/jpeg',
      upsert: true,
    })
    if (error) throw error
    const { data } = client.storage.from(bucket).getPublicUrl(path)
    return data.publicUrl
  } catch {
    // Storage failed — fall back to inline base64 (compressed)
    return compressForFallback(base64)
  }
}

// ─── Image uploads ──────────────────────────────────────────────────────────

export async function uploadClothingImage(userId: string, itemId: string, base64: string): Promise<string> {
  return uploadToBucket('wardrobe', `${userId}/${itemId}.jpg`, base64)
}

export async function uploadProfilePhoto(userId: string, base64: string): Promise<string> {
  const id = crypto.randomUUID()
  return uploadToBucket('profile', `${userId}/${id}.jpg`, base64)
}

export async function uploadStyleImage(userId: string, styleId: string, base64: string): Promise<string> {
  return uploadToBucket('styles', `${userId}/${styleId}.jpg`, base64)
}

// ─── Wardrobe ───────────────────────────────────────────────────────────────

function rowToItem(row: Record<string, unknown>): ClothingItem {
  return {
    id: row.id as string,
    name: row.name as string,
    category: row.category as ClothingItem['category'],
    color: (row.color as string) ?? '',
    image: (row.image as string) ?? '',
    tags: (row.tags as string[]) ?? [],
    uploadedAt: (row.uploaded_at as string) ?? new Date().toISOString(),
    wearCount: (row.wear_count as number) ?? 0,
    lastWorn: (row.last_worn as string) ?? undefined,
  }
}

function itemToRow(userId: string, item: ClothingItem) {
  return {
    id: item.id,
    user_id: userId,
    name: item.name,
    category: item.category,
    color: item.color ?? '',
    image: item.image,
    tags: item.tags ?? [],
    uploaded_at: item.uploadedAt,
    wear_count: item.wearCount ?? 0,
    last_worn: item.lastWorn ?? null,
  }
}

export async function addItemCloud(userId: string, item: ClothingItem): Promise<void> {
  const client = requireClient()
  const { error } = await client.from('wardrobe_items').upsert(itemToRow(userId, item))
  if (error) throw error
}

export async function removeItemCloud(userId: string, itemId: string): Promise<void> {
  const client = requireClient()
  const { error } = await client.from('wardrobe_items').delete().eq('id', itemId).eq('user_id', userId)
  if (error) throw error
}

// ─── Outfits ────────────────────────────────────────────────────────────────

function rowToOutfit(row: Record<string, unknown>): OutfitSuggestion {
  return {
    id: row.id as string,
    date: row.date as string,
    itemIds: (row.item_ids as string[]) ?? [],
    description: (row.description as string) ?? '',
    styleNotes: (row.style_notes as string) ?? '',
    occasion: (row.occasion as string) ?? 'Casual',
    generatedAt: (row.generated_at as string) ?? new Date().toISOString(),
    previewImage: (row.preview_image as string) ?? undefined,
  }
}

function outfitToRow(userId: string, outfit: OutfitSuggestion) {
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

export async function saveOutfitCloud(userId: string, outfit: OutfitSuggestion): Promise<void> {
  const client = requireClient()
  const { error } = await client.from('outfits').upsert(outfitToRow(userId, outfit))
  if (error) throw error
}

// ─── Styles ─────────────────────────────────────────────────────────────────

function rowToStyle(row: Record<string, unknown>): StyleImage {
  return {
    id: row.id as string,
    image: row.image as string,
    itemIds: (row.item_ids as string[]) ?? [],
    outfitId: (row.outfit_id as string) ?? undefined,
    source: (row.source as StyleImage['source']) ?? 'daily-preview',
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
  }
}

function styleToRow(userId: string, style: StyleImage) {
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

export async function saveStyleCloud(userId: string, style: StyleImage): Promise<void> {
  const client = requireClient()
  const { error } = await client.from('styles').upsert(styleToRow(userId, style))
  if (error) throw error
}

export async function removeStyleCloud(userId: string, styleId: string): Promise<void> {
  const client = requireClient()
  const { error } = await client.from('styles').delete().eq('id', styleId).eq('user_id', userId)
  if (error) throw error
}

// ─── Settings ───────────────────────────────────────────────────────────────

export async function saveConfigCloud(userId: string, config: AppConfig): Promise<void> {
  const client = requireClient()
  const { error } = await client.from('user_settings').upsert({
    user_id: userId,
    provider: config.provider,
    api_key: config.apiKey,
    ollama_url: config.ollamaUrl,
    ollama_model: config.ollamaModel,
  })
  if (error) throw error
}

// ─── Bulk import ────────────────────────────────────────────────────────────

export async function importLocalWardrobeToCloud(userId: string, localItems: ClothingItem[]): Promise<number> {
  const valid = localItems.filter((item) => item.id && item.name)
  if (valid.length === 0) return 0
  const client = requireClient()
  const { error } = await client.from('wardrobe_items').upsert(valid.map((item) => itemToRow(userId, item)))
  if (error) throw error
  return valid.length
}

// ─── Realtime subscription ──────────────────────────────────────────────────

export interface UserDataSnapshot {
  wardrobe: ClothingItem[]
  outfits: OutfitSuggestion[]
  styles: StyleImage[]
}

export function subscribeToUserData(
  userId: string,
  onData: (data: Partial<UserDataSnapshot>) => void,
  onError?: (error: Error) => void,
): () => void {
  const client = requireClient()

  let cancelled = false

  // Initial fetch
  async function loadAll() {
    try {
      const [wardrobeRes, outfitsRes, stylesRes] = await Promise.all([
        client.from('wardrobe_items').select('*').eq('user_id', userId).order('uploaded_at', { ascending: false }),
        client.from('outfits').select('*').eq('user_id', userId).order('date', { ascending: false }).limit(90),
        client.from('styles').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
      ])
      if (cancelled) return
      onData({
        wardrobe: (wardrobeRes.data ?? []).map(rowToItem),
        outfits: (outfitsRes.data ?? []).map(rowToOutfit),
        styles: (stylesRes.data ?? []).map(rowToStyle),
      })
    } catch (e) {
      if (!cancelled) onError?.(e instanceof Error ? e : new Error(String(e)))
    }
  }

  loadAll()

  // Realtime subscriptions for live updates across devices
  const channel = client
    .channel(`user-data-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wardrobe_items', filter: `user_id=eq.${userId}` },
      () => { loadAll() })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'outfits', filter: `user_id=eq.${userId}` },
      () => { loadAll() })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'styles', filter: `user_id=eq.${userId}` },
      () => { loadAll() })
    .subscribe()

  return () => {
    cancelled = true
    client.removeChannel(channel)
  }
}
