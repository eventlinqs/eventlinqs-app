import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordDemand, LEDGER_EVENT_COLUMNS, type EventForLedger } from '@/lib/ledger/adapter'
import { afterResponse } from '@/lib/after-response'
import { visitorHash } from '@/lib/broadcast/share-links'
import { deviceFromUserAgent, decodeFirstTouch, FIRST_TOUCH_COOKIE } from '@/lib/growth/visit-attribution'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * THE DEMAND BEACON. Close-out D1.
 *
 * Two of the five demand actions have no person attached and no server action to
 * hang off: somebody looked at a page, and somebody looked at a page that had
 * sold out. Both matter, because "how many people wanted this and could not have
 * it" is the number an organiser has never had, and neither can be recorded
 * during the render: the page is cached, so a view counted there would be
 * counted once for the whole cache lifetime and then never again. That is the
 * same reason the share view beacon already exists.
 *
 * WHAT A BROWSER CANNOT FORGE HERE.
 *   - only the two anonymous actions are accepted. checkout_started,
 *     checkout_abandoned and waitlist_join are written server side, by the code
 *     that actually observed them, so a script cannot invent demand that carries
 *     an address.
 *   - the slot is resolved from the database, and a draft, private or cancelled
 *     event is refused exactly as its page would be.
 *   - the row is deduped per visitor per slot per day by its occurrence key, so
 *     a refresh loop writes one row.
 *
 * AUTH POSTURE: public by design. It is an anonymous beacon, it accepts no
 * identifying field, and it is rate limited. Declared in
 * scripts/security/entrypoint-authz-audit.mjs.
 */
const BodySchema = z.object({
  eventId: z.string().uuid(),
  action: z.enum(['page_view', 'sold_out_view']),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  const blocked = await applyRateLimit('ledger-demand', request)
  if (blocked) return blocked

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: event } = await admin
    .from('events')
    .select(`${LEDGER_EVENT_COLUMNS}, status, visibility`)
    .eq('id', parsed.data.eventId)
    .maybeSingle()

  // The same answer the page would give. A beacon must never be a way to learn
  // that a draft event exists.
  const row = event as ({ status?: string; visibility?: string } & Record<string, unknown>) | null
  if (!row || row.status !== 'published' || row.visibility !== 'public') {
    return NextResponse.json({ ok: true })
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const userAgent = request.headers.get('user-agent')
  const visitor = visitorHash(ip, userAgent)
  const day = new Date().toISOString().slice(0, 10)
  const firstTouch = decodeFirstTouch(request.cookies.get(FIRST_TOUCH_COOKIE)?.value ?? null)

  // AFTER the answer, not before it (close-out D1's reversal condition,
  // measured at 245ms p95 against a 50ms threshold). Everything this row needs
  // has already been read off the request above.
  afterResponse(`the ${parsed.data.action} demand row`, () =>
    recordDemand({
      event: event as unknown as EventForLedger,
      action: parsed.data.action,
      // One row per visitor per slot per day. A refresh loop writes one row.
      occurrenceKey: `${parsed.data.eventId}:${visitor}:${day}`,
      visitorId: visitor,
      attribution: {
        referrer: firstTouch.referrer,
        utmSource: firstTouch.utmSource,
        utmMedium: firstTouch.utmMedium,
        utmCampaign: firstTouch.utmCampaign,
        device: deviceFromUserAgent(userAgent),
      },
    }),
  )

  return NextResponse.json({ ok: true })
}
