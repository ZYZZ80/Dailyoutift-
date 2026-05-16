import type { ClothingItem, OutfitSuggestion, StyleImage } from '../types'
import { localDateKey } from './dates'

const WARDROBE_KEY    = 'daily-stylist-wardrobe'
const OUTFITS_KEY     = 'daily-stylist-outfits'
const CONFIG_KEY      = 'daily-stylist-config'
const PHOTOS_KEY      = 'daily-stylist-profile-photos'
const DELETED_STYLES_KEY = 'daily-stylist-deleted-styles'

export interface AppConfig {
  provider: 'openai' | 'gemini' | 'ollama' | 'proxy'
  apiKey: string
  ollamaUrl: string
  ollamaModel: string
}

const DEFAULT_CONFIG: AppConfig = {
  provider: 'openai',
  apiKey: '',
  ollamaUrl: 'http://localhost:5173/ollama',
  ollamaModel: 'moondream',
}

// ── Config ────────────────────────────────────────────────────────────────────

export function getConfig(): AppConfig {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') }
  } catch {
    return DEFAULT_CONFIG
  }
}

export function saveConfig(config: AppConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

// ── Profile photos (up to 5) ──────────────────────────────────────────────────

export function getProfilePhotos(): string[] {
  try {
    const arr = JSON.parse(localStorage.getItem(PHOTOS_KEY) || '[]') as string[]
    if (arr.length > 0) return arr
    // Legacy: single photo
    const single = localStorage.getItem('daily-stylist-profile') || ''
    return single ? [single] : []
  } catch {
    return []
  }
}

export function saveProfilePhotos(photos: string[]): void {
  const trimmed = photos.filter(Boolean).slice(0, 5)
  localStorage.setItem(PHOTOS_KEY, JSON.stringify(trimmed))
  // Keep legacy key in sync (first photo)
  localStorage.setItem('daily-stylist-profile', trimmed[0] ?? '')
  window.dispatchEvent(new CustomEvent('daily-stylist-profile-photos', { detail: trimmed }))
}

/** @deprecated Use getProfilePhotos()[0] */
export function getProfilePhoto(): string {
  return getProfilePhotos()[0] ?? ''
}

/** @deprecated Use saveProfilePhotos */
export function saveProfilePhoto(photo: string): void {
  const photos = getProfilePhotos()
  if (photo) {
    photos[0] = photo
  } else {
    photos.splice(0, 1)
  }
  saveProfilePhotos(photos)
}

// ── Wardrobe ──────────────────────────────────────────────────────────────────

export function getWardrobe(): ClothingItem[] {
  try {
    return JSON.parse(localStorage.getItem(WARDROBE_KEY) || '[]')
  } catch {
    return []
  }
}

export function saveWardrobe(items: ClothingItem[]): void {
  try {
    localStorage.setItem(WARDROBE_KEY, JSON.stringify(items))
  } catch (error) {
    const isQuotaError =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error.code === 22)
    if (!isQuotaError) throw error

    const compact = items.map((item) => ({
      ...item,
      image: item.image.startsWith('data:') ? '' : item.image,
    }))
    localStorage.setItem(WARDROBE_KEY, JSON.stringify(compact))
  }
}

export function addClothingItem(item: ClothingItem): void {
  saveWardrobe([...getWardrobe(), item])
}

export function removeClothingItem(id: string): void {
  saveWardrobe(getWardrobe().filter((item) => item.id !== id))
}

/** Increment wearCount for each item in the outfit. */
export function recordWear(itemIds: string[]): void {
  const today = localDateKey()
  saveWardrobe(
    getWardrobe().map((item) =>
      itemIds.includes(item.id)
        ? { ...item, wearCount: (item.wearCount ?? 0) + 1, lastWorn: today }
        : item,
    ),
  )
}

/** Reset wearCount to 0 after washing. */
export function markWashed(itemId: string): void {
  saveWardrobe(
    getWardrobe().map((item) =>
      item.id === itemId ? { ...item, wearCount: 0 } : item,
    ),
  )
}

// ── Backup / Restore ──────────────────────────────────────────────────────────

export interface BackupData {
  version: 1
  exportedAt: string
  wardrobe: ClothingItem[]
  outfits: OutfitSuggestion[]
  profilePhotos: string[]
}

