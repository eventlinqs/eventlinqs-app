import { NextResponse, type NextRequest } from 'next/server'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPreviewCrawler } from '@/lib/broadcast/crawler'
import { MEASUREMENT_OFF } from '@/lib/analytics/measurement-off'
import { vitalsRows } from '@/lib/analytics/vitals-record'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * THE REAL VISITOR RECORD'S SERVER HALF (Lawal's law of 10 November 2026, 13:30, internal only; the PM's ruling of
 * 15:05 (2); WINDOW 5A). The browser half is src/components/analytics/web-vitals-record.tsx.
 *
 * It keeps one row per measure in public.page_vitals: the kind of page, phone or desktop, LCP, INP or CLS, and its
 * value (src/lib/analytics/vitals-record.ts decides what is accepted). Nothing about the sender is kept: no address, no
 * user agent, no identifier, no cookie read or set. A crawler's report (Lighthouse names itself one) is not recorded, so
 * the record is real visitors only. The one measurement kill switch (MEASUREMENT_OFF) stops it with every other sender.
 *
 * It answers 204 to a report it keeps and to one it does not (a crawler, the kill switch, a failed write), so the
 * browser never retries and the page never waits on it.
 *
 * AUTH POSTURE: public by design. It is an anonymous beacon, it accepts no identifying field, and it is rate limited
 * (web-vitals). Declared in scripts/security/entrypoint-authz-audit.mjs.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (MEASUREMENT_OFF) return new NextResponse(null, { status: 204 })
  const blocked = await applyRateLimit('web-vitals', request)
  if (blocked) return blocked
  if (isPreviewCrawler(request.headers.get('user-agent'))) return new NextResponse(null, { status: 204 })

  const text = await request.text()
  // One page view's measures together (vitalsRows): five at about 60 bytes each; the old single measure is far smaller.
  if (text.length > 1024) return NextResponse.json({ ok: false, error: 'too_large' }, { status: 413 })
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }
  const rows = vitalsRows(body)
  if (!rows) return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 })

  const { error } = await createAdminClient().from('page_vitals').insert(rows)
  if (error) console.warn('[vitals] a measure was not recorded:', error.message)
  return new NextResponse(null, { status: 204 })
}
