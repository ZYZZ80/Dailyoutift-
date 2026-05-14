import { memo, useState } from 'react'
import { CalendarDays, RefreshCw, Sparkles, RotateCcw, Calendar, Shirt } from 'lucide-react'
import type { ClothingItem, OutfitSuggestion } from '../types'
import { OCCASIONS } from '../types'
import { generateOutfit } from '../lib/claude'
import { saveOutfit, recordWear, type AppConfig } from '../lib/storage'
import { saveOutfitCloud } from '../lib/cloud'
import { Button, Card, EmptyState, Select, Spinner } from './ui'
import { useToast } from '../contexts/ToastContext'

interface Props {
  wardrobe: ClothingItem[]
  outfits: OutfitSuggestion[]
  config: AppConfig
  onUpdate: () => void
  userId?: string
}

const DAY_OCCASIONS = ['Casual', 'Work', 'Work', 'Work', 'Work', 'Casual', 'Casual']

function getWeekDates(): string[] {
  const today = new Date()
  const day = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((day + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d.toISOString().split('T')[0]
  })
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const OCCASION_OPTIONS = OCCASIONS.map((o) => ({ value: o, label: o }))

const WeekPlanPage = memo(function WeekPlanPage({ wardrobe, outfits, config, onUpdate, userId }: Props) {
  const [generating, setGenerating] = useState<string | null>(null)
  const [occasions, setOccasions] = useState<Record<string, string>>({})
  const toast = useToast()

  const weekDates = getWeekDates()
  const outfitMap = Object.fromEntries(outfits.map((o) => [o.date, o]))
  const wardrobeMap = Object.fromEntries(wardrobe.map((item) => [item.id, item]))

  function getOccasion(date: string, i: number) {
    return occasions[date] ?? DAY_OCCASIONS[i]
  }

  async function generateDay(date: string, occasion: string) {
    if (wardrobe.length < 2) { toast.error('Add at least 2 items to your wardrobe first!'); return }
    setGenerating(date)
    try {
      const result = await generateOutfit(wardrobe, date, config, occasion)
      const saved = { id: crypto.randomUUID(), ...result, generatedAt: new Date().toISOString() }
      saveOutfit(saved)
      recordWear(saved.itemIds)
      if (userId) saveOutfitCloud(userId, saved).catch(() => {})
      onUpdate()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('429') || msg.includes('quota')) toast.error('Quota exceeded — try a new API key')
      else toast.error(msg.substring(0, 100))
    } finally {
      setGenerating(null)
    }
  }

  async function planFullWeek() {
    if (wardrobe.length < 2) { toast.error('Add at least 2 items to your wardrobe first!'); return }
    for (let i = 0; i < weekDates.length; i++) {
      const date = weekDates[i]
      const occasion = getOccasion(date, i)
      await generateDay(date, occasion)
      if (i < weekDates.length - 1) await new Promise((r) => setTimeout(r, 800))
    }
  }

  const plannedCount = weekDates.filter((d) => outfitMap[d]).length

  const weeklyUsage: Record<string, number> = {}
  weekDates.forEach((date) => {
    const outfit = outfitMap[date]
    if (outfit) outfit.itemIds.forEach((id) => { weeklyUsage[id] = (weeklyUsage[id] ?? 0) + 1 })
  })

  const repeatedItems = Object.entries(weeklyUsage).filter(([, c]) => c >= 2).length
  const unusedItems = wardrobe.filter((i) => !weeklyUsage[i.id]).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-charcoal">Week Plan</h2>
          <p className="text-sm text-charcoal-muted mt-0.5">{plannedCount}/7 days planned</p>
        </div>
        <Button
          variant="primary"
          size="md"
          leftIcon={generating ? undefined : <CalendarDays className="w-4 h-4" />}
          loading={!!generating}
          onClick={planFullWeek}
          disabled={!!generating}
        >
          {generating ? `Planning ${DAY_NAMES[weekDates.indexOf(generating!)]}…` : 'Plan My Week'}
        </Button>
      </div>

      {/* Progress bar */}
      {plannedCount > 0 && (
        <Card padding="md">
          <div className="flex items-center justify-between text-xs text-charcoal-muted mb-2">
            <span>Week progress</span>
            <span className="font-medium">{plannedCount}/7 days</span>
          </div>
          <div className="h-2 bg-surface-overlay rounded-full overflow-hidden">
            <div
              className="h-full bg-blush rounded-full transition-all duration-500"
              style={{ width: `${(plannedCount / 7) * 100}%` }}
            />
          </div>
        </Card>
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
              className={[
                'bg-white rounded-2xl border shadow-sm overflow-hidden',
                isToday ? 'border-blush/40 ring-1 ring-blush/20' : 'border-[#E8E4DF]',
              ].join(' ')}
            >
              {/* Day header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E8E4DF]">
                <div
                  className={[
                    'w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0',
                    isToday ? 'bg-charcoal text-white' : isPast ? 'bg-surface-overlay text-charcoal-muted' : 'bg-cream text-charcoal',
                  ].join(' ')}
                >
                  <span className="text-2xs font-medium leading-none">{DAY_NAMES[i]}</span>
                  <span className="text-sm font-bold leading-none mt-0.5">{dateLabel.split(' ')[1]}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-charcoal">{DAY_NAMES[i]} · {dateLabel}</span>
                    {isToday && (
                      <span className="text-xs bg-blush/20 text-blush-dark px-1.5 py-0.5 rounded-full font-medium">Today</span>
                    )}
                  </div>
                  <Select
                    value={occasion}
                    onChange={(v) => setOccasions((prev) => ({ ...prev, [date]: v }))}
                    options={OCCASION_OPTIONS}
                    size="sm"
                    className="max-w-[160px]"
                  />
                </div>

                <button
                  onClick={() => generateDay(date, occasion)}
                  disabled={!!generating}
                  className="flex items-center gap-1.5 text-xs font-medium text-charcoal bg-surface-overlay px-3 py-1.5 rounded-xl hover:bg-[#E8E4DF] transition-colors disabled:opacity-40"
                >
                  {isLoading ? <Spinner size="sm" /> : outfit ? <RefreshCw className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                  {isLoading ? 'Styling…' : outfit ? 'Redo' : 'Style'}
                </button>
              </div>

              {/* Outfit items */}
              {isLoading ? (
                <div className="px-4 py-4 flex items-center gap-2 text-sm text-charcoal-muted">
                  <Spinner size="sm" color="blush" />
                  Finding the perfect look…
                </div>
              ) : outfit && items.length > 0 ? (
                <div className="px-4 py-3 space-y-2">
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {items.map((item) => {
                      const usedThisWeek = weeklyUsage[item.id] ?? 0
                      return (
                        <div key={item.id} className="flex-shrink-0 w-16 text-center">
                          <div
                            className={[
                              'w-16 h-16 rounded-xl overflow-hidden border',
                              usedThisWeek >= 2 ? 'border-warning/40' : 'border-[#E8E4DF]',
                            ].join(' ')}
                          >
                            <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                          </div>
                          <p className="text-2xs text-charcoal-muted mt-1 truncate">{item.name}</p>
                          {usedThisWeek >= 2 && (
                            <p className="text-2xs text-warning">×{usedThisWeek} this week</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-xs bg-blush/15 text-blush-dark px-2 py-0.5 rounded-full">{outfit.occasion}</span>
                      <p className="text-xs text-charcoal-muted mt-1 line-clamp-2">{outfit.description}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={Calendar}
                  title="No outfit planned"
                  compact
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Weekly insights */}
      {plannedCount >= 3 && (
        <Card padding="md" className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blush" />
            <p className="text-sm font-semibold text-charcoal">Weekly Insights</p>
          </div>
          <div className="space-y-2.5 text-sm text-charcoal-muted">
            {repeatedItems > 0 ? (
              <div className="flex items-start gap-2">
                <RotateCcw className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                <p><strong className="text-charcoal">{repeatedItems} items</strong> are being repeated — mix in different pieces for variety.</p>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                <p>Great variety this week — you're using different items every day!</p>
              </div>
            )}
            <div className="flex items-start gap-2">
              <Calendar className="w-4 h-4 text-info flex-shrink-0 mt-0.5" />
              <p>{plannedCount} of 7 days planned. {7 - plannedCount > 0 ? `${7 - plannedCount} more to go!` : 'Your whole week is sorted!'}</p>
            </div>
            {unusedItems > 0 && (
              <div className="flex items-start gap-2">
                <Shirt className="w-4 h-4 text-charcoal-muted flex-shrink-0 mt-0.5" />
                <p><strong className="text-charcoal">{unusedItems} items</strong> haven't been used this week — they're waiting to be styled!</p>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  )
})

export default WeekPlanPage
