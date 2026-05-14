import { useState, useRef, memo } from 'react'
import { Plus, Trash2, Tag, Download, Upload, RotateCcw, Search, X } from 'lucide-react'
import type { ClothingItem, ClothingCategory } from '../types'
import { CLOTHING_CATEGORIES } from '../types'
import { removeClothingItem, markWashed, exportBackup, importBackup, getWardrobe, saveWardrobe, type AppConfig } from '../lib/storage'
import { removeItemCloud, addItemCloud } from '../lib/cloud'
import UploadModal from './UploadModal'
import { Badge, Button, Card, EmptyState, Tabs } from './ui'
import { useToast } from '../contexts/ToastContext'

interface Props {
  wardrobe: ClothingItem[]
  config: AppConfig
  onUpdate: () => void
  userId?: string
}

interface ItemCardProps {
  item: ClothingItem
  onDelete: (id: string) => void
  onWashed: (item: ClothingItem) => void
}

const WardrobeItemCard = memo(function WardrobeItemCard({ item, onDelete, onWashed }: ItemCardProps) {
  const wears = item.wearCount ?? 0
  const needsWash = wears >= 2

  return (
    <div
      className={[
        'bg-white rounded-2xl overflow-hidden border group transition-shadow hover:shadow-md',
        needsWash ? 'border-warning/40' : 'border-[#E8E4DF]',
      ].join(' ')}
    >
      <div className="relative aspect-square bg-surface-overlay">
        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />

        {/* Wear count dots */}
        <div
          className="absolute bottom-2 left-2 flex gap-1"
          aria-label={`Worn ${wears} of 2 times`}
        >
          {[0, 1].map((i) => (
            <span
              key={i}
              aria-hidden="true"
              className={['w-2 h-2 rounded-full', i < wears ? 'bg-warning' : 'bg-white/70'].join(' ')}
            />
          ))}
        </div>

        {/* Needs wash badge */}
        {needsWash && (
          <div className="absolute top-2 left-2">
            <Badge variant="warning" size="sm" dot>
              Wash
            </Badge>
          </div>
        )}

        {/* Delete button */}
        <button
          onClick={() => onDelete(item.id)}
          aria-label={`Remove ${item.name}`}
          className="absolute top-2 right-2 p-2 bg-white/90 rounded-xl opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all hover:bg-danger-bg"
        >
          <Trash2 className="w-3.5 h-3.5 text-danger" />
        </button>
      </div>

      <div className="p-3 space-y-2">
        <p className="text-sm font-medium text-charcoal truncate">{item.name}</p>

        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant={item.category}>{item.category}</Badge>
          {item.color && <span className="text-xs text-charcoal-muted">{item.color}</span>}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-charcoal-muted">Worn {wears}/2</p>
          {needsWash && (
            <button
              onClick={() => onWashed(item)}
              className="flex items-center gap-1 text-xs text-warning-text bg-warning-bg px-2.5 py-1 rounded-full hover:bg-warning/20 transition-colors font-medium"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              Washed
            </button>
          )}
        </div>

        {item.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {item.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="text-xs text-charcoal-muted bg-surface-overlay px-2 py-0.5 rounded-full">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
})

export default function WardrobePage({ wardrobe, config, onUpdate, userId }: Props) {
  const [showUpload, setShowUpload] = useState(false)
  const [filter, setFilter] = useState<ClothingCategory | 'all' | 'wash'>('all')
  const [search, setSearch] = useState('')
  const importRef = useRef<HTMLInputElement>(null)
  const toast = useToast()

  function handleImport(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const msg = importBackup(e.target?.result as string)
        toast.success(msg)
        onUpdate()
      } catch {
        toast.error('Could not read backup file — make sure it\'s a valid Daily Stylist backup.')
      }
    }
    reader.readAsText(file)
  }

  const needsWashCount = wardrobe.filter((item) => (item.wearCount ?? 0) >= 2).length

  const byFilter =
    filter === 'all' ? wardrobe :
    filter === 'wash' ? wardrobe.filter((item) => (item.wearCount ?? 0) >= 2) :
    wardrobe.filter((item) => item.category === filter)

  const q = search.toLowerCase().trim()
  const filtered = q
    ? byFilter.filter((item) =>
        item.name.toLowerCase().includes(q) ||
        item.color.toLowerCase().includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q)),
      )
    : byFilter

  function handleDelete(id: string) {
    removeClothingItem(id)
    if (userId) removeItemCloud(userId, id).catch(() => {})
    onUpdate()
  }

  function handleWashed(item: ClothingItem) {
    markWashed(item.id)
    if (userId) {
      const updated: ClothingItem = { ...item, wearCount: 0 }
      // addItemCloud also migrates base64 images to Storage and returns the URL
      addItemCloud(userId, updated).then((saved) => {
        if (saved.image !== updated.image) {
          // Image was migrated to Storage — update localStorage with the new URL
          saveWardrobe(getWardrobe().map((i) => i.id === saved.id ? saved : i))
        }
      }).catch(() => {})
    }
    onUpdate()
  }

  // Build tabs with counts
  const filterTabs = [
    { id: 'all', label: 'All', count: wardrobe.length },
    { id: 'wash', label: 'Needs Wash', count: needsWashCount },
    ...CLOTHING_CATEGORIES.map((cat) => ({
      id: cat,
      label: cat.charAt(0).toUpperCase() + cat.slice(1),
      count: wardrobe.filter((i) => i.category === cat).length,
    })),
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-charcoal">My Wardrobe</h2>
          <p className="text-sm text-charcoal-muted mt-0.5">
            {wardrobe.length} items{needsWashCount > 0 ? ` · ${needsWashCount} need washing` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Download className="w-3.5 h-3.5" />}
            onClick={exportBackup}
          >
            Backup
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Upload className="w-3.5 h-3.5" />}
            onClick={() => importRef.current?.click()}
          >
            Restore
          </Button>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) handleImport(e.target.files[0])
              e.target.value = ''
            }}
          />
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setShowUpload(true)}
          >
            Add Item
          </Button>
        </div>
      </div>

      {/* Stats — at top */}
      {wardrobe.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card padding="md" className="text-center">
            <p className="text-2xl font-bold text-charcoal">{wardrobe.length}</p>
            <p className="text-xs text-charcoal-muted mt-0.5">Total items</p>
          </Card>
          <Card padding="md" className="text-center">
            <p className="text-2xl font-bold text-warning">{needsWashCount}</p>
            <p className="text-xs text-charcoal-muted mt-0.5">Need wash</p>
          </Card>
          <Card padding="md" className="text-center">
            <p className="text-2xl font-bold text-sage">{wardrobe.filter((i) => !i.lastWorn).length}</p>
            <p className="text-xs text-charcoal-muted mt-0.5">Never worn</p>
          </Card>
        </div>
      )}

      {/* Laundry alert */}
      {needsWashCount > 0 && (
        <div className="bg-warning-bg border border-warning/20 rounded-2xl px-4 py-3 flex items-center gap-3">
          <RotateCcw className="w-5 h-5 text-warning flex-shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-warning-text">
              {needsWashCount} item{needsWashCount > 1 ? 's' : ''} need washing
            </p>
            <p className="text-xs text-warning/70 mt-0.5">
              These items have been worn 2+ times. Use the filter below to find them.
            </p>
          </div>
        </div>
      )}

      {/* Search */}
      {wardrobe.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-muted pointer-events-none" />
          <input
            type="search"
            placeholder="Search by name, color or tag…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-[#E8E4DF] rounded-xl pl-9 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blush/50 text-charcoal placeholder:text-charcoal-muted/50"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal-muted hover:text-charcoal"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Filters */}
      <Tabs tabs={filterTabs} active={filter} onChange={(id) => setFilter(id as typeof filter)} />

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={search ? Search : filter === 'wash' ? RotateCcw : Tag}
          title={
            wardrobe.length === 0 ? 'No clothes yet' :
            search ? `No results for "${search}"` :
            filter === 'wash' ? 'All clean!' :
            'No items in this category'
          }
          description={
            wardrobe.length === 0 ? 'Add your first item to get started.' :
            search ? 'Try a different name, color, or tag.' :
            filter === 'wash' ? 'None of your items need washing right now.' :
            undefined
          }
          action={
            wardrobe.length === 0
              ? { label: 'Add Item', onClick: () => setShowUpload(true) }
              : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((item) => (
            <WardrobeItemCard
              key={item.id}
              item={item}
              onDelete={handleDelete}
              onWashed={handleWashed}
            />
          ))}
        </div>
      )}

      {showUpload && (
        <UploadModal
          config={config}
          onClose={() => setShowUpload(false)}
          onAdded={onUpdate}
          userId={userId}
        />
      )}
    </div>
  )
}
