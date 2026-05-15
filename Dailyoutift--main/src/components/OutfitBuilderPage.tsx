import { useState, useCallback, useEffect } from 'react'
import { Wand2, X, Download, RefreshCw, User, CheckCircle2, ImageOff, Sparkles } from 'lucide-react'
import type { ClothingItem, StyleImage } from '../types'
import type { AppConfig } from '../lib/storage'
import { getProfilePhotos, getStyles, saveStyles } from '../lib/storage'
import { generateOutfitLook } from '../lib/preview'
import { saveStyleCloud, uploadStyleImage } from '../lib/cloud'
import { generationQueue, useGenerationJob } from '../lib/generationQueue'

interface Props {
  wardrobe: ClothingItem[]
  config: AppConfig
  userId?: string
  onSaved?: () => void
}

const CATEGORY_ORDER = ['outerwear', 'top', 'bottom', 'dress', 'shoes', 'accessory']

export default function OutfitBuilderPage({ wardrobe, config, userId, onSaved }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [useProfilePhoto, setUseProfilePhoto] = useState(false)
  const [resultImage, setResultImage] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [profilePhotos, setProfilePhotos] = useState<string[]>(() => getProfilePhotos())
  const hasProfilePhoto = profilePhotos.length > 0

  const job = useGenerationJob()
  const isMyJob = job?.kind === 'outfit-build'
  const generating = isMyJob && job?.status === 'running'

  // Reflect job result/error in this page
  useEffect(() => {
    if (isMyJob && job?.status === 'done' && job.result) {
      setResultImage(job.result.imageBase64)
      setError('')
    } else if (isMyJob && job?.status === 'error') {
      setError(`Generation failed: ${(job.error ?? '').slice(0, 100)}`)
    }
  }, [job?.id, job?.status])

  useEffect(() => {
    const onFocus = () => setProfilePhotos(getProfilePhotos())
    window.addEventListener('daily-stylist-profile-photos', onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('daily-stylist-profile-photos', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const sorted = [...wardrobe].sort((a, b) =>
    CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
  )

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    setResultImage(null)
    setError('')
  }, [])

  const selectedItems = wardrobe.filter((i) => selectedIds.has(i.id))

  async function saveBuilderStyle(image: string, items: ClothingItem[]): Promise<StyleImage> {
    const style: StyleImage = {
      id: crypto.randomUUID(),
      image,
      itemIds: items.map((item) => item.id),
      source: 'outfit-builder',
      createdAt: new Date().toISOString(),
    }

    saveStyles([style, ...getStyles()])
    onSaved?.()

    if (!userId) return style

    try {
      const imageUrl = await uploadStyleImage(userId, style.id, image)
      const cloudStyle = { ...style, image: imageUrl }
      await saveStyleCloud(userId, cloudStyle)
      saveStyles([cloudStyle, ...getStyles().filter((item) => item.id !== style.id)])
      onSaved?.()
      return cloudStyle
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn('Outfit builder cloud save failed; kept local recovery copy:', message)
      return style
    }
  }

  async function handleGenerate() {
    if (selectedIds.size === 0 || generating) return
    setError('')
    setResultImage(null)

    const items = [...selectedItems]
    const profilePhoto = (useProfilePhoto && hasProfilePhoto) ? profilePhotos[0] : null
    const cfg = config

    generationQueue.start({
      kind: 'outfit-build',
      origin: 'build',
      label: `Building outfit from ${items.length} item${items.length !== 1 ? 's' : ''}`,
      runner: async () => {
        const generatedImage = await generateOutfitLook(items, profilePhoto, cfg)
        const savedStyle = await saveBuilderStyle(generatedImage, items)
        return { imageBase64: savedStyle.image }
      },
    })
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
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
        <ImageOff className="w-12 h-12 text-gray-200" />
        <p className="text-gray-400 text-sm">Your wardrobe is empty.</p>
        <p className="text-gray-300 text-xs">Add clothes in the Wardrobe tab first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-charcoal">Outfit Builder</h1>
        <p className="text-gray-400 text-sm mt-1">Pick items, then generate an AI outfit photo.</p>
      </div>

      {/* Selected items tray */}
      {selectedItems.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
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
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-charcoal rounded-full flex items-center justify-center"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
                <p className="text-[9px] text-gray-500 mt-1 text-center truncate w-16">{item.name}</p>
              </div>
            ))}
          </div>

          {/* Profile photo toggle */}
          {hasProfilePhoto && (
            <button
              onClick={() => setUseProfilePhoto((v) => !v)}
              className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl border transition-colors w-full ${
                useProfilePhoto
                  ? 'bg-charcoal text-white border-charcoal'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              <User className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="font-medium">{useProfilePhoto ? 'Using your photo — virtual try-on' : 'Add me to the photo (virtual try-on)'}</span>
              {useProfilePhoto && <CheckCircle2 className="w-3.5 h-3.5 ml-auto" />}
            </button>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full btn-sky rounded-xl py-3 text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {generating ? (
              <>
                <Sparkles className="w-4 h-4 animate-pulse" />
                Generating in background…
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                Generate Outfit Look
              </>
            )}
          </button>
        </div>
      )}

      {/* Skeleton while generating */}
      {generating && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div
            className="aspect-[3/4] w-full animate-shimmer"
            style={{
              backgroundImage:
                'linear-gradient(90deg, #f3f4f6 0px, #fafafa 200px, #f3f4f6 400px)',
              backgroundSize: '800px 100%',
            }}
          />
          <div className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-blush rounded-full animate-pulse" />
              <p className="text-xs text-gray-500 font-medium">
                Building your outfit — feel free to browse other tabs
              </p>
            </div>
            <p className="text-[11px] text-gray-300">
              You'll get a notification when it's ready ✨
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 text-sm text-red-500">
          {error}
        </div>
      )}

      {/* Result image */}
      {resultImage && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <img src={resultImage} alt="Generated outfit" className="w-full object-contain max-h-[70vh]" />
          <div className="flex gap-2 p-3">
            <button
              onClick={handleDownload}
              className="flex-1 flex items-center justify-center gap-2 btn-coral rounded-xl py-2.5 text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Save Photo
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center justify-center gap-2 bg-gray-100 text-gray-700 rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Wardrobe grid */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
          {selectedIds.size === 0 ? 'Tap items to select' : 'Add more items'}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {sorted.map((item) => {
            const isSelected = selectedIds.has(item.id)
            return (
              <button
                key={item.id}
                onClick={() => toggle(item.id)}
                className={`relative rounded-2xl overflow-hidden aspect-square transition-all ${
                  isSelected
                    ? 'ring-2 ring-charcoal ring-offset-2'
                    : 'hover:ring-1 hover:ring-gray-300 hover:ring-offset-1'
                }`}
              >
                <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                {/* Overlay */}
                <div className={`absolute inset-0 transition-opacity ${isSelected ? 'bg-charcoal/20' : 'bg-transparent'}`} />
                {isSelected && (
                  <div className="absolute top-2 right-2 w-6 h-6 bg-charcoal rounded-full flex items-center justify-center shadow">
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </div>
                )}
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2 pt-4">
                  <p className="text-white text-xs font-medium truncate">{item.name}</p>
                  <p className="text-white/60 text-[10px] capitalize">{item.category}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
