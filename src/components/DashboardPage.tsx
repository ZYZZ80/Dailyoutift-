import { CalendarDays, History, Images, Shirt, Sparkles, Wand2 } from 'lucide-react'
import type { ClothingItem, OutfitSuggestion, StyleImage } from '../types'
import type { AppConfig } from '../lib/storage'
import DailyOutfitPage from './DailyOutfitPage'
import Img from './Img'

interface Props {
  wardrobe: ClothingItem[]
  outfits: OutfitSuggestion[]
  styles: StyleImage[]
  todayOutfit: OutfitSuggestion | null
  config: AppConfig
  userId?: string
  onOutfitGenerated: () => void
  onOpenTab: (tab: 'wardrobe' | 'styles' | 'week' | 'history' | 'build') => void
}

export default function DashboardPage({
  wardrobe,
  outfits,
  styles,
  todayOutfit,
  config,
  userId,
  onOutfitGenerated,
  onOpenTab,
}: Props) {
  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d.toISOString().split('T')[0]
  })
  const plannedThisWeek = outfits.filter((outfit) => weekDates.includes(outfit.date)).length
  const recentStyles = styles.slice(0, 6)

  const cards = [
    { label: 'Wardrobe', value: wardrobe.length, icon: <Shirt className="w-4 h-4" />, tab: 'wardrobe' as const },
    { label: 'Styles', value: styles.length, icon: <Images className="w-4 h-4" />, tab: 'styles' as const },
    { label: 'This week', value: `${plannedThisWeek}/7`, icon: <CalendarDays className="w-4 h-4" />, tab: 'week' as const },
    { label: 'Generated', value: recentStyles.length, icon: <History className="w-4 h-4" />, tab: 'history' as const },
  ]

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-charcoal">Dashboard</h1>
            <p className="text-sm text-gray-400 mt-0.5">Your wardrobe, outfits, and generated style pictures.</p>
          </div>
          <button
            onClick={() => onOpenTab('build')}
            className="hidden sm:flex items-center gap-2 bg-charcoal text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-black transition-colors"
          >
            <Wand2 className="w-4 h-4" />
            Generate style
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map((card) => (
            <button
              key={card.label}
              onClick={() => onOpenTab(card.tab)}
              className="bg-white border border-gray-100 rounded-2xl p-4 text-left shadow-sm hover:border-gray-200 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 font-medium">{card.label}</span>
                <span className="text-gray-300">{card.icon}</span>
              </div>
              <p className="text-2xl font-semibold text-charcoal mt-2">{card.value}</p>
            </button>
          ))}
        </div>

        {recentStyles.length > 0 && (
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blush" />
                <p className="text-sm font-semibold text-charcoal">Recent generated pictures</p>
              </div>
              <button onClick={() => onOpenTab('styles')} className="text-xs text-gray-400 hover:text-charcoal">
                View all
              </button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {recentStyles.map((style) => (
                <button key={style.id} onClick={() => onOpenTab('styles')} className="aspect-square rounded-xl overflow-hidden bg-gray-50">
                  <Img src={style.image} alt="Generated style" thumb={400} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <DailyOutfitPage
        wardrobe={wardrobe}
        todayOutfit={todayOutfit}
        config={config}
        onOutfitGenerated={onOutfitGenerated}
        userId={userId}
      />
    </div>
  )
}
