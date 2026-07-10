import { cookies } from 'next/headers'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import {
  SHARE_COOKIE,
  recordShareLinkEvent,
  resolveShareLink,
} from '@/lib/broadcast/share-links'

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
 *     replays idempotent.
 *
 * Never throws: attribution is instrumentation and must never break the
 * confirmation page.
 */
export async function recordShareConversionForOrder(order: {
  id: string
  event_id: string
}): Promise<void> {
  try {
    if (!(await isFeatureEnabled('broadcast_share'))) return

    const jar = await cookies()
    const code = jar.get(SHARE_COOKIE)?.value
    if (!code) return

    const link = await resolveShareLink(code)
    if (!link) return
    if (link.event_id !== order.event_id) return

    await recordShareLinkEvent({
      linkId: link.id,
      kind: 'conversion',
      orderId: order.id,
    })
  } catch {
    // Instrumentation only. The confirmation page always renders.
  }
}
