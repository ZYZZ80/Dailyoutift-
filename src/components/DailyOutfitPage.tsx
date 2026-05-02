import { useState, useRef } from 'react'
import {
  Sparkles, RefreshCw, Loader2, Calendar, Info, Camera, X, Wand2,
  Plus, Lightbulb,
} from 'lucide-react'
import type { ClothingItem, OutfitSuggestion } from '../types'
import { generateOutfit } from '../lib/claude'
import { generateOutfitPreview } from '../lib/preview'
import { saveOutfit, getProfilePhotos, saveProfilePhotos, recordWear, type AppConfig } from '../lib/storage'
// Firebase removed — no cloud syncou

const OCCASIONS = [
  { id: 'Casual',     emoji: '😊' },
  { id: 'Work',       emoji: '💼' },
  { id: 'Dining Out', emoji: '🍽️' },
  { id: 'Date Night', emoji: '🌙' },
  { id: 'Party',      emoji: '🎉' },
  { id: 'Sports',     emoji: '🏃' },
  { id: 'Beach',      emoji: '🏖️' },
  { id: 'Travel',     emoji: '✈️' },
]

const PHOTO_LABELS = ['Front', 'Side', 'Full body']

interface Props {
  wardrobe: ClothingItem[]
  todayOutfit: OutfitSuggestion | null
  config: AppConfig
  onOutfitGenerated: () => void
  userId?: string
}

type AgentStep = 'idle' | 'outfit' | 'preview' | 'done'

