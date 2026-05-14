import { GoogleGenerativeAI } from '@google/generative-ai'

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const { action, imageBase64, wardrobe, date, occasion, weatherHint } = req.body ?? {}

  const apiKey = process.env.GEMINI_API_KEY
  if (action === 'health') return res.status(200).json({ configured: Boolean(apiKey) })
  if (!apiKey) return res.status(503).json({ error: 'not_configured', message: 'Missing GEMINI_API_KEY in Vercel Environment Variables' })

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
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
      const weatherLine = weatherHint ? `\n${weatherHint}` : ''
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wardrobeList = (wardrobe as any[]).map((i) => `ID:${i.id} | ${i.name} | ${i.category} | ${i.color}`).join('\n')
      const prompt = `You are a stylist. Pick 2-4 items for ${day}, ${date}${occasionHint}.${weatherLine}\n\nWardrobe:\n${wardrobeList}\n\nRespond ONLY with valid JSON:\n{"itemIds":["id1","id2"],"description":"outfit description","styleNotes":"styling tips","occasion":"${occasion ?? 'Casual'}"}`
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
        const base64Data = profileBase64.includes(',') ? profileBase64.split(',')[1] : profileBase64
        const mimeType = profileBase64.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'
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

    if (action === 'try-on') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { itemsBase64, bodyBase64 } = req.body as { itemsBase64?: string[]; bodyBase64?: string }
      const items = itemsBase64 ?? []
      if (items.length === 0) return res.status(400).json({ error: 'items required' })

      // Step 1: describe each item with Gemini vision
      const descriptions = await Promise.all(items.map(async (item: string) => {
        const base64Data = item.includes(',') ? item.split(',')[1] : item
        const mimeType = item.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'
        const result = await model.generateContent([
          { inlineData: { data: base64Data, mimeType } },
          'Describe this clothing item in one short sentence: type, color, pattern, style, fit.',
        ])
        return result.response.text().trim() || 'an item'
      }))
      const combinedDescription = descriptions.length === 1
        ? descriptions[0]
        : descriptions.map((d, i) => `(${i + 1}) ${d}`).join('; ')

      // Step 2: generate image with Gemini image generation
      const imageModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-preview-image-generation' })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parts: any[] = []
      if (bodyBase64) {
        const base64Data = bodyBase64.includes(',') ? bodyBase64.split(',')[1] : bodyBase64
        const mimeType = bodyBase64.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'
        parts.push({ inlineData: { data: base64Data, mimeType } })
        parts.push({ text: `Generate a realistic full-body fashion photo of this person wearing: ${combinedDescription}. Preserve the person's exact appearance. Professional studio lighting, clean white background.` })
      } else {
        parts.push({ text: `Create a professional fashion flat-lay photo of these clothing items arranged stylishly: ${combinedDescription}. Clean white background, top-down editorial view, high quality fashion photography.` })
      }
      const result = await imageModel.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } as Record<string, unknown>,
      })
      for (const part of result.response.candidates?.[0]?.content?.parts ?? []) {
        const p = part as unknown as Record<string, unknown>
        if (p.inlineData) {
          const d = p.inlineData as { mimeType: string; data: string }
          return res.json({ imageBase64: `data:${d.mimeType};base64,${d.data}`, description: combinedDescription })
        }
      }
      throw new Error('No image returned by Gemini')
    }

    return res.status(400).json({ error: 'unknown action' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('AI proxy error:', msg)
    if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      return res.status(429).json({ error: 'quota_exceeded', message: 'Gemini quota exceeded' })
    }
    return res.status(500).json({ error: 'ai_failed', message: msg.substring(0, 180) })
  }
}
