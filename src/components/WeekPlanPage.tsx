import { useState } from 'react'
import { CalendarDays, Loader2 } from 'lucide-react'
import type { ClothingItem, OutfitSuggestion } from '../types'

import { saveOutfit, recordWear, type AppConfig } from '../lib/storage'
import { generateOutfit } from '../lib/claude'

interface Props {
  wardrobe: ClothingItem[]
  outfits: OutfitSuggestion[]
  config: AppConfig
  onUpdate: () => void
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

export default function WeekPlanPage({ wardrobe, outfits, config, onUpdate }: Props) {
  const [generating, setGenerating] = useState<string | null>(null)
  const [error, setError] = useState('')
const [occasions] = useState<Record<string, string>>({})

  const weekDates = getWeekDates()
  const outfitMap = Object.fromEntries(outfits.map((o) => [o.date, o]))
  const wardrobeMap = Object.fromEntries(wardrobe.map((item) => [item.id, item]))

  function getOccasion(date: string, i: number) {
    return occasions[date] ?? DAY_OCCASIONS[i]
  }

  async function generateDay(date: string, occasion: string) {
    if (wardrobe.length < 2) {
      setError('Add at least 2 items to your wardrobe first!')
      return
    }

    setGenerating(date)
    setError('')

    try {
      const result = await generateOutfit(wardrobe, date, config, occasion)

      const saved = {
        id: crypto.randomUUID(),
        ...result,
        generatedAt: new Date().toISOString(),
      }

      saveOutfit(saved)
      recordWear(saved.itemIds)

      onUpdate()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('429') || msg.includes('quota')) {
        setError('Quota exceeded — get a new API key')
      } else {
        setError(msg.substring(0, 100))
      }
    } finally {
      setGenerating(null)
    }
  }

  async function planFullWeek() {
    for (let i = 0; i < weekDates.length; i++) {
      const date = weekDates[i]
      const occasion = getOccasion(date, i)

      await generateDay(date, occasion)

      if (i < weekDates.length - 1) {
        await new Promise((r) => setTimeout(r, 800))
      }
    }
  }

  const plannedCount = weekDates.filter((d) => outfitMap[d]).length

  const weeklyUsage: Record<string, number> = {}
  weekDates.forEach((date) => {
    const outfit = outfitMap[date]
    if (outfit) {
      outfit.itemIds.forEach((id) => {
        weeklyUsage[id] = (weeklyUsage[id] ?? 0) + 1
      })
    }
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
          className="flex items-center gap-2 bg-charcoal text-white px-4 py-2.5 rounded-xl text-sm"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />}
          {generating ? 'Planning…' : 'Plan My Week'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-500 rounded-2xl px-4 py-3 text-sm">{error}</div>
      )}

      {/* Days */}
      <div className="space-y-3">
        {weekDates.map((date, i) => {
          const outfit = outfitMap[date]
          const items = outfit ? outfit.itemIds.map((id) => wardrobeMap[id]).filter(Boolean) : []
          const isLoading = generating === date

          return (
            <div key={date} className="bg-white rounded-2xl border p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium">{DAY_NAMES[i]}</span>

                <button
                  onClick={() => generateDay(date, getOccasion(date, i))}
                  className="text-xs bg-gray-100 px-3 py-1 rounded-lg"
                >
                  {isLoading ? '...' : outfit ? 'Redo' : 'Style'}
                </button>
              </div>

              {items.length > 0 ? (
                <div className="flex gap-2">
                  {items.map((item) => (
                    <img key={item.id} src={item.image} className="w-12 h-12 object-cover rounded-lg" />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-300">No outfit planned</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
