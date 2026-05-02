import { GoogleGenerativeAI } from '@google/generative-ai'
import OpenAI from 'openai'

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  const origin = req.headers.origin ?? ''
  const allowed = ['https://daily-outfit-stylist.vercel.app', 'http://localhost:5173', 'http://localhost:4173']
  if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin)
  else res.setHeader('Access-Control-Allow-Origin', 'https://daily-outfit-stylist.vercel.app')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
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
  const { action, imageBase64, wardrobe, date, occasion } = req.body ?? {}

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
        const day = new Date(date as string).toLocaleDateString('en-US', { weekday: 'long' })
        const occasionHint = occasion ? ` for a ${occasion} occasion` : ''
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wardrobeList = (wardrobe as any[]).map((i) => `ID:${i.id} | ${i.name} | ${i.category} | ${i.color}`).join('\n')
        const prompt = `You are a stylist. Pick 2-4 items for ${day}, ${date}${occasionHint}.\n\nWardrobe:\n${wardrobeList}\n\nRespond ONLY with valid JSON:\n{"itemIds":["id1","id2"],"description":"outfit description","styleNotes":"styling tips","occasion":"${occasion ?? 'Casual'}"}`
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
                { type: 'text' as const, text: 'Describe this clothing item in one short sentence: type, color, pattern, style, fit.' },
              ],
            }],
            max_tokens: 80,
          })
          return descRes.choices[0].message.content?.trim() ?? 'an item'
        }))

        const combinedDescription = descriptions.length === 1
          ? descriptions[0]
          : descriptions.map((d, i) => `(${i + 1}) ${d}`).join('; ')

        // Step 2 — generate try-on
        if (bodyBase64) {
          const { buffer, mimeType } = await imageToBuffer(bodyBase64)
          const { toFile } = await import('openai')
          const ext = mimeType === 'image/png' ? 'png' : 'jpg'
          const imageFile = await toFile(buffer, `person.${ext}`, { type: mimeType })
          const prompt = items.length === 1
            ? `Dress this person in: ${combinedDescription}. Keep their face, hair, skin tone, and body exactly the same. Full body, clean white background, professional fashion photo, photorealistic.`
            : `Dress this person in this complete outfit combining all of these pieces: ${combinedDescription}. Layer them naturally as a single coordinated outfit. Keep the person's face, hair, skin tone, and body exactly the same. Full body, clean white background, professional fashion photo, photorealistic.`
          const response = await openai.images.edit({
            model: 'gpt-image-1',
            image: imageFile,
            prompt,
            size: '1024x1536',
          })
          const b64 = response.data?.[0]?.b64_json
          if (b64) return res.json({ imageBase64: `data:image/png;base64,${b64}`, description: combinedDescription })
        }

        // No body photo — generate a styled product/flat-lay shot
        const flatPrompt = items.length === 1
          ? `High-quality fashion product photo of: ${combinedDescription}. Clean white background, professional studio lighting, mannequin or flat lay.`
          : `Editorial fashion flat-lay photo combining: ${combinedDescription}. Items arranged stylishly together. Clean white background, top-down view, professional photography.`
        const response = await openai.images.generate({
          model: 'dall-e-3',
          prompt: flatPrompt,
          size: '1024x1024',
          quality: 'standard',
          n: 1,
          response_format: 'b64_json',
        })
        const b64 = response.data?.[0]?.b64_json
        if (b64) return res.json({ imageBase64: `data:image/png;base64,${b64}`, description: combinedDescription })
        throw new Error('No image returned')
      }

      if (action === 'image-gen') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { items, profileBase64 } = req.body as { items: any[]; profileBase64?: string }
        if (!items?.length) return res.status(400).json({ error: 'items required' })
        const outfitDesc = items.map((i) => `${i.name} (${i.color} ${i.category})`).join(', ')

        if (profileBase64) {
          // Virtual try-on with gpt-image-1 (handles both data URLs and Firebase Storage URLs)
          const { buffer, mimeType } = await imageToBuffer(profileBase64)
          const { toFile } = await import('openai')
          const ext = mimeType === 'image/png' ? 'png' : 'jpg'
          const imageFile = await toFile(buffer, `profile.${ext}`, { type: mimeType })
          const response = await openai.images.edit({
            model: 'gpt-image-1',
            image: imageFile,
            prompt: `Show this person wearing: ${outfitDesc}. Full body fashion photo, clean white background, professional studio lighting, photorealistic. Preserve the person's exact face, hair, and skin tone.`,
            size: '1024x1536',
          })
          const b64 = response.data?.[0]?.b64_json
          if (b64) return res.json({ imageBase64: `data:image/png;base64,${b64}` })
        }

        // Flat-lay with dall-e-3
        const response = await openai.images.generate({
          model: 'dall-e-3',
          prompt: `Professional fashion flat-lay photo of these clothing items arranged stylishly: ${outfitDesc}. Clean white background, top-down editorial view, high quality fashion photography.`,
          size: '1024x1024',
          quality: 'standard',
          n: 1,
          response_format: 'b64_json',
        })
        const b64 = response.data?.[0]?.b64_json
        if (b64) return res.json({ imageBase64: `data:image/png;base64,${b64}` })
        throw new Error('No image returned by OpenAI')
      }
    }

    // ── Gemini path ──────────────────────────────────────────────────────────
    const genAI = new GoogleGenerativeAI(geminiKey!)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    if (action === 'analyze') {
      if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' })
      const base64Data = (imageBase64 as string).includes(',')
        ? (imageBase64 as string).split(',')[1]
        : imageBase64
      const mimeType = (imageBase64 as string).startsWith('data:image/png') ? 'image/png' : 'image/jpeg'
      const result = await model.generateContent([
        { inlineData: { data: base64Data, mimeType } },
        'Analyze this clothing item. Respond ONLY with valid JSON:\n{"name":"short name","category":"top|bottom|dress|shoes|accessory|outerwear","color":"main color","tags":["tag1","tag2","tag3"]}',
      ])
      return res.json(parseAI(result.response.text()))
    }

    if (action === 'outfit') {
      if (!wardrobe || !date) return res.status(400).json({ error: 'wardrobe and date required' })
      const day = new Date(date as string).toLocaleDateString('en-US', { weekday: 'long' })
      const occasionHint = occasion ? ` for a ${occasion} occasion` : ''
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wardrobeList = (wardrobe as any[]).map((i) => `ID:${i.id} | ${i.name} | ${i.category} | ${i.color}`).join('\n')
      const prompt = `You are a stylist. Pick 2-4 items for ${day}, ${date}${occasionHint}.\n\nWardrobe:\n${wardrobeList}\n\nRespond ONLY with valid JSON:\n{"itemIds":["id1","id2"],"description":"outfit description","styleNotes":"styling tips","occasion":"${occasion ?? 'Casual'}"}`
      const result = await model.generateContent(prompt)
      return res.json({ ...parseAI(result.response.text()), date })
    }

    if (action === 'image-gen') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { items, profileBase64 } = req.body as { items: any[]; profileBase64?: string }
      if (!items?.length) return res.status(400).json({ error: 'items required' })
      const outfitDesc = items.map((i) => `${i.name} (${i.color} ${i.category})`).join(', ')
      const imageModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-preview-image-generation' })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parts: any[] = []
      if (profileBase64) {
        const base64Data = (profileBase64 as string).includes(',') ? (profileBase64 as string).split(',')[1] : profileBase64
        const mimeType = (profileBase64 as string).startsWith('data:image/png') ? 'image/png' : 'image/jpeg'
        parts.push({ inlineData: { data: base64Data, mimeType } })
        parts.push({ text: `Generate a realistic full-body fashion photo of this person wearing: ${outfitDesc}. Preserve the person's exact appearance. Professional studio lighting, clean white background.` })
      } else {
        parts.push({ text: `Create a professional fashion flat-lay photo of these clothing items arranged stylishly: ${outfitDesc}. Clean white background, top-down editorial view, high quality fashion photography.` })
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
    return res.status(500).json({ error: 'ai_failed', details: publicError(msg) })
  }
}
