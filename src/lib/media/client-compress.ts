// Client-side downscale/compress before upload (Event Media Standard SPEC 1.5:
// "Compress and downscale client-side before upload").
//
// Why this exists: the platform transport (Vercel serverless request body) caps
// a request at ~4.5MB, so an original photo between 4.5MB and the app's own
// 10MB limit would be accepted by the UI and then rejected at the transport
// layer before the server pipeline ever ran. Phones routinely produce 5-8MB
// photos. Files at or under TRANSPORT_SAFE_BYTES are sent untouched; larger
// files are re-encoded in the browser until they fit, preserving quality first
// (full resolution, stepped JPEG quality) and resolution second.
//
// The server pipeline (magic bytes, dimension cap, EXIF strip, re-encode)
// remains the authority; this only shrinks the payload it receives.

/** Largest body we will hand to a server action (under the ~4.5MB platform cap). */
export const TRANSPORT_SAFE_BYTES = 4 * 1024 * 1024 // 4MB

/** Quality/scale ladder walked until the encode fits TRANSPORT_SAFE_BYTES. */
const LADDER: Array<{ scale: number; quality: number }> = [
  { scale: 1, quality: 0.85 },
  { scale: 1, quality: 0.75 },
  { scale: 1, quality: 0.65 },
  { scale: 0.75, quality: 0.8 },
  { scale: 0.75, quality: 0.7 },
  { scale: 0.5, quality: 0.75 },
  { scale: 0.5, quality: 0.6 },
]

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

/**
 * Returns a File safe to send through a server action. Files already at or
 * under TRANSPORT_SAFE_BYTES pass through untouched (the server pipeline does
 * the real work). Larger files are decoded and re-encoded to JPEG in-browser.
 * If the browser cannot decode the format (e.g. HEIC outside Safari), the
 * original file is returned and the caller's error path reports honestly.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  if (file.size <= TRANSPORT_SAFE_BYTES) return file
  if (typeof createImageBitmap !== 'function') return file

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file // undecodable in this browser; surface the honest server/transport error
  }

  try {
    for (const step of LADDER) {
      const w = Math.max(1, Math.round(bitmap.width * step.scale))
      const h = Math.max(1, Math.round(bitmap.height * step.scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return file
      ctx.drawImage(bitmap, 0, 0, w, h)
      const blob = await canvasToBlob(canvas, step.quality)
      if (blob && blob.size <= TRANSPORT_SAFE_BYTES) {
        const name = file.name.replace(/\.[a-z0-9]+$/i, '') + '.jpg'
        return new File([blob], name, { type: 'image/jpeg' })
      }
    }
  } finally {
    bitmap.close()
  }
  return file
}
