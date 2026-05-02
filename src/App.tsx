import { useState, useEffect, useCallback, useRef } from 'react'
import { Images, Shirt, Sparkles, History, Settings, Menu, X, LogOut, Loader2, CalendarDays, Wand2, ShoppingBag } from 'lucide-react'
import { getConfig, getWardrobe, saveConfig, type AppConfig } from './lib/storage'
import { supabase, SUPABASE_ENABLED } from './lib/supabase'
import type { User } from '@supabase/supabase-js'
import { checkProxy } from './lib/claude'
import { importLocalWardrobeToCloud, removeStyleCloud, saveConfigCloud, subscribeToUserData } from './lib/cloud'
import type { ClothingItem, OutfitSuggestion, StyleImage } from './types'
import ApiKeySetup from './components/ApiKeySetup'
import WardrobePage from './components/WardrobePage'
import DailyOutfitPage from './components/DailyOutfitPage'
import DashboardPage from './components/DashboardPage'
import HistoryPage from './components/HistoryPage'
import WeekPlanPage from './components/WeekPlanPage'
import OutfitBuilderPage from './components/OutfitBuilderPage'
import StylesPage from './components/StylesPage'
import TryOnPage from './components/TryOnPage'
import LoginPage from './components/LoginPage'

type Tab = 'dashboard' | 'today' | 'wardrobe' | 'week' | 'history' | 'build' | 'styles' | 'tryon'
function isConfigured(c: AppConfig) {
  if (c.provider === 'proxy') return true
  if (c.provider === 'ollama') return c.ollamaUrl.length > 0 && c.ollamaModel.length > 0
  return c.apiKey.length > 0
}
const PROVIDER_LABELS: Record<string, string> = { openai: 'OpenAI', gemini: 'Gemini', ollama: 'Ollama', proxy: 'Built-in AI' }
function getInitials(name: string | null | undefined): string {
  if (!name) return 'A'
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}
export default function App() {
  const [config, setConfig] = useState<AppConfig>(() => getConfig())
  const [tab, setTab] = useState<Tab>('dashboard')
  const [wardrobe, setWardrobe] = useState<ClothingItem[]>([])
  const [outfits, setOutfits] = useState<OutfitSuggestion[]>([])
  const [styles, setStyles] = useState<StyleImage[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(SUPABASE_ENABLED)
  const [cloudLoading, setCloudLoading] = useState(false)
  const [localImportItems, setLocalImportItems] = useState<ClothingItem[]>(() => getWardrobe())
  const [importingLocal, setImportingLocal] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [importBannerDismissed, setImportBannerDismissed] = useState(false)
  const proxyChecked = useRef(false)

  const refresh = useCallback(() => {
    // Cloud data auto-updates via Firestore subscription.
    // For any local-only state, force a re-read here.
    setWardrobe((prev) => [...prev])
  }, [])

  useEffect(() => {
    if (proxyChecked.current) return
    proxyChecked.current = true
    const cur = getConfig()
    if (isConfigured(cur)) return
    checkProxy().then((ok) => { if (ok) { const pc = { ...cur, provider: 'proxy' as const }; saveConfig(pc); setConfig(pc) } })
  }, [])

  useEffect(() => {
    if (!SUPABASE_ENABLED || !supabase) { setAuthLoading(false); return }
    // Get initial session
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setAuthLoading(false)
      setCloudLoading(!!data.session?.user)
    })
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
      setCloudLoading(!!session?.user)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) {
      setWardrobe([])
      setOutfits([])
      setStyles([])
      setCloudLoading(false)
      return
    }

    setCloudLoading(true)
    const unsub = subscribeToUserData(
      user.uid,
      (data) => {
        if (data.wardrobe !== undefined) {
          const cloudItems = data.wardrobe ?? []
          // Merge: show cloud items + any local-only items not yet synced
          const local = getWardrobe()
          const localOnly = local.filter((li) => !cloudItems.some((ci) => ci.id === li.id))

          // If cloud is empty but we have local items → auto-import silently
          if (cloudItems.length === 0 && local.length > 0) {
            importLocalWardrobeToCloud(user.uid, local).catch(() => {})
          }

          // Always show the union so nothing disappears while syncing
          setWardrobe(cloudItems.length > 0 ? cloudItems : local)
          setLocalImportItems(localOnly)
        }
        if (data.outfits) setOutfits(data.outfits)
        if (data.styles) setStyles(data.styles)
        setCloudLoading(false)
      },
      () => {
        // Firebase error — fall back to localStorage so wardrobe is never blank
        setWardrobe(getWardrobe())
        setCloudLoading(false)
      },
    )

    const localConfig = getConfig()
    if (isConfigured(localConfig)) saveConfigCloud(user.uid, localConfig).catch(() => {})

    return unsub
  }, [user])

  async function handleImportLocalWardrobe() {
    if (!user || localImportItems.length === 0) return
    setImportingLocal(true)
    setImportMsg('')
    try {
      const count = await importLocalWardrobeToCloud(user.uid, localImportItems)
      setImportMsg(`Imported ${count} local wardrobe item${count === 1 ? '' : 's'} to cloud.`)
      setLocalImportItems([])
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : 'Could not import local wardrobe.')
    } finally {
      setImportingLocal(false)
    }
  }

  function handleDeleteStyle(styleId: string) {
    if (user) removeStyleCloud(user.uid, styleId).catch(() => {})
    setStyles((prev) => prev.filter((s) => s.id !== styleId))
  }
  function handleReset() { saveConfig({ provider: 'openai', apiKey: '', ollamaUrl: 'http://localhost:11434', ollamaModel: 'moondream' }); setConfig(getConfig()) }
  async function handleSignOut() { if (auth) await signOut(auth); setUser(null) }

  if (authLoading) return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-12 h-12 bg-charcoal rounded-2xl flex items-center justify-center mx-auto"><Sparkles className="w-6 h-6 text-white" strokeWidth={1.5} /></div>
        <Loader2 className="w-5 h-5 animate-spin text-gray-300 mx-auto" />
      </div>
    </div>
  )

  if (!user) return <LoginPage onLogin={(u) => setUser(u)} />
  if (cloudLoading) return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="text-center space-y-3">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300 mx-auto" />
        <p className="text-sm text-gray-400">Loading your cloud wardrobe...</p>
      </div>
    </div>
  )
  if (!isConfigured(config)) return <ApiKeySetup onSaved={() => setConfig(getConfig())} userId={user?.uid} />

  const today = new Date().toISOString().split('T')[0]
  const todayOutfit = outfits.find((o) => o.date === today) ?? null
  const userName: string = user?.displayName ?? 'You'
  const userPhoto: string | null = user?.photoURL ?? null
  const needsWashCount = wardrobe.filter((i) => (i.wearCount ?? 0) >= 2).length

  // Derive extra styles from outfits that have a previewImage but no matching style doc
  // This recovers images that were saved to the outfit but not the styles collection
  const styleIds = new Set(styles.map((s) => s.outfitId).filter(Boolean))
  const derivedStyles: StyleImage[] = outfits
    .filter((o) => o.previewImage && !styleIds.has(o.id))
    .map((o) => ({
      id: `derived-${o.id}`,
      image: o.previewImage!,
      itemIds: o.itemIds,
      outfitId: o.id,
      source: 'daily-preview' as const,
      createdAt: o.generatedAt,
    }))
  const allStyles: StyleImage[] = [...styles, ...derivedStyles]
  const styleCount = allStyles.length

  const NAV_ITEMS: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <Sparkles className="w-5 h-5" strokeWidth={1.5} /> },
    { id: 'today',    label: 'Today',    icon: <Sparkles className="w-5 h-5" strokeWidth={1.5} /> },
    { id: 'wardrobe', label: 'Wardrobe', icon: <Shirt className="w-5 h-5" strokeWidth={1.5} />, badge: needsWashCount > 0 ? needsWashCount : undefined },
    { id: 'tryon',    label: 'Try On',   icon: <ShoppingBag className="w-5 h-5" strokeWidth={1.5} /> },
    { id: 'build',    label: 'Build',    icon: <Wand2 className="w-5 h-5" strokeWidth={1.5} /> },
    { id: 'styles',   label: 'Styles',   icon: <Images className="w-5 h-5" strokeWidth={1.5} />, badge: styleCount > 0 ? styleCount : undefined },
    { id: 'week',     label: 'Week',     icon: <CalendarDays className="w-5 h-5" strokeWidth={1.5} /> },
    { id: 'history',  label: 'History',  icon: <History className="w-5 h-5" strokeWidth={1.5} /> },
  ]

  const pageContent = (<>
    {tab === 'dashboard' && <DashboardPage wardrobe={wardrobe} outfits={outfits} styles={allStyles} todayOutfit={todayOutfit} config={config} onOutfitGenerated={refresh} userId={user?.uid} onOpenTab={setTab} />}
    {tab === 'today' && <DailyOutfitPage wardrobe={wardrobe} todayOutfit={todayOutfit} config={config} onOutfitGenerated={refresh} userId={user?.uid} />}
    {tab === 'wardrobe' && <WardrobePage wardrobe={wardrobe} config={config} onUpdate={refresh} userId={user?.uid} />}
    {tab === 'build' && <OutfitBuilderPage wardrobe={wardrobe} config={config} userId={user?.uid} />}
    {tab === 'tryon' && <TryOnPage config={config} userId={user?.uid} onSaved={refresh} />}
    {tab === 'styles' && <StylesPage styles={allStyles} wardrobe={wardrobe} onDelete={handleDeleteStyle} />}
    {tab === 'week' && <WeekPlanPage wardrobe={wardrobe} outfits={outfits} config={config} onUpdate={refresh} userId={user?.uid} />}
    {tab === 'history' && <HistoryPage styles={allStyles} onDelete={handleDeleteStyle} />}
  </>)

  function SidebarContent({ onClose }: { onClose?: () => void }) {
    return (<>
      <div className="h-16 flex items-center gap-3 px-5 border-b border-white/10">
        <div className="w-8 h-8 bg-blush/30 rounded-xl flex items-center justify-center"><Sparkles className="w-4 h-4 text-blush" strokeWidth={1.5} /></div>
        <div className="flex-1 min-w-0"><p className="font-semibold text-white text-sm leading-none">Daily Stylist</p><p className="text-[10px] text-white/40 mt-0.5">{PROVIDER_LABELS[config.provider]}</p></div>
        {onClose && <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg flex-shrink-0"><X className="w-4 h-4 text-white/60" /></button>}
      </div>
      {(user || !FIREBASE_ENABLED) && (
        <div className="px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            {userPhoto ? <img src={userPhoto} alt={userName} className="w-8 h-8 rounded-full object-cover" /> : <div className="w-8 h-8 rounded-full bg-blush/40 flex items-center justify-center flex-shrink-0"><span className="text-xs font-bold text-white">{getInitials(userName)}</span></div>}
            <div className="min-w-0"><p className="text-sm font-medium text-white truncate">{userName}</p><p className="text-[10px] text-white/40 truncate">{user?.email ?? ''}</p></div>
          </div>
        </div>
      )}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {NAV_ITEMS.map((item) => (
          <button key={item.id} onClick={() => { setTab(item.id); onClose?.() }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors relative ${tab === item.id ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/80'}`}>
            {tab === item.id && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blush rounded-r-full" />}
            {item.icon}{item.label}
            {item.badge !== undefined && item.badge > 0 && <span className="ml-auto bg-blush/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">{item.badge > 99 ? '99+' : item.badge}</span>}
          </button>
        ))}
      </nav>
      <div className="p-3 border-t border-white/10 space-y-1">
        <button onClick={handleReset} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-white/40 hover:bg-white/5 hover:text-white/70 transition-colors"><Settings className="w-4 h-4" />Change Provider</button>
        {FIREBASE_ENABLED && user && <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-white/40 hover:bg-white/5 hover:text-red-400 transition-colors"><LogOut className="w-4 h-4" />Sign Out</button>}
      </div>
    </>)
  }

  return (
    <div className="min-h-screen bg-cream">
      {user && localImportItems.length > 0 && !importBannerDismissed && (
        <div className="bg-amber-50 border-b border-amber-100 px-4 py-3 text-amber-800">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <p className="text-sm">
              📦 Found {localImportItems.length} item{localImportItems.length === 1 ? '' : 's'} saved only in this browser — import to keep them on all devices.
            </p>
            <div className="flex items-center gap-2 flex-shrink-0">
              {importMsg && <span className="text-xs text-amber-700">{importMsg}</span>}
              <button
                onClick={handleImportLocalWardrobe}
                disabled={importingLocal}
                className="bg-charcoal text-white px-3 py-2 rounded-xl text-xs font-medium disabled:opacity-50 whitespace-nowrap"
              >
                {importingLocal ? 'Importing…' : 'Import to cloud'}
              </button>
              <button onClick={() => setImportBannerDismissed(true)} className="text-amber-500 hover:text-amber-700 px-1 text-lg leading-none" title="Dismiss">×</button>
            </div>
          </div>
        </div>
      )}
      <div className="hidden md:flex min-h-screen">
        <aside className="w-60 bg-charcoal flex flex-col flex-shrink-0 sticky top-0 h-screen"><SidebarContent /></aside>
        <main className="flex-1 overflow-auto"><div className="max-w-5xl mx-auto px-8 py-8">{pageContent}</div></main>
      </div>
      <div className="md:hidden">
        {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setSidebarOpen(false)} />}
        <aside className={`fixed inset-y-0 left-0 w-64 bg-charcoal flex flex-col z-50 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <SidebarContent onClose={() => setSidebarOpen(false)} />
        </aside>
        <header className="bg-white border-b border-gray-100 sticky top-0 z-30 safe-top">
          <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={() => setSidebarOpen(true)} className="p-1.5 hover:bg-gray-100 rounded-full mr-1"><Menu className="w-4 h-4 text-gray-400" /></button>
              <div className="w-7 h-7 bg-charcoal rounded-lg flex items-center justify-center"><Sparkles className="w-4 h-4 text-white" strokeWidth={1.5} /></div>
              <span className="font-semibold text-charcoal text-sm">Daily Stylist</span>
              <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium uppercase">{PROVIDER_LABELS[config.provider]}</span>
            </div>
            {userPhoto ? <img src={userPhoto} alt={userName} className="w-7 h-7 rounded-full object-cover" /> : <div className="w-7 h-7 rounded-full bg-charcoal flex items-center justify-center"><span className="text-[10px] font-bold text-white">{getInitials(userName)}</span></div>}
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6 pb-28">{pageContent}</main>
        <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 z-40 safe-bottom">
          <div className="max-w-2xl mx-auto px-2 flex">
            {NAV_ITEMS.filter((i) => ['dashboard','today','wardrobe','tryon','build'].includes(i.id)).map((item) => (
              <button key={item.id} onClick={() => setTab(item.id)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 relative transition-colors ${tab === item.id ? 'text-charcoal' : 'text-gray-400 hover:text-gray-600'}`}>
                {item.icon}
                <span className="text-[10px] font-medium">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && <span className="absolute top-2.5 right-1/4 translate-x-1/2 bg-blush text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{item.badge > 99 ? '99+' : item.badge}</span>}
                {tab === item.id && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-charcoal rounded-full" />}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  )
}
