import { useState, useEffect, useCallback, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { Shirt, Sparkles, History, CalendarDays, Wand2, Images, Sun, ShoppingBag } from 'lucide-react'
import { getConfig, getWardrobe, getOutfits, getProfilePhotos, getStyleImages, saveConfig, saveWardrobe, replaceOutfits, saveProfilePhotos, saveStyleImages, type AppConfig } from './lib/storage'
import { supabase, SUPABASE_ENABLED } from './lib/supabase'
import { checkProxy } from './lib/claude'
import { addItemCloud, saveOutfitCloud, syncFromCloud, saveConfigCloud, uploadProfilePhoto, subscribeToCloud, getStylesCloud } from './lib/cloud'
import type { ClothingItem, OutfitSuggestion, StyleImage } from './types'
import ApiKeySetup from './components/ApiKeySetup'
import WardrobePage from './components/WardrobePage'
import DailyOutfitPage from './components/DailyOutfitPage'
import HistoryPage from './components/HistoryPage'
import WeekPlanPage from './components/WeekPlanPage'
import OutfitBuilderPage from './components/OutfitBuilderPage'
import StyleGalleryPage from './components/StyleGalleryPage'
import TryOnPage from './components/TryOnPage'
import OnboardingPage from './components/OnboardingPage'
import LoginPage from './components/LoginPage'
import Sidebar from './components/Sidebar'
import MobileHeader from './components/MobileHeader'
import GenerationStatusBar from './components/GenerationStatusBar'
import { Spinner } from './components/ui'
import { ToastProvider } from './contexts/ToastContext'
import { WardrobeProvider } from './contexts/WardrobeContext'
import { ConfigProvider } from './contexts/ConfigContext'

type Tab = 'today' | 'wardrobe' | 'week' | 'history' | 'build' | 'styles' | 'tryon'

export function isConfigured(c: AppConfig) {
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

function mergeById<T extends { id: string }>(primary: T[], secondary: T[]): T[] {
  return Array.from(new Map([...secondary, ...primary].map((i) => [i.id, i])).values())
}

function sortOutfits(outfits: OutfitSuggestion[]): OutfitSuggestion[] {
  return [...outfits]
    .sort((a, b) => {
      const ad = a.generatedAt || a.date
      const bd = b.generatedAt || b.date
      return bd.localeCompare(ad)
    })
    .slice(0, 90)
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: number | undefined
  const timeout = new Promise<never>((_, rej) => {
    t = window.setTimeout(() => rej(new Error('timeout')), ms)
  })
  try {
    return await Promise.race([p, timeout])
  } finally {
    if (t) window.clearTimeout(t)
  }
}

export default function App() {
  const [config, setConfigState] = useState<AppConfig>(() => getConfig())
  const [tab, setTab] = useState<Tab>('today')
  const [wardrobe, setWardrobe] = useState<ClothingItem[]>([])
  const [outfits, setOutfits] = useState<OutfitSuggestion[]>([])
  const [styleImages, setStyleImages] = useState<StyleImage[]>(() => getStyleImages())
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(SUPABASE_ENABLED)
  const [cloudReady, setCloudReady] = useState(false)
  const proxyChecked = useRef(false)

  const refresh = useCallback(() => {
    setWardrobe(getWardrobe())
    setOutfits(getOutfits())
    setStyleImages(getStyleImages())
  }, [])

  const setConfig = useCallback((c: AppConfig) => {
    setConfigState(c)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    if (proxyChecked.current) return
    proxyChecked.current = true
    const cur = getConfig()
    if (isConfigured(cur)) return
    checkProxy().then((ok) => {
      if (ok) {
        const pc = { ...cur, provider: 'proxy' as const }
        saveConfig(pc)
        setConfigState(pc)
      }
    })
  }, [])

  useEffect(() => {
    if (!SUPABASE_ENABLED || !supabase) { setAuthLoading(false); return }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
      if (session?.user) syncUserData(session.user.id)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setCloudReady(false)
      if (session?.user) syncUserData(session.user.id)
    })

    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function syncUserData(userId: string) {
    const localWardrobe = getWardrobe()
    const localOutfits = getOutfits()
    const localPhotos = getProfilePhotos()
    const localConfig = getConfig()
    try {
      const snap = await withTimeout(syncFromCloud(userId), 8000)
      const cloudHasData = snap.wardrobe.length > 0 || snap.outfits.length > 0 || !!snap.profilePhoto
      if (cloudHasData) {
        saveWardrobe(snap.wardrobe)
        replaceOutfits(sortOutfits(snap.outfits))
        if (snap.profilePhoto) saveProfilePhotos([snap.profilePhoto])
      } else {
        const migratedWardrobe = mergeById(localWardrobe, [])
        const migratedOutfits = sortOutfits(localOutfits)
        saveWardrobe(migratedWardrobe)   // save immediately so wardrobe is always visible
        replaceOutfits(migratedOutfits)
        // Upload to cloud in background; update localStorage with Storage URLs when done
        Promise.allSettled([
          ...migratedWardrobe.map((i) =>
            addItemCloud(userId, i).then((saved) => {
              if (saved.image !== i.image) {
                // Image was migrated to Storage — quietly update localStorage URL
                saveWardrobe(getWardrobe().map((w) => w.id === saved.id ? saved : w))
              }
            })
          ),
          ...migratedOutfits.map((o) => saveOutfitCloud(userId, o)),
          ...localPhotos.slice(0, 1).map((ph) => uploadProfilePhoto(userId, ph)),
        ])
      }
      if (snap.config) { saveConfig(snap.config); setConfigState(snap.config) }
      else if (isConfigured(localConfig)) saveConfigCloud(userId, localConfig).catch(() => {})
    } catch {
      // cloud unavailable: keep local cache visible
    } finally {
      refresh()
      setCloudReady(true)
    }
    // Load try-on styles from cloud (non-critical, runs after main sync)
    try {
      const cloudStyles = await getStylesCloud(userId)
      if (cloudStyles.length > 0) {
        saveStyleImages(cloudStyles)
        setStyleImages(cloudStyles)
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!SUPABASE_ENABLED || !user || !cloudReady) return
    return subscribeToCloud(user.id, (snap) => {
      saveWardrobe(snap.wardrobe)
      replaceOutfits(sortOutfits(snap.outfits))
      if (snap.config) { saveConfig(snap.config); setConfigState(snap.config) }
      if (snap.profilePhoto) saveProfilePhotos([snap.profilePhoto])
      refresh()
    })
  }, [user, cloudReady, refresh])

  function handleReset() {
    saveConfig({ provider: 'openai', apiKey: '', ollamaUrl: 'http://localhost:11434', ollamaModel: 'moondream' })
    setConfigState(getConfig())
  }

  async function handleSignOut() {
    if (supabase) await supabase.auth.signOut()
    setUser(null)
  }

  // --- Loading state ---
  if (authLoading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 bg-charcoal rounded-2xl flex items-center justify-center mx-auto shadow-md">
            <Sparkles className="w-6 h-6 text-white" strokeWidth={1.5} />
          </div>
          <Spinner size="md" color="default" />
        </div>
      </div>
    )
  }

  if (SUPABASE_ENABLED && !user) return <LoginPage onLogin={setUser} />
  if (!isConfigured(config)) return <ApiKeySetup onSaved={() => setConfigState(getConfig())} userId={user?.id} />

  const today = new Date().toISOString().split('T')[0]
  const todayOutfit = outfits.find((o) => o.date === today) ?? null
  const userName: string = user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? 'You'
  const userPhoto: string | null = user?.user_metadata?.avatar_url ?? null
  const needsWashCount = wardrobe.filter((i) => (i.wearCount ?? 0) >= 2).length

  // Compute daily streak — consecutive days with an outfit generated
  const outfitDates = new Set(outfits.map((o) => o.date))
  let streak = 0
  const d = new Date()
  while (outfitDates.has(d.toISOString().split('T')[0])) {
    streak++
    d.setDate(d.getDate() - 1)
  }

  // All nav items — sidebar shows all, mobile bottom bar shows only the top 5
  const NAV_ITEMS: { id: Tab; label: string; icon: React.ReactNode; badge?: number; mobileHide?: boolean }[] = [
    { id: 'today',    label: 'Today',    icon: <Sun className="w-5 h-5" strokeWidth={1.5} /> },
    { id: 'wardrobe', label: 'Wardrobe', icon: <Shirt className="w-5 h-5" strokeWidth={1.5} />, badge: needsWashCount > 0 ? needsWashCount : wardrobe.length },
    { id: 'build',    label: 'Build',    icon: <Wand2 className="w-5 h-5" strokeWidth={1.5} /> },
    { id: 'styles',   label: 'Styles',   icon: <Images className="w-5 h-5" strokeWidth={1.5} />, badge: outfits.filter((o) => o.previewImage).length + styleImages.length },
    { id: 'tryon',    label: 'Try Buy',  icon: <ShoppingBag className="w-5 h-5" strokeWidth={1.5} /> },
    { id: 'week',     label: 'Week',     icon: <CalendarDays className="w-5 h-5" strokeWidth={1.5} />, mobileHide: true },
    { id: 'history',  label: 'History',  icon: <History className="w-5 h-5" strokeWidth={1.5} /> },
  ]
  const MOBILE_NAV = NAV_ITEMS.filter((item) => !item.mobileHide)

  const pageContent = (
    <>
      {tab === 'today' && wardrobe.length === 0 && (
        <OnboardingPage userName={userName} onAddFirstItem={() => setTab('wardrobe')} />
      )}
      {tab === 'today' && wardrobe.length > 0 && (
        <DailyOutfitPage wardrobe={wardrobe} todayOutfit={todayOutfit} config={config} onOutfitGenerated={refresh} userId={user?.id} streak={streak} />
      )}
      {tab === 'wardrobe' && <WardrobePage wardrobe={wardrobe} config={config} onUpdate={refresh} userId={user?.id} />}
      {tab === 'build'    && <OutfitBuilderPage wardrobe={wardrobe} config={config} userId={user?.id} onSaved={refresh} />}
      {tab === 'week'     && <WeekPlanPage wardrobe={wardrobe} outfits={outfits} config={config} onUpdate={refresh} userId={user?.id} />}
      {tab === 'styles'   && <StyleGalleryPage outfits={outfits} wardrobe={wardrobe} styleImages={styleImages} />}
      {tab === 'history'  && <HistoryPage outfits={outfits} wardrobe={wardrobe} />}
      {tab === 'tryon'    && <TryOnPage config={config} userId={user?.id} onSaved={refresh} />}
    </>
  )

  return (
    <ToastProvider>
      <WardrobeProvider wardrobe={wardrobe} outfits={outfits} userId={user?.id} refresh={refresh}>
        <ConfigProvider config={config} setConfig={setConfig} isConfigured={isConfigured(config)}>
          <GenerationStatusBar onJump={(origin) => setTab(origin as Tab)} />
          <div className="min-h-screen bg-cream">
            {/* Desktop layout */}
            <div className="hidden md:flex min-h-screen">
              <aside className="w-64 bg-charcoal flex flex-col flex-shrink-0 sticky top-0 h-screen">
                <Sidebar
                  tab={tab}
                  onTabChange={(t) => setTab(t as Tab)}
                  userName={userName}
                  userPhoto={userPhoto}
                  userEmail={user?.email ?? ''}
                  providerLabel={PROVIDER_LABELS[config.provider]}
                  navItems={NAV_ITEMS}
                  onReset={handleReset}
                  onSignOut={handleSignOut}
                />
              </aside>
              <main className="flex-1 overflow-auto">
                <div className="max-w-5xl mx-auto px-8 py-8">{pageContent}</div>
              </main>
            </div>

            {/* Mobile layout */}
            <div className="md:hidden">
              {sidebarOpen && (
                <div
                  className="fixed inset-0 bg-black/40 z-40"
                  aria-hidden="true"
                  onClick={() => setSidebarOpen(false)}
                />
              )}
              <aside
                className={`fixed inset-y-0 left-0 w-64 bg-charcoal flex flex-col z-50 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
              >
                <Sidebar
                  tab={tab}
                  onTabChange={(t) => { setTab(t as Tab); setSidebarOpen(false) }}
                  userName={userName}
                  userPhoto={userPhoto}
                  userEmail={user?.email ?? ''}
                  providerLabel={PROVIDER_LABELS[config.provider]}
                  navItems={NAV_ITEMS}
                  onReset={handleReset}
                  onSignOut={handleSignOut}
                  onClose={() => setSidebarOpen(false)}
                />
              </aside>

              <MobileHeader
                title="Daily Stylist"
                providerLabel={PROVIDER_LABELS[config.provider]}
                userPhoto={userPhoto}
                userName={userName}
                onMenuOpen={() => setSidebarOpen(true)}
              />

              <main className="max-w-2xl mx-auto px-4 py-6 pb-28">{pageContent}</main>

              <nav
                className="fixed bottom-0 inset-x-0 bg-white border-t border-[#E8E4DF] z-40 safe-bottom"
                aria-label="Tab bar"
              >
                <div className="max-w-2xl mx-auto px-4 flex">
                  {MOBILE_NAV.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setTab(item.id)}
                      aria-current={tab === item.id ? 'page' : undefined}
                      className={`flex-1 flex flex-col items-center gap-1 py-3 relative transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush ${tab === item.id ? 'text-charcoal' : 'text-charcoal-muted hover:text-charcoal'}`}
                    >
                      {item.icon}
                      <span className="text-xs font-medium">{item.label}</span>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="absolute top-2.5 right-1/4 translate-x-1/2 bg-blush text-white text-2xs font-bold w-4 h-4 rounded-full flex items-center justify-center">
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
        </ConfigProvider>
      </WardrobeProvider>
    </ToastProvider>
  )
}
