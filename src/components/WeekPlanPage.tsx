import { useState } from 'react'
import { CalendarDays, Loader2, Sparkles, RefreshCw, ChevronRight } from 'lucide-react'
import type { ClothingItem, OutfitSuggestion } from '../types'
import { generateOutfit } from '../lib/claude'
import { saveOutfit, recordWear, type AppConfig } from '../lib/storage'
import { saveOutfitCloud } from '../lib/cloud'

interface Props {
  wardrobe: ClothingItem[]
  outfits: OutfitSuggestion[]
  config: AppConfig
  onUpdate: () => void
  userId?: string
}

const DAY_OCCASIONS = ['Casual', 'Work', 'Work', 'Work', 'Work', 'Casual', 'Casual'] // Mon–Sun defaults

function getWeekDates(): string[] {
  const today = new Date()
  const day = today.getDay() // 0=Sun
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((day + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d.toISOString().split('T')[0]
  })
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function WeekPlanPage({ wardrobe, outfits, config, onUpdate, userId }: Props) {
  const [generating, setGenerating] = useState<string | null>(null) // date being generated
  const [error, setError] = useState('')
  const [occasions, setOccasions] = useState<Record<string, string>>({})

  const weekDates = getWeekDates()
  const outfitMap = Object.fromEntries(outfits.map((o) => [o.date, o]))
  const wardrobeMap = Object.fromEntries(wardrobe.map((item) => [item.id, item]))

  function getOccasion(date: string, i: number) {
    return occasions[date] ?? DAY_OCCASIONS[i]
  }

  async function generateDay(date: string, occasion: string) {
    if (wardrobe.length < 2) { setError('Add at least 2 items to your wardrobe first!'); return }
    setGenerating(date)
    setError('')
    try {
      const result = await generateOutfit(wardrobe, date, config, occasion)
      const saved = { id: crypto.randomUUID(), ...result, generatedAt: new Date().toISOString() }
      saveOutfit(saved)
      recordWear(saved.itemIds)
      if (userId) saveOutfitCloud(userId, saved).catch(() => {})
      onUpdate()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('429') || msg.includes('quota')) setError('Quota exceeded — get a new API key')
      else setError(msg.substring(0, 100))
    } finally {
      setGenerating(null)
    }
  }

  async function planFullWeek() {
    if (wardrobe.length < 2) { setError('Add at least 2 items to your wardrobe first!'); return }
    setError('')
    for (let i = 0; i < weekDates.length; i++) {
      const date = weekDates[i]
      const occasion = getOccasion(date, i)
      await generateDay(date, occasion)
      // Small delay to avoid rate limiting
      if (i < weekDates.length - 1) await new Promise((r) => setTimeout(r, 800))
    }
  }

  const plannedCount = weekDates.filter((d) => outfitMap[d]).length

  // Count how many times each item is used this week
  const weeklyUsage: Record<string, number> = {}
  weekDates.forEach((date) => {
    const outfit = outfitMap[date]
    if (outfit) outfit.itemIds.forEach((id) => { weeklyUsage[id] = (weeklyUsage[id] ?? 0) + 1 })
  })

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-charcoal">Week Plan</h2>
          <p className="text-sm text-gray-400 mt-0.5">{plannedCount}/7 days planned</p>
        </div>
        <button
          onClick={planFullWeek}
          disabled={!!generating}
          className="flex items-center gap-2 bg-charcoal text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-black transition-colors disabled:opacity-50"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />}
          {generating ? `Planning ${DAY_NAMES[weekDates.indexOf(generating)]}…` : 'Plan My Week'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-500 rounded-2xl px-4 py-3 text-sm">{error}</div>
      )}

      {/* Progress bar */}
      {plannedCount > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
            <span>Week progress</span><span>{plannedCount}/7 days</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blush rounded-full transition-all duration-500"
              style={{ width: `${(plannedCount / 7) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* 7-day grid */}
      <div className="space-y-3">
        {weekDates.map((date, i) => {
          const outfit = outfitMap[date]
          const items = outfit ? outfit.itemIds.map((id) => wardrobeMap[id]).filter(Boolean) : []
          const isToday = date === new Date().toISOString().split('T')[0]
          const isPast = date < new Date().toISOString().split('T')[0]
          const isLoading = generating === date
          const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          const occasion = getOccasion(date, i)

          return (
            <div
              key={date}
              className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
                isToday ? 'border-blush/50 ring-1 ring-blush/20' : 'border-gray-100'
              }`}
            >
              {/* Day header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50">
                <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${
                  isToday ? 'bg-charcoal text-white' : isPast ? 'bg-gray-100 text-gray-400' : 'bg-cream text-charcoal'
                }`}>
                  <span className="text-[10px] font-medium leading-none">{DAY_NAMES[i]}</span>
                  <span className="text-sm font-bold leading-none mt-0.5">{dateLabel.split(' ')[1]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-charcoal">{DAY_NAMES[i]} · {dateLabel}</span>
                    {isToday && <span className="text-[10px] bg-blush/20 text-blush px-1.5 py-0.5 rounded-full font-medium">Today</span>}
                  </div>
                  {/* Occasion selector */}
                  <select
                    value={occasion}
                    onChange={(e) => setOccasions((prev) => ({ ...prev, [date]: e.target.value }))}
                    className="text-xs text-gray-400 bg-transparent mt-0.5 cursor-pointer focus:outline-none"
                  >
                    {['Casual','Work','Dining Out','Date Night','Party','Sports','Beach','Travel'].map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => generateDay(date, occasion)}
                  disabled={!!generating}
                  className="flex items-center gap-1.5 text-xs font-medium text-charcoal bg-gray-100 px-3 py-1.5 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-40"
                >
                  {isLoading
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : outfit ? <RefreshCw className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                  {isLoading ? 'Styling…' : outfit ? 'Redo' : 'Style'}
                </button>
              </div>

              {/* Outfit items */}
              {isLoading ? (
                <div className="px-4 py-4 flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin text-blush" />
                  <span>Finding the perfect look…</span>
                </div>
              ) : outfit && items.length > 0 ? (
                <div className="px-4 py-3 space-y-2">
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {items.map((item) => {
                      const usedThisWeek = weeklyUsage[item.id] ?? 0
                      return (
                        <div key={item.id} className="flex-shrink-0 w-16 text-center">
                          <div className={`w-16 h-16 rounded-xl overflow-hidden border ${usedThisWeek >= 2 ? 'border-amber-300' : 'border-gray-100'}`}>
                            <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                          </div>
                          <p className="text-[10px] text-gray-500 mt-1 truncate">{item.name}</p>
                          {usedThisWeek >= 2 && <p className="text-[9px] text-amber-500">×{usedThisWeek} this week</p>}
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] bg-blush/15 text-blush px-2 py-0.5 rounded-full">{outfit.occasion}</span>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{outfit.description}</p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-0.5" />
                  </div>
                </div>
              ) : (
                <div className="px-4 py-4 text-sm text-gray-300 italic">
                  No outfit planned yet
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Weekly insights */}
      {plannedCount >= 3 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blush" />
            <p className="text-sm font-semibold text-charcoal">Weekly Insights</p>
          </div>
          <div className="space-y-2 text-sm text-gray-600">
            {Object.entries(weeklyUsage).filter(([, c]) => c >= 2).length > 0 && (
              <p>🔁 <strong>{Object.entries(weeklyUsage).filter(([, c]) => c >= 2).length} items</strong> are being repeated this week — consider mixing in different pieces for variety.</p>
            )}
            {Object.entries(weeklyUsage).filter(([, c]) => c >= 2).length === 0 && (
              <p>✨ Great variety this week — you're using different items every day!</p>
            )}
            <p>📅 {plannedCount} of 7 days planned. {7 - plannedCount > 0 ? `${7 - plannedCount} more to go!` : 'Your whole week is sorted! 🎉'}</p>
            {wardrobe.filter((i) => !weeklyUsage[i.id]).length > 0 && (
              <p>👗 <strong>{wardrobe.filter((i) => !weeklyUsage[i.id]).length} items</strong> haven't been used this week — they're waiting to be styled!</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
