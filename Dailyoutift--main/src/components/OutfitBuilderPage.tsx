import { useState, useCallback } from 'react'
import { Wand2, X, Download, RefreshCw, User, CheckCircle2, Shirt } from 'lucide-react'
import type { ClothingItem } from '../types'
import type { AppConfig } from '../lib/storage'
import { getProfilePhotos } from '../lib/storage'
import { generateOutfitLook } from '../lib/preview'
import { Button, EmptyState } from './ui'
import { useToast } from '../contexts/ToastContext'

interface Props {
  wardrobe: ClothingItem[]
  config: AppConfig
}

const CATEGORY_ORDER = ['outerwear', 'top', 'bottom', 'dress', 'shoes', 'accessory']

export default function OutfitBuilderPage({ wardrobe, config }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [useProfilePhoto, setUseProfilePhoto] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [resultImage, setResultImage] = useState<string | null>(null)
  const toast = useToast()

  const profilePhotos = getProfilePhotos()
  const hasProfilePhoto = profilePhotos.length > 0

  const sorted = [...wardrobe].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
  )

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    setResultImage(null)
  }, [])

  const selectedItems = wardrobe.filter((i) => selectedIds.has(i.id))

  async function handleGenerate() {
    if (selectedIds.size === 0) return
    setGenerating(true)
    setResultImage(null)
    try {
      const profilePhoto = (useProfilePhoto && hasProfilePhoto) ? profilePhotos[0] : null
      const image = await generateOutfitLook(selectedItems, profilePhoto, config)
      setResultImage(image)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('quota') || msg.includes('429')) {
        toast.error('AI quota exceeded — try again later or switch provider in Settings.')
      } else if (msg.includes('No image')) {
        toast.error('The AI didn\'t generate an image. Try selecting fewer or different items.')
      } else {
        toast.error(`Generation failed: ${msg.slice(0, 100)}`)
      }
    } finally {
      setGenerating(false)
    }
  }

  function handleDownload() {
    if (!resultImage) return
    const a = document.createElement('a')
    a.href = resultImage
    a.download = `outfit-${Date.now()}.jpg`
    a.click()
  }

  if (wardrobe.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-charcoal">Outfit Builder</h1>
        <EmptyState
          icon={Shirt}
          title="Your wardrobe is empty"
          description="Add clothes in the Wardrobe tab first, then come back to build outfits."
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-charcoal">Outfit Builder</h1>
        <p className="text-charcoal-muted text-sm mt-0.5">Pick items, then generate an AI outfit photo.</p>
      </div>

      {/* Selected items tray */}
      {selectedItems.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E8E4DF] space-y-3">
          <p
            className="text-xs font-semibold text-charcoal-muted uppercase tracking-wide"
            aria-label={`${selectedItems.length} items selected`}
          >
            Selected ({selectedItems.length})
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {selectedItems.map((item) => (
              <div key={item.id} className="relative flex-shrink-0">
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-16 h-16 rounded-xl object-cover border-2 border-charcoal"
                />
                <button
                  onClick={() => toggle(item.id)}
                  aria-label={`Remove ${item.name}`}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-charcoal rounded-full flex items-center justify-center hover:bg-black transition-colors"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
                <p className="text-2xs text-charcoal-muted mt-1 text-center truncate w-16">{item.name}</p>
              </div>
            ))}
          </div>

          {/* Profile photo toggle */}
          {hasProfilePhoto && (
            <button
              onClick={() => setUseProfilePhoto((v) => !v)}
              className={[
                'flex items-center gap-2 text-sm px-3 py-2.5 rounded-xl border transition-all w-full',
                useProfilePhoto
                  ? 'bg-charcoal text-white border-charcoal'
                  : 'bg-white text-charcoal-muted border-[#E8E4DF] hover:border-blush',
              ].join(' ')}
            >
              <User className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium">
                {useProfilePhoto ? 'Using your photo — virtual try-on' : 'Add me to the photo (virtual try-on)'}
              </span>
              {useProfilePhoto && <CheckCircle2 className="w-4 h-4 ml-auto" />}
            </button>
          )}

          <Button
            variant="primary"
            size="md"
            fullWidth
            loading={generating}
            leftIcon={<Wand2 className="w-4 h-4" />}
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? 'Generating photo…' : 'Generate Outfit Look'}
          </Button>
        </div>
      )}

      {/* Result image */}
      {resultImage && (
        <div className="bg-white rounded-2xl shadow-sm border border-[#E8E4DF] overflow-hidden">
          <img src={resultImage} alt="Generated outfit" className="w-full object-contain max-h-[70vh]" />
          <div className="flex gap-2 p-3">
            <Button variant="primary" size="md" leftIcon={<Download className="w-4 h-4" />} onClick={handleDownload} className="flex-1">
              Save Photo
            </Button>
            <Button variant="secondary" size="md" leftIcon={<RefreshCw className="w-4 h-4" />} onClick={handleGenerate} disabled={generating}>
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Wardrobe grid */}
      <div>
        <p className="text-xs font-semibold text-charcoal-muted uppercase tracking-wide mb-3">
          {selectedIds.size === 0 ? 'Tap items to select' : 'Add more items'}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {sorted.map((item) => {
            const isSelected = selectedIds.has(item.id)
            return (
              <button
                key={item.id}
                onClick={() => toggle(item.id)}
                aria-pressed={isSelected}
                className={[
                  'relative rounded-2xl overflow-hidden aspect-square transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush',
                  isSelected
                    ? 'ring-2 ring-charcoal ring-offset-2'
                    : 'hover:ring-1 hover:ring-[#E8E4DF] hover:ring-offset-1',
                ].join(' ')}
              >
                <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                <div className={['absolute inset-0 transition-opacity', isSelected ? 'bg-charcoal/20' : 'bg-transparent'].join(' ')} />
                {isSelected && (
                  <div className="absolute top-2 right-2 w-6 h-6 bg-charcoal rounded-full flex items-center justify-center shadow">
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </div>
                )}
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/65 to-transparent p-2 pt-4">
                  <p className="text-white text-xs font-medium truncate">{item.name}</p>
                  <p className="text-white/60 text-2xs capitalize">{item.category}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
