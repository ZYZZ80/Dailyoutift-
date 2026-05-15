import { useRef, useState } from 'react'
import { AlertCircle, Loader2, Sparkles, Upload, X } from 'lucide-react'
import { analyzeClothing } from '../lib/claude'
import { addItemCloud, uploadClothingImage } from '../lib/cloud'
import { convertImageFileToJpegDataUrl } from '../lib/image'
import type { AppConfig } from '../lib/storage'
import type { ClothingCategory, ClothingItem } from '../types'

interface Props {
  config: AppConfig
  onClose: () => void
  onAdded: () => void
  userId?: string
}

const CATEGORIES: ClothingCategory[] = ['top', 'bottom', 'dress', 'shoes', 'accessory', 'outerwear']

export default function UploadModal({ config, onClose, onAdded, userId }: Props) {
  const [image, setImage] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<ClothingCategory>('top')
  const [color, setColor] = useState('')
  const [tags, setTags] = useState('')
  const [analyzeError, setAnalyzeError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [imageError, setImageError] = useState('')
  const [analyzed, setAnalyzed] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setImageError('')
    setSaveError('')
    try {
      const { dataUrl } = await convertImageFileToJpegDataUrl(file, 1200, 0.75)
      setImage(dataUrl)
      setAnalyzed(false)
      setAnalyzeError('')
      autoAnalyze(dataUrl)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setImageError(msg)
      setAnalyzeError('iPad/Safari image issue: choose a JPEG/PNG photo or take a screenshot and upload that.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function autoAnalyze(imageData: string) {
    setAnalyzing(true)
    setAnalyzeError('')
    try {
      const result = await analyzeClothing(imageData, config)
      setName(result.name)
      setCategory((result.category as ClothingCategory) || 'top')
      setColor(result.color)
      setTags(result.tags.join(', '))
      setAnalyzed(true)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('QUOTA_EXCEEDED') || msg.includes('quota') || msg.includes('429')) {
        setAnalyzeError('AI quota exceeded — fill in the details below manually')
      } else if (msg.includes('INVALID_KEY') || msg.includes('401') || msg.includes('403')) {
        setAnalyzeError('Invalid API key — open Settings to update the AI provider')
      } else if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed to fetch')) {
        setAnalyzeError('No internet — fill in the details below manually')
      } else {
        setAnalyzeError('AI couldn\'t read the photo — fill in the details below manually')
      }
      setTimeout(() => nameRef.current?.focus(), 100)
    } finally {
      setAnalyzing(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  async function handleSave() {
    if (!image) { setSaveError('Please add a photo first.'); return }
    if (!name.trim()) { setSaveError('Please enter a name for this item.'); nameRef.current?.focus(); return }
    setSaveError('')
    setSaving(true)

    try {
      if (!userId) throw new Error('Please sign in before saving wardrobe items.')
      const itemId = crypto.randomUUID()
      const imageUrl = await uploadClothingImage(userId, itemId, image)
      const item: ClothingItem = {
        id: itemId,
        name: name.trim(),
        category,
        color: color.trim(),
        image: imageUrl,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        uploadedAt: new Date().toISOString(),
      }

      await addItemCloud(userId, item)
      onAdded()
      onClose()
    } catch (e) {
      setSaveError('Could not save item: ' + (e instanceof Error ? e.message : String(e)).substring(0, 160))
      setSaving(false)
    }
  }

  const canSave = !!image && name.trim().length > 0 && !saving

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-charcoal">Add Clothing Item</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors" disabled={saving}>
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div
            className="border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center cursor-pointer hover:border-blush transition-colors"
            onClick={() => !saving && fileRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            {image ? (
              <img src={image} alt="clothing" className="max-h-48 mx-auto rounded-xl object-contain" />
            ) : (
              <div className="space-y-2">
                <Upload className="w-8 h-8 text-gray-300 mx-auto" />
                <p className="text-sm text-gray-400">Click or drag &amp; drop a photo</p>
                <p className="text-xs text-gray-300">iPad-safe: converts to JPEG before preview/upload</p>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.heic,.heif"
              className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.currentTarget.value = '' }}
            />
          </div>

          {imageError && (
            <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 rounded-xl px-4 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span className="break-words">{imageError}</span>
            </div>
          )}

          {analyzing && (
            <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 rounded-xl px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
              <span>AI is analyzing your item, or fill in the details below now</span>
            </div>
          )}
          {analyzed && !analyzeError && (
            <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-xl px-4 py-2">
              <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
              AI filled in the details - review and edit if needed
            </div>
          )}
          {analyzeError && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-xl px-4 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>{analyzeError}</span>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Name <span className="text-red-400">*</span></label>
              <input
                ref={nameRef}
                value={name}
                onChange={(e) => { setName(e.target.value); setSaveError('') }}
                placeholder="e.g. White linen shirt"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blush/40"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value as ClothingCategory)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blush/40 bg-white capitalize">
                  {CATEGORIES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Color</label>
                <input value={color} onChange={(e) => setColor(e.target.value)} placeholder="e.g. Navy blue"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blush/40" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Tags (comma separated)</label>
              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. casual, summer, loose fit"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blush/40" />
            </div>
          </div>

          {saveError && (
            <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 rounded-xl px-4 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {saveError}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={!canSave}
            className="w-full btn-sky rounded-xl py-3 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Add to Wardrobe'}
          </button>

          {image && !name.trim() && !saving && (
            <p className="text-xs text-center text-gray-400">
              {analyzing ? 'Waiting for AI, or type the item name above to save now' : 'Type the item name above to enable saving'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
