import { useState } from 'react'
import { Download, ImageOff, Trash2, X } from 'lucide-react'
import type { StyleImage } from '../types'

interface Props {
  styles: StyleImage[]
  onDelete?: (styleId: string) => void
}

export default function HistoryPage({ styles, onDelete }: Props) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null)

  function download(image: string, id: string) {
    const a = document.createElement('a')
    a.href = image
    a.download = `generated-style-${id}.jpg`
    a.click()
  }

  if (styles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
        <ImageOff className="w-12 h-12 text-gray-200" />
        <p className="text-gray-400 text-sm">No generated pictures yet.</p>
        <p className="text-gray-300 text-xs">Your generated style photos will appear here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-charcoal">Generated Pictures</h2>
        <p className="text-sm text-gray-400 mt-0.5">{styles.length} saved image{styles.length === 1 ? '' : 's'}</p>
      </div>

      {expandedImage && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setExpandedImage(null)}>
          <img src={expandedImage} alt="Generated style" className="max-w-full max-h-full rounded-2xl object-contain" />
          <button
            className="absolute top-4 right-4 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white hover:bg-white/30"
            onClick={() => setExpandedImage(null)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {styles.map((style) => (
          <div key={style.id} className="relative rounded-2xl overflow-hidden bg-gray-50 border border-gray-100 shadow-sm">
            <button onClick={() => setExpandedImage(style.image)} className="block w-full">
              <img src={style.image} alt="Generated style" className="w-full aspect-[4/5] object-cover" />
            </button>
            <div className="absolute top-2 right-2 flex flex-col gap-1.5">
              <button
                onClick={() => download(style.image, style.id)}
                className="bg-white/90 p-2 rounded-full shadow-sm hover:bg-white transition-colors"
                title="Download"
              >
                <Download className="w-4 h-4 text-gray-600" />
              </button>
              {onDelete && (
                <button
                  onClick={() => onDelete(style.id)}
                  className="bg-white/90 p-2 rounded-full shadow-sm hover:bg-red-50 transition-colors"
                  title="Remove"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
