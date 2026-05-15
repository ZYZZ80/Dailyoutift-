import { ImageOff } from 'lucide-react'
import { useState, type ImgHTMLAttributes } from 'react'

interface Props extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'loading'> {
  src: string | undefined | null
  /** Resize via Supabase image transform — pass the longest edge in px (e.g. 200, 400). */
  thumb?: number
  /** Force eager loading (rare — only for above-the-fold hero images). */
  eager?: boolean
}

/**
 * Drop-in <img> replacement with:
 *  - native lazy loading (only loads when scrolled into viewport)
 *  - async decoding so it doesn't block the main thread
 *  - skeleton placeholder while loading (no layout shift)
 *  - optional Supabase image-transform thumbnail (e.g. 200px wide instead of 2MB original)
 */
export default function Img({ src, thumb, eager, alt = '', className = '', style, ...rest }: Props) {
  const [loaded, setLoaded] = useState(false)
  const [useOriginal, setUseOriginal] = useState(false)
  const [broken, setBroken] = useState(false)

  // If it's a Supabase-hosted image and a thumb size was requested, swap to the
  // /render/image/ transform endpoint which serves resized WebP. ~10x smaller.
  let finalSrc = src ?? ''
  if (!useOriginal && thumb && finalSrc && finalSrc.includes('/storage/v1/object/public/')) {
    finalSrc = finalSrc.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/') +
               `${finalSrc.includes('?') ? '&' : '?'}width=${thumb}&resize=cover&quality=75`
  }

  if (broken) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`${className} bg-gray-100 text-gray-300 flex flex-col items-center justify-center gap-2`}
        style={style}
      >
        <ImageOff className="w-6 h-6" strokeWidth={1.5} />
        <span className="text-[10px] font-medium">Image unavailable</span>
      </div>
    )
  }

  return (
    <img
      {...rest}
      src={finalSrc || undefined}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onLoad={(e) => { setLoaded(true); rest.onLoad?.(e) }}
      onError={(e) => {
        if (!useOriginal && src && finalSrc !== src) {
          setUseOriginal(true)
          setLoaded(false)
          return
        }
        setLoaded(true)
        setBroken(true)
        rest.onError?.(e)
      }}
      className={`${className} ${loaded ? '' : 'animate-pulse bg-gray-100'}`}
      style={{ ...style, transition: 'opacity 0.2s', opacity: loaded ? 1 : 0.85 }}
    />
  )
}
