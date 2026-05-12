// Lazy-load the heavy AI SDKs only when actually needed.
// For users on the Built-in AI (proxy) provider — by far the common case —
// neither SDK is ever loaded into the browser. Saves ~330 KB of JS.
import type OpenAIType from 'openai'
import type { GoogleGenerativeAI as GoogleGenerativeAIType } from '@google/generative-ai'
import type { AppConfig } from './storage'
import type { ClothingItem, OutfitSuggestion } from '../types'

let _OpenAI: typeof OpenAIType | null = null
async function getOpenAIClass(): Promise<typeof OpenAIType> {
  if (!_OpenAI) _OpenAI = (await import('openai')).default
  return _OpenAI
}

let _GoogleGenAI: typeof GoogleGenerativeAIType | null = null
async function getGoogleGenAIClass(): Promise<typeof GoogleGenerativeAIType> {
  if (!_GoogleGenAI) _GoogleGenAI = (await import('@google/generative-ai')).GoogleGenerativeAI
  return _GoogleGenAI
}

// Gemini model preference order — tries each until one works
const GEMINI_TEXT_MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
]

function resolveUrl(url: string): string {
  if (url.startsWith('/')) return `${window.location.origin}${url}`
  return url
}

/** Parse the real cause out of a GoogleGenerativeAI error */
export function parseGeminiError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)

  // Extract embedded JSON error body: [...{"error":{"code":429,...}}]
  const jsonMatch = raw.match(/\[(\{"error"[\s\S]*?})\]/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]) as { error?: { code?: number; message?: string; status?: string } }
      const code = parsed?.error?.code
      const status = parsed?.error?.status ?? ''
      const msg = parsed?.error?.message ?? ''
      if (code === 429 || status === 'RESOURCE_EXHAUSTED') return 'QUOTA_EXCEEDED'
      if (code === 400) return `Bad request: ${msg.substring(0, 80)}`
      if (code === 401 || code === 403) return 'INVALID_KEY'
      if (msg) return msg.substring(0, 100)
    } catch { /* ignore */ }
  }

  if (raw.includes('429') || raw.includes('quota') || raw.includes('RESOURCE_EXHAUSTED')) return 'QUOTA_EXCEEDED'
  if (raw.includes('401') || raw.includes('403') || raw.includes('API_KEY') || raw.includes('invalid')) return 'INVALID_KEY'
  if (raw.includes('Error fetching from')) return `Network error — check your internet connection. (${raw.substring(0, 80)})`
  return raw.substring(0, 120)
}

/** Get a Gemini model, trying fallbacks if the primary is unavailable */
async function getGeminiModel(apiKey: string, models = GEMINI_TEXT_MODELS) {
  const GoogleGenerativeAI = await getGoogleGenAIClass()
  const genAI = new GoogleGenerativeAI(apiKey)
  return genAI.getGenerativeModel({ model: models[0] })
}

function extractFirstJSON(text: string): string {
  const start = text.indexOf('{')
  if (start === -1) throw new Error('No JSON found in response')
  let depth = 0, inString = false, escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    if (ch === '}') { depth--; if (depth === 0) return text.slice(start, i + 1) }
  }
  throw new Error('Incomplete JSON in response')
}

function normalizeClothingData(data: Record<string, unknown>): { name: string; category: string; color: string; tags: string[] } {
  return {
    name: typeof data.name === 'string' && data.name ? data.name : 'Unknown Item',
    category: typeof data.category === 'string' && data.category ? data.category : 'top',
    color: typeof data.color === 'string' ? data.color : '',
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
  }
}

