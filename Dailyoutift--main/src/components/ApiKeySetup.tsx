import { useState, useEffect } from 'react'
import { Key, Cpu, Zap, CheckCircle, XCircle, Cloud, Sparkles, Info, Eye, EyeOff, AlertTriangle } from 'lucide-react'
import { saveConfig, type AppConfig } from '../lib/storage'
import { saveConfigCloud } from '../lib/cloud'
import { testGeminiKey, checkProxy } from '../lib/claude'
import { SUPABASE_ENABLED } from '../lib/supabase'
import { Button, Card, Select, Spinner } from './ui'

interface Props {
  onSaved: () => void
  userId?: string
}

type Provider = 'openai' | 'gemini' | 'ollama' | 'proxy'
type TestStatus = 'idle' | 'testing' | 'ok' | 'fail'

const OLLAMA_MODELS = [
  { value: 'moondream', label: 'moondream (recommended)' },
  { value: 'llava', label: 'llava' },
  { value: 'llama3.2-vision', label: 'llama3.2-vision' },
]

export default function ApiKeySetup({ onSaved, userId }: Props) {
  const [provider, setProvider] = useState<Provider>('gemini')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:5173/ollama')
  const [ollamaModel, setOllamaModel] = useState('moondream')
  const [error, setError] = useState('')
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [testMsg, setTestMsg] = useState('')
  const [proxyAvailable, setProxyAvailable] = useState(false)

  useEffect(() => {
    checkProxy().then((ok) => {
      setProxyAvailable(ok)
      if (ok) setProvider('proxy')
    })
  }, [])

  async function handleTest() {
    if (!apiKey.trim()) { setError('Enter your API key first'); return }
    setTestStatus('testing')
    setTestMsg('')
    setError('')
    if (provider === 'gemini') {
      const result = await testGeminiKey(apiKey.trim())
      if (result.ok) {
        setTestStatus('ok')
        setTestMsg('Key works!')
      } else {
        setTestStatus('fail')
        const err = result.error ?? ''
        if (err === 'QUOTA_EXCEEDED') {
          setTestMsg('Quota exceeded — create a new key at aistudio.google.com/apikey')
        } else if (err === 'INVALID_KEY') {
          setTestMsg('Invalid key — copy it again from aistudio.google.com/apikey')
        } else {
          setTestMsg(err || 'Could not connect to Gemini')
        }
      }
    }
  }

  async function handleSave() {
    if (provider === 'proxy') {
      const config: AppConfig = { provider: 'proxy', apiKey: '', ollamaUrl: '', ollamaModel: '' }
      saveConfig(config)
      if (userId) saveConfigCloud(userId, config).catch(() => {})
      onSaved()
      return
    }
    if (provider !== 'ollama' && !apiKey.trim()) {
      setError('Please enter your API key')
      return
    }
    const config: AppConfig = {
      provider,
      apiKey: apiKey.trim(),
      ollamaUrl: ollamaUrl.trim(),
      ollamaModel: ollamaModel.trim(),
    }
    saveConfig(config)
    if (userId) {
      try { await saveConfigCloud(userId, config) } catch { /* ignore */ }
    }
    onSaved()
  }

  const ALL_PROVIDERS: { id: Provider; label: string; icon: React.ReactNode; badge: string; badgeColor: string; hidden?: boolean }[] = [
    { id: 'proxy',  label: 'Built-in AI', icon: <Sparkles className="w-4 h-4" />, badge: 'Free',  badgeColor: 'bg-success-bg text-success-text', hidden: !proxyAvailable },
    { id: 'gemini', label: 'Gemini',      icon: <Zap className="w-4 h-4" />,      badge: 'Free',  badgeColor: 'bg-success-bg text-success-text' },
    { id: 'openai', label: 'OpenAI',      icon: <Key className="w-4 h-4" />,      badge: 'Paid',  badgeColor: 'bg-warning-bg text-warning-text' },
    { id: 'ollama', label: 'Ollama',      icon: <Cpu className="w-4 h-4" />,      badge: 'Local', badgeColor: 'bg-surface-overlay text-charcoal-muted' },
  ]
  const PROVIDERS = ALL_PROVIDERS.filter((p) => !p.hidden)

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-lg p-8 max-w-md w-full animate-scale-in">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-blush/30 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Zap className="w-6 h-6 text-blush-dark" strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-charcoal">Connect AI</h1>
            <p className="text-charcoal-muted text-sm">Choose your AI provider to get started.</p>
          </div>
        </div>

        {/* Provider tabs */}
        <div
          role="tablist"
          aria-label="AI provider"
          className="flex bg-surface-overlay rounded-xl p-1 mb-6 gap-1"
        >
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={provider === p.id}
              onClick={() => { setProvider(p.id); setError(''); setTestStatus('idle'); setTestMsg('') }}
              className={[
                'flex-1 flex flex-col items-center justify-center py-2.5 rounded-lg text-xs font-medium transition-all gap-1',
                provider === p.id ? 'bg-white shadow text-charcoal' : 'text-charcoal-muted hover:text-charcoal',
              ].join(' ')}
            >
              <span className="flex items-center gap-1.5">{p.icon}{p.label}</span>
              <span className={['text-2xs px-1.5 py-0.5 rounded-full font-semibold', p.badgeColor].join(' ')}>
                {p.badge}
              </span>
            </button>
          ))}
        </div>

        {/* Proxy */}
        {provider === 'proxy' && (
          <Card padding="sm" className="mb-4 bg-success-bg border-success/20">
            <div className="flex items-start gap-3">
              <Sparkles className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-success-text">No API key needed</p>
                <p className="text-xs text-success-text/70 mt-0.5">
                  AI is powered by the app — just tap Save &amp; Get Started.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Gemini */}
        {provider === 'gemini' && (
          <div className="space-y-3 mb-4">
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                placeholder="AIza..."
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setError(''); setTestStatus('idle') }}
                className="w-full border border-[#E8E4DF] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blush/50 pr-24"
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowKey(s => !s)}
                  aria-label={showKey ? 'Hide API key' : 'Show API key'}
                  className="p-1.5 text-charcoal-muted hover:text-charcoal transition-colors"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  onClick={handleTest}
                  disabled={testStatus === 'testing' || !apiKey.trim()}
                  className="text-xs font-medium px-2.5 py-1.5 bg-surface-overlay hover:bg-[#E8E4DF] rounded-lg disabled:opacity-40 transition-colors flex items-center gap-1"
                >
                  {testStatus === 'testing' ? <Spinner size="sm" /> :
                   testStatus === 'ok' ? <CheckCircle className="w-3 h-3 text-success" /> :
                   testStatus === 'fail' ? <XCircle className="w-3 h-3 text-danger" /> : null}
                  Test
                </button>
              </div>
            </div>

            {testStatus === 'ok' && (
              <div className="flex items-center gap-2 text-success-text bg-success-bg rounded-xl px-3 py-2 text-xs">
                <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {testMsg}
              </div>
            )}
            {testStatus === 'fail' && (
              <div className="flex items-start gap-2 text-danger-text bg-danger-bg rounded-xl px-3 py-2.5 text-xs">
                <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Key not working</p>
                  <p className="mt-0.5 text-danger/80">{testMsg}</p>
                </div>
              </div>
            )}

            <Card padding="sm" className="bg-surface-raised">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-charcoal-muted flex-shrink-0 mt-0.5" />
                <div className="text-xs text-charcoal-muted space-y-1">
                  <p className="font-semibold text-charcoal">How to get a free key:</p>
                  <p>1. Go to <strong className="text-charcoal">aistudio.google.com/apikey</strong></p>
                  <p>2. Click <strong>"Create API key in new project"</strong></p>
                  <p>3. Copy and paste it above</p>
                  <p className="text-charcoal-muted/60">Each new project gets fresh free quota.</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* OpenAI */}
        {provider === 'openai' && (
          <div className="space-y-3 mb-4">
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setError('') }}
                className="w-full border border-[#E8E4DF] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blush/50 pr-12"
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
              <button
                type="button"
                onClick={() => setShowKey(s => !s)}
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-charcoal-muted hover:text-charcoal transition-colors"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Card padding="sm" className="bg-surface-raised">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-charcoal-muted flex-shrink-0 mt-0.5" />
                <p className="text-xs text-charcoal-muted">
                  ChatGPT Plus <strong className="text-charcoal">does not</strong> include API access.
                  Get a separate key at <strong className="text-charcoal">platform.openai.com/api-keys</strong>
                </p>
              </div>
            </Card>
          </div>
        )}

        {/* Ollama */}
        {provider === 'ollama' && (
          <div className="space-y-3 mb-4">
            <div>
              <label className="text-xs font-medium text-charcoal-muted mb-1.5 block">Ollama URL</label>
              <input
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
                className="w-full border border-[#E8E4DF] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blush/50"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-charcoal-muted mb-1.5 block">Vision Model</label>
              <Select
                value={ollamaModel}
                onChange={setOllamaModel}
                options={OLLAMA_MODELS}
              />
            </div>
            <div className="flex items-start gap-2 bg-warning-bg rounded-xl px-3 py-2.5 text-xs text-warning-text">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              Only works on PC browser (localhost), not iPad.
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-danger-text bg-danger-bg rounded-xl px-3 py-2 text-xs mb-3">
            <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {error}
          </div>
        )}

        {SUPABASE_ENABLED && userId && (
          <div className="flex items-center gap-2 text-success-text bg-success-bg rounded-xl px-3 py-2 text-xs mb-4">
            <Cloud className="w-3.5 h-3.5 flex-shrink-0" />
            Key will be saved to your account — no need to re-enter on other devices.
          </div>
        )}

        <Button variant="primary" size="lg" fullWidth onClick={handleSave}>
          Save &amp; Get Started
        </Button>
      </div>
    </div>
  )
}
