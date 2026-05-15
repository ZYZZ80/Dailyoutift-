import { GoogleGenerativeAI } from '@google/generative-ai'
import type { Part as GeminiPart } from '@google/generative-ai'
import OpenAI from 'openai'
import { checkAndRecordUsage, cors, getUser, type ApiRequest, type ApiResponse } from './lib/account.js'

function extractFirstJSON(text: string): string {
  const start = text.indexOf('{')
  if (start === -1) throw new Error('No JSON in response')
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

function parseAI(text: string): Record<string, unknown> {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```[\w]*\n?/g, '').trim()
  return JSON.parse(extractFirstJSON(cleaned))
}

/** Convert any image input (data URL or remote URL) into a Buffer + mimeType for OpenAI. */
async function imageToBuffer(input: string): Promise<{ buffer: Buffer; mimeType: string }> {
  if (input.startsWith('data:')) {
    const [meta, base64Data] = input.split(',')
    if (!base64Data) throw new Error('Invalid image data URL')
    const mimeMatch = meta.match(/data:([^;]+)/)
    const mimeType = mimeMatch?.[1] ?? 'image/jpeg'
    return { buffer: Buffer.from(base64Data, 'base64'), mimeType }
  }
  // Remote URL — fetch it
  const response = await fetch(input)
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`)
  const arrayBuffer = await response.arrayBuffer()
  const mimeType = response.headers.get('content-type') ?? 'image/jpeg'
  return { buffer: Buffer.from(arrayBuffer), mimeType }
}

/** Convert any image input into a data URL string (for use as image_url in OpenAI vision). */
async function imageToDataUrl(input: string): Promise<string> {
  if (input.startsWith('data:')) return input
  const { buffer, mimeType } = await imageToBuffer(input)
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

async function urlToDataUrl(url: string): Promise<string> {
  try {
    return await imageToDataUrl(url)
  } catch {
    return url
  }
}

function getAIConfig() {
  const openaiKey = process.env.OPENAI_API_KEY
  const geminiKey = process.env.GEMINI_API_KEY
  return {
    openaiKey,
    geminiKey,
    provider: openaiKey ? 'openai' : geminiKey ? 'gemini' : null,
  }
}

function publicError(message: string): string {
  return message.substring(0, 180)
}

type OutfitImageItem = {
  name?: unknown
  color?: unknown
  category?: unknown
  image?: unknown
}

function textItemDescription(item: OutfitImageItem): string {
  const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'wardrobe item'
  const color = typeof item.color === 'string' && item.color.trim() ? item.color.trim() : ''
  const category = typeof item.category === 'string' && item.category.trim() ? item.category.trim() : ''
  return [name, color, category].filter(Boolean).join(' - ')
}

function strictTryOnPrompt(outfitDesc: string): string {
  return [
    'Edit the provided person photo into a realistic virtual try-on.',
    'IDENTITY LOCK: preserve the exact same face, facial hair, glasses, hairstyle, hairline, skin tone, body proportions, and age. Do not beautify, change ethnicity, change the jaw, nose, eyes, glasses, or facial expression.',
    'CLOTHING LOCK: replace only the clothing and use exactly these wardrobe garments:',
    outfitDesc,
    'Do not substitute garment types, colors, or patterns. A shirt must not become a tank top. Trousers or pants must not become shorts. Keep stripes, collars, sleeves, length, texture, and distinctive details from the references.',
    'Full body, clean light studio background, natural fit, photorealistic fashion photo.',
  ].join('\n')
}

function strictFlatLayPrompt(outfitDesc: string): string {
  return [
    'Professional fashion flat-lay photo of exactly these wardrobe garments:',
    outfitDesc,
    'Keep the exact garment types, colors, patterns, and visible details. Do not substitute shirts, pants, shorts, shoes, or accessories.',
    'Clean white background, top-down editorial view, high quality fashion photography.',
  ].join('\n')
}

async function describeOutfitItems(openai: OpenAI, items: OutfitImageItem[]): Promise<string> {
  const descriptions = await Promise.all(items.map(async (item, index) => {
    const fallback = textItemDescription(item)
    const image = typeof item.image === 'string' ? item.image : ''
    if (!image) return `Item ${index + 1}: ${fallback}`
    try {
      const itemDataUrl = await imageToDataUrl(image)
      const descRes = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url' as const, image_url: { url: itemDataUrl, detail: 'low' as const } },
            {
              type: 'text' as const,
              text: 'Describe this exact wardrobe item for a virtual try-on. Include garment type, color, pattern, sleeve or leg length, collar or neckline, fit, fabric or texture, and distinctive details. If it is trousers, shorts, a shirt, tank top, dress, shoes, or accessory, say exactly that. Do not invent a different garment. One concise sentence.',
            },
          ],
        }],
        max_tokens: 120,
      })
      const visual = descRes.choices[0].message.content?.trim()
      return `Item ${index + 1}: ${fallback}${visual ? `; visual reference: ${visual}` : ''}`
    } catch (error) {
      console.warn('Failed to describe outfit item image:', error instanceof Error ? error.message : String(error))
      return `Item ${index + 1}: ${fallback}`
    }
  }))
  return descriptions.join('\n')
}

