// Lazy SDK loaders — see comment in claude.ts
import type OpenAIType from 'openai'
import type { GoogleGenerativeAI as GoogleGenerativeAIType } from '@google/generative-ai'
import type { Part as GeminiPart } from '@google/generative-ai'
import type { AppConfig } from './storage'
import type { ClothingItem } from '../types'
import { authFetch } from './authFetch'

let _OpenAI: typeof OpenAIType | null = null
async function getOpenAIClass() {
  if (!_OpenAI) _OpenAI = (await import('openai')).default
  return _OpenAI
}

let _GoogleGenAI: typeof GoogleGenerativeAIType | null = null
async function getGoogleGenAIClass() {
  if (!_GoogleGenAI) _GoogleGenAI = (await import('@google/generative-ai')).GoogleGenerativeAI
  return _GoogleGenAI
}

async function base64ToFile(dataUrl: string, filename: string): Promise<File> {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  return new File([blob], filename, { type: blob.type || 'image/jpeg' })
}

async function readApiJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(`AI server returned ${res.status} with an unreadable response.`)
  }
}

function apiErrorMessage(data: Record<string, unknown>, status: number): string {
  const details = typeof data.details === 'string' ? data.details : ''
  const error = typeof data.error === 'string' ? data.error : ''
  return details || error || `AI server error ${status}`
}

function outfitItemPayload(items: ClothingItem[]) {
  return items.map((i) => ({
    name: i.name,
    color: i.color,
    category: i.category,
    image: i.image,
  }))
}

function strictOutfitPrompt(outfitDesc: string): string {
  return [
    'Create a realistic virtual try-on using the provided person photo as the identity reference.',
    'Identity lock: preserve the exact face, facial hair, glasses, hairstyle, hairline, skin tone, and body proportions. Do not beautify, age, change ethnicity, or change facial features.',
    `Clothing lock: dress the person in exactly these wardrobe items: ${outfitDesc}.`,
    'Do not substitute garment types, colors, or patterns. If the outfit says shirt, it must not become a tank top. If it says trousers or pants, they must not become shorts.',
    'Full body, clean light background, professional fashion photo, photorealistic.',
  ].join(' ')
}

async function describePersonWithGemini(profilePhoto: string, apiKey: string): Promise<string> {
  const GoogleGenerativeAI = await getGoogleGenAIClass()
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
  const base64Data = profilePhoto.includes(',') ? profilePhoto.split(',')[1] : profilePhoto
  const mimeType = profilePhoto.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'
  const result = await model.generateContent([
    { inlineData: { data: base64Data, mimeType } },
    'Describe this person briefly for a fashion illustration: body type, skin tone, hair color and style. Be concise.',
  ])
  return result.response.text()
}

export async function generateOutfitLook(
  items: ClothingItem[],
  profilePhoto: string | null,
  config: AppConfig,
): Promise<string> {
  const outfitDesc = items.map((i) => `${i.name} (${i.color} ${i.category})`).join(', ')

  if (config.provider === 'proxy') {
    const res = await authFetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'image-gen',
        items: outfitItemPayload(items),
        profileBase64: profilePhoto ?? undefined,
      }),
    })
    const data = await readApiJson(res)
    if (!res.ok) throw new Error(apiErrorMessage(data, res.status))
    const { imageBase64 } = data
    return imageBase64 as string
  }

  if (config.provider === 'gemini') {
    const GoogleGenerativeAI = await getGoogleGenAIClass()
    const genAI = new GoogleGenerativeAI(config.apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-preview-image-generation' })
    const parts: GeminiPart[] = []
    // Include item images as visual reference (up to 4)
    for (const item of items.slice(0, 4)) {
      if (item.image?.startsWith('data:')) {
        const base64Data = item.image.split(',')[1]
        const mimeType = item.image.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'
        parts.push({ inlineData: { data: base64Data, mimeType } })
      }
    }
    if (profilePhoto) {
      const base64Data = profilePhoto.includes(',') ? profilePhoto.split(',')[1] : profilePhoto
      const mimeType = profilePhoto.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'
      parts.push({ inlineData: { data: base64Data, mimeType } })
      parts.push({ text: strictOutfitPrompt(outfitDesc) })
    } else {
      parts.push({ text: `Create a professional fashion flat-lay photo of these clothing items arranged stylishly: ${outfitDesc}. Clean white background, top-down editorial view, high quality fashion photography.` })
    }
    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } as Record<string, unknown>,
    })
    for (const part of result.response.candidates?.[0]?.content?.parts ?? []) {
      const p = part as unknown as Record<string, unknown>
      if (p.inlineData) {
        const d = p.inlineData as { mimeType: string; data: string }
        return `data:${d.mimeType};base64,${d.data}`
      }
    }
    throw new Error('No image generated by Gemini')
  }

  // OpenAI fallback
  const OpenAI = await getOpenAIClass()
  const client = new OpenAI({ apiKey: config.apiKey, dangerouslyAllowBrowser: true })
  if (profilePhoto) {
    const imageFile = await base64ToFile(profilePhoto, 'profile.jpg')
    const response = await client.images.edit({
      model: 'gpt-image-1',
      image: imageFile,
      prompt: strictOutfitPrompt(outfitDesc),
      size: '1024x1536',
    })
    const b64 = response.data?.[0]?.b64_json
    if (b64) return `data:image/png;base64,${b64}`
  }
  const fallback = await client.images.generate({
    model: 'dall-e-3',
    prompt: `Professional fashion flat-lay photo of outfit: ${outfitDesc}. White background, editorial style, high quality.`,
    size: '1024x1792',
    quality: 'standard',
    n: 1,
  })
  const url = fallback.data?.[0]?.url
  if (!url) throw new Error('No image generated')
  try {
    const imgRes = await fetch(url)
    const blob = await imgRes.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Failed to read image'))
      reader.readAsDataURL(blob)
    })
  } catch {
    return url
  }
}

