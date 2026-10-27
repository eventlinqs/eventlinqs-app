/**
 * WHAT EACH POST BROUGHT: TICKETS AND THEIR MONEY FIRST, THEN PEOPLE WHO ARRIVED AND PRESSED OUT (item 11, the social
 * engine; docs/SOCIAL-ENGINE.md). Ported from Bookedproof's src/lib/social/results.ts.
 *
 * Every post carries its own share link, so its counts are the share_link_events rows of that link alone:
 *   arrived:  'click', a person who came to the event through the post's link;
 *   pressed out: 'outbound', a person who came through it and pressed on to the organiser's own booking page (WI3's
 *             counted press, /out); for a listing EventLinqs does not ticket, this is the nearest a post gets to a sale;
 *   tickets:  'conversion', an EventLinqs order for this event reached through the link, its tickets and money, while
 *             the order stands (confirmed or partly refunded).
 * Each counted from the moment the post went to 30 days after. Likes, impressions and follows are never read: none of
 * them sells a ticket, and a number nobody can act on is noise.
 *
 * Pure: src/lib/social/store.ts reads the rows.
 */

export const CREDIT_DAYS = 30

export const STANDING_ORDER = ['confirmed', 'partially_refunded'] as const

export interface LinkEvent {
  readonly linkId: string
  readonly kind: 'view' | 'click' | 'conversion' | 'outbound'
  readonly orderId: string | null
  readonly occurredAt: string
}

export interface CreditedOrder {
  readonly id: string
  readonly status: string
  readonly totalCents: number
  readonly tickets: number
}

export interface PostResult {
  readonly arrived: number
  readonly pressedOut: number
  readonly tickets: number
  readonly cents: number
  readonly orders: number
}

export const NO_RESULT: PostResult = { arrived: 0, pressedOut: 0, tickets: 0, cents: 0, orders: 0 }

/** One post's results, counted inside its window, each order once. */
export function resultOf(linkId: string, postedAt: Date | null, events: readonly LinkEvent[], orders: ReadonlyMap<string, CreditedOrder>): PostResult {
  if (postedAt === null) return NO_RESULT
  const from = postedAt.getTime()
  const until = from + CREDIT_DAYS * 86_400_000
  let arrived = 0
  let pressedOut = 0
  const counted = new Set<string>()
  for (const e of events) {
    if (e.linkId !== linkId) continue
    const at = new Date(e.occurredAt).getTime()
    if (at < from || at > until) continue
    if (e.kind === 'click') arrived += 1
    else if (e.kind === 'outbound') pressedOut += 1
    else if (e.kind === 'conversion' && e.orderId !== null) counted.add(e.orderId)
  }
  let tickets = 0
  let cents = 0
  let standing = 0
  for (const id of counted) {
    const o = orders.get(id)
    if (o === undefined || !(STANDING_ORDER as readonly string[]).includes(o.status)) continue
    tickets += o.tickets
    cents += o.totalCents
    standing += 1
  }
  return { arrived, pressedOut, tickets, cents, orders: standing }
}
