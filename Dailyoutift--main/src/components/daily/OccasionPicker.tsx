import React from 'react'
import {
  Sun, Briefcase, UtensilsCrossed, Moon, Sparkles, Activity, Waves, Plane,
} from 'lucide-react'
import type { Occasion } from '../../types'
import { OCCASIONS } from '../../types'

interface Props {
  value: Occasion
  onChange: (o: Occasion) => void
}

const ICON_MAP: Record<Occasion, React.ElementType> = {
  Casual: Sun,
  Work: Briefcase,
  'Dining Out': UtensilsCrossed,
  'Date Night': Moon,
  Party: Sparkles,
  Sports: Activity,
  Beach: Waves,
  Travel: Plane,
}

export function OccasionPicker({ value, onChange }: Props) {
  return (
    <div>
      <p className="text-xs font-semibold text-charcoal-muted uppercase tracking-wider mb-3">
        What's the occasion?
      </p>
      <div className="flex flex-wrap gap-2">
        {OCCASIONS.map((occ) => {
          const Icon = ICON_MAP[occ]
          const isActive = value === occ
          return (
            <button
              key={occ}
              onClick={() => onChange(occ)}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush',
                isActive
                  ? 'bg-charcoal text-white shadow-sm'
                  : 'bg-surface-overlay text-charcoal-muted hover:bg-[#E8E4DF] hover:text-charcoal',
              ].join(' ')}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              {occ}
            </button>
          )
        })}
      </div>
    </div>
  )
}
