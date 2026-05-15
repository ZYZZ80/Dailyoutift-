#!/usr/bin/env node
/**
 * One-shot Firebase → Supabase migration.
 *
 * Reads `users/{firebaseUid}/wardrobeItems`, `styles`, `outfits` from Firestore,
 * downloads any image URLs that point at Firebase Storage, re-uploads them to
 * Supabase Storage, and inserts the rows into the Supabase tables under the
 * caller's Supabase user_id.
 *
 * Usage:
 *   node scripts/migrate-firebase-to-supabase.mjs
 *
 * It will prompt for the Supabase service_role key.
 */

import admin from 'firebase-admin'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

// ── Config ────────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const FIREBASE_KEY_PATH = path.join(
  ROOT,
  'daily-stylist-aziz-firebase-adminsdk-fbsvc-7b00216596.json',
)
const SUPABASE_URL = 'https://grvarojbxvgykfrhirrs.supabase.co'
const SUPABASE_USER_ID = '272082a0-bb16-4543-b4c3-7328f789d423'
const FIREBASE_STORAGE_BUCKET = 'daily-stylist-aziz.firebasestorage.app'

// ── Init ──────────────────────────────────────────────────────────────────────
const serviceAccount = JSON.parse(readFileSync(FIREBASE_KEY_PATH, 'utf8'))

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: FIREBASE_STORAGE_BUCKET,
})
const db = admin.firestore()
const fbBucket = admin.storage().bucket()

// Read key from env, file, or prompt
let SUPABASE_SERVICE_ROLE = (process.env.SB_SERVICE_ROLE || '').trim()
if (!SUPABASE_SERVICE_ROLE) {
  try {
    SUPABASE_SERVICE_ROLE = readFileSync(path.join(ROOT, 'sb-service-role.txt'), 'utf8').trim()
  } catch {}
}
if (!SUPABASE_SERVICE_ROLE) {
  const rl = readline.createInterface({ input, output })
  SUPABASE_SERVICE_ROLE = (await rl.question('Paste Supabase service_role key: ')).trim()
  rl.close()
}

