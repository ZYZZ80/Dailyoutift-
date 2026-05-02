import { useState, useEffect, useCallback, useRef } from 'react'
import { Shirt, Sparkles, History, Settings, Menu, X, CalendarDays, Wand2 } from 'lucide-react'
import { getConfig, getWardrobe, getOutfits, saveConfig, type AppConfig } from './lib/storage'
import { checkProxy } from './lib/claude'
import type { ClothingItem, OutfitSuggestion } from './types'
import ApiKeySetup from './components/ApiKeySetup'
import WardrobePage from './components/WardrobePage'
import DailyOutfitPage from './components/DailyOutfitPage'
import HistoryPage from './components/HistoryPage'
import WeekPlanPage from './components/WeekPlanPage'
import OutfitBuilderPage from './components/OutfitBuilderPage'

type Tab = 'today' | 'wardrobe' | 'week' | 'history' | 'build'

function isConfigured(c: AppConfig) {
  if (c.provider === 'proxy') return true
  if (c.provider === 'ollama') return c.ollamaUrl.length > 0 && c.ollamaModel.length > 0
  return c.apiKey.length > 0
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  gemini: 'Gemini',
  ollama: 'Ollama',
  proxy: 'Built-in AI',
}

export default function App() {
  const [config, setConfig] = useState<AppConfig>(() => getConfig())
  const [tab, setTab] = useState<Tab>('today')
  const [wardrobe, setWardrobe] = useState<ClothingItem[]>([])
  const [outfits, setOutfits] = useState<OutfitSuggestion[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const proxyChecked = useRef(false)

  const refresh = useCallback(async () => {
    const w = await getWardrobe()
    const o = await getOutfits()
    setWardrobe(w)
    setOutfits(o)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (proxyChecked.current) return
    proxyChecked.current = true

    const cur = getConfig()
    if (isConfigured(cur)) return

    checkProxy().then((ok) => {
      if (ok) {
        const pc = { ...cur, provider: 'proxy' as const }
        saveConfig(pc)
        setConfig(pc)
      }
    })
  }, [])

  function handleReset() {
    saveConfig({
      provider: 'openai',
      apiKey: '',
      ollamaUrl: 'http://localhost:11434',
      ollamaModel: 'moondream',
    })
    setConfig(getConfig())
  }

  if (!isConfigured(config)) {
    return <ApiKeySetup onSaved={() => setConfig(getConfig())} />
  }

  const today = new Date().toISOString().split('T')[0]
  const todayOutfit = outfits.find((o) => o.date === today) ?? null
  const userName = 'Aziz'
  const needsWashCount = wardrobe.filter((i) => (i.wearCount ?? 0) >= 2).length

  const NAV_ITEMS: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'today', label: 'Today', icon: <Sparkles className="w-5 h-5" strokeWidth={1.5} /> },
    { id: 'wardrobe', label: 'Wardrobe', icon: <Shirt className="w-5 h-5" strokeWidth={1.5} />, badge: needsWashCount > 0 ? needsWashCount : wardrobe.length },
    { id: 'build', label: 'Build', icon: <Wand2 className="w-5 h-5" strokeWidth={1.5} /> },
    { id: 'week', label: 'Week', icon: <CalendarDays className="w-5 h-5" strokeWidth={1.5} /> },
    { id: 'history', label: 'History', icon: <History className="w-5 h-5" strokeWidth={1.5} /> },
  ]

  const pageContent = (
    <>
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

      {tab === 'build' && (
        <OutfitBuilderPage wardrobe={wardrobe} config={config} />
      )}

      {tab === 'week' && (
        <WeekPlanPage
          wardrobe={wardrobe}
          outfits={outfits}
          config={config}
          onUpdate={refresh}
        />
      )}

      {tab === 'history' && (
        <HistoryPage outfits={outfits} wardrobe={wardrobe} />
      )}
    </>
  )

  function SidebarContent({ onClose }: { onClose?: () => void }) {
    return (
      <>
        <div className="h-16 flex items-center gap-3 px-5 border-b border-white/10">
          <div className="w-8 h-8 bg-blush/30 rounded-xl flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-blush" strokeWidth={1.5} />
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white text-sm leading-none">Daily Stylist</p>
            <p className="text-[10px] text-white/40 mt-0.5">
              {PROVIDER_LABELS[config.provider]}
            </p>
          </div>

          {onClose && (
            <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg flex-shrink-0">
              <X className="w-4 h-4 text-white/60" />
            </button>
          )}
        </div>

        <div className="px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blush/40 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-white">A</span>
            </div>

            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{userName}</p>
              <p className="text-[10px] text-white/40 truncate">Supabase mode</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setTab(item.id)
                onClose?.()
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors relative ${
                tab === item.id
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:bg-white/5 hover:text-white/80'
              }`}
            >
              {tab === item.id && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blush rounded-r-full" />
              )}

              {item.icon}
              {item.label}

              {item.badge !== undefined && item.badge > 0 && (
                <span className="ml-auto bg-blush/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-white/10 space-y-1">
          <button
            onClick={handleReset}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-white/40 hover:bg-white/5 hover:text-white/70 transition-colors"
          >
            <Settings className="w-4 h-4" />
            Change Provider
          </button>
        </div>
      </>
    )
  }

  return (
    <div className="min-h-screen bg-cream">
      <div className="hidden md:flex min-h-screen">
        <aside className="w-60 bg-charcoal flex flex-col flex-shrink-0 sticky top-0 h-screen">
          <SidebarContent />
        </aside>

        <main className="flex-1 overflow-auto">
          <div className="max-w-5xl mx-auto px-8 py-8">{pageContent}</div>
        </main>
      </div>

      <div className="md:hidden">
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside
          className={`fixed inset-y-0 left-0 w-64 bg-charcoal flex flex-col z-50 transition-transform duration-300 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <SidebarContent onClose={() => setSidebarOpen(false)} />
        </aside>

        <header className="bg-white border-b border-gray-100 sticky top-0 z-30 safe-top">
          <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-1.5 hover:bg-gray-100 rounded-full mr-1"
              >
                <Menu className="w-4 h-4 text-gray-400" />
              </button>

              <div className="w-7 h-7 bg-charcoal rounded-lg flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" strokeWidth={1.5} />
              </div>

              <span className="font-semibold text-charcoal text-sm">Daily Stylist</span>

              <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium uppercase">
                {PROVIDER_LABELS[config.provider]}
              </span>
            </div>

            <div className="w-7 h-7 rounded-full bg-charcoal flex items-center justify-center">
              <span className="text-[10px] font-bold text-white">A</span>
            </div>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-6 pb-28">{pageContent}</main>

        <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 z-40 safe-bottom">
          <div className="max-w-2xl mx-auto px-4 flex">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 relative transition-colors ${
                  tab === item.id
                    ? 'text-charcoal'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {item.icon}
                <span className="text-xs font-medium">{item.label}</span>

                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute top-2.5 right-1/4 translate-x-1/2 bg-blush text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}

                {tab === item.id && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-charcoal rounded-full" />
                )}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  )
}