export async function generateOutfitPreview(
  profilePhoto: string,
  outfitItems: ClothingItem[],
  config: AppConfig
): Promise<string> {
  const outfitDesc = outfitItems.map((i) => `${i.name} (${i.color} ${i.category})`).join(', ')

  if (config.provider === 'proxy') {
    const res = await authFetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'image-gen',
        items: outfitItemPayload(outfitItems),
        profileBase64: profilePhoto,
      }),
    })
    const data = await readApiJson(res)
    if (!res.ok) throw new Error(apiErrorMessage(data, res.status))
    return data.imageBase64 as string
  }

  if (config.provider === 'gemini') {
    const personDesc = await describePersonWithGemini(profilePhoto, config.apiKey)
    const GoogleGenerativeAI = await getGoogleGenAIClass()
    const genAI = new GoogleGenerativeAI(config.apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-preview-image-generation' })
    const base64Data = profilePhoto.includes(',') ? profilePhoto.split(',')[1] : profilePhoto
    const mimeType = profilePhoto.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { data: base64Data, mimeType } },
          { text: `${strictOutfitPrompt(outfitDesc)} Person reference details to preserve: ${personDesc}.` },
        ],
      }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } as Record<string, unknown>,
    })
    for (const part of result.response.candidates?.[0]?.content?.parts ?? []) {
      const p = part as unknown as Record<string, unknown>
      if (p.inlineData) {
        const d = p.inlineData as { mimeType: string; data: string }
        return `data:${d.mimeType};base64,${d.data}`
      }
    }
    throw new Error('No image generated by Gemini')
  }

  // OpenAI: use gpt-image-1 edit with actual person photo for realistic try-on
  const OpenAI = await getOpenAIClass()
  const client = new OpenAI({ apiKey: config.apiKey, dangerouslyAllowBrowser: true })
  const imageFile = await base64ToFile(profilePhoto, 'profile.jpg')

  const response = await client.images.edit({
    model: 'gpt-image-1',
    image: imageFile,
    prompt: strictOutfitPrompt(outfitDesc),
    size: '1024x1536',
  })

  const b64 = response.data?.[0]?.b64_json
  if (b64) return `data:image/png;base64,${b64}`

  // Fallback to DALL-E 3 if gpt-image-1 unavailable
  const fallback = await client.images.generate({
    model: 'dall-e-3',
    prompt: `Full-body fashion photo of a person. Outfit: ${outfitDesc}. Style: editorial fashion photography, clean white background, professional lighting, photorealistic.`,
    size: '1024x1792',
    quality: 'standard',
    n: 1,
  })
  const tempUrl = fallback.data?.[0]?.url
  if (!tempUrl) return ''
  // Fetch and convert to base64 so the image doesn't expire
  try {
    const res = await fetch(tempUrl)
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Failed to read image'))
      reader.readAsDataURL(blob)
    })
  } catch {
    return tempUrl // fallback to URL if fetch fails
  }
}
