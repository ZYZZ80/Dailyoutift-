import { Plus, X } from 'lucide-react'

const PHOTO_LABELS = ['Front', 'Side', 'Full body']

interface Props {
  photos: string[]
  activeIdx: number
  onSelect: (i: number) => void
  onUpload: (slot: number) => void
  onRemove: (slot: number) => void
}

export function ProfilePhotoUploader({ photos, activeIdx, onSelect, onUpload, onRemove }: Props) {
  return (
    <div>
      <p className="text-xs font-semibold text-charcoal-muted uppercase tracking-wider mb-2">
        Your Photos
      </p>
      <div className="flex items-center gap-2">
        {PHOTO_LABELS.map((label, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div
              className={[
                'relative w-14 h-14 rounded-xl overflow-hidden border-2 transition-all cursor-pointer',
                photos[i]
                  ? activeIdx === i
                    ? 'border-charcoal ring-2 ring-charcoal/20'
                    : 'border-transparent hover:border-blush'
                  : 'border-dashed border-[#E8E4DF] hover:border-blush bg-surface-overlay',
              ].join(' ')}
              onClick={() => (photos[i] ? onSelect(i) : onUpload(i))}
              role="button"
              aria-label={photos[i] ? `Select ${label} photo` : `Upload ${label} photo`}
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && (photos[i] ? onSelect(i) : onUpload(i))}
            >
              {photos[i] ? (
                <>
                  <img src={photos[i]} alt={label} className="w-full h-full object-cover" />
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemove(i) }}
                    aria-label={`Remove ${label} photo`}
                    className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center hover:bg-black transition-colors"
                  >
                    <X className="w-2.5 h-2.5 text-white" />
                  </button>
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Plus className="w-5 h-5 text-charcoal-muted/40" />
                </div>
              )}
            </div>
            <span className="text-xs text-charcoal-muted/60">{label}</span>
          </div>
        ))}
        <p className="text-xs text-charcoal-muted ml-2 leading-snug">
          {photos.length > 0
            ? 'Tap to select for try-on'
            : 'Add photos for virtual try-on'}
        </p>
      </div>
    </div>
  )
}
