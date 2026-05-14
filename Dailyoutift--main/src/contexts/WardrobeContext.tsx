import React, { createContext, useContext } from 'react'
import type { ClothingItem, OutfitSuggestion } from '../types'

interface WardrobeContextValue {
  wardrobe: ClothingItem[]
  outfits: OutfitSuggestion[]
  userId: string | undefined
  refresh: () => void
}

const WardrobeContext = createContext<WardrobeContextValue | null>(null)

interface WardrobeProviderProps {
  wardrobe: ClothingItem[]
  outfits: OutfitSuggestion[]
  userId: string | undefined
  refresh: () => void
  children: React.ReactNode
}

export function WardrobeProvider({
  wardrobe,
  outfits,
  userId,
  refresh,
  children,
}: WardrobeProviderProps) {
  return (
    <WardrobeContext.Provider value={{ wardrobe, outfits, userId, refresh }}>
      {children}
    </WardrobeContext.Provider>
  )
}

export function useWardrobe(): WardrobeContextValue {
  const ctx = useContext(WardrobeContext)
  if (!ctx) throw new Error('useWardrobe must be used inside <WardrobeProvider>')
  return ctx
}