if (!SUPABASE_SERVICE_ROLE.startsWith('eyJ')) {
  console.error('That doesn\'t look like a JWT. Aborting.')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Helpers ───────────────────────────────────────────────────────────────────
function isFirebaseImage(url) {
  return typeof url === 'string' &&
    (url.includes('firebasestorage.googleapis.com') ||
     url.includes('firebasestorage.app'))
}

async function uploadToSupabaseStorage(bucketName, destPath, buffer, contentType) {
  const { error } = await sb.storage
    .from(bucketName)
    .upload(destPath, buffer, { contentType, upsert: true })
  if (error) throw new Error(`upload ${destPath}: ${error.message}`)
  return sb.storage.from(bucketName).getPublicUrl(destPath).data.publicUrl
}

async function downloadFromUrl(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download ${url}: ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const ct = res.headers.get('content-type') || 'image/jpeg'
  return { buf, ct }
}

async function migrateImage(originalUrl, bucketName, destPath) {
  if (!originalUrl) return originalUrl
  if (!isFirebaseImage(originalUrl)) return originalUrl // already remote/data URL — leave it
  try {
    const { buf, ct } = await downloadFromUrl(originalUrl)
    const url = await uploadToSupabaseStorage(bucketName, destPath, buf, ct)
    return url
  } catch (e) {
    console.warn(`  ⚠ image migration failed: ${e.message} — keeping original URL`)
    return originalUrl
  }
}

// Find which users/* document holds data — uses listDocuments() to also pick up
// "virtual" parent docs that only exist via their subcollections.
async function pickFirebaseUser() {
  const docRefs = await db.collection('users').listDocuments()
  const candidates = []
  for (const ref of docRefs) {
    const wcCount = (await ref.collection('wardrobeItems').count().get()).data().count
    const stCount = (await ref.collection('styles').count().get()).data().count
    const ouCount = (await ref.collection('outfits').count().get()).data().count
    if (wcCount + stCount + ouCount > 0) {
      candidates.push({ uid: ref.id, wardrobe: wcCount, styles: stCount, outfits: ouCount })
    }
  }
  console.log('Firebase users with data:')
  candidates.forEach(c => console.log('  ', c))
  if (candidates.length === 0) throw new Error('No data found in any user doc')
  candidates.sort((a, b) => (b.wardrobe + b.styles + b.outfits) - (a.wardrobe + a.styles + a.outfits))
  return candidates[0]
}

// ── Migrate wardrobe ─────────────────────────────────────────────────────────
async function migrateWardrobe(firebaseUid) {
  const snap = await db.collection('users').doc(firebaseUid).collection('wardrobeItems').get()
  console.log(`\n📦 Wardrobe: ${snap.size} items`)
  let inserted = 0
  for (const doc of snap.docs) {
    const d = doc.data()
    const id = doc.id
    const newImage = await migrateImage(
      d.image,
      'wardrobe-images',
      `${SUPABASE_USER_ID}/${id}.jpg`,
    )
    const row = {
      id,
      user_id: SUPABASE_USER_ID,
      name: d.name || 'Item',
      category: d.category || 'Other',
      color: d.color || '',
      image: newImage,
      tags: d.tags || [],
      wear_count: d.wearCount ?? 0,
      last_worn: d.lastWorn ?? null,
      uploaded_at: d.uploadedAt || new Date().toISOString(),
    }
    const { error } = await sb.from('wardrobe_items').upsert(row)
    if (error) console.warn(`  ⚠ ${id}: ${error.message}`)
    else { inserted++; process.stdout.write('.') }
  }
  console.log(`\n  ✓ ${inserted}/${snap.size} wardrobe items migrated`)
}

// ── Migrate outfits ──────────────────────────────────────────────────────────
async function migrateOutfits(firebaseUid) {
  const snap = await db.collection('users').doc(firebaseUid).collection('outfits').get()
  console.log(`\n👗 Outfits: ${snap.size} items`)
  let inserted = 0
  for (const doc of snap.docs) {
    const d = doc.data()
    const id = doc.id
    let preview = d.previewImage
    if (preview) {
      preview = await migrateImage(
        preview,
        'style-images',
        `${SUPABASE_USER_ID}/outfit-${id}.jpg`,
      )
    }
    const row = {
      id,
      user_id: SUPABASE_USER_ID,
      date: d.date || new Date().toISOString().split('T')[0],
      item_ids: d.itemIds || [],
      description: d.description || '',
      style_notes: d.styleNotes || '',
      occasion: d.occasion || 'Casual',
      preview_image: preview ?? null,
      generated_at: d.generatedAt || new Date().toISOString(),
    }
    const { error } = await sb.from('outfit_suggestions').upsert(row)
    if (error) console.warn(`  ⚠ ${id}: ${error.message}`)
    else { inserted++; process.stdout.write('.') }
  }
  console.log(`\n  ✓ ${inserted}/${snap.size} outfits migrated`)
}

// ── Migrate styles ───────────────────────────────────────────────────────────
async function migrateStyles(firebaseUid) {
  const snap = await db.collection('users').doc(firebaseUid).collection('styles').get()
  console.log(`\n🎨 Styles: ${snap.size} items`)
  let inserted = 0
  for (const doc of snap.docs) {
    const d = doc.data()
    const id = doc.id
    const newImage = await migrateImage(
      d.image,
      'style-images',
      `${SUPABASE_USER_ID}/${id}.jpg`,
    )
    const row = {
      id,
      user_id: SUPABASE_USER_ID,
      image: newImage,
      item_ids: d.itemIds || [],
      outfit_id: d.outfitId ?? null,
      source: d.source || 'manual',
      created_at: d.createdAt || new Date().toISOString(),
    }
    const { error } = await sb.from('style_images').upsert(row)
    if (error) console.warn(`  ⚠ ${id}: ${error.message}`)
    else { inserted++; process.stdout.write('.') }
  }
  console.log(`\n  ✓ ${inserted}/${snap.size} styles migrated`)
}

// ── Run ──────────────────────────────────────────────────────────────────────
console.log('🔥 Firebase → Supabase migration')
console.log(`   Firebase project: ${serviceAccount.project_id}`)
console.log(`   Supabase project: grvarojbxvgykfrhirrs`)
console.log(`   Target user_id:   ${SUPABASE_USER_ID}\n`)

const fbUser = await pickFirebaseUser()
console.log(`\n→ Migrating from Firebase uid: ${fbUser.uid}`)

await migrateWardrobe(fbUser.uid)
await migrateOutfits(fbUser.uid)
await migrateStyles(fbUser.uid)

console.log('\n✅ Migration complete. Refresh the app to see your data.')
process.exit(0)
