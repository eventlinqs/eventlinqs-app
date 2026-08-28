import 'server-only'
import { captureException } from '@/lib/observability/sentry'

/**
 * Fetch a stored image with a hard deadline and a size ceiling.
 *
 * Every artefact renderer pulls the organiser's own cover and logo out of
 * storage before it can draw. Without a deadline, one slow or hanging object
 * store turns a poster download into a request that never returns, and the
 * organiser sees a spinner with no explanation. Artefacts must degrade rather
 * than hang: a missing photograph falls back to the typographic composition, a
 * missing logo falls back to the organiser's name in type. Both are designed
 * states, not failures, so the right behaviour on a slow upstream is to give
 * up quickly and draw the fallback.
 *
 * The size ceiling is the second half of the same argument: the upload pipeline
 * caps a stored object at 10MB, so anything materially larger is not ours and
 * is not worth buffering into a lambda.
 */

/** Long enough for a cold object-store read, short enough to stay a download. */
export const IMAGE_FETCH_TIMEOUT_MS = 6000

/** Matches the upload ceiling in src/lib/media/limits.ts, with headroom. */
const MAX_FETCH_BYTES = 12 * 1024 * 1024

export type FetchedImage = { bytes: Uint8Array; contentType: string | null }

/**
 * The magic numbers of every raster format a decoder here will accept.
 *
 * WHY SNIFF AT ALL. A share card that hands a renderer a URL and hopes is one
 * bad object away from rendering nothing: satori fetches the URL itself, and if
 * what comes back is an error page, a truncated body or a format the decoder
 * does not know, the whole ImageResponse throws and the route dies with "failed
 * to pipe response". The card then does not fall back to the branded design it
 * documents; the share preview is simply dead, which is the worst outcome for
 * the one artefact whose entire job is to be seen.
 *
 * A content-type header is not enough. Object stores lie, and an error body can
 * arrive labelled image/jpeg. The first bytes cannot lie.
 */
const MAGIC: { name: string; test: (b: Uint8Array) => boolean }[] = [
  { name: 'image/jpeg', test: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { name: 'image/png', test: b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { name: 'image/gif', test: b => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
  {
    name: 'image/webp',
    test: b =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
]

/** What these bytes actually are, by magic number, or null if not an image. */
export function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.byteLength < 12) return null
  return MAGIC.find(m => m.test(bytes))?.name ?? null
}

/**
 * A cover as a data: URI a renderer can embed WITHOUT fetching anything itself,
 * or null when there is nothing usable. Null is a designed state: every caller
 * draws its branded fallback, which is what a share card is supposed to do when
 * an organiser has no artwork.
 *
 * AVIF and HEIF are deliberately absent from the accepted set. They are valid
 * images that this renderer cannot draw, so treating them as "no cover" gives
 * the reader a designed card instead of a dead one.
 */
export async function fetchImageDataUri(
  url: string | null | undefined,
  timeoutMs: number = IMAGE_FETCH_TIMEOUT_MS,
): Promise<string | null> {
  const fetched = await fetchImageBytes(url, timeoutMs)
  if (!fetched) return null
  const type = sniffImageType(fetched.bytes)
  if (!type) return null
  return `data:${type};base64,${Buffer.from(fetched.bytes).toString('base64')}`
}

export async function fetchImageBytes(
  url: string | null | undefined,
  timeoutMs: number = IMAGE_FETCH_TIMEOUT_MS,
): Promise<FetchedImage | null> {
  if (!url) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    if (!response.ok) return null

    const declared = Number(response.headers.get('content-length') ?? '0')
    if (declared > MAX_FETCH_BYTES) return null

    const bytes = new Uint8Array(await response.arrayBuffer())
    // A missing or lying content-length is checked again on the real payload.
    if (bytes.byteLength < 12 || bytes.byteLength > MAX_FETCH_BYTES) return null
    return { bytes, contentType: response.headers.get('content-type') }
  } catch (error) {
    captureException(error, { where: 'lib/media/fetch-image:49' })
    // Timed out, aborted, refused, or unreachable. The caller draws its
    // designed fallback; nothing here is worth failing an artefact over.
    return null
  } finally {
    clearTimeout(timer)
  }
}
