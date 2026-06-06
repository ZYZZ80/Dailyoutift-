import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { FileText, History, Shirt, Sparkles, Settings, Menu, X, LogOut, Loader2, CalendarDays, Wand2, ShoppingBag } from 'lucide-react'
import { getConfig, getWardrobe, saveConfig, getOutfits, getStyles, saveWardrobe, saveOutfitsSnapshot, saveStyles, saveProfilePhotos, getProfilePhotos, isStyleDeleted, markStyleDeleted, type AppConfig } from './lib/storage'
import { supabase, SUPABASE_ENABLED } from './lib/supabase'
import type { User } from '@supabase/supabase-js'
import { checkProxy } from './lib/claude'
import { clearOutfitPreviewCloud, importLocalOutfitsToCloud, importLocalStylesToCloud, importLocalWardrobeToCloud, removeStyleCloud, saveConfigCloud, saveProfilePhotosCloud, subscribeToUserData, uploadProfilePhoto } from './lib/cloud'
import type { ClothingItem, OutfitSuggestion, StyleImage } from './types'
import LoginPage from './components/LoginPage'
import GenerationStatusBar from './components/GenerationStatusBar'
import OnboardingPage from './components/OnboardingPage'
import AppLogo from './components/AppLogo'
import { useGenerationJob } from './lib/generationQueue'
import { localDateKey, previousDateKey } from './lib/dates'

// Lazy-load every heavy page. Each chunk is tiny (1-13 KB) so loading the
// first one is fast; we then preload the rest on idle so subsequent tab
// switches feel instant without ever showing a loading state again.
const importApiKeySetup       = () => import('./components/ApiKeySetup')
const importWardrobePage      = () => import('./components/WardrobePage')
const importDailyOutfitPage   = () => import('./components/DailyOutfitPage')
const importDashboardPage     = () => import('./components/DashboardPage')
const importWeekPlanPage      = () => import('./components/WeekPlanPage')
const importOutfitBuilderPage = () => import('./components/OutfitBuilderPage')
const importStylesPage        = () => import('./components/StylesPage')
const importTryOnPage         = () => import('./components/TryOnPage')
const importSettingsPage      = () => import('./components/SettingsPage')
const importLegalPage         = () => import('./components/LegalPage')

const ApiKeySetup       = lazy(importApiKeySetup)
const WardrobePage      = lazy(importWardrobePage)
const DailyOutfitPage   = lazy(importDailyOutfitPage)
const DashboardPage     = lazy(importDashboardPage)
const WeekPlanPage      = lazy(importWeekPlanPage)
const OutfitBuilderPage = lazy(importOutfitBuilderPage)
const StylesPage        = lazy(importStylesPage)
const TryOnPage         = lazy(importTryOnPage)
const SettingsPage      = lazy(importSettingsPage)
const LegalPage         = lazy(importLegalPage)

// Preload page chunks slowly after first render. Eager preloading made iPad
// Safari feel heavy because all pages and image logic warmed at once.
function preloadAllPages() {
  const idle = (cb: () => void) => {
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback
    if (ric) ric(cb)
    else setTimeout(cb, 2500)
  }
  setTimeout(() => idle(() => { importDashboardPage(); importWardrobePage() }), 1800)
  setTimeout(() => idle(() => { importDailyOutfitPage(); importStylesPage() }), 3200)
  setTimeout(() => idle(() => { importTryOnPage(); importOutfitBuilderPage(); importWeekPlanPage(); importSettingsPage(); importLegalPage() }), 4800)
}

type Tab = 'dashboard' | 'today' | 'wardrobe' | 'week' | 'build' | 'styles' | 'tryon' | 'settings' | 'legal'
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
function getDailyStreak(outfits: OutfitSuggestion[]) {
  const outfitDates = new Set(outfits.map((outfit) => outfit.date))
  let streak = 0
  let cursor = localDateKey()
  while (outfitDates.has(cursor)) {
    streak += 1
    cursor = previousDateKey(cursor)
  }
  return streak
}
function remapItemIds(ids: string[], idMap: Record<string, string>) {
  return ids.map((id) => idMap[id] ?? id)
}

