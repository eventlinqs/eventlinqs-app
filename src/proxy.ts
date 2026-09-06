import { updateSession } from '@/lib/supabase/middleware'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SHARE_COOKIE, SHARE_COOKIE_MAX_AGE_SECONDS } from '@/lib/broadcast/share-codes'
import { validateAdmissionToken } from '@/lib/queue/tokens'
import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabase/env'
import { GONE_HEADERS, GONE_STATUS, renderGoneHtml } from '@/lib/events/gone-page'
import { SIGNED_IN_MARKER_COOKIE } from '@/lib/auth/signed-in-marker'

/**
 * /dev/* production gate.
 *
 * Per AUDIT-FUNCTIONALITY-2026-05-23.md HIGH-1: three preview pages
 * live under /dev/ (logo-preview, shell-preview,
 * connect-onboarding-preview). They carry robots: noindex but were
 * otherwise publicly reachable, which is a friends-launch risk.
 *
 * Gate logic:
 *   - Local development (NODE_ENV=development)        -> 200
 *   - Vercel preview deploys (VERCEL_ENV=preview)     -> 200
 *   - Local production build (NODE_ENV=production,
 *     VERCEL_ENV=undefined)                           -> 404
 *   - Vercel production deploy (VERCEL_ENV=production) -> 404
 *
 * Encoded as: block when NODE_ENV === 'production' AND VERCEL_ENV !==
 * 'preview'. The local-prod check matches the brief's verification step
 * "Production build: /dev/logo-preview should return 404".
 */
function gateDevRoutes(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl
  if (!pathname.startsWith('/dev/') && pathname !== '/dev') return null
  const isProd = process.env.NODE_ENV === 'production'
  const isPreview = process.env.VERCEL_ENV === 'preview'
  if (isProd && !isPreview) {
    return new NextResponse('Not Found', { status: 404 })
  }
  return null
}

/**
 * Does this admission token admit the bearer to THIS event?
 *
 * A signed token carries the event it was issued for
 * (`queueId:eventId:expiresAtMs`), but the gate used to check only
 * `validateAdmissionToken(token).valid` and throw the embedded eventId away.
 * A signature is only a proof of ISSUANCE, never a proof of SCOPE: one
 * legitimately-earned token for a low-demand event admitted the bearer to
 * every high-demand event on the platform, which is the whole thing the queue
 * exists to prevent. Comparing the embedded eventId to the event actually being
 * requested is what binds the two together.
 */
export function admitsToEvent(token: string, eventId: string): boolean {
  const result = validateAdmissionToken(token)
  return result.valid && result.eventId === eventId
}

