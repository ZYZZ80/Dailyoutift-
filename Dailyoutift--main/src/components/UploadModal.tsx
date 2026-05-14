import { useState, useRef } from 'react'
import { Upload, AlertCircle, CheckCircle, Circle } from 'lucide-react'
import { analyzeClothing } from '../lib/claude'
import { addClothingItem, type AppConfig } from '../lib/storage'
import { uploadClothingImage, addItemCloud } from '../lib/cloud'
import type { ClothingItem, ClothingCategory } from '../types'
import { CLOTHING_CATEGORIES } from '../types'
import { Modal, Button, Select, Spinner } from './ui'

interface Props {
  config: AppConfig
  onClose: () => void
  onAdded: () => void
  userId?: string
}

/** Resize + compress image to max 800×800, JPEG 0.75 quality */
function compressImage(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const MAX = 800
      let { width, height } = img
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round((height * MAX) / width); width = MAX }
        else { width = Math.round((width * MAX) / height); height = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(dataUrl); return }
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.75))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

const CATEGORY_OPTIONS = CLOTHING_CATEGORIES.map((c) => ({
  value: c,
  label: c.charAt(0).toUpperCase() + c.slice(1),
}))

type AnalysisStep = 'idle' | 'uploading' | 'analyzing' | 'ready' | 'error'

