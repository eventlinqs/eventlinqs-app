import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const WARM_PATHS = [
  '/',
  '/events',
  '/events/browse/melbourne',
  '/events/browse/sydney',
  '/events/browse/brisbane',
]

/**
 * Keeps the hot paths warm so first-visit cold-start never lands on a
 * real user. Runs every minute (Vercel Cron minimum). Each fetch passes
 * a cache-bust query so the origin re-executes; the resulting ISR entry
 * sits in Vercel's edge for the next real request.
 *
 * Protected by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  const results = await Promise.allSettled(
    WARM_PATHS.map(async path => {
      const started = Date.now()
      const res = await fetch(`${base}${path}`, {
        headers: { 'user-agent': 'EventLinqs-Warmer/1.0' },
        cache: 'no-store',
      })
      return {
        path,
        status: res.status,
        ms: Date.now() - started,
      }
    })
  )

  const summary = results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { path: WARM_PATHS[i], status: 'error', error: String(r.reason) }
  )

  return NextResponse.json({
    ok: true,
    warmed: summary,
    timestamp: new Date().toISOString(),
  })
}