// /events/<slug> queue gate. This used to live inline in the page via
// `searchParams.queue_token`, which forced dynamic SSR and disqualified the
// route from `generateStaticParams` + `revalidate`. Lifting it here lets
// the page itself be fully static while high-demand events still redirect
// pre-admission visitors to /queue/<slug>. Skipped for /events/browse and
// any nested route under /events.
async function gateHighDemandEvent(
  request: NextRequest,
): Promise<NextResponse | typeof PRIVATE_TO_EDGE | typeof HOLDER_VIEW | null> {
  const { pathname } = request.nextUrl
  if (!pathname.startsWith('/events/')) return null

  const rest = pathname.slice('/events/'.length)
  if (!rest || rest.startsWith('browse')) return null
  if (rest.includes('/')) return null

  const slug = rest
  // Resolver, never the raw NEXT_PUBLIC_* pair. Reading the base vars directly
  // here made every preview deployment query the PRODUCTION database on every
  // /events/<slug> request, because the *_PREVIEW overrides that point previews
  // at the TEST project are only applied by src/lib/supabase/env.ts.
  const url = getSupabaseUrl()
  const key = getSupabaseAnonKey()
  if (!url || !key) return null

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { data: event } = await supabase
    .from('events')
    .select('id, is_high_demand, status')
    .eq('slug', slug)
    .maybeSingle<{ id: string; is_high_demand: boolean; status: string }>()

  /*
   * A DELETED EVENT ANSWERS 410 GONE (docs/EVENT-LIFECYCLE.md, close-out C13.6).
   *
   * The read above is the one this gate has always made. Only when it finds
   * no live row (which anon cannot see for a draft or an archived event either,
   * and which is the whole of what a deleted event leaves) is the tombstone
   * asked, so the hot path stays at one query. The tombstone is written by a
   * BEFORE DELETE trigger in the same transaction as the delete, and anon may
   * read its slug and date only. The page component cannot set a 410, so the
   * proxy answers here with the branded body rather than letting the route
   * render a 404 for an address that did exist.
   */
  if (!event) {
    const { data: tombstone } = await supabase
      .from('event_tombstones')
      .select('slug')
      .eq('slug', slug)
      .maybeSingle<{ slug: string }>()
    if (tombstone) return goneResponse()
    /*
     * NO LIVE ROW AND NO GRAVE: the slug is unknown, unpublished, private, or
     * ARCHIVED. An archived event's page is per viewer (404 to a stranger, the
     * page to a ticket holder), and next.config.ts edge-caches /events/:slug
     * publicly for 300s on the assumption that the render is anonymous.
     *
     * A SIGNED-IN VIEWER IS REWRITTEN OFF THE CACHED PATH. The edge looks a URL
     * up before any function runs and cookies are not part of its key, so on
     * the preview a holder was served the stranger's cached 404 whatever the
     * origin's own headers said. Routing Middleware "runs globally before the
     * cache" and rewriting is the documented way to personalise cached content
     * (https://vercel.com/docs/routing-middleware, last updated 2026-08-14,
     * fetched 2026-09-06), so a request carrying the signed-in marker goes to
     * /events/[slug]/holder: the same page under the same layout guard, at a
     * path no public cache rule matches. Only the marker is trusted here, never
     * the session cookie itself: a signed-in request WITHOUT the marker gets
     * the anonymous 404 (the response that sets the marker), so the holder path
     * is never reached by a request the config rule would let the edge keep.
     * Everyone else continues to the public path, marked private to the edge
     * as belt and braces (privateToEdge).
     */
    if (request.cookies.has(SIGNED_IN_MARKER_COOKIE)) return HOLDER_VIEW
    return PRIVATE_TO_EDGE
  }
  if (event.status !== 'published') return null
  if (!event.is_high_demand) return null

  // queue_open_at is deferred (no live schema column), so a high-demand
  // published event gates immediately. Selecting the missing column here used
  // to error on every /events/<slug> request and silently fail the gate open.
  // Pre-queue scheduling returns when the column ships.

  const queueToken = request.nextUrl.searchParams.get('queue_token')
  if (queueToken && admitsToEvent(queueToken, event.id)) return null

  const redirectUrl = request.nextUrl.clone()
  redirectUrl.pathname = `/queue/${slug}`
  redirectUrl.search = ''
  return NextResponse.redirect(redirectUrl)
}

/** The 410 for a deleted event's address, exported so its shape is tested. */
export function goneResponse(): NextResponse {
  return new NextResponse(renderGoneHtml(), { status: GONE_STATUS, headers: GONE_HEADERS })
}

/** The gate's answers when the slug has no live row: not redirects, markers. */
const PRIVATE_TO_EDGE = Symbol('private-to-edge')
const HOLDER_VIEW = Symbol('holder-view')

/** Where a signed-in viewer of a slug with no live row is rewritten to. */
export function holderViewPath(slug: string): string {
  return `/events/${slug}/holder`
}

/**
 * The rewrite for a signed-in viewer, carrying whatever cookies the session
 * refresh set on this request so a rewritten navigation loses nothing.
 */
export function holderViewRewrite(request: NextRequest, slug: string, session: NextResponse): NextResponse {
  const target = request.nextUrl.clone()
  target.pathname = holderViewPath(slug)
  const rewritten = NextResponse.rewrite(target, { request: { headers: request.headers } })
  for (const cookie of session.cookies.getAll()) rewritten.cookies.set(cookie)
  return privateToEdge(rewritten)
}

/**
 * KEEP THIS RESPONSE OUT OF THE EDGE CACHE.
 *
 * next.config.ts sets `CDN-Cache-Control: public, s-maxage=300` on every
 * /events/:slug response so an anonymous render is served from Vercel's cache.
 * An ARCHIVED event's response is not anonymous: a stranger gets 404 and a
 * ticket holder gets the page, on the same URL, and the edge caches by URL. A
 * holder's page cached for strangers, or a stranger's 404 cached for holders,
 * is the same defect from either side.
 *
 * `Vercel-CDN-Cache-Control` set on the function response outranks the
 * config's `CDN-Cache-Control` ("Vercel-CDN-Cache-Control is exclusive to
 * Vercel and has top priority, whether it's defined in a Vercel Function
 * response or a vercel.json file"), and `private` "specifies that the response
 * can only be cached by the client and not by Vercel's CDN".
 * https://vercel.com/docs/caching/cache-control-headers (last updated
 * 2026-08-11, fetched 2026-09-06). The header is consumed by the edge and never
 * reaches the browser. Exported so the shape is unit tested.
 */
