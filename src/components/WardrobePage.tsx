import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { ClothingItem, ClothingCategory } from '../types'
import { removeClothingItem, markWashed } from '../lib/storage'
import UploadModal from './UploadModal'

interface Props {
  wardrobe: ClothingItem[]
  onUpdate: () => void
}

const CATEGORIES: (ClothingCategory | 'all')[] = [
  'all', 'top', 'bottom', 'dress', 'shoes', 'accessory', 'outerwear'
]

export default function WardrobePage({ wardrobe, onUpdate }: Props) {
  const [showUpload, setShowUpload] = useState(false)
  const [filter, setFilter] = useState<ClothingCategory | 'all'>('all')

  const filtered =
    filter === 'all'
      ? wardrobe
      : wardrobe.filter((item) => item.category === filter)

  async function handleDelete(id: string) {
    await removeClothingItem(id)
    onUpdate()
  }

  async function handleWashed(item: ClothingItem) {
    await markWashed(item.id)
    onUpdate()
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-charcoal">My Wardrobe</h2>
          <p className="text-sm text-gray-400">
            {wardrobe.length} items
          </p>
        </div>

        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-xl"
        >
          <Plus className="w-4 h-4" />
          Add Item
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`px-3 py-1 rounded-full text-xs ${
              filter === c
                ? 'bg-black text-white'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <p className="text-center text-gray-400 py-10">
          No items yet
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-xl border overflow-hidden"
            >
              <div className="relative aspect-square">
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />

                <button
                  onClick={() => handleDelete(item.id)}
                  className="absolute top-2 right-2 bg-white p-1 rounded-full"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>

              <div className="p-2 text-sm">
                <p className="font-medium">{item.name}</p>
                <p className="text-gray-400 text-xs">{item.category}</p>

                <button
                  onClick={() => handleWashed(item)}
                  className="text-xs text-blue-500 mt-1"
                >
                  Mark washed
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onAdded={onUpdate}
        />
      )}

    </div>
  )
}
