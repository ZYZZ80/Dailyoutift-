import { useState, useEffect } from 'react'
import { Key, Cpu, Zap, CheckCircle, XCircle, Loader2, Cloud, Sparkles } from 'lucide-react'
import { saveConfig, type AppConfig } from '../lib/storage'
import { testGeminiKey, checkProxy } from '../lib/claude'

interface Props {
  onSaved: () => void
}

type Provider = 'openai' | 'gemini' | 'ollama' | 'proxy'
type TestStatus = 'idle' | 'testing' | 'ok' | 'fail'

export default function ApiKeySetup({ onSaved }: Props) {
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
    if (!apiKey.trim()) {
      setError('Enter your API key first')
      return
    }

    setTestStatus('testing')
    setError('')
    setTestMsg('')

    if (provider === 'gemini') {
      const result = await testGeminiKey(apiKey.trim())

      if (result.ok) {
        setTestStatus('ok')
        setTestMsg('Key works!')
      } else {
        setTestStatus('fail')
        setTestMsg(result.error || 'Invalid key')
      }
    }
  }

  async function handleSave() {
    if (provider === 'proxy') {
      saveConfig({
        provider: 'proxy',
        apiKey: '',
        ollamaUrl: '',
        ollamaModel: '',
      })
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
    onSaved()
  }

  const PROVIDERS = [
    { id: 'proxy', label: 'Built-in AI', badge: 'Free', hidden: !proxyAvailable },
    { id: 'gemini', label: 'Gemini', badge: 'Free' },
    { id: 'openai', label: 'OpenAI', badge: 'Paid' },
    { id: 'ollama', label: 'Ollama', badge: 'Local' },
  ].filter(p => !p.hidden)

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-lg p-8 max-w-md w-full text-center">

        <div className="w-16 h-16 bg-blush/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <Zap className="w-8 h-8 text-blush" />
        </div>

        <h1 className="text-xl font-semibold mb-2">Daily Stylist</h1>
        <p className="text-sm text-gray-400 mb-6">Choose your AI provider</p>

        {/* Providers */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
          {PROVIDERS.map(p => (
            <button
              key={p.id}
              onClick={() => setProvider(p.id as Provider)}
              className={`flex-1 py-2 rounded-lg text-xs ${
                provider === p.id ? 'bg-white shadow' : ''
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Input */}
        {provider !== 'proxy' && provider !== 'ollama' && (
          <input
            type="password"
            placeholder="API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full border p-3 rounded-xl mb-3"
          />
        )}

        {/* Test */}
        {provider === 'gemini' && (
          <button
            onClick={handleTest}
            className="text-xs mb-3"
          >
            Test Key
          </button>
        )}

        {testStatus === 'ok' && <p className="text-green-500 text-xs">{testMsg}</p>}
        {testStatus === 'fail' && <p className="text-red-500 text-xs">{testMsg}</p>}

        {error && <p className="text-red-500 text-xs mb-2">{error}</p>}

        <button
          onClick={handleSave}
          className="w-full bg-black text-white py-3 rounded-xl"
        >
          Save & Start
        </button>

      </div>
    </div>
  )
}
