export type ClothingCategory = 'top' | 'bottom' | 'dress' | 'shoes' | 'accessory' | 'outerwear'

export interface ClothingItem {
  id: string
  name: string
  category: ClothingCategory
  color: string
  image: string // base64 data URL or Supabase Storage URL
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
  previewImage?: string // AI-generated try-on photo or Supabase Storage URL
  previewGeneratedAt?: string
  previewSource?: 'auto' | 'manual'
}

// Occasion types — single source of truth used across DailyOutfitPage + WeekPlanPage
export type Occasion = 'Casual' | 'Work' | 'Dining Out' | 'Date Night' | 'Party' | 'Sports' | 'Beach' | 'Travel'
export const OCCASIONS: Occasion[] = ['Casual', 'Work', 'Dining Out', 'Date Night', 'Party', 'Sports', 'Beach', 'Travel']

// Lucide icon names per occasion — replaces emoji throughout the app
export const OCCASION_ICONS: Record<Occasion, string> = {
  Casual: 'Sun',
  Work: 'Briefcase',
  'Dining Out': 'UtensilsCrossed',
  'Date Night': 'Moon',
  Party: 'Sparkles',
  Sports: 'Activity',
  Beach: 'Waves',
  Travel: 'Plane',
}

// Const array for category iteration
export const CLOTHING_CATEGORIES: ClothingCategory[] = ['top', 'bottom', 'dress', 'shoes', 'accessory', 'outerwear']

export interface StyleImage {
  id: string
  image: string
  itemIds: string[]
  outfitId?: string
  source: string
  createdAt: string
}
