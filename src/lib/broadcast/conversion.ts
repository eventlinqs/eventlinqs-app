import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { captureException } from '@/lib/observability/sentry'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { pieceNamesNight } from '@/lib/broadcast/outbound'
import {
  SHARE_COOKIE,
  getOrCreateShareLink,
  recordShareLinkEvent,
  resolveShareLink,
} from '@/lib/broadcast/share-links'
import { GO_PIECE_COOKIE, pieceIdOf } from '@/lib/growth/go-math'

/**
 * Records a share-link conversion for a confirmed order, reading the share
 * attribution cookie from the current request. Called from the order
 * confirmation render: the one moment the platform has the buyer's browser
 * context AND a confirmed order, entirely outside the payment engine.
 *
 * Attribution integrity:
 *   - the cookie value passes the strict code format gate or nothing happens;
 *   - the code must exist in share_links (a forged code resolves to nothing);
 *   - the link's event must equal the order's event (a code for another event
 *     never claims this sale);
 *   - the unique (link_id, order_id) conversion index makes re-renders and
 *     replays idempotent;
 *   - D8 of Lawal's DemandOS directive, 30 October 2026: a tap on /go/<piece> leaves a cookie, so the order also names
 *     the post that brought the buyer when that post named this night, and a post alone credits the night's own link.
 *
 * Never throws: attribution is instrumentation and must never break the
 * confirmation page.
 */
export interface ConversionDeps {
  resolve(code: string): Promise<{ id: string; event_id: string | null } | null>
  pieceNamesNight(pieceId: string, eventId: string): Promise<boolean>
  ownLinkFor(eventId: string): Promise<{ id: string } | null>
  record(linkId: string, orderId: string, pieceId: string | null): Promise<void>
}

export async function creditConversion(
  order: { id: string; event_id: string },
  cookie: { shareCode: string | null; pieceCookie: string | null },
  deps: ConversionDeps,
): Promise<void> {
  const resolved = cookie.shareCode ? await deps.resolve(cookie.shareCode) : null
  const link = resolved && resolved.event_id === order.event_id ? resolved : null
  const candidate = pieceIdOf(cookie.pieceCookie)
  let pieceId: string | null = null
  if (candidate !== null) {
    try {
      pieceId = (await deps.pieceNamesNight(candidate, order.event_id)) ? candidate : null
    } catch (error) {
      // A failed read of the post never costs the share link its credit.
      captureException(error, { where: 'lib/broadcast/conversion:creditConversion the post' })
    }
  }
  const target = link ?? (pieceId !== null ? await deps.ownLinkFor(order.event_id) : null)
  if (!target) return
  await deps.record(target.id, order.id, pieceId)
}

export async function recordShareConversionForOrder(order: {
  id: string
  event_id: string
}): Promise<void> {
  try {
    if (!(await isFeatureEnabled('broadcast_share'))) return

    const jar = await cookies()
    const admin = createAdminClient()
    await creditConversion(
      order,
      { shareCode: jar.get(SHARE_COOKIE)?.value ?? null, pieceCookie: jar.get(GO_PIECE_COOKIE)?.value ?? null },
      {
        resolve: resolveShareLink,
        pieceNamesNight: (pieceId, eventId) => pieceNamesNight(admin, pieceId, eventId),
        async ownLinkFor(eventId) {
          const { data, error } = await admin.from('events').select('slug').eq('id', eventId).maybeSingle()
          if (error) throw new Error(`the night's own link could not be read: ${error.message}`)
          return data?.slug ? getOrCreateShareLink({ eventId, channel: 'other', eventSlug: data.slug }) : null
        },
        async record(linkId, orderId, pieceId) {
          await recordShareLinkEvent({ linkId, kind: 'conversion', orderId, pieceId })
        },
      },
    )
  } catch (error) {
    // Instrumentation only. The confirmation page always renders; the lost credit is reported, never silent.
    captureException(error, { where: 'lib/broadcast/conversion:recordShareConversionForOrder' })
  }
}
