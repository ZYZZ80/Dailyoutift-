import type { StyleImage } from '../types'
import { saveStyleCloud, uploadStyleImage } from './cloud'
import { getStyles, saveStyles } from './storage'
import { authFetch } from './authFetch'

interface SaveGeneratedStyleInput {
  userId?: string
  image: string
  itemIds?: string[]
  outfitId?: string
  source: StyleImage['source']
}

function mergeSavedStyle(style: StyleImage) {
  saveStyles([style, ...getStyles().filter((item) => item.id !== style.id)])
}

async function saveStyleViaServer(style: StyleImage): Promise<StyleImage> {
  const res = await authFetch('/api/save-style', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ style }),
  })
  const data = await res.json().catch(() => ({})) as { style?: StyleImage; error?: string; details?: string }
  if (!res.ok || !data.style) {
    throw new Error(data.details || data.error || `Style save failed (${res.status})`)
  }
  return data.style
}

export async function saveGeneratedStyleToHistory({
  userId,
  image,
  itemIds = [],
  outfitId,
  source,
}: SaveGeneratedStyleInput): Promise<StyleImage> {
  const localStyle: StyleImage = {
    id: crypto.randomUUID(),
    image,
    itemIds,
    outfitId,
    source,
    createdAt: new Date().toISOString(),
  }

  if (!userId) {
    mergeSavedStyle(localStyle)
    return localStyle
  }

  try {
    const cloudStyle = await saveStyleViaServer(localStyle)
    mergeSavedStyle(cloudStyle)
    return cloudStyle
  } catch (serverError) {
    const serverMessage = serverError instanceof Error ? serverError.message : String(serverError)
    console.warn('Server style save failed; trying browser Supabase upload:', serverMessage)
  }

  try {
    const imageUrl = await uploadStyleImage(userId, localStyle.id, image)
    const cloudStyle = { ...localStyle, image: imageUrl }
    await saveStyleCloud(userId, cloudStyle)
    mergeSavedStyle(cloudStyle)
    return cloudStyle
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    try {
      await saveStyleCloud(userId, localStyle, { skipImageUpload: true })
      console.warn('Style image storage upload failed; saved History record in Supabase table instead:', message)
    } catch (rowError) {
      const rowMessage = rowError instanceof Error ? rowError.message : String(rowError)
      console.warn('Style history cloud save failed; kept local recovery copy:', `${message}; ${rowMessage}`)
    }
    mergeSavedStyle(localStyle)
    return localStyle
  }
}
