/**
 * Cloud sync layer — Firestore + Firebase Storage
 * All functions are no-ops if Firebase is not configured.
 */
import {
  collection, doc, setDoc, deleteDoc, getDocs,
  getDoc, query, orderBy, limit,
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

// ── Image upload ──────────────────────────────────────────────────────────────

/** Upload a clothing item image to Storage. Returns download URL (or original base64 on failure). */
export async function uploadClothingImage(
  userId: string,
  itemId: string,
  base64: string,
): Promise<string> {
  if (!FIREBASE_ENABLED || !storage) return base64
  try {
    const blob = await base64ToBlob(base64)
    const storageRef = ref(storage, `users/${userId}/wardrobe/${itemId}`)
    await uploadBytes(storageRef, blob, { contentType: blob.type || 'image/jpeg' })
    return await getDownloadURL(storageRef)
  } catch {
    return base64
  }
}

/** Upload profile photo. Returns download URL. */
export async function uploadProfilePhoto(userId: string, base64: string): Promise<string> {
  if (!FIREBASE_ENABLED || !storage) return base64
  try {
    const blob = await base64ToBlob(base64)
    const storageRef = ref(storage, `users/${userId}/profile`)
    await uploadBytes(storageRef, blob, { contentType: blob.type || 'image/jpeg' })
    return await getDownloadURL(storageRef)
  } catch {
    return base64
  }
}

/** Get profile photo URL from Storage. */
export async function getProfilePhotoCloud(userId: string): Promise<string> {
  if (!FIREBASE_ENABLED || !storage) return ''
  try {
    return await getDownloadURL(ref(storage, `users/${userId}/profile`))
  } catch {
    return ''
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
