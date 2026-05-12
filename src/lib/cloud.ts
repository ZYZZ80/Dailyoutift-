/**
 * Cloud sync — Supabase Postgres + Storage
 * All functions are no-ops when Supabase is not configured.
 */
import { supabase, SUPABASE_ENABLED } from './supabase'
import type { ClothingItem, OutfitSuggestion, StyleImage } from '../types'
import type { AppConfig } from './storage'

export interface UserData {
  wardrobe?: ClothingItem[]
  outfits?: OutfitSuggestion[]
  styles?: StyleImage[]
}

// ── Image upload ──────────────────────────────────────────────────────────────

export async function uploadClothingImage(
  userId: string,
  itemId: string,
  base64: string,
): Promise<string> {
  if (!SUPABASE_ENABLED || !supabase) return base64
  try {
    const res = await fetch(base64)
    const blob = await res.blob()
    const ext = blob.type === 'image/png' ? 'png' : 'jpg'
    const path = `${userId}/${itemId}.${ext}`
    const { error } = await supabase.storage
      .from('wardrobe-images')
      .upload(path, blob, { upsert: true, contentType: blob.type })
    if (error) return base64
    return supabase.storage.from('wardrobe-images').getPublicUrl(path).data.publicUrl
  } catch {
    return base64
  }
}

/** Upload any generated style/try-on image to storage. Returns public URL. */
export async function uploadStyleImage(userId: string, imageId: string, base64: string): Promise<string> {
  if (!SUPABASE_ENABLED || !supabase) return base64
  try {
    const res = await fetch(base64)
    const blob = await res.blob()
    const path = `${userId}/${imageId}.jpg`
    const { error } = await supabase.storage
      .from('style-images')
      .upload(path, blob, { upsert: true, contentType: blob.type })
    if (error) return base64
    return supabase.storage.from('style-images').getPublicUrl(path).data.publicUrl
  } catch {
    return base64
  }
}

export async function uploadProfilePhoto(userId: string, base64: string): Promise<string> {
  if (!SUPABASE_ENABLED || !supabase) return base64
  try {
    const res = await fetch(base64)
    const blob = await res.blob()
    const path = `${userId}/profile.jpg`
    const { error } = await supabase.storage
      .from('profile-photos')
      .upload(path, blob, { upsert: true, contentType: blob.type })
    if (error) return base64
    // Cache-bust so new photo appears immediately
    const url = supabase.storage.from('profile-photos').getPublicUrl(path).data.publicUrl
    return `${url}?t=${Date.now()}`
  } catch {
    return base64
  }
}

// ── Row converters ────────────────────────────────────────────────────────────

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToItem(row: any): ClothingItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    color: row.color || '',
    image: row.image,
    tags: row.tags ?? [],
    uploadedAt: row.uploaded_at,
    wearCount: row.wear_count ?? 0,
    lastWorn: row.last_worn ?? undefined,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToOutfit(row: any): OutfitSuggestion {
  return {
    id: row.id,
    date: row.date,
    itemIds: row.item_ids ?? [],
    description: row.description || '',
    styleNotes: row.style_notes || '',
    occasion: row.occasion || 'Casual',
    generatedAt: row.generated_at,
    previewImage: row.preview_image ?? undefined,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToStyle(row: any): StyleImage {
  return {
    id: row.id,
    image: row.image,
    itemIds: row.item_ids ?? [],
    outfitId: row.outfit_id ?? undefined,
    source: row.source,
    createdAt: row.created_at,
  }
}

// ── Wardrobe ──────────────────────────────────────────────────────────────────

export async function addItemCloud(userId: string, item: ClothingItem): Promise<void> {
  if (!SUPABASE_ENABLED || !supabase) return
  const { error } = await supabase.from('wardrobe_items').upsert(itemToRow(item, userId))
  if (error) throw new Error(error.message)
}

export async function removeItemCloud(userId: string, itemId: string): Promise<void> {
  if (!SUPABASE_ENABLED || !supabase) return
  await supabase.from('wardrobe_items').delete().eq('id', itemId).eq('user_id', userId)
}

export async function importLocalWardrobeToCloud(
  userId: string,
  items: ClothingItem[],
): Promise<number> {
  if (!SUPABASE_ENABLED || !supabase || items.length === 0) return 0
  const { error } = await supabase
    .from('wardrobe_items')
    .upsert(items.map((i) => itemToRow(i, userId)))
  if (error) throw new Error(error.message)
  return items.length
}

// ── Outfits ───────────────────────────────────────────────────────────────────

export async function saveOutfitCloud(userId: string, outfit: OutfitSuggestion): Promise<void> {
  if (!SUPABASE_ENABLED || !supabase) return
  await supabase.from('outfit_suggestions').upsert(outfitToRow(outfit, userId))
}

// ── Styles ────────────────────────────────────────────────────────────────────

export async function saveStyleCloud(userId: string, style: StyleImage): Promise<void> {
  if (!SUPABASE_ENABLED || !supabase) return
  await supabase.from('style_images').upsert(styleToRow(style, userId))
}

export async function removeStyleCloud(userId: string, styleId: string): Promise<void> {
  if (!SUPABASE_ENABLED || !supabase) return
  await supabase.from('style_images').delete().eq('id', styleId).eq('user_id', userId)
}

// ── Config ────────────────────────────────────────────────────────────────────

export async function saveConfigCloud(userId: string, config: AppConfig): Promise<void> {
  if (!SUPABASE_ENABLED || !supabase) return
  await supabase.from('user_config').upsert({
    user_id: userId,
    provider: config.provider,
    api_key: config.apiKey,
    ollama_url: config.ollamaUrl,
    ollama_model: config.ollamaModel,
  })
}

export async function getConfigCloud(userId: string): Promise<AppConfig | null> {
  if (!SUPABASE_ENABLED || !supabase) return null
  const { data } = await supabase
    .from('user_config')
    .select('*')
    .eq('user_id', userId)
    .single()
  if (!data) return null
  return {
    provider: data.provider,
    apiKey: data.api_key,
    ollamaUrl: data.ollama_url,
    ollamaModel: data.ollama_model,
  }
}

// ── Real-time subscription (fetch + live updates) ─────────────────────────────

export function subscribeToUserData(
  userId: string,
  onData: (data: UserData) => void,
  onError: (err: Error) => void,
): () => void {
  if (!SUPABASE_ENABLED || !supabase) {
    onError(new Error('Supabase not configured'))
    return () => {}
  }

  async function fetchAll() {
    try {
      const [w, o, s] = await Promise.all([
        supabase!.from('wardrobe_items').select('*').eq('user_id', userId),
        supabase!
          .from('outfit_suggestions')
          .select('*')
          .eq('user_id', userId)
          .order('date', { ascending: false })
          .limit(90),
        supabase!
          .from('style_images')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
      ])
      onData({
        wardrobe: (w.data ?? []).map(rowToItem),
        outfits: (o.data ?? []).map(rowToOutfit),
        styles: (s.data ?? []).map(rowToStyle),
      })
    } catch (e) {
      onError(e instanceof Error ? e : new Error(String(e)))
    }
  }

  fetchAll()

  // Live updates whenever any table changes for this user
  const channel = supabase
    .channel(`user-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wardrobe_items', filter: `user_id=eq.${userId}` }, fetchAll)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'outfit_suggestions', filter: `user_id=eq.${userId}` }, fetchAll)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'style_images', filter: `user_id=eq.${userId}` }, fetchAll)
    .subscribe()

  return () => { supabase!.removeChannel(channel) }
}
