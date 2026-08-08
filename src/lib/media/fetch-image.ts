import 'server-only'

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
  } catch {
    // Timed out, aborted, refused, or unreachable. The caller draws its
    // designed fallback; nothing here is worth failing an artefact over.
    return null
  } finally {
    clearTimeout(timer)
  }
}
