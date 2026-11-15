/**
 * A CLIENT REQUEST THAT NEVER BREAKS A PAGE (Sentry JAVASCRIPT-NEXTJS-C, 15 November 2026: 'TypeError: Load failed' on
 * /events/:slug from Mobile Safari 27 on iOS 18.7, through our client error sink; Lawal, 22:01: "It's definitely our
 * fault ... Fix it across every page").
 *
 * 'Load failed' is Safari's own words for a fetch that never reached us; Chrome says 'Failed to fetch' and Firefox
 * 'NetworkError when attempting to fetch resource.' (each browser's text, as thrown by window.fetch). A phone losing its
 * signal for a moment, or a page left while a request was in flight, ends a fetch this way. So a fire-and-forget request
 * on a page (a beacon, a cookie write, a preference) goes through quietFetch: it is tried once more after a short wait,
 * and if it still does not arrive it resolves to null, so nothing is thrown into the page. Any other error is a fault of
 * ours and is still thrown, never hidden.
 */

const NETWORK_WORDS: readonly RegExp[] = [
  /^Load failed$/i,
  /^Failed to fetch$/i,
  /^NetworkError when attempting to fetch resource\.?$/i,
  /^The network connection was lost\.?$/i,
  /^The Internet connection appears to be offline\.?$/i,
  /^Network request failed$/i,
]

/** True when the error is a browser's word for a request that never arrived (or one the page itself abandoned). */
export function isNetworkFailure(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') return true
  return error instanceof TypeError && NETWORK_WORDS.some((w) => w.test(error.message.trim()))
}

/**
 * fetch, tried once more on a dropped network, then null. A fault that is not the network is thrown as fetch threw it.
 */
export async function quietFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts: { readonly retries?: number; readonly waitMs?: number } = {},
): Promise<Response | null> {
  const retries = opts.retries ?? 1
  const waitMs = opts.waitMs ?? 600
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(input, init)
    } catch (error) {
      if (!isNetworkFailure(error)) throw error
      if (attempt >= retries) return null
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
  }
}
