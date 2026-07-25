import { updateSession } from '@/lib/supabase/middleware'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateAdmissionToken } from '@/lib/queue/tokens'
import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabase/env'

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
async function gateHighDemandEvent(request: NextRequest): Promise<NextResponse | null> {
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

  if (!event) return null
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

export async function proxy(request: NextRequest) {
  // Host canonicalisation runs first - synchronous, before any cookie is read.
  const hostRedirect = canonicaliseHost(request)
  if (hostRedirect) return hostRedirect

  // /dev/* gate runs next - synchronous, no network or DB call - so
  // blocked requests short-circuit immediately.
  const devGate = gateDevRoutes(request)
  if (devGate) return devGate

  const queueRedirect = await gateHighDemandEvent(request)
  if (queueRedirect) return queueRedirect
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|hero/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|ogg|woff|woff2|ttf|otf)$).*)',
  ],
}