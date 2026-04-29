/**
 * Cloud sync layer — Firestore + Firebase Storage
 * All functions are no-ops if Firebase is not configured.
 */
import {
  collection, doc, setDoc, deleteDoc, getDocs,
  getDoc, query, orderBy, limit, onSnapshot,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage, FIREBASE_ENABLED } from './firebase'
import type { ClothingItem, OutfitSuggestion } from '../types'
import type { AppConfig } from './storage'

// ── Helpers ──────────────────────────────────────────────────────────────────

async function base64ToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms)
  })
  try { return await Promise.race([promise, timeout]) }
  finally { if (timer) clearTimeout(timer) }
}

// ── Image upload ──────────────────────────────────────────────────────────────

/** Upload a clothing item image to Storage. Returns download URL (or original base64 on failure). */
export async function uploadClothingImage(
  userId: string,
  itemId: string,
  base64: string,
): Promise<string> {
  if (!FIREBASE_ENABLED || !storage) return base64
  const blob = await base64ToBlob(base64)
  const storageRef = ref(storage, `users/${userId}/wardrobe/${itemId}.jpg`)
  try {
    await withTimeout(uploadBytes(storageRef, blob, { contentType: 'image/jpeg' }), 15000, 'Image upload')
    return await withTimeout(getDownloadURL(storageRef), 8000, 'Image URL')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`Firebase Storage failed: ${msg}. Check Storage rules and bucket.`)
  }
}

/** Upload profile photo. Returns download URL. */
export async function uploadProfilePhoto(userId: string, base64: string): Promise<string> {
  if (!FIREBASE_ENABLED || !storage) return base64
  const blob = await base64ToBlob(base64)
  const storageRef = ref(storage, `users/${userId}/profile.jpg`)
  try {
    await withTimeout(uploadBytes(storageRef, blob, { contentType: 'image/jpeg' }), 15000, 'Profile upload')
    return await withTimeout(getDownloadURL(storageRef), 8000, 'Profile URL')
  } catch {
    return base64
  }
}

/** Get profile photo URL from Storage. */
export async function getProfilePhotoCloud(userId: string): Promise<string> {
  if (!FIREBASE_ENABLED || !storage) return ''
  try {
    return await getDownloadURL(ref(storage, `users/${userId}/profile.jpg`))
  } catch {
    return ''
  }
}


/** Upload generated style / try-on image to Storage. Returns download URL. */
export async function uploadStylePreviewImage(
  userId: string,
  outfitId: string,
  imageDataUrl: string,
): Promise<string> {
  if (!FIREBASE_ENABLED || !storage) return imageDataUrl
  if (!imageDataUrl.startsWith('data:')) return imageDataUrl
  const blob = await base64ToBlob(imageDataUrl)
  const storageRef = ref(storage, `users/${userId}/style-previews/${outfitId}.png`)
  try {
    await withTimeout(uploadBytes(storageRef, blob, { contentType: blob.type || 'image/png' }), 20000, 'Style image upload')
    return await withTimeout(getDownloadURL(storageRef), 8000, 'Style image URL')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`Style image upload failed: ${msg}`)
  }
}

// ── Wardrobe ──────────────────────────────────────────────────────────────────

export async function addItemCloud(userId: string, item: ClothingItem): Promise<void> {
  if (!FIREBASE_ENABLED || !db) return
  await setDoc(doc(db, 'users', userId, 'wardrobe', item.id), item)
}

export async function removeItemCloud(userId: string, itemId: string): Promise<void> {
  if (!FIREBASE_ENABLED || !db) return
  await deleteDoc(doc(db, 'users', userId, 'wardrobe', itemId))
}

export async function getWardrobeCloud(userId: string): Promise<ClothingItem[]> {
  if (!FIREBASE_ENABLED || !db) return []
  const snap = await getDocs(collection(db, 'users', userId, 'wardrobe'))
  return snap.docs.map((d) => d.data() as ClothingItem)
}

// ── Outfits ───────────────────────────────────────────────────────────────────

export async function saveOutfitCloud(userId: string, outfit: OutfitSuggestion): Promise<void> {
  if (!FIREBASE_ENABLED || !db) return
  await setDoc(doc(db, 'users', userId, 'outfits', outfit.id), outfit)
}

export async function getOutfitsCloud(userId: string): Promise<OutfitSuggestion[]> {
  if (!FIREBASE_ENABLED || !db) return []
  const q = query(
    collection(db, 'users', userId, 'outfits'),
    orderBy('date', 'desc'),
    limit(90),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => d.data() as OutfitSuggestion)
}

// ── Config ────────────────────────────────────────────────────────────────────

export async function saveConfigCloud(userId: string, config: AppConfig): Promise<void> {
  if (!FIREBASE_ENABLED || !db) return
  await setDoc(doc(db, 'users', userId, 'settings', 'main'), config)
}

export async function getConfigCloud(userId: string): Promise<AppConfig | null> {
  if (!FIREBASE_ENABLED || !db) return null
  const snap = await getDoc(doc(db, 'users', userId, 'settings', 'main'))
  return snap.exists() ? (snap.data() as AppConfig) : null
}

// ── Full sync (cloud → local) ─────────────────────────────────────────────────

export interface CloudSnapshot {
  wardrobe: ClothingItem[]
  outfits: OutfitSuggestion[]
  config: AppConfig | null
  profilePhoto: string
}

export async function syncFromCloud(userId: string): Promise<CloudSnapshot> {
  const [wardrobe, outfits, config, profilePhoto] = await Promise.all([
    getWardrobeCloud(userId),
    getOutfitsCloud(userId),
    getConfigCloud(userId),
    getProfilePhotoCloud(userId),
  ])
  return { wardrobe, outfits, config, profilePhoto }
}


// ── Live sync (same account across PC / iPad) ─────────────────────────────────

export function subscribeToCloud(userId: string, onData: (snapshot: CloudSnapshot) => void): () => void {
  if (!FIREBASE_ENABLED || !db) return () => {}

  let wardrobe: ClothingItem[] = []
  let outfits: OutfitSuggestion[] = []
  let config: AppConfig | null = null
  let profilePhoto = ''
  let wardrobeLoaded = false
  let outfitsLoaded = false

  // Avoid clearing local cache with partial empty snapshots while Firestore listeners are still starting.
  const emit = () => {
    if (!wardrobeLoaded || !outfitsLoaded) return
    onData({ wardrobe, outfits, config, profilePhoto })
  }

  const unsubWardrobe = onSnapshot(collection(db, 'users', userId, 'wardrobe'), (snap) => {
    wardrobe = snap.docs.map((d) => d.data() as ClothingItem)
    wardrobeLoaded = true
    emit()
  })

  const outfitsQuery = query(collection(db, 'users', userId, 'outfits'), orderBy('date', 'desc'), limit(90))
  const unsubOutfits = onSnapshot(outfitsQuery, (snap) => {
    outfits = snap.docs.map((d) => d.data() as OutfitSuggestion)
    outfitsLoaded = true
    emit()
  })

  const unsubConfig = onSnapshot(doc(db, 'users', userId, 'settings', 'main'), (snap) => {
    config = snap.exists() ? (snap.data() as AppConfig) : null
    emit()
  })

  getProfilePhotoCloud(userId).then((url) => {
    profilePhoto = url
    emit()
  }).catch(() => {})

  return () => { unsubWardrobe(); unsubOutfits(); unsubConfig() }
}