/** Download a full JSON backup of all app data. */
export function exportBackup(): void {
  const data: BackupData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    wardrobe: getWardrobe(),
    outfits: getOutfits(),
    profilePhotos: getProfilePhotos(),
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `daily-stylist-backup-${localDateKey()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** Restore all data from a backup file. Returns summary string. */
export function importBackup(json: string): string {
  const data = JSON.parse(json) as BackupData
  if (data.version !== 1) throw new Error('Unknown backup format')
  if (data.wardrobe?.length) saveWardrobe(data.wardrobe)
  if (data.outfits?.length) {
    data.outfits.forEach((o) => saveOutfit(o))
  }
  if (data.profilePhotos?.length) saveProfilePhotos(data.profilePhotos)
  return `Restored ${data.wardrobe?.length ?? 0} items, ${data.outfits?.length ?? 0} outfits, ${data.profilePhotos?.length ?? 0} photos`
}

// ── Outfits ───────────────────────────────────────────────────────────────────

export function getOutfits(): OutfitSuggestion[] {
  try {
    return JSON.parse(localStorage.getItem(OUTFITS_KEY) || '[]')
  } catch {
    return []
  }
}

export function saveOutfit(outfit: OutfitSuggestion): void {
  const outfits = getOutfits()
  const existing = outfits.findIndex((o) => o.date === outfit.date)
  if (existing >= 0) {
    outfits[existing] = outfit
  } else {
    outfits.unshift(outfit)
  }
  localStorage.setItem(OUTFITS_KEY, JSON.stringify(outfits.slice(0, 90)))
}

// ── Styles cache ───────────────────────────────────────────────────────────
const STYLES_KEY = 'daily-stylist-styles'
let stylesCache: StyleImage[] | null = null
interface DeletedStyleRecord {
  id: string
  image?: string
  outfitId?: string
  deletedAt: string
}
const LEGACY_STYLE_KEYS = [
  'daily-stylist-style-images',
  'daily-stylist-style-gallery',
  'daily-stylist-generated-styles',
  'daily-stylist-generated-pictures',
  'daily-stylist-history',
  'daily-stylist-tryons',
  'daily-stylist-try-on',
]

function isImageValue(value: unknown): value is string {
  return typeof value === 'string' && (
    value.startsWith('data:image/') ||
    value.startsWith('blob:') ||
    value.includes('/storage/v1/object/public/') ||
    value.includes('/storage/v1/render/image/public/') ||
    /^https?:\/\/.+\.(png|jpe?g|webp)(\?|$)/i.test(value)
  )
}

function normalizeStyleSource(value: unknown): StyleImage['source'] {
  const raw = String(value ?? '').toLowerCase()
  if (raw.includes('import')) return 'imported'
  if (raw === 'try-on' || raw === 'tryon' || raw.includes('try')) return 'try-on'
  if (raw === 'outfit-builder' || raw.includes('builder')) return 'outfit-builder'
  return 'daily-preview'
}

function normalizeStyleRecord(record: unknown, fallbackId: string): StyleImage | null {
  if (!record || typeof record !== 'object') return null
  const row = record as Record<string, unknown>
  const image =
    row.image ??
    row.imageUrl ??
    row.url ??
    row.previewImage ??
    row.generatedImage ??
    row.imageBase64 ??
    row.result
  if (!isImageValue(image)) return null
  const rawItemIds = row.itemIds ?? row.item_ids ?? row.items
  const itemIds = Array.isArray(rawItemIds)
    ? rawItemIds.map((item) => typeof item === 'object' && item && 'id' in item ? String((item as { id: unknown }).id) : String(item))
    : []
  return {
    id: String(row.id ?? row.styleId ?? fallbackId),
    image,
    itemIds,
    outfitId: row.outfitId || row.outfit_id ? String(row.outfitId ?? row.outfit_id) : undefined,
    source: normalizeStyleSource(row.source ?? row.type ?? row.kind),
    createdAt: String(row.createdAt ?? row.created_at ?? row.generatedAt ?? row.date ?? row.timestamp ?? new Date().toISOString()),
  }
}

function collectStyles(value: unknown, bucket: StyleImage[], prefix: string) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStyles(item, bucket, `${prefix}-${index}`))
    return
  }
  const direct = normalizeStyleRecord(value, prefix)
  if (direct) {
    bucket.push(direct)
    return
  }
  if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
      if (isImageValue(child)) {
        bucket.push({
          id: `${prefix}-${key}`,
          image: child,
          itemIds: [],
          source: normalizeStyleSource(prefix),
          createdAt: new Date().toISOString(),
        })
      } else if (key.toLowerCase().includes('style') || key.toLowerCase().includes('history') || key.toLowerCase().includes('generated') || key.toLowerCase().includes('preview') || key.toLowerCase().includes('try')) {
        collectStyles(child, bucket, `${prefix}-${key}`)
      }
    })
  }
}

function getLegacyStyles(): StyleImage[] {
  const found: StyleImage[] = []
  const keys = new Set(LEGACY_STYLE_KEYS)
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key) continue
      const lower = key.toLowerCase()
      if (
        lower.includes('style') ||
        lower.includes('history') ||
        lower.includes('generated') ||
        lower.includes('preview') ||
        lower.includes('tryon') ||
        lower.includes('try-on')
      ) keys.add(key)
    }
  } catch {
    /* ignore */
  }

  keys.forEach((key) => {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return
      collectStyles(JSON.parse(raw), found, key)
    } catch {
      /* ignore invalid legacy values */
    }
  })
  return found
}

function getDeletedStyleRecords(): DeletedStyleRecord[] {
  try {
    return JSON.parse(localStorage.getItem(DELETED_STYLES_KEY) || '[]') as DeletedStyleRecord[]
  } catch {
    return []
  }
}

export function isStyleDeleted(style: Pick<StyleImage, 'id' | 'image' | 'outfitId'>): boolean {
  return getDeletedStyleRecords().some((record) => (
    record.id === style.id ||
    Boolean(record.outfitId && style.outfitId && record.outfitId === style.outfitId) ||
    Boolean(record.image && style.image && record.image === style.image)
  ))
}

export function markStyleDeleted(style: Pick<StyleImage, 'id' | 'image' | 'outfitId'>): void {
  const current = getDeletedStyleRecords()
  const record: DeletedStyleRecord = {
    id: style.id,
    image: style.image || undefined,
    outfitId: style.outfitId || undefined,
    deletedAt: new Date().toISOString(),
  }
  const next = [record, ...current.filter((item) => item.id !== record.id)].slice(0, 1000)
  localStorage.setItem(DELETED_STYLES_KEY, JSON.stringify(next))
  stylesCache = stylesCache ? stylesCache.filter((item) => !isStyleDeleted(item)) : null
}

export function getStyles(): StyleImage[] {
  if (stylesCache) return stylesCache
  try {
    const current = JSON.parse(localStorage.getItem(STYLES_KEY) || '[]') as StyleImage[]
    const merged = [...current, ...getLegacyStyles()]
    const seen = new Set<string>()
    stylesCache = merged
      .filter((style) => style.image)
      .filter((style) => !isStyleDeleted(style))
      .filter((style) => {
        const key = `${style.id}:${style.image}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return stylesCache
  } catch { return [] }
}
export function saveStyles(styles: StyleImage[]): void {
  stylesCache = styles
    .filter((style) => style.image)
    .filter((style) => !isStyleDeleted(style))
    .slice(0, 1000)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  try {
    localStorage.setItem(STYLES_KEY, JSON.stringify(stylesCache))
  } catch (error) {
    const isQuotaError =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error.code === 22)
    if (!isQuotaError) throw error
    stylesCache = styles.filter((style) => !style.image.startsWith('data:')).slice(0, 1000)
    localStorage.setItem(STYLES_KEY, JSON.stringify(stylesCache))
  }
  window.dispatchEvent(new CustomEvent('daily-stylist-styles', { detail: stylesCache }))
}

// ── Cloud snapshot (full replace, used after cloud sync) ───────────────────
export function saveOutfitsSnapshot(outfits: OutfitSuggestion[]): void {
  localStorage.setItem(OUTFITS_KEY, JSON.stringify(outfits.slice(0, 90)))
}
