export type ClothingCategory = 'top' | 'bottom' | 'dress' | 'shoes' | 'accessory' | 'outerwear'

export interface ClothingItem {
  id: string
  name: string
  category: ClothingCategory
  color: string
  image: string // data URL cache or Supabase Storage URL
  tags: string[]
  uploadedAt: string
  wearCount?: number   // times worn since last wash
  lastWorn?: string    // ISO date
}

export interface OutfitSuggestion {
  id: string
  date: string
  itemIds: string[]
  description: string
  styleNotes: string
  occasion: string
  generatedAt: string
  previewImage?: string // AI-generated try-on photo
}

export interface StyleImage {
  id: string
  image: string
  itemIds: string[]
  outfitId?: string
  source: 'daily-preview' | 'outfit-builder' | 'try-on'
  createdAt: string
}
