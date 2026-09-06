/**
 * THE SIGNED-IN MARKER: one small cookie that says "this request has a session",
 * readable by the routing layer before any function runs.
 *
 * WHY IT EXISTS (close-out C13, 6 September 2026). next.config.ts edge-caches
 * /events/:slug publicly for 300s on the assumption that the render is
 * anonymous. An ARCHIVED event breaks that assumption: a stranger gets 404 and
 * a ticket holder gets the page, on the same URL. Measured on the pull request
 * preview: the proxy set Vercel-CDN-Cache-Control: private, no-store on the
 * response and the edge cached the 404 anyway (x-vercel-cache: HIT, age 20),
 * because a header added by the proxy does not reach the cache decision the
 * way a function's own header does.
 *
 * The cache decision that CAN be made before the function runs is a header
 * rule's `missing` condition, evaluated against the incoming request's cookies
 * (node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/headers.md:
 * "all missing items must not match for the header to be applied"). So the
 * public CDN rule applies only when this cookie is ABSENT, and the holder view
 * of an archived event renders only when it is PRESENT. A signed-in viewer's
 * responses are therefore never shared at the edge, and an anonymous viewer's
 * 404 may be, which is the correct answer for every anonymous viewer anyway.
 *
 * The value carries nothing: no id, no email, no token. It is set by the
 * session middleware on every response that has a user and cleared on every
 * response that does not. A session that predates it gets one 404 on an
 * archived event, the response that sets the marker, and a reload works; that
 * one 404 is the anonymous answer and is safe to cache.
 */
export const SIGNED_IN_MARKER_COOKIE = 'el-signed-in'

/** Seven days: longer than a refreshed session, shorter than forever. */
export const SIGNED_IN_MARKER_MAX_AGE_SECONDS = 7 * 24 * 60 * 60

export function signedInMarkerOptions(secure: boolean) {
  return {
    maxAge: SIGNED_IN_MARKER_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax' as const,
    httpOnly: true,
    secure,
  }
}
