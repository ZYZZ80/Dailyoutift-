import type { ClothingItem, OutfitSuggestion } from '../types'

const WARDROBE_KEY    = 'daily-stylist-wardrobe'
const OUTFITS_KEY     = 'daily-stylist-outfits'
const CONFIG_KEY      = 'daily-stylist-config'
const PHOTOS_KEY      = 'daily-stylist-profile-photos'

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
  localStorage.setItem(WARDROBE_KEY, JSON.stringify(items))
}

export function addClothingItem(item: ClothingItem): void {
  saveWardrobe([...getWardrobe(), item])
}

export function removeClothingItem(id: string): void {
  saveWardrobe(getWardrobe().filter((item) => item.id !== id))
}

/** Increment wearCount for each item in the outfit. */
export function recordWear(itemIds: string[]): void {
  const today = new Date().toISOString().split('T')[0]
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
  a.download = `daily-stylist-backup-${new Date().toISOString().split('T')[0]}.json`
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