export default function DailyOutfitPage({ wardrobe, todayOutfit, config, onOutfitGenerated, userId }: Props) {
  const [selectedOccasion, setSelectedOccasion] = useState('Casual')
  const [agentStep, setAgentStep] = useState<AgentStep>('idle')
  const [error, setError] = useState('')
  const [profilePhotos, setProfilePhotos] = useState<string[]>(() => getProfilePhotos())
  const [activePhotoIdx, setActivePhotoIdx] = useState(0)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [showTips, setShowTips] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const uploadingSlot = useRef<number>(0)

  const today = new Date().toISOString().split('T')[0]
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const outfitItems = todayOutfit ? wardrobe.filter((item) => todayOutfit.itemIds.includes(item.id)) : []
  const isRunning = agentStep === 'outfit' || agentStep === 'preview'
  const primaryPhoto = profilePhotos[activePhotoIdx] ?? profilePhotos[0] ?? ''

  function openPhotoUpload(slot: number) {
    uploadingSlot.current = slot
    fileRef.current?.click()
  }

  function handlePhotoFile(file: File) {
    const slot = uploadingSlot.current
    const reader = new FileReader()
    reader.onload = async (e) => {
      const base64 = e.target?.result as string
      const updated = [...profilePhotos]
      updated[slot] = base64
      setProfilePhotos(updated)
      saveProfilePhotos(updated)

      // Upload to Firebase Storage
      if (userId) {
        try {
          const url = await uploadProfilePhoto(userId, base64)
          updated[slot] = url
          setProfilePhotos([...updated])
          saveProfilePhotos(updated)
        } catch { /* keep base64 */ }
      }
    }
    reader.readAsDataURL(file)
  }

  function removePhoto(slot: number) {
    const updated = profilePhotos.filter((_, i) => i !== slot)
    setProfilePhotos(updated)
    saveProfilePhotos(updated)
    if (activePhotoIdx >= updated.length) setActivePhotoIdx(Math.max(0, updated.length - 1))
  }

  async function runAgent() {
    if (wardrobe.length < 2) { setError('Add at least 2 clothing items first!'); return }
    setError('')
    setPreviewImage(null)

    // Step 1: Generate outfit
    setAgentStep('outfit')
    let outfitResult: Omit<OutfitSuggestion, 'id' | 'generatedAt'> | null = null
    try {
      outfitResult = await generateOutfit(wardrobe, today, config, selectedOccasion)
      const savedOutfit = { id: crypto.randomUUID(), ...outfitResult, generatedAt: new Date().toISOString() }
      saveOutfit(savedOutfit)
      recordWear(savedOutfit.itemIds) // track wear count
      if (userId) saveOutfitCloud(userId, savedOutfit).catch(() => {})
      onOutfitGenerated()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('429') || msg.includes('quota')) setError('Quota exceeded — get a new API key')
      else if (msg.includes('401') || msg.includes('403') || msg.includes('API_KEY')) setError('Invalid API key — check your key')
      else setError(msg.substring(0, 120))
      setAgentStep('idle')
      return
    }

    // Step 2: Auto try-on if photo exists
    if (primaryPhoto && config.provider !== 'ollama' && outfitResult) {
      setAgentStep('preview')
      try {
        const items = wardrobe.filter((item) => (outfitResult!.itemIds as string[]).includes(item.id))
        if (items.length > 0) {
          const url = await generateOutfitPreview(primaryPhoto, items, config)
          setPreviewImage(url)
          // Save preview image into the outfit record
          if (url && todayOutfit) {
            const withPreview = { ...todayOutfit, previewImage: url }
            saveOutfit(withPreview)
            if (userId) saveOutfitCloud(userId, withPreview).catch(() => {})
            onOutfitGenerated()
          }
        }
      } catch { /* skip silently */ }
    }

    setAgentStep('done')
    setTimeout(() => setAgentStep('idle'), 800)
  }

  async function manualPreview() {
    if (!outfitItems.length || !primaryPhoto) return
    setAgentStep('preview')
    setError('')
    try {
      const url = await generateOutfitPreview(primaryPhoto, outfitItems, config)
      setPreviewImage(url)
      // Save preview image into the outfit record
      if (url && todayOutfit) {
        const withPreview = { ...todayOutfit, previewImage: url }
        saveOutfit(withPreview)
        if (userId) saveOutfitCloud(userId, withPreview).catch(() => {})
        onOutfitGenerated()
      }
    } catch (e) {
      setError('Preview failed: ' + (e instanceof Error ? e.message : '').substring(0, 80))
    } finally {
      setAgentStep('idle')
    }
  }

  const buttonLabel =
    agentStep === 'outfit' ? 'Picking outfit…' :
    agentStep === 'preview' ? 'Generating photo…' :
    agentStep === 'done' ? 'Done!' :
    todayOutfit ? 'Restyle Me' : 'Style Me'

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold text-charcoal">Today's Outfit</h2>
        <div className="flex items-center gap-1.5 text-sm text-gray-400 mt-0.5">
          <Calendar className="w-3.5 h-3.5" />{todayLabel}
        </div>
      </div>

      {/* Agent control panel */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">

        {/* Occasion chips */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">What's the occasion?</p>
          <div className="flex flex-wrap gap-2">
            {OCCASIONS.map((occ) => (
              <button
                key={occ.id}
                onClick={() => setSelectedOccasion(occ.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  selectedOccasion === occ.id
                    ? 'bg-charcoal text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span>{occ.emoji}</span>{occ.id}
              </button>
            ))}
          </div>
        </div>

        {/* Profile photos row (up to 3) */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Your Photos</p>
          <div className="flex items-center gap-2">
            {PHOTO_LABELS.map((label, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div
                  className={`relative w-14 h-14 rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                    profilePhotos[i]
                      ? activePhotoIdx === i ? 'border-charcoal' : 'border-transparent'
                      : 'border-dashed border-gray-200 hover:border-blush bg-gray-50'
                  }`}
                  onClick={() => profilePhotos[i] ? setActivePhotoIdx(i) : openPhotoUpload(i)}
                >
                  {profilePhotos[i] ? (
                    <>
                      <img src={profilePhotos[i]} alt={label} className="w-full h-full object-cover" />
                      <button
                        onClick={(e) => { e.stopPropagation(); removePhoto(i) }}
                        className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center"
                      >
                        <X className="w-2.5 h-2.5 text-white" />
                      </button>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Plus className="w-5 h-5 text-gray-300" />
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-gray-400">{label}</span>
              </div>
            ))}
            <p className="text-xs text-gray-400 ml-2 leading-tight">
              {profilePhotos.length > 0
                ? 'Tap a photo to select\nfor try-on'
                : 'Add photos for\nvirtual try-on'}
            </p>
          </div>
        </div>

        {/* Generate button row */}
        <div className="flex items-center gap-3 pt-1 border-t border-gray-50">
          <button
            onClick={runAgent}
            disabled={isRunning}
            className="flex items-center gap-2 bg-charcoal text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-black transition-colors disabled:opacity-50"
          >
            {isRunning
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : todayOutfit ? <RefreshCw className="w-4 h-4" /> : <Wand2 className="w-4 h-4" />}
            {buttonLabel}
          </button>
          <p className="text-xs text-gray-400">
            {primaryPhoto && !isRunning && 'Photo selected · try-on auto-generates'}
            {!primaryPhoto && !isRunning && 'Add a photo above for virtual try-on'}
          </p>
        </div>

        {/* Progress steps */}
        {isRunning && (
          <div className="flex items-center gap-3 text-xs">
            <div className={`flex items-center gap-1.5 ${agentStep === 'outfit' ? 'text-charcoal font-medium' : 'text-gray-300'}`}>
              <span className={`w-2 h-2 rounded-full ${agentStep === 'outfit' ? 'bg-blush animate-pulse' : 'bg-gray-200'}`} />
              Picking outfit
            </div>
            <div className="w-6 h-px bg-gray-200" />
            <div className={`flex items-center gap-1.5 ${agentStep === 'preview' ? 'text-charcoal font-medium' : 'text-gray-300'}`}>
              <span className={`w-2 h-2 rounded-full ${agentStep === 'preview' ? 'bg-blush animate-pulse' : 'bg-gray-200'}`} />
              Generating photo
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 text-red-500 rounded-2xl px-4 py-3 text-sm flex items-center gap-2">
          <Info className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* Empty state */}
      {!todayOutfit && !isRunning && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-16 text-center">
          <div className="w-16 h-16 bg-blush/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Wand2 className="w-8 h-8 text-blush" strokeWidth={1.5} />
          </div>
          <h3 className="font-medium text-charcoal mb-2">Pick your occasion above</h3>
          <p className="text-sm text-gray-400 max-w-xs mx-auto">Select an occasion and hit "Style Me" — your AI stylist will put together the perfect look.</p>
        </div>
      )}

      {/* Outfit result — two-column on desktop */}
      {todayOutfit && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* Left: outfit details */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-2 bg-blush/20 text-blush px-3 py-1.5 rounded-full text-sm font-medium">
                <Sparkles className="w-3.5 h-3.5" />{todayOutfit.occasion}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {outfitItems.map((item) => {
                const wears = item.wearCount ?? 0
                const needsWash = wears >= 2
                return (
                  <div key={item.id} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 relative">
                    {needsWash && (
                      <div className="absolute top-2 left-2 z-10 bg-amber-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        🧺 Wash
                      </div>
                    )}
                    <div className="aspect-square bg-gray-50">
                      <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-medium text-charcoal truncate">{item.name}</p>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-xs text-gray-400 capitalize">{item.category}</p>
                        <p className="text-xs text-gray-300">{wears}/2 wears</p>
                      </div>
                    </div>
                  </div>
                )
              })}
              {outfitItems.length === 0 && todayOutfit.itemIds.length > 0 && (
                <div className="col-span-full bg-amber-50 rounded-2xl p-4 text-sm text-amber-600">
                  Some suggested items were removed. Regenerate to get a fresh look.
                </div>
              )}
            </div>

            {/* Description + Style Tips */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
              <p className="text-sm text-charcoal font-medium">{todayOutfit.description}</p>
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Style Tips</p>
                <p className="text-sm text-gray-600 leading-relaxed">{todayOutfit.styleNotes}</p>
              </div>
            </div>

            {/* Expandable more ideas */}
            <button
              onClick={() => setShowTips(!showTips)}
              className="w-full flex items-center gap-2 text-sm text-gray-500 bg-white border border-gray-100 rounded-2xl px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <Lightbulb className="w-4 h-4 text-blush" />
              {showTips ? 'Hide ideas' : 'More style ideas & suggestions'}
            </button>
            {showTips && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3 text-sm text-gray-600 leading-relaxed">
                <p>💡 <strong>Accessorise:</strong> A belt, watch, or simple necklace can elevate this outfit from everyday to polished.</p>
                <p>👟 <strong>Shoe swap:</strong> Try white sneakers for a casual vibe, loafers for smart-casual, or boots for an edgier look.</p>
                <p>🎨 <strong>Colour rule:</strong> Stick to 2–3 colours max. Add a pop with accessories if the outfit feels too neutral.</p>
                <p>📦 <strong>Layer it:</strong> A light jacket, blazer, or overshirt can completely transform the outfit and make it more versatile.</p>
                <p>🧺 <strong>Laundry tip:</strong> Items worn 2+ times are flagged in your wardrobe — wash before wearing again for freshness.</p>
              </div>
            )}
          </div>

          {/* Right: virtual try-on */}
          <div className="space-y-3">
            {previewImage ? (
              <div className="relative rounded-2xl overflow-hidden bg-gray-50 border border-gray-100">
                <img src={previewImage} alt="Outfit preview" className="w-full object-cover" />
                <button
                  onClick={() => setPreviewImage(null)}
                  className="absolute top-2 right-2 bg-white/90 rounded-full p-1.5 hover:bg-white shadow"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
                {profilePhotos.length > 1 && (
                  <div className="absolute top-2 left-2 flex gap-1">
                    {profilePhotos.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => { setActivePhotoIdx(i); setPreviewImage(null) }}
                        className={`w-6 h-6 rounded-full overflow-hidden border-2 ${activePhotoIdx === i ? 'border-white' : 'border-white/40'}`}
                      >
                        <img src={profilePhotos[i]} className="w-full h-full object-cover" alt="" />
                      </button>
                    ))}
                  </div>
                )}
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/50 to-transparent px-4 py-4">
                  <p className="text-white text-xs font-medium">AI-generated outfit preview</p>
                </div>
              </div>
            ) : agentStep === 'preview' ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-blush mx-auto mb-3" />
                <p className="text-sm text-gray-500">Creating your virtual try-on…</p>
              </div>
            ) : config.provider !== 'ollama' ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center flex flex-col items-center gap-3">
                <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center">
                  <Camera className="w-7 h-7 text-gray-300" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-sm font-medium text-charcoal mb-1">Virtual Try-On</p>
                  <p className="text-xs text-gray-400 max-w-[200px]">
                    {primaryPhoto
                      ? 'Restyle to auto-generate, or try it manually'
                      : 'Add your photos above to see yourself wearing this outfit'}
                  </p>
                </div>
                {primaryPhoto && outfitItems.length > 0 && (
                  <button
                    onClick={manualPreview}
                    disabled={isRunning}
                    className="flex items-center gap-1.5 text-sm font-medium text-charcoal bg-gray-100 px-4 py-2 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
                  >
                    <Camera className="w-4 h-4" /> Try It On
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => e.target.files?.[0] && handlePhotoFile(e.target.files[0])} />
    </div>
  )
}
