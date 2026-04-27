import { updateSession } from '@/lib/supabase/middleware'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateAdmissionToken } from '@/lib/queue/tokens'

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
  const queueRedirect = await gateHighDemandEvent(request)
  if (queueRedirect) return queueRedirect
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|hero/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|ogg|woff|woff2|ttf|otf)$).*)',
  ],
}