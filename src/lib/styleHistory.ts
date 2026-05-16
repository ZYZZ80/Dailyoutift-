import type { StyleImage } from '../types'
import { saveStyleCloud, uploadStyleImage } from './cloud'
import { getStyles, saveStyles } from './storage'

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

  // Local-first save: History keeps the generated design even if cloud upload,
  // schema cache, or the network fails after generation completes.
  mergeSavedStyle(localStyle)

  if (!userId) return localStyle

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
    return localStyle
  }
}