function mergeOutfitsForDisplay(cloudOutfits: OutfitSuggestion[], localOutfits: OutfitSuggestion[]) {
  const byDate = new Map<string, OutfitSuggestion>()
  ;[...localOutfits, ...cloudOutfits].forEach((outfit) => {
    const current = byDate.get(outfit.date)
    if (!current || outfit.generatedAt > current.generatedAt) byDate.set(outfit.date, outfit)
  })
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date) || b.generatedAt.localeCompare(a.generatedAt))
}

function mergeStylesForDisplay(cloudStyles: StyleImage[], localStyles: StyleImage[]) {
  const seen = new Set<string>()
  return [...localStyles, ...cloudStyles]
    .filter((style) => style.image)
    .filter((style) => !isStyleDeleted(style))
    .filter((style) => {
      const key = `${style.id}:${style.image}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export default function App() {
  const [config, setConfig] = useState<AppConfig>(() => getConfig())
  const [tab, setTab] = useState<Tab>('dashboard')
  // Initialize from localStorage so the dashboard renders INSTANTLY on first
  // paint with cached data, then cloud sync silently updates it. This is what
  // makes the app feel "snappy" like the other dashboards.
  const [wardrobe, setWardrobe] = useState<ClothingItem[]>(() => getWardrobe())
  const [outfits, setOutfits] = useState<OutfitSuggestion[]>(() => getOutfits())
  const [styles, setStyles] = useState<StyleImage[]>(() => getStyles())
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(SUPABASE_ENABLED)
  const [cloudLoading, setCloudLoading] = useState(false)
  const [localImportItems, setLocalImportItems] = useState<ClothingItem[]>(() => getWardrobe())
  const [localImportStyles, setLocalImportStyles] = useState<StyleImage[]>(() => getStyles())
  const [localImportOutfits, setLocalImportOutfits] = useState<OutfitSuggestion[]>(() => getOutfits())
  const [importingLocal, setImportingLocal] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [wardrobeImportDismissed, setWardrobeImportDismissed] = useState(false)
  const [generatedImportDismissed, setGeneratedImportDismissed] = useState(false)
  const proxyChecked = useRef(false)
  const autoImportingWardrobe = useRef(false)
  const autoImportingOutfits = useRef(false)
  const autoImportingStyles = useRef(false)

  const refresh = useCallback(() => {
    // Cloud data auto-updates via Supabase realtime subscription.
    // For any local-only state, force a re-read here.
    setWardrobe((prev) => [...prev])
    setOutfits(getOutfits())
    setStyles(getStyles())
  }, [])
  const generationJob = useGenerationJob()

  useEffect(() => {
    if (generationJob?.status === 'done') refresh()
  }, [generationJob?.id, generationJob?.status, refresh])

  useEffect(() => {
    const syncStyles = () => setStyles(getStyles())
    window.addEventListener('daily-stylist-styles', syncStyles)
    return () => window.removeEventListener('daily-stylist-styles', syncStyles)
  }, [])

  useEffect(() => {
    if (proxyChecked.current) return
    proxyChecked.current = true
    preloadAllPages() // warm all the lazy chunks on idle for instant tab switches
    const cur = getConfig()
    if (isConfigured(cur)) return
    checkProxy().then((ok) => { if (ok) { const pc = { ...cur, provider: 'proxy' as const }; saveConfig(pc); setConfig(pc) } })
  }, [])

  useEffect(() => {
    if (!SUPABASE_ENABLED || !supabase) { setAuthLoading(false); return }

    // Auth listener — only update user identity, NEVER touch loading flags here.
    // Token refresh fires this every hour; if we set cloudLoading=true on that,
    // the user gets a full-screen "refresh" flash for no reason.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Ignore noisy refresh events that don't change identity
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return
      setUser((prev) => (prev?.id === session?.user?.id ? prev : (session?.user ?? null)))
      setAuthLoading(false)
    })

    // Handle OAuth redirect / fetch existing session
    const url = new URL(window.location.href)
    const code = url.searchParams.get('code')
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''))
    const hashAccessToken = hashParams.get('access_token')
    const errParam = url.searchParams.get('error_description') || hashParams.get('error_description')

    if (errParam) {
      console.error('OAuth error:', errParam)
      window.history.replaceState({}, document.title, url.origin + url.pathname)
      setAuthLoading(false)
    } else if (hashAccessToken) {
      supabase.auth.getSession().then(({ data }) => {
        window.history.replaceState({}, document.title, url.origin + url.pathname)
        setUser(data.session?.user ?? null)
        setAuthLoading(false)
      })
    } else if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
        if (error) console.error('Code exchange failed:', error.message)
        window.history.replaceState({}, document.title, url.origin + url.pathname)
        setUser(data?.session?.user ?? null)
        setAuthLoading(false)
      })
    } else {
      supabase.auth.getSession().then(({ data }) => {
        setUser(data.session?.user ?? null)
        setAuthLoading(false)
      })
    }

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

    // Show the last synced data immediately after login. Supabase remains the
    // source of truth, but this cache prevents a blank dashboard while realtime
    // does the first round trip.
    const cachedWardrobe = getWardrobe()
    const cachedOutfits = getOutfits()
    const cachedStyles = getStyles()
    setWardrobe(cachedWardrobe)
    setOutfits(cachedOutfits)
    setStyles(cachedStyles)
    setLocalImportItems(cachedWardrobe)
    setLocalImportOutfits(cachedOutfits)
    setLocalImportStyles(cachedStyles)

    // Only show the loading line if there is no useful cache to display.
    let firstFetch = true
    setCloudLoading(cachedWardrobe.length === 0 && cachedOutfits.length === 0 && cachedStyles.length === 0)
    const unsub = subscribeToUserData(
      user.id,
      (data) => {
        if (data.wardrobe !== undefined) {
          const cloudItems = data.wardrobe ?? []
          const local = getWardrobe()
          const localOnly = local.filter((li) => !cloudItems.some((ci) => ci.id === li.id))

          if (localOnly.length > 0 && !autoImportingWardrobe.current) {
            autoImportingWardrobe.current = true
            importLocalWardrobeToCloud(user.id, localOnly)
              .then((result) => {
                const remappedOutfits = getOutfits().map((outfit) => ({ ...outfit, itemIds: remapItemIds(outfit.itemIds, result.idMap) }))
                const remappedStyles = getStyles().map((style) => ({ ...style, itemIds: remapItemIds(style.itemIds, result.idMap) }))
                const importedOldIds = new Set(localOnly.map((item) => item.id))
                const mergedWardrobe = [...getWardrobe().filter((item) => !importedOldIds.has(item.id)), ...result.items]
                saveWardrobe(mergedWardrobe)
                saveOutfitsSnapshot(remappedOutfits)
                saveStyles(remappedStyles)
                setWardrobe(mergedWardrobe)
                setOutfits(remappedOutfits)
                setStyles(remappedStyles)
                setLocalImportItems([])
              })
              .catch(() => {})
              .finally(() => { autoImportingWardrobe.current = false })
          }

          const finalWardrobe = cloudItems.length > 0 ? cloudItems : local
          setWardrobe(finalWardrobe)
          setLocalImportItems([])
          // Persist for instant first-paint next time
          saveWardrobe(finalWardrobe)
        }
        if (data.outfits) {
          const localOutfits = getOutfits()
          const cloudOutfits = data.outfits
          const localOnlyOutfits = localOutfits.filter((lo) => !cloudOutfits.some((co) => co.id === lo.id || co.date === lo.date))
          const finalOutfits = mergeOutfitsForDisplay(cloudOutfits, localOutfits)
          setOutfits(finalOutfits)
          setLocalImportOutfits([])
          if (finalOutfits.length > 0) saveOutfitsSnapshot(finalOutfits)

          if (localOnlyOutfits.length > 0 && !autoImportingOutfits.current) {
            autoImportingOutfits.current = true
            importLocalOutfitsToCloud(user.id, localOnlyOutfits)
              .then((result) => {
                const importedOldIds = new Set(localOnlyOutfits.map((outfit) => outfit.id))
                const merged = [...getOutfits().filter((outfit) => !importedOldIds.has(outfit.id)), ...result.items]
                saveOutfitsSnapshot(merged)
                setOutfits(merged)
                setLocalImportOutfits([])
              })
              .catch(() => {})
              .finally(() => { autoImportingOutfits.current = false })
          }
        }
        if (data.styles) {
          const localStyles = getStyles()
          const cloudStyles = data.styles
          const localOnlyStyles = localStyles.filter((ls) => !cloudStyles.some((cs) => cs.id === ls.id || cs.image === ls.image))
          const finalStyles = mergeStylesForDisplay(cloudStyles, localStyles)
          setStyles(finalStyles)
          setLocalImportStyles([])
          if (finalStyles.length > 0) saveStyles(finalStyles)

          if (localOnlyStyles.length > 0 && !autoImportingStyles.current) {
            autoImportingStyles.current = true
            importLocalStylesToCloud(user.id, localOnlyStyles)
              .then((result) => {
                const importedOldIds = new Set(localOnlyStyles.map((style) => style.id))
                const merged = [...getStyles().filter((style) => !importedOldIds.has(style.id)), ...result.items]
                saveStyles(merged)
                setStyles(merged)
                setLocalImportStyles([])
              })
              .catch(() => {})
              .finally(() => { autoImportingStyles.current = false })
          }
        }
        if (data.profilePhotos) {
          const accountPhotos = data.profilePhotos.filter(Boolean)
          if (accountPhotos.length > 0) {
            saveProfilePhotos(accountPhotos)
          } else {
            const localPhotos = getProfilePhotos().filter(Boolean)
            if (localPhotos.length > 0) {
              Promise.all(localPhotos.slice(0, 5).map((photo, index) => (
                photo.startsWith('data:') || photo.startsWith('blob:')
                  ? uploadProfilePhoto(user.id, photo, `profile-${index}`)
                  : Promise.resolve(photo)
              )))
                .then((urls) => saveProfilePhotosCloud(user.id, urls).then(() => saveProfilePhotos(urls)))
                .catch(() => {})
            }
          }
        }
        if (firstFetch) {
          setCloudLoading(false)
          firstFetch = false
        }
      },
      () => {
        // Supabase error: fall back to localStorage so wardrobe is never blank.
        setWardrobe(getWardrobe())
        setCloudLoading(false)
      },
    )

    const localConfig = getConfig()
    if (isConfigured(localConfig)) saveConfigCloud(user.id, localConfig).catch(() => {})

    return unsub
  }, [user])

  async function handleImportLocalWardrobe() {
    if (!user || localImportItems.length === 0) return
    setImportingLocal(true)
    setImportMsg('')
    try {
      const result = await importLocalWardrobeToCloud(user.id, localImportItems)
      const importedOldIds = new Set(localImportItems.map((item) => item.id))
      const mergedWardrobe = [...getWardrobe().filter((item) => !importedOldIds.has(item.id)), ...result.items]
      const remappedOutfits = getOutfits().map((outfit) => ({ ...outfit, itemIds: remapItemIds(outfit.itemIds, result.idMap) }))
      const remappedStyles = getStyles().map((style) => ({ ...style, itemIds: remapItemIds(style.itemIds, result.idMap) }))
      saveWardrobe(mergedWardrobe)
      saveOutfitsSnapshot(remappedOutfits)
      saveStyles(remappedStyles)
      setWardrobe(mergedWardrobe)
      setOutfits(remappedOutfits)
      setStyles(remappedStyles)
      setImportMsg(`Imported ${result.count} local wardrobe item${result.count === 1 ? '' : 's'} to cloud.`)
      setLocalImportItems([])
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : 'Could not import local wardrobe.')
    } finally {
      setImportingLocal(false)
    }
  }

  function handleDeleteStyle(styleId: string) {
    const target = allStyles.find((style) => style.id === styleId)
    if (target) markStyleDeleted(target)

    if (user) {
      const derivedOutfitId = styleId.startsWith('derived-') ? styleId.replace(/^derived-/, '') : ''
      if (derivedOutfitId) clearOutfitPreviewCloud(user.id, derivedOutfitId).catch(() => {})
      else removeStyleCloud(user.id, styleId).catch(() => {})
    }
    const nextStyles = getStyles().filter((style) => style.id !== styleId && style.outfitId !== target?.outfitId)
    saveStyles(nextStyles)
    setStyles(nextStyles)
    if (styleId.startsWith('derived-')) {
      const outfitId = styleId.replace(/^derived-/, '')
      const nextOutfits = getOutfits().map((outfit) => outfit.id === outfitId ? { ...outfit, previewImage: undefined } : outfit)
      saveOutfitsSnapshot(nextOutfits)
      setOutfits(nextOutfits)
    }
  }

  async function handleImportLocalGenerated() {
    if (!user || (localImportStyles.length === 0 && localImportOutfits.length === 0)) return
    setImportingLocal(true)
    setImportMsg('')
    try {
      const [styleCount, outfitCount] = await Promise.all([
        importLocalStylesToCloud(user.id, localImportStyles),
        importLocalOutfitsToCloud(user.id, localImportOutfits),
      ])
      const importedOldStyleIds = new Set(localImportStyles.map((style) => style.id))
      const importedOldOutfitIds = new Set(localImportOutfits.map((outfit) => outfit.id))
      const mergedStyles = [...getStyles().filter((style) => !importedOldStyleIds.has(style.id)), ...styleCount.items]
      const mergedOutfits = [...getOutfits().filter((outfit) => !importedOldOutfitIds.has(outfit.id)), ...outfitCount.items]
      saveStyles(mergedStyles)
      saveOutfitsSnapshot(mergedOutfits)
      setStyles(mergedStyles)
      setOutfits(mergedOutfits)
      setImportMsg(`Imported ${styleCount.count} generated picture${styleCount.count === 1 ? '' : 's'} and ${outfitCount.count} outfit${outfitCount.count === 1 ? '' : 's'} to cloud.`)
      setLocalImportStyles([])
      setLocalImportOutfits([])
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : 'Could not import generated pictures.')
    } finally {
      setImportingLocal(false)
    }
  }
  function handleReset() { saveConfig({ provider: 'openai', apiKey: '', ollamaUrl: 'http://localhost:11434', ollamaModel: 'moondream' }); setConfig(getConfig()) }
  async function handleSignOut() { if (supabase) await supabase.auth.signOut(); setUser(null) }

  if (authLoading) return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-12 h-12 bg-charcoal rounded-2xl flex items-center justify-center mx-auto"><Sparkles className="w-6 h-6 text-white" strokeWidth={1.5} /></div>
        <Loader2 className="w-5 h-5 animate-spin text-gray-300 mx-auto" />
      </div>
    </div>
  )

  if (!user) return <LoginPage />
  if (!isConfigured(config)) return (
    <Suspense fallback={<div className="min-h-screen bg-cream flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>}>
      <ApiKeySetup onSaved={() => setConfig(getConfig())} userId={user?.id} />
    </Suspense>
  )

  const today = localDateKey()
  const todayOutfit = outfits.find((o) => o.date === today) ?? null
  const userName: string = user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? 'You'
  const userPhoto: string | null = user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture ?? null
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
    .filter((style) => !isStyleDeleted(style))
  const allStyles: StyleImage[] = [...styles, ...derivedStyles]
    .filter((style) => style.image)
    .filter((style) => !isStyleDeleted(style))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const styleCount = allStyles.length
  const dailyStreak = getDailyStreak(outfits)
  const showOnboarding = tab === 'dashboard' && !cloudLoading && wardrobe.length === 0 && outfits.length === 0 && allStyles.length === 0

  const NAV_ITEMS: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <Sparkles className="w-5 h-5" strokeWidth={1.5} /> },
    { id: 'today',    label: 'Today',    icon: <Sparkles className="w-5 h-5" strokeWidth={1.5} /> },
    { id: 'wardrobe', label: 'Wardrobe', icon: <Shirt className="w-5 h-5" strokeWidth={1.5} />, badge: needsWashCount > 0 ? needsWashCount : undefined },
    { id: 'tryon',    label: 'Try-On',   icon: <ShoppingBag className="w-5 h-5" strokeWidth={1.5} /> },
    { id: 'build',    label: 'Builder',  icon: <Wand2 className="w-5 h-5" strokeWidth={1.5} /> },
    { id: 'styles',   label: 'History',  icon: <History className="w-5 h-5" strokeWidth={1.5} />, badge: styleCount > 0 ? styleCount : undefined },
    { id: 'week',     label: 'Week',     icon: <CalendarDays className="w-5 h-5" strokeWidth={1.5} /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-5 h-5" strokeWidth={1.5} /> },
    { id: 'legal',    label: 'Privacy',  icon: <FileText className="w-5 h-5" strokeWidth={1.5} /> },
  ]

  const PageFallback = (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
    </div>
  )

  const pageContent = (
    <Suspense fallback={PageFallback}>
      {tab === 'dashboard' && (showOnboarding ? <OnboardingPage onAddFirstItem={() => setTab('wardrobe')} /> : <DashboardPage wardrobe={wardrobe} outfits={outfits} styles={allStyles} todayOutfit={todayOutfit} config={config} onOutfitGenerated={refresh} userId={user?.id} onOpenTab={setTab} />)}
      {tab === 'today' && <DailyOutfitPage wardrobe={wardrobe} todayOutfit={todayOutfit} config={config} onOutfitGenerated={refresh} userId={user?.id} dailyStreak={dailyStreak} />}
      {tab === 'wardrobe' && <WardrobePage wardrobe={wardrobe} config={config} onUpdate={refresh} userId={user?.id} />}
      {tab === 'build' && <OutfitBuilderPage wardrobe={wardrobe} config={config} userId={user?.id} onSaved={refresh} />}
      {tab === 'tryon' && <TryOnPage config={config} userId={user?.id} onSaved={refresh} />}
      {tab === 'styles' && <StylesPage styles={allStyles} wardrobe={wardrobe} userId={user?.id} onDelete={handleDeleteStyle} onSaved={refresh} />}
      {tab === 'week' && <WeekPlanPage wardrobe={wardrobe} outfits={outfits} config={config} onUpdate={refresh} userId={user?.id} />}
      {tab === 'settings' && user && <SettingsPage user={user} config={config} counts={{ wardrobe: wardrobe.length, outfits: outfits.length, styles: styleCount }} onChangeProvider={handleReset} onSignOut={handleSignOut} />}
      {tab === 'legal' && <LegalPage />}
    </Suspense>
  )

  function SidebarContent({ onClose }: { onClose?: () => void }) {
    return (<>
      <div className="h-16 flex items-center gap-3 px-5 border-b border-white/10">
        <AppLogo className="w-8 h-8 flex-shrink-0" />
        <div className="flex-1 min-w-0"><p className="font-semibold text-white text-sm leading-none">Daily Outfit</p><p className="text-[10px] text-white/40 mt-0.5">{PROVIDER_LABELS[config.provider]}</p></div>
        {onClose && <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg flex-shrink-0"><X className="w-4 h-4 text-white/60" /></button>}
      </div>
      {(user || !SUPABASE_ENABLED) && (
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
            {tab === item.id && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-gradient-to-b from-coral to-skysoft rounded-r-full" />}
            {item.icon}{item.label}
            {item.badge !== undefined && item.badge > 0 && <span className="ml-auto bg-gradient-to-r from-coral to-sun text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">{item.badge > 99 ? '99+' : item.badge}</span>}
          </button>
        ))}
      </nav>
      <div className="p-3 border-t border-white/10 space-y-1">
        {SUPABASE_ENABLED && user && <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-white/40 hover:bg-white/5 hover:text-red-400 transition-colors"><LogOut className="w-4 h-4" />Sign Out</button>}
      </div>
    </>)
  }

  return (
    <div className="min-h-screen bg-cream">
      <GenerationStatusBar onJump={(origin) => setTab(origin === 'today' ? 'today' : origin)} />
      {cloudLoading && (
        <div className="fixed top-0 inset-x-0 h-0.5 bg-blush/40 overflow-hidden z-40">
          <div className="h-full w-1/3 bg-blush animate-progress-slide" />
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
              <AppLogo className="w-7 h-7 flex-shrink-0" />
              <span className="font-semibold text-charcoal text-sm">Daily Outfit</span>
              <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium uppercase">{PROVIDER_LABELS[config.provider]}</span>
            </div>
            {userPhoto ? <img src={userPhoto} alt={userName} className="w-7 h-7 rounded-full object-cover" /> : <div className="w-7 h-7 rounded-full bg-charcoal flex items-center justify-center"><span className="text-[10px] font-bold text-white">{getInitials(userName)}</span></div>}
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6 pb-28">{pageContent}</main>
        <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 z-40 safe-bottom">
          <div className="max-w-2xl mx-auto px-2 flex">
            {NAV_ITEMS.filter((i) => ['today','wardrobe','tryon','styles','build'].includes(i.id)).map((item) => (
              <button key={item.id} onClick={() => setTab(item.id)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 relative transition-colors ${tab === item.id ? 'text-charcoal' : 'text-gray-400 hover:text-gray-600'}`}>
                {item.icon}
                <span className="text-[10px] font-medium">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && <span className="absolute top-2.5 right-1/4 translate-x-1/2 bg-gradient-to-r from-coral to-sun text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{item.badge > 99 ? '99+' : item.badge}</span>}
                {tab === item.id && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-gradient-to-r from-coral to-skysoft rounded-full" />}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  )
}
