import { useState } from 'react'
import type { ClothingItem, OutfitSuggestion } from './types'
import { getConfig, getWardrobe, getOutfits, type AppConfig } from './lib/storage'

import WardrobePage from './components/WardrobePage'
import DailyOutfitPage from './components/DailyOutfitPage'
import WeekPlanPage from './components/WeekPlanPage'
import HistoryPage from './components/HistoryPage'
import OutfitBuilderPage from './components/OutfitBuilderPage'
import StyleGalleryPage from './components/StyleGalleryPage'
import ApiKeySetup from './components/ApiKeySetup'

type Tab = 'today' | 'wardrobe' | 'week' | 'history' | 'build' | 'styles'

export default function App() {
  const [tab, setTab] = useState<Tab>('today')
  const [config, setConfig] = useState<AppConfig>(getConfig())
  const [wardrobe, setWardrobe] = useState<ClothingItem[]>(getWardrobe())
  const [outfits, setOutfits] = useState<OutfitSuggestion[]>(getOutfits())

  function refresh() {
    setWardrobe(getWardrobe())
    setOutfits(getOutfits())
  }

  const today = new Date().toISOString().split('T')[0]
  const todayOutfit = outfits.find((o) => o.date === today) ?? null

  if (!config.apiKey && config.provider !== 'proxy') {
    return <ApiKeySetup onSaved={() => setConfig(getConfig())} />
  }

  return (
    <div className="min-h-screen bg-cream p-6">

      <div className="flex gap-2 mb-6 flex-wrap">
        <button onClick={() => setTab('today')}>Today</button>
        <button onClick={() => setTab('wardrobe')}>Wardrobe</button>
        <button onClick={() => setTab('week')}>Week</button>
        <button onClick={() => setTab('build')}>Build</button>
        <button onClick={() => setTab('styles')}>Styles</button>
        <button onClick={() => setTab('history')}>History</button>
      </div>

      {tab === 'today' && (
        <DailyOutfitPage
          wardrobe={wardrobe}
          todayOutfit={todayOutfit}
          config={config}
          onOutfitGenerated={refresh}
        />
      )}

      {tab === 'wardrobe' && (
        <WardrobePage
          wardrobe={wardrobe}
          onUpdate={refresh}
        />
      )}

      {tab === 'week' && (
        <WeekPlanPage
          wardrobe={wardrobe}
          outfits={outfits}
          config={config}
          onUpdate={refresh}
        />
      )}

      {tab === 'build' && (
        <OutfitBuilderPage
          wardrobe={wardrobe}
          config={config}
        />
      )}

      {tab === 'styles' && (
        <StyleGalleryPage
          outfits={outfits}
          wardrobe={wardrobe}
        />
      )}

      {tab === 'history' && (
        <HistoryPage
          outfits={outfits}
          wardrobe={wardrobe}
        />
      )}

    </div>
  )
}
