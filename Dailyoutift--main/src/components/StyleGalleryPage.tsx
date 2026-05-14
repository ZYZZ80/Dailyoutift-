import { memo, useState, useEffect } from 'react'
import { Images, Sparkles, ShoppingBag, Wand2, X } from 'lucide-react'
import type { ClothingItem, OutfitSuggestion, StyleImage } from '../types'
import { EmptyState, Tabs, Badge } from './ui'

interface Props {
  outfits: OutfitSuggestion[]
  wardrobe: ClothingItem[]
  styleImages?: StyleImage[]
}

// Unified display type for both outfit previews and try-on results
interface StyleEntry {
  id: string
  image: string
  date: string
  source: 'outfit' | 'try-on' | 'manual' | 'outfit-builder'
  occasion?: string
  description?: string
  itemIds: string[]
}

function toEntries(outfits: OutfitSuggestion[], styleImages: StyleImage[]): StyleEntry[] {
  const fromOutfits: StyleEntry[] = outfits
    .filter((o) => !!o.previewImage)
    .map((o) => ({
      id: o.id,
      image: o.previewImage!,
      date: o.previewGeneratedAt ?? o.generatedAt,
      source: (o.previewSource === 'manual' ? 'manual' : 'outfit') as StyleEntry['source'],
      occasion: o.occasion,
      description: o.description,
      itemIds: o.itemIds,
    }))
  const fromStyles: StyleEntry[] = styleImages.map((s) => ({
    id: s.id,
    image: s.image,
    date: s.createdAt,
    source: (s.source === 'outfit-builder' ? 'outfit-builder' : 'try-on') as StyleEntry['source'],
    itemIds: s.itemIds,
  }))
  return [...fromOutfits, ...fromStyles].sort((a, b) => b.date.localeCompare(a.date))
}

const FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'outfit', label: 'Outfit preview' },
  { id: 'try-on', label: 'Try-on' },
  { id: 'outfit-builder', label: 'Builder' },
]

const StyleGalleryPage = memo(function StyleGalleryPage({ outfits, wardrobe, styleImages = [] }: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [filter, setFilter] = useState('all')
  const wardrobeMap = Object.fromEntries(wardrobe.map((item) => [item.id, item]))

  const allEntries = toEntries(outfits, styleImages)
  const displayed =
    filter === 'all' ? allEntries :
    filter === 'try-on' ? allEntries.filter((e) => e.source === 'try-on') :
    filter === 'outfit-builder' ? allEntries.filter((e) => e.source === 'outfit-builder') :
    allEntries.filter((e) => e.source === 'outfit' || e.source === 'manual')

  // Keyboard nav for lightbox
  useEffect(() => {
    if (expandedIdx === null) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedIdx(null)
      if (e.key === 'ArrowRight') setExpandedIdx((i) => (i !== null ? Math.min(i + 1, displayed.length - 1) : null))
      if (e.key === 'ArrowLeft') setExpandedIdx((i) => (i !== null ? Math.max(i - 1, 0) : null))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [expandedIdx, displayed.length])

  const tabsWithCounts = FILTER_TABS.map((t) => ({
    ...t,
    count:
      t.id === 'all' ? allEntries.length :
      t.id === 'try-on' ? allEntries.filter((e) => e.source === 'try-on').length :
      t.id === 'outfit-builder' ? allEntries.filter((e) => e.source === 'outfit-builder').length :
      allEntries.filter((e) => e.source === 'outfit' || e.source === 'manual').length,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-charcoal">Saved Styles</h2>
        <p className="text-sm text-charcoal-muted mt-0.5">
          {allEntries.length > 0
            ? `${allEntries.length} saved style image${allEntries.length > 1 ? 's' : ''}`
            : 'Generated style images will appear here automatically.'}
        </p>
      </div>

      {allEntries.length > 0 && (
        <Tabs tabs={tabsWithCounts} active={filter} onChange={setFilter} />
      )}

      {/* Lightbox */}
      {expandedIdx !== null && displayed[expandedIdx] && (
        <div
          className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4"
          onClick={() => setExpandedIdx(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Image ${expandedIdx + 1} of ${displayed.length}. Press arrow keys to navigate.`}
        >
          <img
            src={displayed[expandedIdx].image}
            alt={`Style ${expandedIdx + 1} of ${displayed.length}`}
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
              className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors text-xl"
              onClick={(e) => { e.stopPropagation(); setExpandedIdx((i) => (i !== null ? i - 1 : null)) }}
            >
              ‹
            </button>
          )}
          {expandedIdx < displayed.length - 1 && (
            <button
              aria-label="Next image"
              className="absolute right-14 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors text-xl"
              onClick={(e) => { e.stopPropagation(); setExpandedIdx((i) => (i !== null ? i + 1 : null)) }}
            >
              ›
            </button>
          )}
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-xs">
            {expandedIdx + 1} / {displayed.length}
          </p>
        </div>
      )}

      {displayed.length === 0 ? (
        <EmptyState
          icon={Images}
          title="No saved style images yet"
          description={
            filter === 'try-on'
              ? 'Go to Try Buy, upload items, and generate a look.'
              : filter === 'outfit-builder'
              ? 'Go to Build, pick items, and generate an outfit photo.'
              : 'Go to Today, generate an outfit photo, and it will be saved here.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {displayed.map((entry, idx) => {
            const items = entry.itemIds.map((id) => wardrobeMap[id]).filter(Boolean)
            const dateLabel = new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            const isTryOn = entry.source === 'try-on'
            const isBuilder = entry.source === 'outfit-builder'
            return (
              <div key={entry.id} className="bg-white rounded-2xl border border-[#E8E4DF] shadow-sm overflow-hidden">
                <button
                  className="relative w-full block group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush"
                  onClick={() => setExpandedIdx(idx)}
                  aria-label={`View ${isBuilder ? 'builder' : isTryOn ? 'try-on' : 'outfit'} from ${dateLabel}`}
                >
                  <img
                    src={entry.image}
                    alt={isBuilder ? 'Builder outfit' : isTryOn ? 'Try-on result' : `${entry.occasion} outfit`}
                    className="w-full aspect-[3/4] object-cover bg-surface-overlay"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-3 flex items-center justify-between">
                    {entry.occasion ? (
                      <Badge variant="neutral" className="bg-white/20 text-white text-xs border-0">
                        {entry.occasion}
                      </Badge>
                    ) : <span />}
                    <div className="flex items-center gap-1 text-white/80 text-xs bg-black/30 px-2 py-0.5 rounded-full">
                      {isBuilder
                        ? <><Wand2 className="w-3 h-3" /> Builder</>
                        : isTryOn
                        ? <><ShoppingBag className="w-3 h-3" /> Try-on</>
                        : <><Sparkles className="w-3 h-3" /> Preview</>
                      }
                    </div>
                  </div>
                </button>
                <div className="p-4 space-y-2">
                  <p className="font-medium text-charcoal text-sm">{dateLabel}</p>
                  {entry.description && (
                    <p className="text-xs text-charcoal-muted line-clamp-2">{entry.description}</p>
                  )}
                  {items.length > 0 && (
                    <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                      {items.slice(0, 5).map((item) => (
                        <div key={item.id} className="w-9 h-9 flex-shrink-0 rounded-lg overflow-hidden bg-surface-overlay border border-[#E8E4DF]">
                          <img src={item.image} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
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