function parseJSON(text: string): Record<string, unknown> {
  const stripped = text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/```[\w]*\n?/g, '')
    .trim()
  const jsonStr = extractFirstJSON(stripped)
  try { return JSON.parse(jsonStr) } catch { /* fall through */ }
  try { return JSON.parse(jsonStr.replace(/'/g, '"')) } catch { /* fall through */ }
  throw new Error('Could not parse AI response as JSON')
}

// --- Gemini ---

async function geminiAnalyzeClothing(imageBase64: string, apiKey: string) {
  const model = await getGeminiModel(apiKey)
  const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
  const mimeType = imageBase64.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'
  const result = await model.generateContent([
    { inlineData: { data: base64Data, mimeType } },
    `Analyze this clothing item. Respond ONLY with valid JSON:\n{"name":"short name","category":"top|bottom|dress|shoes|accessory|outerwear","color":"main color","tags":["tag1","tag2","tag3"]}`,
  ])
  return parseJSON(result.response.text())
}

/** Quick test: send a tiny prompt to check the key + model are working */
export async function testGeminiKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const model = await getGeminiModel(apiKey)
    await model.generateContent('Reply with the single word: ok')
    return { ok: true }
  } catch (e) {
    const err = parseGeminiError(e)
    return { ok: false, error: err }
  }
}

// --- OpenAI / Ollama ---

async function getOpenAIClient(config: AppConfig): Promise<{ client: OpenAIType; model: string }> {
  const OpenAI = await getOpenAIClass()
  if (config.provider === 'ollama') {
    return {
      client: new OpenAI({ apiKey: 'ollama', baseURL: `${resolveUrl(config.ollamaUrl)}/v1`, dangerouslyAllowBrowser: true }),
      model: config.ollamaModel,
    }
  }
  return {
    client: new OpenAI({ apiKey: config.apiKey, dangerouslyAllowBrowser: true }),
    model: 'gpt-4o',
  }
}

async function ollamaChat(ollamaBaseUrl: string, model: string, prompt: string, think = false): Promise<string> {
  const base = resolveUrl(ollamaBaseUrl)
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, think, stream: false, messages: [{ role: 'user', content: prompt }] }),
  })
  const data = await res.json()
  return data.message?.content ?? ''
}

async function ollamaAnalyzeClothing(imageBase64: string, config: AppConfig) {
  const baseURL = `${resolveUrl(config.ollamaUrl)}/v1`
  const OpenAI = await getOpenAIClass()
  const visionClient = new OpenAI({ apiKey: 'ollama', baseURL, dangerouslyAllowBrowser: true })
  const desc = await visionClient.chat.completions.create({
    model: config.ollamaModel,
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageBase64 } },
        { type: 'text', text: 'Describe this clothing item: what is it, color, style?' },
      ],
    }],
  })
  const description = desc.choices[0].message.content ?? ''
  const raw = await ollamaChat(
    config.ollamaUrl,
    'qwen3:4b',
    `Clothing description: "${description}"\n\nOutput ONLY this JSON:\n{"name":"item name","category":"top or bottom or dress or shoes or accessory or outerwear","color":"main color","tags":["tag1","tag2"]}`,
    false,
  )
  return parseJSON(raw)
}

// --- Proxy (server-side Gemini key) ---

async function readProxyJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(`AI proxy returned a non-JSON response (${res.status}). Check the Vercel function logs.`)
  }
}

function proxyErrorMessage(data: Record<string, unknown>, status: number): string {
  const code = typeof data.error === 'string' ? data.error : ''
  const details = typeof data.details === 'string' ? data.details : ''
  if (code === 'not_configured') return 'AI is not configured. Add OPENAI_API_KEY or GEMINI_API_KEY in Vercel Environment Variables.'
  if (code === 'quota_exceeded') return 'Quota exceeded - the built-in AI quota is full, please try again tomorrow.'
  if (details) return details
  if (code) return code
  return `AI proxy error ${status}`
}

/** Returns true if the /api/ai proxy endpoint is live and configured. */
export async function checkProxy(): Promise<boolean> {
  try {
    const res = await fetch('/api/ai', { method: 'GET' })
    return res.ok
  } catch {
    return false
  }
}

async function proxyAnalyzeClothing(imageBase64: string) {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'analyze', imageBase64 }),
  })
  const data = await readProxyJson(res)
  if (!res.ok) throw new Error(proxyErrorMessage(data, res.status))
  return data as { name: string; category: string; color: string; tags: string[] }
}

async function proxyGenerateOutfit(wardrobe: ClothingItem[], date: string, occasion?: string) {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'outfit', wardrobe, date, occasion }),
  })
  const data = await readProxyJson(res)
  if (!res.ok) {
    throw new Error(proxyErrorMessage(data, res.status))
  }
  return data as Omit<OutfitSuggestion, 'id' | 'generatedAt'>
}

// --- Public API ---

export async function analyzeClothing(
  imageBase64: string,
  config: AppConfig,
): Promise<{ name: string; category: string; color: string; tags: string[] }> {
  if (config.provider === 'proxy') return proxyAnalyzeClothing(imageBase64)
  if (config.provider === 'gemini') {
    try {
      return normalizeClothingData(await geminiAnalyzeClothing(imageBase64, config.apiKey))
    } catch (e) {
      // fallback to proxy
      try { return await proxyAnalyzeClothing(imageBase64) } catch { /* ignore */ }
      throw new Error(parseGeminiError(e))
    }
  }
  if (config.provider === 'ollama') return normalizeClothingData(await ollamaAnalyzeClothing(imageBase64, config))

  // OpenAI direct — try gpt-4o-mini then gpt-4o, then fall back to proxy
  const { client } = await getOpenAIClient(config)
  const analyzePrompt = 'Analyze this clothing item. Respond ONLY with valid JSON:\n{"name":"short name","category":"top|bottom|dress|shoes|accessory|outerwear","color":"main color","tags":["tag1","tag2","tag3"]}'
  let lastErr: unknown
  for (const model of ['gpt-4o-mini', 'gpt-4o']) {
    try {
      const response = await client.chat.completions.create({
        model,
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageBase64 } },
            { type: 'text', text: analyzePrompt },
          ],
        }],
      })
      return normalizeClothingData(parseJSON(response.choices[0].message.content ?? ''))
    } catch (err) {
      lastErr = err
      const m = err instanceof Error ? err.message : String(err)
      if (!m.includes('model') && !m.includes('not found') && !m.includes('access')) break
    }
  }
  // Last resort: server-side proxy
  try { return await proxyAnalyzeClothing(imageBase64) } catch { /* ignore */ }
  throw lastErr ?? new Error('Could not analyze with OpenAI')
}

export async function generateOutfit(
  wardrobe: ClothingItem[],
  date: string,
  config: AppConfig,
  occasion?: string,
): Promise<Omit<OutfitSuggestion, 'id' | 'generatedAt'>> {
  if (config.provider === 'proxy') return proxyGenerateOutfit(wardrobe, date, occasion)

  const day = new Date(date).toLocaleDateString('en-US', { weekday: 'long' })
  const occasionHint = occasion ? ` for a ${occasion} occasion` : ''
  const wardrobeList = wardrobe.map((i) => `ID:${i.id} | ${i.name} | ${i.category} | ${i.color}`).join('\n')
  const prompt = `You are a stylist. Pick 2-4 items for ${day}, ${date}${occasionHint}.\n\nWardrobe:\n${wardrobeList}\n\nRespond ONLY with valid JSON:\n{"itemIds":["id1","id2"],"description":"outfit description","styleNotes":"styling tips","occasion":"${occasion ?? 'Casual'}"}`

  if (config.provider === 'gemini') {
    try {
      const model = await getGeminiModel(config.apiKey)
      const result = await model.generateContent(prompt)
      return { ...parseJSON(result.response.text()), date } as Omit<OutfitSuggestion, 'id' | 'generatedAt'>
    } catch (e) {
      const parsed = parseGeminiError(e)
      if (parsed === 'QUOTA_EXCEEDED') throw new Error('Quota exceeded — create a new API key at aistudio.google.com/apikey (choose "Create API key in new project")')
      if (parsed === 'INVALID_KEY') throw new Error('Invalid API key — check your Gemini key in Settings')
      throw new Error(parsed)
    }
  }

  if (config.provider === 'ollama') {
    const raw = await ollamaChat(config.ollamaUrl, 'qwen3:4b', prompt.replace('Respond ONLY with valid JSON', 'Output ONLY this JSON with no extra text'), false)
    return { ...parseJSON(raw), date } as Omit<OutfitSuggestion, 'id' | 'generatedAt'>
  }

  const { client } = await getOpenAIClient(config)
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  })
  return { ...parseJSON(response.choices[0].message.content ?? ''), date } as Omit<OutfitSuggestion, 'id' | 'generatedAt'>
}
