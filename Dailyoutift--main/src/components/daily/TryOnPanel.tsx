import { Camera, X } from 'lucide-react'
import { Button, Spinner } from '../ui'

interface Props {
  previewImage: string | null
  isLoading: boolean
  hasOutfitItems: boolean
  hasPrimaryPhoto: boolean
  isOllama: boolean
  profilePhotos: string[]
  activePhotoIdx: number
  onPhotoSelect: (i: number) => void
  onManualPreview: () => void
  onDismiss: () => void
}

export function TryOnPanel({
  previewImage,
  isLoading,
  hasOutfitItems,
  hasPrimaryPhoto,
  isOllama,
  profilePhotos,
  activePhotoIdx,
  onPhotoSelect,
  onManualPreview,
  onDismiss,
}: Props) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-[#E8E4DF] shadow-sm p-10 text-center">
        <Spinner size="lg" color="blush" className="mx-auto mb-3" />
        <p className="text-sm text-charcoal-muted">Creating your virtual try-on…</p>
      </div>
    )
  }

  if (previewImage) {
    return (
      <div className="relative rounded-2xl overflow-hidden bg-surface-overlay border border-[#E8E4DF]">
        <img src={previewImage} alt="AI-generated outfit preview" className="w-full object-cover" />
        <button
          onClick={onDismiss}
          aria-label="Dismiss preview"
          className="absolute top-2 right-2 bg-white/90 rounded-full p-1.5 hover:bg-white shadow transition-colors"
        >
          <X className="w-4 h-4 text-charcoal-muted" />
        </button>
        {profilePhotos.length > 1 && (
          <div className="absolute top-2 left-2 flex gap-1">
            {profilePhotos.map((ph, i) => (
              <button
                key={i}
                onClick={() => { onPhotoSelect(i); onDismiss() }}
                aria-label={`Switch to photo ${i + 1}`}
                className={[
                  'w-6 h-6 rounded-full overflow-hidden border-2 transition-all',
                  activePhotoIdx === i ? 'border-white' : 'border-white/40',
                ].join(' ')}
              >
                <img src={ph} className="w-full h-full object-cover" alt="" />
              </button>
            ))}
          </div>
        )}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/50 to-transparent px-4 py-4">
          <p className="text-white text-xs font-medium">AI-generated outfit preview</p>
        </div>
      </div>
    )
  }

  if (isOllama) return null

  return (
    <div className="bg-white rounded-2xl border border-[#E8E4DF] shadow-sm p-8 text-center flex flex-col items-center gap-3">
      <div className="w-14 h-14 bg-surface-overlay rounded-2xl flex items-center justify-center">
        <Camera className="w-7 h-7 text-charcoal-muted/40" strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-sm font-semibold text-charcoal mb-1">Virtual Try-On</p>
        <p className="text-xs text-charcoal-muted max-w-[200px] mx-auto">
          {hasPrimaryPhoto
            ? 'Restyle to auto-generate, or try it on manually'
            : 'Add your photo above to see yourself wearing this outfit'}
        </p>
      </div>
      {hasPrimaryPhoto && hasOutfitItems && (
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Camera className="w-4 h-4" />}
          onClick={onManualPreview}
        >
          Try It On
        </Button>
      )}
    </div>
  )
}
