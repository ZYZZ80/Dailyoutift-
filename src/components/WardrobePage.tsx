import { useState, useRef } from 'react'
import { Plus, Trash2, Tag, Download, Upload } from 'lucide-react'
import type { ClothingItem, ClothingCategory } from '../types'
import { removeClothingItem, markWashed, exportBackup, importBackup, type AppConfig } from '../lib/storage'
import { removeItemCloud, addItemCloud } from '../lib/cloud'
import UploadModal from './UploadModal'

interface Props {
  wardrobe: ClothingItem[]
  config: AppConfig
  onUpdate: () => void
  userId?: string
}

const CATEGORY_COLORS: Record<ClothingCategory, string> = {
  top: 'bg-blue-100 text-blue-700',
  bottom: 'bg-purple-100 text-purple-700',
  dress: 'bg-pink-100 text-pink-700',
  shoes: 'bg-amber-100 text-amber-700',
  accessory: 'bg-green-100 text-green-700',
  outerwear: 'bg-gray-100 text-gray-700',
}

const FILTER_OPTIONS: (ClothingCategory | 'all' | 'wash')[] = ['all', 'wash', 'top', 'bottom', 'dress', 'shoes', 'accessory', 'outerwear']

export default function WardrobePage({ wardrobe, config, onUpdate, userId }: Props) {
  const [showUpload, setShowUpload] = useState(false)
  const [filter, setFilter] = useState<ClothingCategory | 'all' | 'wash'>('all')
  const [restoreMsg, setRestoreMsg] = useState('')
  const importRef = useRef<HTMLInputElement>(null)

  function handleImport(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const msg = importBackup(e.target?.result as string)
        setRestoreMsg(msg)
        onUpdate()
        setTimeout(() => setRestoreMsg(''), 5000)
      } catch {
        setRestoreMsg('Could not read backup file — make sure it\'s a valid Daily Stylist backup.')
        setTimeout(() => setRestoreMsg(''), 5000)
      }
    }
    reader.readAsText(file)
  }

  const needsWashCount = wardrobe.filter((item) => (item.wearCount ?? 0) >= 2).length

  const filtered =
    filter === 'all' ? wardrobe :
    filter === 'wash' ? wardrobe.filter((item) => (item.wearCount ?? 0) >= 2) :
    wardrobe.filter((item) => item.category === filter)

async function handleDelete(id: string) {
  await removeClothingItem(id)

  if (userId) {
    removeItemCloud(userId, id).catch(() => {})
  }

  onUpdate()
}

  async function handleWashed(item: ClothingItem) {
  await markWashed(item.id)

  if (userId) {
    const updated: ClothingItem = { ...item, wearCount: 0 }
    addItemCloud(userId, updated).catch(() => {})
  }

  onUpdate()
}
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-charcoal">My Wardrobe</h2>
          <p className="text-sm text-gray-400">{wardrobe.length} items{needsWashCount > 0 ? ` · ${needsWashCount} need washing` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Backup / Restore */}
          <button
            onClick={exportBackup}
            title="Download backup"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Backup
          </button>
          <button
            onClick={() => importRef.current?.click()}
            title="Restore from backup"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" /> Restore
          </button>
          <input ref={importRef} type="file" accept=".json,application/json" className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) handleImport(e.target.files[0]); e.target.value = '' }} />
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 bg-charcoal text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-black transition-colors">
            <Plus className="w-4 h-4" /> Add Item
          </button>
        </div>
      </div>

      {/* Restore message */}
      {restoreMsg && (
        <div className={`rounded-2xl px-4 py-3 text-sm flex items-center gap-2 ${restoreMsg.includes('Could not') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
          {restoreMsg.includes('Could not') ? '❌' : '✅'} {restoreMsg}
        </div>
      )}

      {/* Laundry alert */}
      {needsWashCount > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 flex items-center gap-3">
          <span className="text-xl">🧺</span>
          <div>
            <p className="text-sm font-medium text-amber-700">{needsWashCount} item{needsWashCount > 1 ? 's' : ''} need washing</p>
            <p className="text-xs text-amber-500">These items have been worn 2+ times. Use the filter below to find them.</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {FILTER_OPTIONS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors capitalize ${
              filter === f ? 'bg-charcoal text-white' : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
            }`}>
            {f === 'wash' && '🧺 '}
            {f === 'wash' ? `Needs wash${needsWashCount > 0 ? ` (${needsWashCount})` : ''}` : f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            {filter === 'wash' ? <span className="text-3xl">🧺</span> : <Tag className="w-7 h-7 text-gray-300" />}
          </div>
          <p className="text-gray-400 text-sm">
            {wardrobe.length === 0 ? 'No clothes yet — add your first item!' :
             filter === 'wash' ? 'All clean! No items need washing.' :
             'No items in this category'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((item) => {
            const wears = item.wearCount ?? 0
            const needsWash = wears >= 2
            return (
              <div key={item.id} className={`bg-white rounded-2xl overflow-hidden shadow-sm border group ${needsWash ? 'border-amber-200' : 'border-gray-100'}`}>
                <div className="relative aspect-square bg-gray-50">
                  <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                  {/* Wear dots */}
                  <div className="absolute bottom-2 left-2 flex gap-1">
                    {[0, 1].map((i) => (
                      <span key={i} className={`w-2 h-2 rounded-full ${i < wears ? 'bg-amber-400' : 'bg-white/60'}`} />
                    ))}
                  </div>
                  {needsWash && (
                    <div className="absolute top-2 left-2 bg-amber-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      🧺 Wash
                    </div>
                  )}
                  <button onClick={() => handleDelete(item.id)}
                    className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
                <div className="p-3 space-y-1.5">
                  <p className="text-sm font-medium text-charcoal truncate">{item.name}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${CATEGORY_COLORS[item.category]}`}>{item.category}</span>
                    {item.color && <span className="text-xs text-gray-400">{item.color}</span>}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-300">{wears}/2 wears</p>
                    {needsWash && (
                      <button
                        onClick={() => handleWashed(item)}
                        className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full hover:bg-amber-100 transition-colors font-medium"
                      >
                        Mark washed ✓
                      </button>
                    )}
                  </div>
                  {item.tags.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {item.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Stats bar */}
      {wardrobe.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-lg font-semibold text-charcoal">{wardrobe.length}</p>
            <p className="text-xs text-gray-400">Total items</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-amber-500">{needsWashCount}</p>
            <p className="text-xs text-gray-400">Need wash</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-sage">{wardrobe.filter(i => !i.lastWorn).length}</p>
            <p className="text-xs text-gray-400">Never worn</p>
          </div>
        </div>
      )}

           {showUpload && (
  <UploadModal
    config={config}
    onClose={() => setShowUpload(false)}
    onAdded={onUpdate}
  />
)}
