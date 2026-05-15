import type { ClothingCategory, ClothingItem } from '../types'

export const WASHABLE_CATEGORIES: ClothingCategory[] = ['top', 'bottom', 'dress']

export function isWashableItem(item: Pick<ClothingItem, 'category'>): boolean {
  return WASHABLE_CATEGORIES.includes(item.category)
}

export function needsWash(item: Pick<ClothingItem, 'category' | 'wearCount'>): boolean {
  return isWashableItem(item) && (item.wearCount ?? 0) >= 2
}
