import { useState, useRef, useEffect } from 'react'
import { RefreshCw, Calendar, Wand2, Lightbulb } from 'lucide-react'
import type { ClothingItem, OutfitSuggestion, Occasion } from '../types'
import { generateOutfit } from '../lib/claude'
import { generateOutfitPreview } from '../lib/preview'
import { saveOutfit, getProfilePhotos, saveProfilePhotos, recordWear, type AppConfig } from '../lib/storage'
import { saveOutfitCloud, uploadProfilePhoto, uploadStylePreviewImage } from '../lib/cloud'
import { Card, Button, EmptyState } from './ui'
import { useToast } from '../contexts/ToastContext'
import { OccasionPicker } from './daily/OccasionPicker'
import { ProfilePhotoUploader } from './daily/ProfilePhotoUploader'
import { OutfitItemsGrid } from './daily/OutfitItemsGrid'
import { TryOnPanel } from './daily/TryOnPanel'

interface Props {
  wardrobe: ClothingItem[]
  todayOutfit: OutfitSuggestion | null
  config: AppConfig
  onOutfitGenerated: () => void
  userId?: string
}

type AgentStep = 'idle' | 'outfit' | 'preview' | 'done'

export default function DailyOutfitPage({ wardrobe, todayOutfit, config, onOutfitGenerated, userId }: Props) {
  const [selectedOccasion, setSelectedOccasion] = useState<Occasion>('Casual')
  const [agentStep, setAgentStep] = useState<AgentStep>('idle')
  const [profilePhotos, setProfilePhotos] = useState<string[]>(() => getProfilePhotos())
  const [activePhotoIdx, setActivePhotoIdx] = useState(0)
  const [previewImage, setPreviewImage] = useState<string | null>(todayOutfit?.previewImage ?? null)
  const [showTips, setShowTips] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const uploadingSlot = useRef<number>(0)
  const toast = useToast()

  const today = new Date().toISOString().split('T')[0]
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const outfitItems = todayOutfit ? wardrobe.filter((item) => todayOutfit.itemIds.includes(item.id)) : []
  const isRunning = agentStep === 'outfit' || agentStep === 'preview'
  const primaryPhoto = profilePhotos[activePhotoIdx] ?? profilePhotos[0] ?? ''

  useEffect(() => {
    setPreviewImage(todayOutfit?.previewImage ?? null)
  }, [todayOutfit?.id, todayOutfit?.previewImage])

  async function savePreviewToOutfit(outfit: OutfitSuggestion, imageDataUrl: string, source: 'auto' | 'manual') {
    let finalImageUrl = imageDataUrl
    if (userId) {
      try { finalImageUrl = await uploadStylePreviewImage(userId, outfit.id, imageDataUrl) }
      catch { /* keep local */ }
    }
    const withPreview: OutfitSuggestion = {
      ...outfit,
      previewImage: finalImageUrl,
      previewGeneratedAt: new Date().toISOString(),
      previewSource: source,
    }
    setPreviewImage(finalImageUrl)
    saveOutfit(withPreview)
    if (userId) saveOutfitCloud(userId, withPreview).catch(() => {})
    onOutfitGenerated()
  }

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
    if (wardrobe.length < 2) { toast.error('Add at least 2 clothing items first!'); return }
    setPreviewImage(null)
    setAgentStep('outfit')
    let savedOutfit: OutfitSuggestion | null = null
    let outfitResult: Omit<OutfitSuggestion, 'id' | 'generatedAt'> | null = null
    try {
      outfitResult = await generateOutfit(wardrobe, today, config, selectedOccasion)
      savedOutfit = { id: crypto.randomUUID(), ...outfitResult, generatedAt: new Date().toISOString() }
      saveOutfit(savedOutfit)
      recordWear(savedOutfit.itemIds)
      if (userId) saveOutfitCloud(userId, savedOutfit).catch(() => {})
      onOutfitGenerated()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('429') || msg.includes('quota')) toast.error('Quota exceeded — try a new API key')
      else if (msg.includes('401') || msg.includes('403') || msg.includes('API_KEY')) toast.error('Invalid API key — check your provider settings')
      else toast.error(msg.substring(0, 120))
      setAgentStep('idle')
      return
    }

    if (primaryPhoto && config.provider !== 'ollama' && outfitResult) {
      setAgentStep('preview')
      try {
        const items = wardrobe.filter((item) => (outfitResult!.itemIds as string[]).includes(item.id))
        if (items.length > 0) {
          const url = await generateOutfitPreview(primaryPhoto, items, config)
          if (url && savedOutfit) await savePreviewToOutfit(savedOutfit, url, 'auto')
        }
      } catch { /* skip silently */ }
    }

    setAgentStep('done')
    setTimeout(() => setAgentStep('idle'), 800)
  }

  async function manualPreview() {
    if (!outfitItems.length || !primaryPhoto) return
    setAgentStep('preview')
    try {
      const url = await generateOutfitPreview(primaryPhoto, outfitItems, config)
      if (url && todayOutfit) await savePreviewToOutfit(todayOutfit, url, 'manual')
    } catch (e) {
      toast.error('Preview failed: ' + (e instanceof Error ? e.message : '').substring(0, 80))
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
        <h2 className="text-2xl font-bold text-charcoal">Today's Outfit</h2>
        <div className="flex items-center gap-1.5 text-sm text-charcoal-muted mt-0.5">
          <Calendar className="w-3.5 h-3.5" />
          {todayLabel}
        </div>
      </div>

      {/* Control panel */}
      <Card padding="md" className="space-y-4">
        <OccasionPicker value={selectedOccasion} onChange={setSelectedOccasion} />

        <ProfilePhotoUploader
          photos={profilePhotos}
          activeIdx={activePhotoIdx}
          onSelect={setActivePhotoIdx}
          onUpload={openPhotoUpload}
          onRemove={removePhoto}
        />

        {/* Generate button + progress */}
        <div className="pt-1 border-t border-[#E8E4DF] space-y-3">
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              size="md"
              loading={isRunning}
              leftIcon={todayOutfit ? <RefreshCw className="w-4 h-4" /> : <Wand2 className="w-4 h-4" />}
              onClick={runAgent}
              disabled={isRunning}
            >
              {buttonLabel}
            </Button>
            <p className="text-xs text-charcoal-muted">
              {primaryPhoto && !isRunning && 'Photo ready · try-on auto-generates'}
              {!primaryPhoto && !isRunning && 'Add a photo above for virtual try-on'}
            </p>
          </div>

          {/* Progress indicator */}
          {isRunning && (
            <div className="flex items-center gap-3 text-xs">
              <div className={`flex items-center gap-1.5 ${agentStep === 'outfit' ? 'text-charcoal font-medium' : 'text-charcoal-muted/30'}`}>
                <span className={`w-2 h-2 rounded-full ${agentStep === 'outfit' ? 'bg-blush animate-pulse' : 'bg-[#E8E4DF]'}`} />
                Picking outfit
              </div>
              <div className="w-6 h-px bg-[#E8E4DF]" />
              <div className={`flex items-center gap-1.5 ${agentStep === 'preview' ? 'text-charcoal font-medium' : 'text-charcoal-muted/30'}`}>
                <span className={`w-2 h-2 rounded-full ${agentStep === 'preview' ? 'bg-blush animate-pulse' : 'bg-[#E8E4DF]'}`} />
                Generating photo
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Empty state */}
      {!todayOutfit && !isRunning && (
        <EmptyState
          icon={Wand2}
          title="Pick your occasion above"
          description={'Select an occasion and hit "Style Me" — your AI stylist will put together the perfect look.'}
        />
      )}

      {/* Outfit result */}
      {todayOutfit && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left: details */}
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 bg-blush/20 text-blush-dark px-3 py-1.5 rounded-full text-sm font-medium">
              {todayOutfit.occasion}
            </div>

            <OutfitItemsGrid
              items={outfitItems}
              missingItemsWarning={outfitItems.length === 0 && todayOutfit.itemIds.length > 0}
            />

            <Card padding="md" className="space-y-3">
              <p className="text-sm text-charcoal font-medium">{todayOutfit.description}</p>
              <div className="border-t border-[#E8E4DF] pt-3">
                <p className="text-xs font-semibold text-charcoal-muted uppercase tracking-wider mb-2">Style Tips</p>
                <p className="text-sm text-charcoal-muted leading-relaxed">{todayOutfit.styleNotes}</p>
              </div>
            </Card>

            <button
              onClick={() => setShowTips(!showTips)}
              aria-expanded={showTips}
              className="w-full flex items-center gap-2 text-sm text-charcoal-muted bg-white border border-[#E8E4DF] rounded-2xl px-4 py-3 hover:bg-surface-overlay transition-colors"
            >
              <Lightbulb className="w-4 h-4 text-blush" />
              {showTips ? 'Hide ideas' : 'More style ideas & suggestions'}
            </button>

            {showTips && (
              <Card padding="md" className="space-y-3 text-sm text-charcoal-muted leading-relaxed animate-slide-up">
                <p><strong className="text-charcoal">Accessorise:</strong> A belt, watch, or simple necklace can elevate this look from everyday to polished.</p>
                <p><strong className="text-charcoal">Shoe swap:</strong> Try white sneakers for casual, loafers for smart-casual, or boots for an edgier look.</p>
                <p><strong className="text-charcoal">Colour rule:</strong> Stick to 2–3 colours max. Add a pop with accessories if the outfit feels too neutral.</p>
                <p><strong className="text-charcoal">Layer it:</strong> A light jacket, blazer, or overshirt can completely transform the outfit.</p>
                <p><strong className="text-charcoal">Laundry tip:</strong> Items worn 2+ times are flagged — wash before wearing again for freshness.</p>
              </Card>
            )}
          </div>

          {/* Right: try-on */}
          <TryOnPanel
            previewImage={previewImage}
            isLoading={agentStep === 'preview'}
            hasOutfitItems={outfitItems.length > 0}
            hasPrimaryPhoto={!!primaryPhoto}
            isOllama={config.provider === 'ollama'}
            profilePhotos={profilePhotos}
            activePhotoIdx={activePhotoIdx}
            onPhotoSelect={setActivePhotoIdx}
            onManualPreview={manualPreview}
            onDismiss={() => setPreviewImage(null)}
          />
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handlePhotoFile(file)
          e.currentTarget.value = ''
        }}
      />
    </div>
  )
}
