import { memo, useState, useEffect } from 'react'
import { Images, Sparkles, X } from 'lucide-react'
import type { ClothingItem, OutfitSuggestion } from '../types'
import { EmptyState, Tabs, Badge } from './ui'

interface Props {
  outfits: OutfitSuggestion[]
  wardrobe: ClothingItem[]
}

const FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'auto', label: 'Auto try-on' },
  { id: 'manual', label: 'Manual' },
]

const StyleGalleryPage = memo(function StyleGalleryPage({ outfits, wardrobe }: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [filter, setFilter] = useState('all')
  const wardrobeMap = Object.fromEntries(wardrobe.map((item) => [item.id, item]))

  const allStyles = outfits
    .filter((o) => !!o.previewImage)
    .sort((a, b) => (b.previewGeneratedAt ?? b.generatedAt).localeCompare(a.previewGeneratedAt ?? a.generatedAt))

  const styles =
    filter === 'all' ? allStyles :
    allStyles.filter((s) => (s.previewSource ?? 'auto') === filter)

  // Keyboard nav for lightbox
  useEffect(() => {
    if (expandedIdx === null) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedIdx(null)
      if (e.key === 'ArrowRight') setExpandedIdx((i) => (i !== null ? Math.min(i + 1, styles.length - 1) : null))
      if (e.key === 'ArrowLeft') setExpandedIdx((i) => (i !== null ? Math.max(i - 1, 0) : null))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [expandedIdx, styles.length])

  const tabsWithCounts = FILTER_TABS.map((t) => ({
    ...t,
    count: t.id === 'all' ? allStyles.length : allStyles.filter((s) => (s.previewSource ?? 'auto') === t.id).length,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-charcoal">Saved Styles</h2>
        <p className="text-sm text-charcoal-muted mt-0.5">
          {allStyles.length > 0
            ? `${allStyles.length} generated style image${allStyles.length > 1 ? 's' : ''}`
            : 'Generated style images will appear here automatically.'}
        </p>
      </div>

      {allStyles.length > 0 && (
        <Tabs tabs={tabsWithCounts} active={filter} onChange={setFilter} />
      )}

      {/* Lightbox */}
      {expandedIdx !== null && styles[expandedIdx] && (
        <div
          className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4"
          onClick={() => setExpandedIdx(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Image ${expandedIdx + 1} of ${styles.length}. Press arrow keys to navigate.`}
        >
          <img
            src={styles[expandedIdx].previewImage!}
            alt={`Style ${expandedIdx + 1} of ${styles.length}`}
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
              className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors"
              onClick={(e) => { e.stopPropagation(); setExpandedIdx((i) => (i !== null ? i - 1 : null)) }}
            >
              ‹
            </button>
          )}
          {expandedIdx < styles.length - 1 && (
            <button
              aria-label="Next image"
              className="absolute right-14 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors"
              onClick={(e) => { e.stopPropagation(); setExpandedIdx((i) => (i !== null ? i + 1 : null)) }}
            >
              ›
            </button>
          )}
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-xs">
            {expandedIdx + 1} / {styles.length}
          </p>
        </div>
      )}

      {styles.length === 0 ? (
        <EmptyState
          icon={Images}
          title="No saved style images yet"
          description="Go to Today, generate an outfit photo, and it will be saved here."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {styles.map((outfit, idx) => {
            const items = outfit.itemIds.map((id) => wardrobeMap[id]).filter(Boolean)
            const dateLabel = new Date(outfit.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            return (
              <div key={outfit.id} className="bg-white rounded-2xl border border-[#E8E4DF] shadow-sm overflow-hidden">
                <button
                  className="relative w-full block group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush"
                  onClick={() => setExpandedIdx(idx)}
                  aria-label={`View style from ${dateLabel}, ${outfit.occasion}`}
                >
                  <img
                    src={outfit.previewImage}
                    alt={`${outfit.occasion} outfit`}
                    className="w-full aspect-[3/4] object-cover bg-surface-overlay"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-3 flex items-center justify-between">
                    <Badge variant="neutral" className="bg-white/20 text-white text-xs border-0">
                      {outfit.occasion}
                    </Badge>
                    <div className="flex items-center gap-1 text-white/70 text-xs">
                      <Sparkles className="w-3 h-3" />
                      {outfit.previewSource ?? 'auto'}
                    </div>
                  </div>
                </button>
                <div className="p-4 space-y-2">
                  <p className="font-medium text-charcoal text-sm">{dateLabel}</p>
                  <p className="text-xs text-charcoal-muted line-clamp-2">{outfit.description}</p>
                  {items.length > 0 && (
                    <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                      {items.slice(0, 5).map((item) => (
                        <div key={item.id} className="w-9 h-9 flex-shrink-0 rounded-lg overflow-hidden bg-surface-overlay border border-[#E8E4DF]">
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
      )}
    </div>
  )
})

export default StyleGalleryPage
