/**
 * Converts HEIC photos → compressed base64 JPEG,
 * analyses each with the Gemini proxy on Vercel,
 * and writes wardrobe-backup.json ready to import via the app.
 */
import { readdir } from 'fs/promises'
import { createRequire } from 'module'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { writeFileSync } from 'fs'
import { randomUUID } from 'crypto'

const require = createRequire(import.meta.url)
const sharp       = require('sharp')
const heicConvert = require('heic-convert')
const { readFileSync } = await import('fs')

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT  = join(__dir, '..')
const PROXY = 'https://daily-outfit-stylist.vercel.app/api/ai'

// Local Gemini key fallback — set GEMINI_API_KEY env var or paste here
const LOCAL_GEMINI_KEY = process.env.GEMINI_API_KEY || ''

const FILES = [
  'IMG_9129.HEIC','IMG_9130.HEIC','IMG_9131.HEIC','IMG_9132.HEIC',
  'IMG_9133.HEIC','IMG_9134.HEIC','IMG_9135.HEIC','IMG_9136.HEIC',
  'IMG_9138.HEIC','IMG_9139.HEIC','IMG_9140.HEIC','IMG_9112.HEIC',
  'IMG_9113.HEIC','IMG_9114.HEIC','IMG_9115.HEIC','IMG_9116.HEIC',
  'IMG_9117.HEIC','IMG_9118.HEIC','IMG_9119.HEIC','IMG_9120.HEIC',
  'IMG_9121.HEIC','IMG_9122.HEIC','IMG_9123.HEIC','IMG_9124.HEIC',
  'IMG_9125.HEIC','IMG_9126.HEIC','IMG_9127.HEIC','IMG_9128.HEIC',
]

async function toBase64(file) {
  const heicBuf  = readFileSync(join(ROOT, file))
  const jpegBuf  = await heicConvert({ buffer: heicBuf, format: 'JPEG', quality: 1 })
  const resized  = await sharp(Buffer.from(jpegBuf))
    .rotate()
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toBuffer()
  return 'data:image/jpeg;base64,' + resized.toString('base64')
}

async function analyzeViaProxy(base64) {
  const res = await fetch(PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'analyze', imageBase64: base64 }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`proxy ${res.status}: ${body.slice(0, 120)}`)
  }
  return await res.json()
}

async function analyzeViaGeminiDirect(base64) {
  // Call Gemini directly using the REST API
  const mimeType = 'image/jpeg'
  const imageData = base64.replace(/^data:image\/\w+;base64,/, '')
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${LOCAL_GEMINI_KEY}`
  const body = {
    contents: [{
      parts: [
        { text: 'Analyze this clothing item. Return JSON only, no markdown: {"name":"short name","category":"top|bottom|dress|outerwear|shoes|accessory","color":"main color","tags":["tag1","tag2"]}' },
        { inlineData: { mimeType, data: imageData } }
      ]
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 200 }
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`gemini-direct ${res.status}: ${err.slice(0, 120)}`)
  }
  const json = await res.json()
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  const cleaned = text.replace(/```json|```/g, '').trim()
  return JSON.parse(cleaned)
}

async function analyze(base64) {
  if (LOCAL_GEMINI_KEY) {
    return analyzeViaGeminiDirect(base64)
  }
  return analyzeViaProxy(base64)
}

const wardrobe = []
let ok = 0, fail = 0

for (const file of FILES) {
  process.stdout.write(`[${ok + fail + 1}/${FILES.length}] ${file} … `)
  try {
    const base64 = await toBase64(file)
    const info   = await analyze(base64)
    wardrobe.push({
      id:         randomUUID(),
      name:       info.name     || file.replace('.HEIC',''),
      category:   info.category || 'top',
      color:      info.color    || '',
      image:      base64,
      tags:       info.tags     || [],
      uploadedAt: new Date().toISOString(),
      wearCount:  0,
    })
    console.log(`✓  ${info.name} (${info.category}, ${info.color})`)
    ok++
  } catch (e) {
    console.log(`✗  ${e.message}`)
    fail++
  }
  // small pause to avoid rate-limiting
  await new Promise(r => setTimeout(r, 800))
}

const backup = {
  version:    1,
  exportedAt: new Date().toISOString(),
  wardrobe,
  outfits:    [],
  profilePhotos: [],
}

const out = join(ROOT, 'wardrobe-backup.json')
writeFileSync(out, JSON.stringify(backup, null, 2))
console.log(`\nDone — ${ok} items saved, ${fail} failed.\nBackup file: ${out}`)
console.log('\nNow open the app → Wardrobe tab → Restore button → select wardrobe-backup.json')