export const PRIVATE_TO_EDGE_HEADER = ['Vercel-CDN-Cache-Control', 'private, no-store'] as const

export function privateToEdge(response: NextResponse): NextResponse {
  response.headers.set(PRIVATE_TO_EDGE_HEADER[0], PRIVATE_TO_EDGE_HEADER[1])
  return response
}

// Canonical host ruling (founder, 2026-07-25): www.eventlinqs.com.au is THE
// canonical host and every other branded host 301s to it. One host means auth
// cookies, sessions, share links, OG cards and the Google index all agree, and
// it removes the four-way split (eventlinqs.com, www.eventlinqs.com,
// eventlinqs.com.au, www.eventlinqs.com.au) that previously all served 200.
//
// 301 (permanent), not 308: browsers and search engines treat 301 as the
// canonicalisation signal, and consolidating link equity onto one host is the
// point. The redirected hosts only ever serve GET/HEAD marketing traffic, so
// the method-preservation that 308 buys is not needed here.
//
// The list is EXPLICIT rather than a suffix match on purpose: localhost,
// *.vercel.app preview hosts and the staging alias must never be redirected, or
// every preview deployment would bounce its own traffic at production.
const CANONICAL_HOST = 'www.eventlinqs.com.au'
const REDIRECT_HOSTS = new Set([
  'eventlinqs.com',
  'www.eventlinqs.com',
  'eventlinqs.com.au',
])

function canonicaliseHost(request: NextRequest): NextResponse | null {
  if (!REDIRECT_HOSTS.has(request.nextUrl.hostname)) return null
  // Stripe does NOT follow redirects: a 3xx here silently breaks every webhook
  // delivery. The endpoint is configured on the canonical host directly, and
  // this bypass is the safety net if it is ever pointed at another alias.
  if (request.nextUrl.pathname === '/api/webhooks/stripe') return null
  const url = request.nextUrl.clone()
  url.hostname = CANONICAL_HOST
  return NextResponse.redirect(url, 301)
}

/**
 * The last-touch share cookie, set for /e/[code] and /s/[code].
 *
 * It has to happen here and not in the page. A Next.js Server Component cannot
 * write a cookie during render; only a Route Handler, a Server Action or the
 * middleware can. /e/[code] RENDERS the event page rather than redirecting to
 * it, which is the whole point of the format, so the cookie is set on the way
 * past instead.
 *
 * No database call is needed: the cookie value IS the code, and the code is
 * already in the path. Format is gated with a cheap regex so a junk path never
 * writes a cookie, and the value is length-capped so a long path cannot be used
 * to stuff a header.
 *
 * Not httpOnly, unchanged from the previous behaviour: the value is a public
 * code already visible in the address bar, and the view beacon on the event
 * page reads it client side.
 */
const SHARE_PATH_RE = /^\/(?:e|s)\/([A-Za-z0-9][A-Za-z0-9-]{1,47})\/?$/

function attachShareCookie(request: NextRequest, response: NextResponse): NextResponse {
  const match = SHARE_PATH_RE.exec(request.nextUrl.pathname)
  if (!match) return response
  // Name and lifetime come from share-codes.ts, the one definition. A second
  // copy here is how the cookie the middleware writes and the cookie the
  // checkout reads drift apart without anything going red.
  response.cookies.set(SHARE_COOKIE, match[1], {
    maxAge: SHARE_COOKIE_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
  })
  return response
}

export async function proxy(request: NextRequest) {
  // Host canonicalisation runs first - synchronous, before any cookie is read.
  const hostRedirect = canonicaliseHost(request)
  if (hostRedirect) return hostRedirect

  // /dev/* gate runs next - synchronous, no network or DB call - so
  // blocked requests short-circuit immediately.
  const devGate = gateDevRoutes(request)
  if (devGate) return devGate

  const gate = await gateHighDemandEvent(request)
  if (gate instanceof NextResponse) return gate
  const response = attachShareCookie(request, await updateSession(request))
  if (gate === HOLDER_VIEW) {
    return holderViewRewrite(request, request.nextUrl.pathname.slice('/events/'.length), response)
  }
  return gate === PRIVATE_TO_EDGE ? privateToEdge(response) : response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|hero/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|ogg|woff|woff2|ttf|otf)$).*)',
  ],
}