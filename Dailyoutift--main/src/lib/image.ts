export interface ImageConversionResult {
  dataUrl: string
  width: number
  height: number
}

function getSafariContext(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const ua = navigator.userAgent
  const platform = navigator.platform
  return `Image conversion failed on this browser. ${message}. Platform: ${platform}. User agent: ${ua}`
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Safari could not decode this image. Try a normal JPEG/PNG screenshot or camera photo.'))
    img.src = dataUrl
  })
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('FileReader returned an unsupported result.'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed to read the image.'))
    reader.readAsDataURL(file)
  })
}

export async function convertImageFileToJpegDataUrl(
  file: File,
  maxWidth = 1200,
  quality = 0.75,
): Promise<ImageConversionResult> {
  try {
    const rawDataUrl = await readFileAsDataUrl(file)
    const img = await loadImage(rawDataUrl)

    const sourceWidth = img.naturalWidth || img.width
    const sourceHeight = img.naturalHeight || img.height
    if (!sourceWidth || !sourceHeight) throw new Error('Image decoded with empty dimensions.')

    const scale = sourceWidth > maxWidth ? maxWidth / sourceWidth : 1
    const width = Math.max(1, Math.round(sourceWidth * scale))
    const height = Math.max(1, Math.round(sourceHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context is not available.')

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)

    return {
      dataUrl: canvas.toDataURL('image/jpeg', quality),
      width,
      height,
    }
  } catch (error) {
    throw new Error(getSafariContext(error))
  }
}
