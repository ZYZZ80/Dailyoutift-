import { Download, ImageOff, Images, Loader2, Search, Sparkles, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ClothingItem, StyleImage } from '../types'
import Img from './Img'
import { convertImageFileToJpegDataUrl } from '../lib/image'
import { getStyles, saveStyles } from '../lib/storage'
import { saveStyleCloud, uploadStyleImage } from '../lib/cloud'

interface Props {
  styles: StyleImage[]
  wardrobe: ClothingItem[]
  userId?: string
  onDelete?: (styleId: string) => void
  onSaved?: () => void
}

const SOURCE_LABEL: Record<StyleImage['source'], string> = {
  'daily-preview': 'Daily try-on',
  'outfit-builder': 'Outfit builder',
  'try-on': 'Try before buy',
  imported: 'Imported design',
}

function getSourceLabel(source: StyleImage['source']) {
  return SOURCE_LABEL[source] ?? 'Generated style'
}

type Filter = 'all' | 'outfit-preview' | 'try-on' | 'imported'

export default function StylesPage({ styles, wardrobe, userId, onDelete, onSaved }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 })
  const [importMsg, setImportMsg] = useState('')
  const importRef = useRef<HTMLInputElement>(null)
  const wardrobeMap = Object.fromEntries(wardrobe.map((item) => [item.id, item]))
  const sourceFilteredStyles = styles.filter((style) => {
    if (filter === 'all') return true
    if (filter === 'try-on') return style.source === 'try-on'
    if (filter === 'imported') return style.source === 'imported'
    return style.source === 'daily-preview' || style.source === 'outfit-builder'
  })
  const searchTerm = search.trim().toLowerCase()
  const filteredStyles = searchTerm
    ? sourceFilteredStyles.filter((style) => {
        const itemText = style.itemIds.map((id) => wardrobeMap[id]?.name ?? id).join(' ')
        return [
          getSourceLabel(style.source),
          style.createdAt,
          itemText,
        ].some((value) => value.toLowerCase().includes(searchTerm))
      })
    : sourceFilteredStyles
  const filters: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: styles.length },
    { id: 'outfit-preview', label: 'Outfit preview', count: styles.filter((s) => s.source === 'daily-preview' || s.source === 'outfit-builder').length },
    { id: 'try-on', label: 'Try-on', count: styles.filter((s) => s.source === 'try-on').length },
    { id: 'imported', label: 'Imported', count: styles.filter((s) => s.source === 'imported').length },
  ]

  async function importPictures(files: FileList | null) {
    const selected = Array.from(files ?? []).filter((file) => file.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp)$/i.test(file.name))
    if (selected.length === 0) return

    setImporting(true)
    setImportProgress({ done: 0, total: selected.length })
    setImportMsg('')
    let imported = 0
    let failed = 0
    try {
      for (let index = 0; index < selected.length; index += 1) {
        const file = selected[index]
        try {
          const converted = await convertImageFileToJpegDataUrl(file, 900, 0.65)
          const localStyle: StyleImage = {
            id: crypto.randomUUID(),
            image: converted.dataUrl,
            itemIds: [],
            source: 'imported',
            createdAt: new Date(Date.now() - index).toISOString(),
          }

          if (userId) {
            const imageUrl = await uploadStyleImage(userId, localStyle.id, localStyle.image)
            const cloudStyle = { ...localStyle, image: imageUrl }
            await saveStyleCloud(userId, cloudStyle)
            saveStyles([cloudStyle, ...getStyles().filter((style) => style.id !== cloudStyle.id)])
          } else {
            saveStyles([localStyle, ...getStyles()])
          }
          imported += 1
          onSaved?.()
        } catch {
          failed += 1
        } finally {
          setImportProgress({ done: index + 1, total: selected.length })
          await new Promise((resolve) => window.setTimeout(resolve, 50))
        }
      }

      if (imported === 0) throw new Error('Could not import these pictures. Try fewer files or smaller images.')
      setImportMsg(
        failed > 0
          ? `Imported ${imported} picture${imported === 1 ? '' : 's'}. ${failed} failed; try those again one at a time.`
          : `Imported ${imported} generated picture${imported === 1 ? '' : 's'} to ${userId ? 'your account' : 'this browser'}.`,
      )
    } catch (error) {
      setImportMsg(error instanceof Error ? error.message : 'Could not import generated pictures.')
    } finally {
      setImporting(false)
      setImportProgress({ done: 0, total: 0 })
      if (importRef.current) importRef.current.value = ''
    }
  }

  function downloadStyle(style: StyleImage) {
    const a = document.createElement('a')
    a.href = style.image
    a.download = `style-${style.createdAt.split('T')[0]}-${style.id}.jpg`
    a.click()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold text-charcoal">Styles History</h2>
          <p className="text-sm text-gray-400 mt-0.5">{styles.length} saved generated picture{styles.length === 1 ? '' : 's'} from daily outfits, builder designs, and try-ons</p>
        </div>
        <button
          type="button"
          onClick={() => importRef.current?.click()}
          disabled={importing}
          className="inline-flex items-center gap-2 btn-coral px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
        >
          {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {importing && importProgress.total > 0 ? `${importProgress.done}/${importProgress.total}` : 'Import pictures'}
        </button>
        <input
          ref={importRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          className="hidden"
          onChange={(event) => void importPictures(event.target.files)}
        />
      </div>
      {importMsg && (
        <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3 text-sm text-gray-500">
          {importMsg}
        </div>
      )}

      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search style history"
            className="w-full bg-white border border-gray-200 rounded-2xl pl-10 pr-4 py-3 text-sm text-charcoal placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-charcoal/10 focus:border-charcoal/30"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {filters.map((item) => (
            <button
              key={item.id}
              onClick={() => setFilter(item.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === item.id ? 'btn-sky' : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {item.label} {item.count > 0 ? `(${item.count})` : ''}
            </button>
          ))}
        </div>
      </div>

      {filteredStyles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
          <ImageOff className="w-12 h-12 text-gray-200" />
          <p className="text-gray-400 text-sm">{styles.length === 0 ? 'No saved style history yet.' : 'No generated pictures match this view.'}</p>
          <p className="text-gray-300 text-xs">{styles.length === 0 ? 'Generate a try-on, builder image, or outfit photo and it will appear here.' : 'Try another filter or search term.'}</p>
        </div>
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredStyles.map((style) => {
          const items = style.itemIds.map((id) => wardrobeMap[id]).filter(Boolean)
          const created = new Date(style.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })

          return (
            <div key={style.id} className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
              <div className="relative bg-gray-50">
                <Img src={style.image} alt="Saved generated style" thumb={500} className="w-full aspect-[4/5] object-cover" />
                <div className="absolute top-2 left-2 inline-flex items-center gap-1.5 bg-white/90 text-charcoal px-2 py-1 rounded-full text-[10px] font-medium shadow-sm">
                  <Sparkles className="w-3 h-3 text-blush" />
                  {getSourceLabel(style.source)}
                </div>
                <div className="absolute top-2 right-2 flex flex-col gap-1.5">
                  <button
                    onClick={() => downloadStyle(style)}
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
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Images className="w-4 h-4 text-gray-300 flex-shrink-0" />
                    <span className="text-sm font-medium text-charcoal truncate">Saved style</span>
                  </div>
                  <span className="text-xs text-gray-300 flex-shrink-0">{created}</span>
                </div>

                {items.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {items.map((item) => (
                      <div key={item.id} className="flex-shrink-0 w-12">
                        <Img src={item.image} alt={item.name} thumb={100} className="w-12 h-12 rounded-xl object-cover border border-gray-100" />
                        <p className="text-[9px] text-gray-400 mt-1 truncate text-center">{item.name}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      )}
    </div>
  )
}
