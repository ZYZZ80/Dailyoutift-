import { useState } from 'react'
import { History, Sparkles, Camera } from 'lucide-react'
import type { ClothingItem, OutfitSuggestion } from '../types'

interface Props {
  outfits: OutfitSuggestion[]
  wardrobe: ClothingItem[]
}

export default function HistoryPage({ outfits, wardrobe }: Props) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null)
  const wardrobeMap = Object.fromEntries(wardrobe.map((item) => [item.id, item]))
  const withPhotos = outfits.filter((o) => o.previewImage).length

  if (outfits.length === 0) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold text-charcoal">Outfit History</h2>
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <History className="w-7 h-7 text-gray-300" />
          </div>
          <p className="text-gray-400 text-sm">No outfit history yet</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold text-charcoal">Outfit History</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          {outfits.length} outfits{withPhotos > 0 ? ` · ${withPhotos} with photos` : ''}
        </p>
      </div>

      {/* Fullscreen image overlay */}
      {expandedImage && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setExpandedImage(null)}
        >
          <img
            src={expandedImage}
            alt="Try-on preview"
            className="max-w-full max-h-full rounded-2xl object-contain"
          />
          <button
            className="absolute top-4 right-4 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white hover:bg-white/30"
            onClick={() => setExpandedImage(null)}
          >
            ✕
          </button>
        </div>
      )}

      <div className="space-y-4">
        {outfits.map((outfit) => {
          const items = outfit.itemIds.map((id) => wardrobeMap[id]).filter(Boolean)
          const dateLabel = new Date(outfit.date + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric',
          })
          const hasPhoto = !!outfit.previewImage

          return (
            <div key={outfit.id} className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${hasPhoto ? 'border-blush/20' : 'border-gray-100'}`}>

              {/* Try-on photo — shown at top if available */}
              {hasPhoto && (
                <div
                  className="relative cursor-pointer group"
                  onClick={() => setExpandedImage(outfit.previewImage!)}
                >
                  <img
                    src={outfit.previewImage}
                    alt="Outfit try-on"
                    className="w-full object-cover max-h-72"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/50 to-transparent px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-white/80" />
                      <p className="text-white text-xs font-medium">AI try-on · tap to expand</p>
                    </div>
                    <div className="flex items-center gap-2 bg-blush/80 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      <Sparkles className="w-3 h-3" />{outfit.occasion}
                    </div>
                  </div>
                </div>
              )}

              <div className="p-5">
                {/* Date + occasion */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="font-medium text-charcoal text-sm">{dateLabel}</p>
                    {!hasPhoto && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <Sparkles className="w-3 h-3 text-blush" />
                        <span className="text-xs text-blush">{outfit.occasion}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Outfit items */}
                {items.length > 0 ? (
                  <div className="flex gap-3 mb-4 overflow-x-auto pb-1">
                    {items.map((item) => (
                      <div key={item.id} className="flex-shrink-0 w-20">
                        <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-50 border border-gray-100">
                          <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                        </div>
                        <p className="text-xs text-gray-500 mt-1 truncate text-center">{item.name}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 mb-3">Items removed from wardrobe</p>
                )}

                <p className="text-sm text-gray-600">{outfit.description}</p>

                {outfit.styleNotes && (
                  <p className="text-xs text-gray-400 mt-2 leading-relaxed">{outfit.styleNotes}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
