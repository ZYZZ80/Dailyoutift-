import { useState, useRef, useEffect } from 'react'
import {
  ShoppingBag, Download, Sparkles, X,
  Camera, Plus, RefreshCw, CheckCircle, Info,
} from 'lucide-react'
import type { AppConfig } from '../lib/storage'
import { getProfilePhotos, getStyles, saveProfilePhotos, saveStyles } from '../lib/storage'
import { saveProfilePhotosCloud, saveStyleCloud, uploadStyleImage, uploadProfilePhoto } from '../lib/cloud'
import { convertImageFileToJpegDataUrl } from '../lib/image'
import { generationQueue, useGenerationJob } from '../lib/generationQueue'
import type { StyleImage } from '../types'
import { authFetch } from '../lib/authFetch'

interface Props {
  config: AppConfig
  userId?: string
  onSaved?: () => void
}

const MAX_ITEMS = 5

async function readApiJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(`AI server returned ${res.status} with an unreadable response.`)
  }
}

const EXAMPLES = [
  { label: 'Top', emoji: '👕' },
  { label: 'Bottom', emoji: '👖' },
  { label: 'Shoes', emoji: '👟' },
  { label: 'Jacket', emoji: '🧥' },
  { label: 'Dress', emoji: '👗' },
]

export default function TryOnPage({ userId, onSaved }: Props) {
  const [itemImages, setItemImages] = useState<string[]>([])
  const [bodyImage, setBodyImage] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [profilePhotos, setProfilePhotos] = useState<string[]>(() => getProfilePhotos())
  const [activeProfileIdx, setActiveProfileIdx] = useState(0)

  // Background-job state — survives page navigation
  const job = useGenerationJob()
  const isMyJob = job?.kind === 'try-on'
  const loading = isMyJob && job?.status === 'running'

  const itemRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLInputElement>(null)

  async function saveTryOnStyle(image: string): Promise<StyleImage> {
    const style: StyleImage = {
      id: crypto.randomUUID(),
      image,
      itemIds: [],
      source: 'try-on',
      createdAt: new Date().toISOString(),
    }

    // Keep a recovery copy first so Pictures never loses a finished try-on
    // because of a temporary Supabase table, storage, or network issue.
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
      console.warn('Try-on cloud save failed; kept local recovery copy:', message)
      return style
    }
  }

  // When the queue's job for this page finishes, pull the result into local state
  useEffect(() => {
    if (isMyJob && job?.status === 'done' && job.result) {
      setResult(job.result.imageBase64)
      setDescription(job.result.description ?? '')
      setSaved(true)
    } else if (isMyJob && job?.status === 'error') {
      setError(job.error?.substring(0, 140) ?? 'Generation failed')
    }
  }, [job?.id, job?.status])

  // Refresh profile photos when window regains focus (in case user added on another page)
  useEffect(() => {
    const onFocus = () => setProfilePhotos(getProfilePhotos())
    window.addEventListener('daily-stylist-profile-photos', onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('daily-stylist-profile-photos', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  async function handleItemFile(file: File) {
    if (itemImages.length >= MAX_ITEMS) {
      setError(`You can add up to ${MAX_ITEMS} items at once`)
      return
    }
    try {
      const { dataUrl } = await convertImageFileToJpegDataUrl(file, 1200, 0.75)
      setItemImages((prev) => [...prev, dataUrl])
      setResult(null)
      setSaved(false)
      setError('')
    } catch (e) {
      setError('Could not load item photo: ' + (e instanceof Error ? e.message : String(e)).substring(0, 120))
    }
  }

  function removeItem(index: number) {
    setItemImages((prev) => prev.filter((_, i) => i !== index))
    setResult(null)
    setSaved(false)
  }

  async function handleBodyFile(file: File) {
    try {
      const { dataUrl } = await convertImageFileToJpegDataUrl(file, 1200, 0.75)
      setBodyImage(dataUrl)
      setError('')

      // Save as profile photo if signed in
      if (userId) {
        const photos = [...getProfilePhotos(), dataUrl].slice(0, 5)
        saveProfilePhotos(photos)
        setProfilePhotos(getProfilePhotos())
        try {
          const url = await uploadProfilePhoto(userId, dataUrl)
          const cloudPhotos = [...getProfilePhotos().filter((photo) => photo !== dataUrl), url].slice(0, 5)
          saveProfilePhotos(cloudPhotos)
          setProfilePhotos(cloudPhotos)
          await saveProfilePhotosCloud(userId, cloudPhotos)
        } catch { /* ignore */ }
      }
    } catch (e) {
      setError('Could not load photo: ' + (e instanceof Error ? e.message : String(e)).substring(0, 80))
    }
  }

  const effectiveBodyImage = bodyImage ?? profilePhotos[activeProfileIdx] ?? null

  async function runTryOn() {
    if (itemImages.length === 0) { setError('Add at least one clothing item photo'); return }
    if (loading) return // prevent double-submit
    setError('')
    setResult(null)
    setSaved(false)

    const items = [...itemImages]
    const body = effectiveBodyImage ?? undefined
    generationQueue.start({
      kind: 'try-on',
      origin: 'tryon',
      label: `Trying on ${items.length} item${items.length !== 1 ? 's' : ''}`,
      runner: async () => {
        const res = await authFetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'try-on', itemsBase64: items, bodyBase64: body }),
        })
        const data = await readApiJson(res)
        if (!res.ok) {
          if (res.status === 429) throw new Error('AI quota exceeded - try again later')
          const details = typeof data.details === 'string' ? data.details : ''
          const error = typeof data.error === 'string' ? data.error : ''
          throw new Error(details || error || `Server error ${res.status}`)
        }
        const imageBase64 = data.imageBase64 as string
        const desc = typeof data.description === 'string' ? data.description : ''
        if (imageBase64) await saveTryOnStyle(imageBase64)

        // Auto-save to Styles & History — happens in the background
        return { imageBase64, description: desc }
      },
    })
  }

  function downloadResult() {
    if (!result) return
    const a = document.createElement('a')
    a.href = result
    a.download = `try-on-${Date.now()}.jpg`
    a.click()
  }

  async function saveToStyles() {
    if (!result || saved) return
    try {
      await saveTryOnStyle(result)
      setSaved(true)
    } catch (e) {
      setError('Could not save: ' + (e instanceof Error ? e.message : '').substring(0, 60))
    }
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <ShoppingBag className="w-5 h-5 text-blush" />
          <h2 className="text-2xl font-semibold text-charcoal">Try Before You Buy</h2>
        </div>
        <p className="text-sm text-gray-400">
          Upload up to {MAX_ITEMS} clothing photos — combine top, bottom, shoes, anything — and see the full look on you.
        </p>
      </div>

      {/* Main two-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* ── Left: Item photos ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-6 h-6 bg-charcoal text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">1</div>
            <p className="text-sm font-semibold text-charcoal">Clothing Items</p>
            <span className="text-xs text-gray-400">{itemImages.length}/{MAX_ITEMS}</span>
          </div>

          {/* Grid of uploaded items + add button */}
          <div className="grid grid-cols-3 gap-2">
            {itemImages.map((img, i) => (
              <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-gray-100 bg-gray-50 group">
                <img src={img} alt={`Item ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  onClick={() => removeItem(i)}
                  className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
                  title="Remove"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
                <div className="absolute bottom-1 left-1 bg-white/90 text-[10px] font-medium text-charcoal rounded-full px-1.5 py-0.5">
                  #{i + 1}
                </div>
              </div>
            ))}
            {itemImages.length < MAX_ITEMS && (
              <button
                onClick={() => itemRef.current?.click()}
                className="aspect-square border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center hover:border-blush hover:bg-blush/5 transition-colors group"
              >
                <Plus className="w-6 h-6 text-gray-300 group-hover:text-blush transition-colors" />
                <span className="text-[10px] text-gray-400 group-hover:text-blush mt-1 font-medium">
                  {itemImages.length === 0 ? 'Add item' : 'Add more'}
                </span>
              </button>
            )}
          </div>

          {itemImages.length === 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-400">💡 Mix any combination:</p>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map((ex) => (
                  <span key={ex.label} className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded-full">
                    {ex.emoji} {ex.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {itemImages.length > 0 && (
            <p className="text-xs text-gray-400">
              {itemImages.length === 1
                ? 'Add more items to build a complete outfit, or generate now.'
                : `${itemImages.length} items ready — AI will combine them on you.`}
            </p>
          )}

          <input ref={itemRef} type="file" accept="image/*,.heic,.heif" className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) handleItemFile(e.target.files[0]); e.target.value = '' }} />
        </div>

        {/* ── Right: Body photo ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-charcoal text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">2</div>
            <p className="text-sm font-semibold text-charcoal">Your Photo</p>
            <span className="text-xs text-gray-400">— optional</span>
          </div>

          {/* Existing profile photos */}
          {profilePhotos.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-2">Saved photos — tap to select:</p>
              <div className="flex gap-2 flex-wrap">
                {profilePhotos.map((photo, i) => (
                  <button
                    key={i}
                    onClick={() => { setActiveProfileIdx(i); setBodyImage(null) }}
                    className={`relative w-14 h-14 rounded-xl overflow-hidden border-2 transition-all ${
                      !bodyImage && activeProfileIdx === i
                        ? 'border-charcoal ring-2 ring-charcoal/20'
                        : 'border-gray-100 hover:border-gray-300'
                    }`}
                  >
                    <img src={photo} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                    {!bodyImage && activeProfileIdx === i && (
                      <div className="absolute inset-0 bg-charcoal/20 flex items-center justify-center">
                        <CheckCircle className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {bodyImage ? (
            <div className="relative rounded-xl overflow-hidden bg-gray-50 border border-charcoal/30">
              <img src={bodyImage} alt="Your photo" className="w-full max-h-56 object-contain" />
              <div className="absolute top-2 left-2 text-[10px] bg-charcoal text-white px-2 py-0.5 rounded-full font-medium">Selected</div>
              <button
                onClick={() => setBodyImage(null)}
                className="absolute top-2 right-2 bg-white/90 p-1.5 rounded-full shadow hover:bg-white"
              >
                <X className="w-3.5 h-3.5 text-gray-500" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => bodyRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-blush hover:bg-blush/5 transition-colors group"
            >
              <Camera className="w-7 h-7 text-gray-300 group-hover:text-blush mx-auto mb-2 transition-colors" />
              <p className="text-sm text-gray-400 group-hover:text-gray-500">
                {profilePhotos.length > 0 ? 'Upload a different photo' : 'Upload your photo'}
              </p>
              <p className="text-xs text-gray-300 mt-1">Full body works best</p>
            </button>
          )}

          {!effectiveBodyImage && (
            <div className="flex items-start gap-2 bg-blue-50 rounded-xl px-3 py-2.5">
              <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-500 leading-relaxed">
                No photo? We'll generate a styled product shot of just the items.
              </p>
            </div>
          )}

          <input ref={bodyRef} type="file" accept="image/*,.heic,.heif" className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) handleBodyFile(e.target.files[0]); e.target.value = '' }} />
        </div>
      </div>

      {/* ── Generate button ── */}
      <button
        onClick={runTryOn}
        disabled={itemImages.length === 0 || loading}
        className="w-full flex items-center justify-center gap-2.5 btn-mint py-4 rounded-2xl text-base font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading
          ? <><Sparkles className="w-5 h-5 animate-pulse" /> Generating in background…</>
          : result
            ? <><RefreshCw className="w-5 h-5" /> Try Again</>
            : <><Sparkles className="w-5 h-5" /> Try It On</>
        }
      </button>

      {loading && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Shimmering skeleton — feels much faster than a static spinner */}
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
                Styling you with {itemImages.length} item{itemImages.length !== 1 ? 's' : ''} — feel free to browse other tabs
              </p>
            </div>
            <p className="text-[11px] text-gray-300">
              You'll get a notification when it's ready ✨
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 rounded-2xl px-4 py-3 flex items-start gap-2">
          <Info className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}

      {/* ── Result ── */}
      {result && !loading && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="relative">
            <img src={result} alt="Try-on result" className="w-full object-cover" />
            <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-blush" />
              <span className="text-xs font-medium text-charcoal">AI Try-On</span>
            </div>
          </div>

          {description && (
            <div className="px-5 pt-4">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Outfit detected</p>
              <p className="text-sm text-charcoal">{description}</p>
            </div>
          )}

          <div className="p-5 flex flex-wrap gap-2">
            <button
              onClick={downloadResult}
              className="flex items-center gap-1.5 btn-sky px-4 py-2.5 rounded-xl text-sm font-medium"
            >
              <Download className="w-4 h-4" /> Download
            </button>
            {userId && (
              <button
                onClick={saveToStyles}
                disabled={saved}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  saved
                    ? 'bg-green-50 text-green-600 border border-green-200 cursor-default'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {saved
                  ? <><CheckCircle className="w-4 h-4" /> Saved</>
                  : <><Plus className="w-4 h-4" /> Save to Styles</>
                }
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── How it works ── */}
      {!result && !loading && itemImages.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-semibold text-charcoal mb-3">How it works</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: '📸', title: 'Add items', desc: `Upload up to ${MAX_ITEMS} photos — top, bottom, shoes, etc.` },
              { icon: '🪄', title: 'AI dresses you', desc: 'Items are combined into one realistic photo of you.' },
              { icon: '✅', title: 'Decide before buying', desc: 'See the full outfit before spending money.' },
            ].map((step) => (
              <div key={step.title} className="text-center space-y-1.5">
                <div className="text-2xl">{step.icon}</div>
                <p className="text-xs font-semibold text-charcoal">{step.title}</p>
                <p className="text-xs text-gray-400 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
