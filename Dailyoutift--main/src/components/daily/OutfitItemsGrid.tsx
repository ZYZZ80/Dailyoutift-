import { RotateCcw } from 'lucide-react'
import type { ClothingItem } from '../../types'
import { Badge } from '../ui'

interface Props {
  items: ClothingItem[]
  missingItemsWarning?: boolean
}

export function OutfitItemsGrid({ items, missingItemsWarning }: Props) {
  if (missingItemsWarning && items.length === 0) {
    return (
      <div className="col-span-full bg-warning-bg border border-warning/20 rounded-2xl p-4 text-sm text-warning-text">
        Some suggested items were removed from your wardrobe. Regenerate to get a fresh look.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((item) => {
        const wears = item.wearCount ?? 0
        const needsWash = wears >= 2
        return (
          <div
            key={item.id}
            className={[
              'bg-white rounded-2xl overflow-hidden border',
              needsWash ? 'border-warning/30' : 'border-[#E8E4DF]',
            ].join(' ')}
          >
            {/* Wash badge */}
            {needsWash && (
              <div className="pt-2 px-2">
                <Badge variant="warning" size="sm" dot>
                  <RotateCcw className="w-2.5 h-2.5 mr-0.5" aria-hidden="true" />
                  Wash
                </Badge>
              </div>
            )}
            <div className="aspect-square bg-surface-overlay">
              <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
            </div>
            <div className="p-3">
              <p className="text-sm font-medium text-charcoal truncate">{item.name}</p>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-xs text-charcoal-muted capitalize">{item.category}</span>
                <span className="text-xs text-charcoal-muted/50">Worn {wears}/2</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