export default function UploadModal({ config, onClose, onAdded, userId }: Props) {
  const [image, setImage] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [step, setStep] = useState<AnalysisStep>('idle')
  const [stepError, setStepError] = useState('')
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<ClothingCategory>('top')
  const [color, setColor] = useState('')
  const [tags, setTags] = useState('')
  const [saveError, setSaveError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const analyzeSeq = useRef(0)

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) { setSaveError('Please choose an image file.'); return }
    if (saving) return
    setSaveError('')
    setStep('uploading')
    const reader = new FileReader()
    reader.onload = async (e) => {
      const raw = e.target?.result as string
      const compressed = await compressImage(raw)
      setImage(compressed)
      setStep('analyzing')
      autoAnalyze(compressed)
    }
    reader.onerror = () => { setStep('error'); setStepError('Could not read this image. Please try another photo.') }
    reader.readAsDataURL(file)
  }

  async function autoAnalyze(imageData: string) {
    const seq = ++analyzeSeq.current
    setStepError('')
    try {
      const result = await analyzeClothing(imageData, config)
      if (seq !== analyzeSeq.current) return
      setName(result.name || '')
      setCategory((result.category as ClothingCategory) || 'top')
      setColor(result.color || '')
      setTags(Array.isArray(result.tags) ? result.tags.join(', ') : '')
      setStep('ready')
    } catch (e) {
      if (seq !== analyzeSeq.current) return
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('QUOTA_EXCEEDED') || msg.includes('quota') || msg.includes('429')) {
        setStepError('AI quota exceeded — fill in the details manually')
      } else if (msg.includes('INVALID_KEY')) {
        setStepError('Invalid API key — check your provider settings')
      } else if (msg.includes('not configured') || msg.includes('GEMINI_API_KEY')) {
        setStepError('Built-in AI unavailable — fill in the details manually')
      } else if (msg.includes('timed out')) {
        setStepError('AI took too long — fill in the details manually or try a clearer photo')
      } else {
        setStepError(`AI analysis failed — fill in the details manually`)
      }
      setStep('error')
      setTimeout(() => nameRef.current?.focus(), 100)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  async function handleSave() {
    if (!image) { setSaveError('Please add a photo first.'); return }
    if (!name.trim()) { setSaveError('Please enter a name for this item.'); nameRef.current?.focus(); return }
    setSaveError('')
    setSaving(true)
    try {
      const itemId = crypto.randomUUID()
      let imageUrl = image
      if (userId) {
        imageUrl = await uploadClothingImage(userId, itemId, image)
      }
      const item: ClothingItem = {
        id: itemId,
        name: name.trim(),
        category,
        color: color.trim(),
        image: imageUrl,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        uploadedAt: new Date().toISOString(),
      }
      if (userId) await addItemCloud(userId, item)
      addClothingItem(item)
      onAdded()
      onClose()
    } catch (e) {
      setSaveError('Could not save: ' + (e instanceof Error ? e.message : String(e)).substring(0, 120))
      setSaving(false)
    }
  }

  const canSave = !!image && name.trim().length > 0 && !saving

  // Analysis step indicator
  const steps: { label: string; done: boolean; active: boolean; isError?: boolean }[] = [
    { label: 'Photo uploaded', done: step !== 'idle' && step !== 'uploading', active: step === 'uploading' },
    { label: 'AI analyzing', done: step === 'ready', active: step === 'analyzing', isError: step === 'error' },
    { label: 'Ready to save', done: false, active: step === 'ready' || step === 'error' },
  ]

  return (
    <Modal title="Add Clothing Item" onClose={onClose} size="md">
      <div className="space-y-5">
        {/* Drop zone */}
        <div
          className={[
            'border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all',
            isDragging
              ? 'border-blush bg-blush/5 scale-[1.01]'
              : image
              ? 'border-[#E8E4DF] hover:border-blush'
              : 'border-[#E8E4DF] hover:border-blush hover:bg-surface-overlay',
          ].join(' ')}
          onClick={() => !saving && fileRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          role="button"
          tabIndex={0}
          aria-label="Upload clothing photo"
          onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
        >
          {image ? (
            <img src={image} alt="Clothing item preview" className="max-h-48 mx-auto rounded-xl object-contain" />
          ) : (
            <div className="space-y-2">
              <Upload className="w-8 h-8 text-charcoal-muted mx-auto" strokeWidth={1.5} />
              <p className="text-sm text-charcoal-muted">
                {isDragging ? 'Drop to upload' : 'Click or drag & drop a photo'}
              </p>
              <p className="text-xs text-charcoal-muted/50">Any size — photo is auto-compressed</p>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.currentTarget.value = ''
              if (file) handleFile(file)
            }}
          />
        </div>

        {/* Analysis step indicator */}
        {step !== 'idle' && (
          <div
            aria-live="polite"
            className="flex items-center justify-between gap-2 bg-surface-overlay rounded-xl px-4 py-3"
          >
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-1.5 flex-1">
                {s.done ? (
                  <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
                ) : s.active && s.isError ? (
                  <AlertCircle className="w-4 h-4 text-warning flex-shrink-0" />
                ) : s.active ? (
                  <Spinner size="sm" color="blush" />
                ) : (
                  <Circle className="w-4 h-4 text-charcoal-muted/30 flex-shrink-0" />
                )}
                <span
                  className={[
                    'text-xs font-medium',
                    s.done ? 'text-success-text' :
                    s.active && s.isError ? 'text-warning-text' :
                    s.active ? 'text-charcoal' :
                    'text-charcoal-muted/40',
                  ].join(' ')}
                >
                  {s.label}
                </span>
                {i < steps.length - 1 && (
                  <div className="flex-1 h-px bg-[#E8E4DF] ml-1" aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Analysis error message */}
        {step === 'error' && stepError && (
          <div className="flex items-start gap-2 text-xs text-warning-text bg-warning-bg rounded-xl px-4 py-2.5">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            {stepError}
          </div>
        )}

        {/* Fields */}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-charcoal-muted mb-1.5 block">
              Name <span className="text-danger" aria-label="required">*</span>
            </label>
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => { setName(e.target.value); setSaveError('') }}
              placeholder="e.g. White linen shirt"
              className="w-full border border-[#E8E4DF] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blush/40 transition-shadow"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-charcoal-muted mb-1.5 block">Category</label>
              <Select
                value={category}
                onChange={(v) => setCategory(v as ClothingCategory)}
                options={CATEGORY_OPTIONS}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-charcoal-muted mb-1.5 block">Color</label>
              <input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="e.g. Navy blue"
                className="w-full border border-[#E8E4DF] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blush/40"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-charcoal-muted mb-1.5 block">
              Tags <span className="font-normal text-charcoal-muted/50">(comma-separated)</span>
            </label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. casual, summer, loose fit"
              className="w-full border border-[#E8E4DF] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blush/40"
            />
          </div>
        </div>

        {saveError && (
          <div className="flex items-center gap-2 text-xs text-danger-text bg-danger-bg rounded-xl px-4 py-2.5">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {saveError}
          </div>
        )}

        <Button
          variant="primary"
          size="md"
          fullWidth
          onClick={handleSave}
          disabled={!canSave}
          loading={saving}
        >
          Add to Wardrobe
        </Button>

        {image && !name.trim() && !saving && (
          <p className="text-xs text-center text-charcoal-muted">
            {step === 'analyzing'
              ? 'AI is analyzing… or type the name above to save now'
              : 'Enter the item name above to save'}
          </p>
        )}
      </div>
    </Modal>
  )
}
