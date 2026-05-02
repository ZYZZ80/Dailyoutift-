import { useState, useEffect } from 'react'
import { Key, Cpu, Zap, CheckCircle, XCircle, Loader2, Cloud, Sparkles } from 'lucide-react'
import { saveConfig, type AppConfig } from '../lib/storage'
import { saveConfigCloud } from '../lib/cloud'
import { testGeminiKey, checkProxy } from '../lib/claude'


interface Props {
  onSaved: () => void
  userId?: string
}

type Provider = 'openai' | 'gemini' | 'ollama' | 'proxy'
type TestStatus = 'idle' | 'testing' | 'ok' | 'fail'

export default function ApiKeySetup({ onSaved, userId }: Props) {
  const [provider, setProvider] = useState<Provider>('gemini')
  const [apiKey, setApiKey] = useState('')
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
          setTestMsg('Quota exceeded — create a new key in a new project at aistudio.google.com/apikey')
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
    const config: AppConfig = { provider, apiKey: apiKey.trim(), ollamaUrl: ollamaUrl.trim(), ollamaModel: ollamaModel.trim() }
    saveConfig(config)
    if (userId) {
      try { await saveConfigCloud(userId, config) } catch { /* ignore */ }
    }
    onSaved()
  }

  const ALL_PROVIDERS: { id: Provider; label: string; icon: React.ReactNode; badge: string; hidden?: boolean }[] = [
    { id: 'proxy',  label: 'Built-in AI', icon: <Sparkles className="w-4 h-4" />, badge: 'Free', hidden: !proxyAvailable },
    { id: 'gemini', label: 'Gemini',      icon: <Zap className="w-4 h-4" />,      badge: 'Free' },
    { id: 'openai', label: 'OpenAI',      icon: <Key className="w-4 h-4" />,      badge: 'Paid' },
    { id: 'ollama', label: 'Ollama',      icon: <Cpu className="w-4 h-4" />,      badge: 'Local' },
  ]
  const PROVIDERS = ALL_PROVIDERS.filter((p) => !p.hidden)

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-lg p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-blush/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <Zap className="w-8 h-8 text-blush" strokeWidth={1.5} />
        </div>
        <h1 className="text-2xl font-semibold text-charcoal mb-2">Daily Outfit Stylist</h1>
        <p className="text-gray-500 mb-6 text-sm">Choose your AI provider to get started.</p>

        {/* Provider tabs */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => { setProvider(p.id); setError(''); setTestStatus('idle'); setTestMsg('') }}
              className={`flex-1 flex flex-col items-center justify-center py-2 rounded-lg text-xs font-medium transition-all gap-0.5 ${
                provider === p.id ? 'bg-white shadow text-charcoal' : 'text-gray-500'
              }`}
            >
              <span className="flex items-center gap-1">{p.icon}{p.label}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                p.badge === 'Free' ? 'bg-green-100 text-green-600' :
                p.badge === 'Paid' ? 'bg-orange-100 text-orange-600' :
                'bg-gray-200 text-gray-500'
              }`}>{p.badge}</span>
            </button>
          ))}
        </div>

        {/* Proxy — no setup needed */}
        {provider === 'proxy' && (
          <div className="mb-4 bg-green-50 rounded-2xl p-4 text-left space-y-1.5">
            <div className="flex items-center gap-2 text-green-700 font-medium text-sm">
              <Sparkles className="w-4 h-4 flex-shrink-0" />
              No API key needed
            </div>
            <p className="text-xs text-green-600 leading-relaxed">
              AI is powered by the app — just tap Save &amp; Get Started.
            </p>
          </div>
        )}

        {provider === 'gemini' && (
          <div className="space-y-3 mb-4 text-left">
            <div className="relative">
              <input
                type="password"
                placeholder="AIza..."
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setError(''); setTestStatus('idle') }}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blush/50 pr-24"
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
              <button
                onClick={handleTest}
                disabled={testStatus === 'testing' || !apiKey.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-40 transition-colors flex items-center gap-1"
              >
                {testStatus === 'testing' ? <Loader2 className="w-3 h-3 animate-spin" /> :
                 testStatus === 'ok' ? <CheckCircle className="w-3 h-3 text-green-500" /> :
                 testStatus === 'fail' ? <XCircle className="w-3 h-3 text-red-400" /> :
                 null}
                Test
              </button>
            </div>

            {testStatus === 'ok' && (
              <div className="flex items-center gap-2 text-green-600 bg-green-50 rounded-xl px-3 py-2 text-xs">
                <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {testMsg}
              </div>
            )}
            {testStatus === 'fail' && (
              <div className="flex items-start gap-2 text-red-500 bg-red-50 rounded-xl px-3 py-2.5 text-xs">
                <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Key not working</p>
                  <p className="mt-0.5 text-red-400">{testMsg}</p>
                </div>
              </div>
            )}

            <div className="bg-gray-50 rounded-xl p-3 text-xs text-left space-y-1 text-gray-500">
              <p className="font-medium text-gray-600">How to get a free key:</p>
              <p>1. Go to <span className="font-medium text-gray-700">aistudio.google.com/apikey</span></p>
              <p>2. Click <span className="font-medium">"Create API key in new project"</span></p>
              <p>3. Copy and paste it above</p>
              <p className="text-gray-400">Each new project gets fresh free quota.</p>
            </div>
          </div>
        )}

        {provider === 'openai' && (
          <div className="space-y-3 mb-4">
            <input
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setError('') }}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blush/50"
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
            <p className="text-xs text-gray-400">
              Note: ChatGPT Plus <strong>does not</strong> include API access.<br />
              Get a separate API key at <span className="font-medium text-gray-600">platform.openai.com/api-keys</span>
            </p>
          </div>
        )}

        {provider === 'ollama' && (
          <div className="space-y-3 mb-4 text-left">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Ollama URL</label>
              <input value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blush/50" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Vision Model</label>
              <select value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blush/50 bg-white">
                <option value="moondream">moondream (recommended)</option>
                <option value="llava">llava</option>
                <option value="llama3.2-vision">llama3.2-vision</option>
              </select>
            </div>
            <p className="text-xs text-amber-500">⚠ Only works on PC browser (localhost), not iPad.</p>
          </div>
        )}

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        {FIREBASE_ENABLED && userId && (
          <div className="flex items-center justify-center gap-1.5 text-xs text-green-600 bg-green-50 rounded-xl px-3 py-2 mb-3">
            <Cloud className="w-3.5 h-3.5 flex-shrink-0" />
            Key will be saved to your account — no need to re-enter on other devices
          </div>
        )}

        <button
          onClick={handleSave}
          className="w-full bg-charcoal text-white rounded-xl py-3 text-sm font-medium hover:bg-black transition-colors"
        >
          Save &amp; Get Started
        </button>
      </div>
    </div>
  )
}
