import { MAX_GALLERY_IMAGES } from './limits'

// The gallery shape stored in events.gallery_urls (jsonb). Enriched from the
// legacy string[] to carry per-image alt text and a blur placeholder, while the
// narrow tolerates BOTH shapes so old rows never break (a plain string becomes
// { url, alt: '' }). cover_image_url stays the canonical cover and is NOT part of
// this array.

export type GalleryImage = {
  url: string
  /** Per-image alt text (accessibility). May be empty; render falls back to the event title. */
  alt: string
  /** Optional blurDataURL placeholder for next/image. */
  blur?: string
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Narrow events.gallery_urls (Json | null) to GalleryImage[]. Accepts the new
 * object shape and the legacy string[] shape; drops anything malformed; caps at
 * the gallery ceiling so a bad row can never render more than allowed.
 */
export function parseGallery(value: unknown): GalleryImage[] {
  if (!Array.isArray(value)) return []
  const out: GalleryImage[] = []
  for (const item of value) {
    if (typeof item === 'string') {
      if (item) out.push({ url: item, alt: '' })
    } else if (isPlainObject(item) && typeof item.url === 'string' && item.url) {
      out.push({
        url: item.url,
        alt: typeof item.alt === 'string' ? item.alt : '',
        blur: typeof item.blur === 'string' && item.blur ? item.blur : undefined,
      })
    }
    if (out.length >= MAX_GALLERY_IMAGES) break
  }
  return out
}

/** Serialise a GalleryImage[] for the jsonb column, enforcing the ceiling. */
export function serializeGallery(images: GalleryImage[]): GalleryImage[] {
  return images
    .filter((i) => i && typeof i.url === 'string' && i.url)
    .slice(0, MAX_GALLERY_IMAGES)
    .map((i) => ({ url: i.url, alt: (i.alt ?? '').slice(0, 300), ...(i.blur ? { blur: i.blur } : {}) }))
}
