import { updateSession } from '@/lib/supabase/middleware'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateAdmissionToken } from '@/lib/queue/tokens'

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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { data: event } = await supabase
    .from('events')
    .select('is_high_demand, queue_open_at, status')
    .eq('slug', slug)
    .maybeSingle<{ is_high_demand: boolean; queue_open_at: string | null; status: string }>()

  if (!event) return null
  if (event.status !== 'published') return null
  if (!event.is_high_demand) return null

  const queueOpen = event.queue_open_at && new Date(event.queue_open_at) <= new Date()
  if (!queueOpen) return null

  const queueToken = request.nextUrl.searchParams.get('queue_token')
  const tokenValid = queueToken ? validateAdmissionToken(queueToken).valid : false
  if (tokenValid) return null

  const redirectUrl = request.nextUrl.clone()
  redirectUrl.pathname = `/queue/${slug}`
  redirectUrl.search = ''
  return NextResponse.redirect(redirectUrl)
}

export async function proxy(request: NextRequest) {
  // /dev/* gate runs first - synchronous, no network or DB call - so
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