import { useState } from 'react'
import { Camera, Images, Sparkles } from 'lucide-react'
import type { ClothingItem, OutfitSuggestion } from '../types'

interface Props {
  outfits: OutfitSuggestion[]
  wardrobe: ClothingItem[]
}

export default function StyleGalleryPage({ outfits, wardrobe }: Props) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null)
  const wardrobeMap = Object.fromEntries(wardrobe.map((item) => [item.id, item]))
  const styles = outfits
    .filter((outfit) => !!outfit.previewImage)
    .sort((a, b) => (b.previewGeneratedAt ?? b.generatedAt).localeCompare(a.previewGeneratedAt ?? a.generatedAt))

  if (styles.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-charcoal">Saved Styles</h2>
          <p className="text-sm text-gray-400 mt-0.5">Generated style images will appear here automatically.</p>
        </div>
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-16 text-center">
          <div className="w-16 h-16 bg-blush/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Images className="w-8 h-8 text-blush" strokeWidth={1.5} />
          </div>
          <h3 className="font-medium text-charcoal mb-2">No saved style images yet</h3>
          <p className="text-sm text-gray-400 max-w-xs mx-auto">Go to Today, generate an outfit photo, and it will be saved here.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-charcoal">Saved Styles</h2>
        <p className="text-sm text-gray-400 mt-0.5">{styles.length} generated style image{styles.length > 1 ? 's' : ''}</p>
      </div>

      {expandedImage && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setExpandedImage(null)}>
          <img src={expandedImage} alt="Saved style" className="max-w-full max-h-full rounded-2xl object-contain" />
          <button className="absolute top-4 right-4 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white hover:bg-white/30" onClick={() => setExpandedImage(null)}>✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {styles.map((outfit) => {
          const items = outfit.itemIds.map((id) => wardrobeMap[id]).filter(Boolean)
          const dateLabel = new Date(outfit.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          return (
            <div key={outfit.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <button className="relative w-full block group" onClick={() => setExpandedImage(outfit.previewImage!)}>
                <img src={outfit.previewImage} alt="Saved style" className="w-full aspect-[3/4] object-cover bg-gray-50" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/55 to-transparent p-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-white text-xs font-medium"><Camera className="w-3.5 h-3.5" /> Saved style</div>
                  <div className="bg-blush/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{outfit.occasion}</div>
                </div>
              </button>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-charcoal text-sm">{dateLabel}</p>
                  <span className="inline-flex items-center gap-1 text-[10px] text-blush bg-blush/10 px-2 py-1 rounded-full"><Sparkles className="w-3 h-3" />{outfit.previewSource ?? 'auto'}</span>
                </div>
                <p className="text-xs text-gray-500 line-clamp-2">{outfit.description}</p>
                {items.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {items.slice(0, 5).map((item) => (
                      <div key={item.id} className="w-10 h-10 flex-shrink-0 rounded-lg overflow-hidden bg-gray-50 border border-gray-100">
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