function weekdayFromDateKey(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })
}

function outfitPrompt(day: string, date: string, occasion: unknown, weatherHint: unknown, wardrobeList: string) {
  const occasionText = typeof occasion === 'string' && occasion ? occasion : 'Casual'
  const weatherLine = typeof weatherHint === 'string' && weatherHint ? `\n${weatherHint}` : ''
  return `You are a practical personal stylist. Pick 2-4 items for ${day}, ${date} for a ${occasionText} occasion.${weatherLine}

Rules:
- Build a complete outfit with one top plus one bottom, or one dress.
- Add shoes or accessories only when they fit the occasion and do not repeat a near-identical look.
- Prefer items with lower weekly use; the app has already removed over-used pieces from the list.
- Do not invent item IDs. Return only IDs from the wardrobe list.
- Avoid repeating the exact same full outfit or color/category combination when alternatives exist.

Wardrobe:
${wardrobeList}

Respond ONLY with valid JSON:
{"itemIds":["id1","id2"],"description":"outfit description","styleNotes":"styling tips","occasion":"${occasionText}"}`
}

function isModelFallbackError(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('model') || lower.includes('not found') || lower.includes('does not exist') || lower.includes('not supported')
}

async function generateOpenAIImage(openai: OpenAI, prompt: string, size: '1024x1024' | '1024x1536' | '1024x1792' = '1024x1024') {
  const compactPrompt = prompt.substring(0, 1800)
  try {
    const response = await openai.images.generate({
      model: 'gpt-image-1',
      prompt: compactPrompt,
      size,
      n: 1,
    } as Parameters<typeof openai.images.generate>[0])
    const imageResponse = response as unknown as { data?: Array<{ b64_json?: string; url?: string }> }
    const b64 = imageResponse.data?.[0]?.b64_json
    const url = imageResponse.data?.[0]?.url
    if (b64) return `data:image/png;base64,${b64}`
    if (url) return urlToDataUrl(url)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (!isModelFallbackError(msg)) throw error
  }

  const fallback = await openai.images.generate({
    model: 'dall-e-3',
    prompt: compactPrompt,
    size: size === '1024x1536' ? '1024x1792' : '1024x1024',
    quality: 'standard',
    n: 1,
    response_format: 'b64_json',
  })
  const fallbackB64 = fallback.data?.[0]?.b64_json
  const fallbackUrl = fallback.data?.[0]?.url
  if (fallbackB64) return `data:image/png;base64,${fallbackB64}`
  if (fallbackUrl) return urlToDataUrl(fallbackUrl)
  throw new Error('No image returned by OpenAI')
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  cors(req, res, 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  const { openaiKey, geminiKey, provider } = getAIConfig()
  if (req.method === 'GET') {
    if (!provider) {
      return res.status(503).json({
        ok: false,
        error: 'not_configured',
        details: 'AI is not configured. Add OPENAI_API_KEY or GEMINI_API_KEY in Vercel Environment Variables.',
      })
    }
    return res.status(200).json({ ok: true, provider })
  }
  if (req.method !== 'POST') return res.status(405).end()

  if (!provider) {
    return res.status(503).json({
      error: 'not_configured',
      details: 'AI is not configured. Add OPENAI_API_KEY or GEMINI_API_KEY in Vercel Environment Variables.',
    })
  }

  const useOpenAI = !!openaiKey
  const { action, imageBase64, wardrobe, date, occasion, weatherHint } = req.body ?? {}
  const billableActions = new Set(['analyze', 'outfit', 'try-on', 'image-gen'])
  if (billableActions.has(String(action))) {
    const auth = await getUser(req)
    if ('error' in auth) {
      if (auth.error !== 'missing_token') {
        return res.status(401).json({ error: auth.error, details: 'Please sign in again from Settings, then retry.' })
      }
      console.warn('AI request missing auth token; allowing one legacy cached client request without usage tracking.')
    } else {
      const usage = await checkAndRecordUsage(auth.user.id, String(action))
      if (!usage.ok) {
        return res.status(402).json({
          error: 'free_limit_reached',
          details: `Free monthly AI limit reached (${usage.used}/${usage.limit}). Upgrade to Pro to continue.`,
        })
      }
    }
  }

  try {
    // ── OpenAI path ──────────────────────────────────────────────────────────
    if (useOpenAI) {
      const openai = new OpenAI({ apiKey: openaiKey })

      if (action === 'analyze') {
        if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' })
        const analyzePrompt = 'Analyze this clothing item. Respond ONLY with valid JSON:\n{"name":"short name","category":"top|bottom|dress|shoes|accessory|outerwear","color":"main color","tags":["tag1","tag2","tag3"]}'
        const imageContent = [
          { type: 'image_url' as const, image_url: { url: imageBase64 as string, detail: 'low' as const } },
          { type: 'text' as const, text: analyzePrompt },
        ]
        // Try gpt-4o-mini first (vision, cheap, widely available), fall back to gpt-4o
        for (const model of ['gpt-4o-mini', 'gpt-4o']) {
          try {
            const response = await openai.chat.completions.create({
              model,
              messages: [{ role: 'user', content: imageContent }],
              max_tokens: 200,
            })
            return res.json(parseAI(response.choices[0].message.content ?? ''))
          } catch (modelErr) {
            const m = modelErr instanceof Error ? modelErr.message : String(modelErr)
            if (model === 'gpt-4o') throw modelErr // last resort failed
            if (!m.includes('model') && !m.includes('not found') && !m.includes('access')) throw modelErr
            // else try next model
          }
        }
      }

      if (action === 'outfit') {
        if (!wardrobe || !date) return res.status(400).json({ error: 'wardrobe and date required' })
        const day = weekdayFromDateKey(date as string)
        const wardrobeList = (wardrobe as Array<Record<string, unknown>>).map((i) => `ID:${i.id} | ${i.name} | ${i.category} | ${i.color}`).join('\n')
        const prompt = outfitPrompt(day, date as string, occasion, weatherHint, wardrobeList)
        for (const model of ['gpt-4o-mini', 'gpt-4o']) {
          try {
            const response = await openai.chat.completions.create({
              model,
              messages: [{ role: 'user', content: prompt }],
              max_tokens: 400,
            })
            return res.json({ ...parseAI(response.choices[0].message.content ?? ''), date })
          } catch (modelErr) {
            const m = modelErr instanceof Error ? modelErr.message : String(modelErr)
            if (model === 'gpt-4o') throw modelErr
            if (!m.includes('model') && !m.includes('not found') && !m.includes('access')) throw modelErr
          }
        }
      }

      if (action === 'try-on') {
        const { itemBase64, itemsBase64, bodyBase64 } = req.body as {
          itemBase64?: string
          itemsBase64?: string[]
          bodyBase64?: string
        }
        // Accept either single item (legacy) or array of items
        const items: string[] = itemsBase64 && itemsBase64.length > 0
          ? itemsBase64
          : itemBase64 ? [itemBase64] : []
        if (items.length === 0) return res.status(400).json({ error: 'item(s) required' })

        // Step 1 — describe each clothing item
        const descriptions = await Promise.all(items.map(async (item) => {
          const itemDataUrl = await imageToDataUrl(item)
          const descRes = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{
              role: 'user',
              content: [
                { type: 'image_url' as const, image_url: { url: itemDataUrl, detail: 'low' as const } },
                { type: 'text' as const, text: 'Describe this exact clothing item for virtual try-on. Include garment type, color, pattern, sleeve or leg length, collar or neckline, fit, fabric or texture, and distinctive details. If it is trousers, shorts, a shirt, tank top, dress, shoes, or accessory, say exactly that. Do not invent a different garment. One concise sentence.' },
              ],
            }],
            max_tokens: 120,
          })
          return descRes.choices[0].message.content?.trim() ?? 'an item'
        }))

        const combinedDescription = descriptions.length === 1
          ? descriptions[0]
          : descriptions.map((d, i) => `(${i + 1}) ${d}`).join('; ')

        // Step 2 — generate try-on
        if (bodyBase64) {
          const prompt = strictTryOnPrompt(combinedDescription)
          try {
            const { buffer, mimeType } = await imageToBuffer(bodyBase64)
            const { toFile } = await import('openai')
            const ext = mimeType === 'image/png' ? 'png' : 'jpg'
            const imageFile = await toFile(buffer, `person.${ext}`, { type: mimeType })
            const response = await openai.images.edit({
              model: 'gpt-image-1',
              image: imageFile,
              prompt,
              size: '1024x1536',
            })
            const b64 = response.data?.[0]?.b64_json
            const url = response.data?.[0]?.url
            if (b64) return res.json({ imageBase64: `data:image/png;base64,${b64}`, description: combinedDescription })
            if (url) return res.json({ imageBase64: await urlToDataUrl(url), description: combinedDescription })
          } catch (editError) {
            console.warn('OpenAI try-on edit failed; using generated fallback:', editError instanceof Error ? editError.message : String(editError))
          }
        }

        // No body photo — generate a styled product/flat-lay shot
        const flatPrompt = bodyBase64
          ? strictTryOnPrompt(combinedDescription)
          : strictFlatLayPrompt(combinedDescription)
        const imageBase64 = await generateOpenAIImage(openai, flatPrompt, '1024x1024')
        return res.json({ imageBase64, description: combinedDescription })
      }

      if (action === 'image-gen') {
        const { items, profileBase64 } = req.body as { items: OutfitImageItem[]; profileBase64?: string }
        if (!items?.length) return res.status(400).json({ error: 'items required' })
        const outfitDesc = await describeOutfitItems(openai, items)

        if (profileBase64) {
          // Virtual try-on with gpt-image-1 (handles both data URLs and Supabase Storage URLs)
          try {
            const { buffer, mimeType } = await imageToBuffer(profileBase64)
            const { toFile } = await import('openai')
            const ext = mimeType === 'image/png' ? 'png' : 'jpg'
            const imageFile = await toFile(buffer, `profile.${ext}`, { type: mimeType })
            const response = await openai.images.edit({
              model: 'gpt-image-1',
              image: imageFile,
              prompt: strictTryOnPrompt(outfitDesc),
              size: '1024x1536',
            })
            const b64 = response.data?.[0]?.b64_json
            const url = response.data?.[0]?.url
            if (b64) return res.json({ imageBase64: `data:image/png;base64,${b64}` })
            if (url) return res.json({ imageBase64: await urlToDataUrl(url) })
          } catch (editError) {
            console.warn('OpenAI outfit edit failed; using generated fallback:', editError instanceof Error ? editError.message : String(editError))
          }
        }

        // Flat-lay with dall-e-3
        const imageBase64 = await generateOpenAIImage(
          openai,
          strictFlatLayPrompt(outfitDesc),
          '1024x1024',
        )
        return res.json({ imageBase64 })
      }
    }

    // ── Gemini path ──────────────────────────────────────────────────────────
    const genAI = new GoogleGenerativeAI(geminiKey!)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    if (action === 'analyze') {
      if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' })
      const base64Data = (imageBase64 as string).includes(',')
        ? (imageBase64 as string).split(',')[1]
        : String(imageBase64)
      const mimeType = (imageBase64 as string).startsWith('data:image/png') ? 'image/png' : 'image/jpeg'
      const result = await model.generateContent([
        { inlineData: { data: base64Data, mimeType } },
        'Analyze this clothing item. Respond ONLY with valid JSON:\n{"name":"short name","category":"top|bottom|dress|shoes|accessory|outerwear","color":"main color","tags":["tag1","tag2","tag3"]}',
      ])
      return res.json(parseAI(result.response.text()))
    }

    if (action === 'outfit') {
      if (!wardrobe || !date) return res.status(400).json({ error: 'wardrobe and date required' })
      const day = weekdayFromDateKey(date as string)
      const wardrobeList = (wardrobe as Array<Record<string, unknown>>).map((i) => `ID:${i.id} | ${i.name} | ${i.category} | ${i.color}`).join('\n')
      const prompt = outfitPrompt(day, date as string, occasion, weatherHint, wardrobeList)
      const result = await model.generateContent(prompt)
      return res.json({ ...parseAI(result.response.text()), date })
    }

    if (action === 'image-gen') {
      const { items, profileBase64 } = req.body as { items: OutfitImageItem[]; profileBase64?: string }
      if (!items?.length) return res.status(400).json({ error: 'items required' })
      const outfitDesc = items.map((i, index) => `Item ${index + 1}: ${textItemDescription(i)}`).join('\n')
      const imageModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-preview-image-generation' })
      const parts: GeminiPart[] = []
      for (const item of items.slice(0, 5)) {
        const image = typeof item.image === 'string' ? item.image : ''
        if (!image) continue
        try {
          const dataUrl = await imageToDataUrl(image)
          const [meta, data] = dataUrl.split(',')
          const mimeType = meta.includes('image/png') ? 'image/png' : meta.includes('image/webp') ? 'image/webp' : 'image/jpeg'
          if (data) parts.push({ inlineData: { data, mimeType } })
        } catch (error) {
          console.warn('Failed to attach Gemini outfit item image:', error instanceof Error ? error.message : String(error))
        }
      }
      if (profileBase64) {
        const base64Data = (profileBase64 as string).includes(',') ? (profileBase64 as string).split(',')[1] : profileBase64
        const mimeType = (profileBase64 as string).startsWith('data:image/png') ? 'image/png' : 'image/jpeg'
        parts.push({ inlineData: { data: base64Data, mimeType } })
        parts.push({ text: strictTryOnPrompt(outfitDesc) })
      } else {
        parts.push({ text: strictFlatLayPrompt(outfitDesc) })
      }
      const result = await imageModel.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } as Record<string, unknown>,
      })
      for (const part of result.response.candidates?.[0]?.content?.parts ?? []) {
        const p = part as unknown as Record<string, unknown>
        if (p.inlineData) {
          const d = p.inlineData as { mimeType: string; data: string }
          return res.json({ imageBase64: `data:${d.mimeType};base64,${d.data}` })
        }
      }
      throw new Error('No image returned by Gemini')
    }

    return res.status(400).json({ error: 'unknown action' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('AI proxy error:', msg)
    if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('rate_limit')) {
      return res.status(429).json({
        error: 'quota_exceeded',
        details: 'The AI provider quota or rate limit was reached. Try again later or add a fresh API key.',
      })
    }
    if (msg.includes('JSON') || msg.includes('No JSON') || msg.includes('Incomplete JSON')) {
      return res.status(502).json({
        error: 'bad_ai_response',
        details: 'The AI provider returned a response the app could not read. Please try again.',
      })
    }
    if (msg.includes('content_policy') || msg.includes('safety') || msg.includes('policy')) {
      return res.status(400).json({
        error: 'image_rejected',
        details: 'The AI image provider rejected this photo or prompt. Try a clearer clothing photo or a simpler outfit.',
      })
    }
    if (msg.includes('model') || msg.includes('not supported') || msg.includes('does not exist')) {
      return res.status(502).json({
        error: 'image_model_unavailable',
        details: 'The image model is not available on this API key. I switched the app to use the safer image fallback.',
      })
    }
    return res.status(500).json({ error: 'ai_failed', details: publicError(msg) })
  }
}
