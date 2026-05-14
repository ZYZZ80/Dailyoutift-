import { memo, useState, useEffect } from 'react'
import { History, Sparkles, Camera, Search, X, ImageOff } from 'lucide-react'
import type { ClothingItem, OutfitSuggestion } from '../types'
import { EmptyState, Badge } from './ui'

interface Props {
  outfits: OutfitSuggestion[]
  wardrobe: ClothingItem[]
}

const HistoryPage = memo(function HistoryPage({ outfits, wardrobe }: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const wardrobeMap = Object.fromEntries(wardrobe.map((item) => [item.id, item]))
  const withPhotos = outfits.filter((o) => o.previewImage).length

  const filtered = outfits.filter((o) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      o.occasion.toLowerCase().includes(q) ||
      o.description.toLowerCase().includes(q) ||
      o.date.includes(q)
    )
  })

  // Keyboard nav for lightbox
  useEffect(() => {
    if (expandedIdx === null) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedIdx(null)
      if (e.key === 'ArrowRight') setExpandedIdx((i) => (i !== null ? Math.min(i + 1, filtered.length - 1) : null))
      if (e.key === 'ArrowLeft') setExpandedIdx((i) => (i !== null ? Math.max(i - 1, 0) : null))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [expandedIdx, filtered.length])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-charcoal">Outfit History</h2>
        <p className="text-sm text-charcoal-muted mt-0.5">
          {outfits.length > 0
            ? `${outfits.length} outfits${withPhotos > 0 ? ` · ${withPhotos} with photos` : ''}`
            : 'Your past outfits will appear here.'}
        </p>
      </div>

      {/* Search bar */}
      {outfits.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by occasion, description, date…"
            className="w-full border border-[#E8E4DF] rounded-xl pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blush/40"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal-muted hover:text-charcoal transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Lightbox */}
      {expandedIdx !== null && filtered[expandedIdx]?.previewImage && (
        <div
          className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4"
          onClick={() => setExpandedIdx(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Image ${expandedIdx + 1} of ${filtered.filter((o) => o.previewImage).length}`}
        >
          <img
            src={filtered[expandedIdx].previewImage!}
            alt="Outfit try-on preview"
            className="max-w-full max-h-full rounded-2xl object-contain animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            aria-label="Close image preview"
            className="absolute top-4 right-4 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors"
            onClick={() => setExpandedIdx(null)}
          >
            <X className="w-5 h-5" />
          </button>
          {expandedIdx > 0 && (
            <button
              aria-label="Previous image"
              className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white text-xl hover:bg-white/30"
              onClick={(e) => { e.stopPropagation(); setExpandedIdx((i) => (i !== null ? i - 1 : null)) }}
            >‹</button>
          )}
          {expandedIdx < filtered.length - 1 && (
            <button
              aria-label="Next image"
              className="absolute right-14 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white text-xl hover:bg-white/30"
              onClick={(e) => { e.stopPropagation(); setExpandedIdx((i) => (i !== null ? i + 1 : null)) }}
            >›</button>
          )}
        </div>
      )}

      {outfits.length === 0 ? (
        <EmptyState
          icon={History}
          title="No outfit history yet"
          description="Generate your first outfit and it will appear here."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No results"
          description={`Nothing matched "${search}"`}
          action={{ label: 'Clear search', onClick: () => setSearch('') }}
        />
      ) : (
        <div className="space-y-4">
          {filtered.map((outfit, idx) => {
            const items = outfit.itemIds.map((id) => wardrobeMap[id]).filter(Boolean)
            const dateLabel = new Date(outfit.date + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric',
            })
            const hasPhoto = !!outfit.previewImage

            return (
              <div
                key={outfit.id}
                className={[
                  'bg-white rounded-2xl shadow-sm border overflow-hidden',
                  hasPhoto ? 'border-blush/20' : 'border-[#E8E4DF]',
                ].join(' ')}
              >
                {/* Try-on photo */}
                {hasPhoto && (
                  <button
                    className="relative w-full block group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush"
                    onClick={() => setExpandedIdx(idx)}
                    aria-label="Expand try-on photo"
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
                      <div className="flex items-center gap-1.5 bg-blush/80 text-white text-xs font-medium px-2 py-0.5 rounded-full">
                        <Sparkles className="w-3 h-3" />{outfit.occasion}
                      </div>
                    </div>
                  </button>
                )}

                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <p className="font-semibold text-charcoal text-sm">{dateLabel}</p>
                    {!hasPhoto && <Badge variant="neutral">{outfit.occasion}</Badge>}
                  </div>

                  {items.length > 0 ? (
                    <div className="flex gap-3 mb-3 overflow-x-auto pb-1">
                      {items.map((item) => (
                        <div key={item.id} className="flex-shrink-0 w-20">
                          <div className="w-20 h-20 rounded-xl overflow-hidden bg-surface-overlay border border-[#E8E4DF]">
                            <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                          </div>
                          <p className="text-xs text-charcoal-muted mt-1 truncate text-center">{item.name}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-charcoal-muted mb-3">
                      <ImageOff className="w-3.5 h-3.5" />
                      Items removed from wardrobe
                    </div>
                  )}

                  <p className="text-sm text-charcoal-muted">{outfit.description}</p>
                  {outfit.styleNotes && (
                    <p className="text-xs text-charcoal-muted/60 mt-1.5 leading-relaxed">{outfit.styleNotes}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
})

export default HistoryPage
