import type { NightFigures } from './organiser-report-math'

/**
 * THE FOUR HONEST LEVELS (Lawal's final blueprint of 30 October 2026, section 7, "The reporting should distinguish
 * four levels"; the PROJECT MANAGER's 17:25: "the venue partnership report shows the four honest levels (exposure,
 * interest, booking intent, verified sale) and never more").
 *
 *   exposure        the posts that named the night and the taps on their /go links (counted); Instagram's reach only
 *                   as a person entered it, kept apart, never added to a count
 *   interest        the distinct people who opened the listing
 *   booking intent  the people sent on to book (a press to the booking site): NEVER a sale
 *   verified sale   standing orders on EventLinqs, only where EventLinqs sells the night; elsewhere not visible to us,
 *                   and the words say so rather than showing 0
 *
 * Read from the night's kept figures (organiser-report-math nightFigures, organiser_night_reports), never recounted,
 * so a venue, its organiser and Lawal read the same numbers. A fifth level, estimated incremental sales, needs a
 * holdout and is not claimed here. Pure.
 */

export interface FourLevels {
  readonly exposure: { readonly posts: number; readonly goTaps: number; readonly instagramReachEntered: number | null }
  readonly interest: { readonly people: number }
  readonly bookingIntent: { readonly people: number }
  /** Null where EventLinqs does not sell the night: the sale happened, or not, where we cannot see it. */
  readonly verifiedSale: { readonly orders: number | null; readonly tickets: number | null }
}

export function fourLevels(f: NightFigures): FourLevels {
  return {
    exposure: {
      posts: f.posts.length,
      goTaps: f.posts.reduce((n, p) => n + p.goPresses, 0),
      instagramReachEntered: f.instagramReach?.value ?? null,
    },
    interest: { people: f.viewers },
    bookingIntent: { people: f.pressesOut.people },
    verifiedSale: f.onEventLinqs === null ? { orders: null, tickets: null } : { orders: f.onEventLinqs.orders, tickets: f.onEventLinqs.tickets },
  }
}

export interface VenueLevels {
  readonly nights: number
  readonly exposure: FourLevels['exposure']
  readonly interest: FourLevels['interest']
  readonly bookingIntent: FourLevels['bookingIntent']
  /** Orders and tickets on the nights we sell (null when none of the nights is ours), and the nights we cannot see. */
  readonly verifiedSale: { readonly orders: number | null; readonly tickets: number | null; readonly nightsNotVisible: number }
}

/** A venue's nights, added: counted levels sum; entered reach sums only what was entered; a sale only where we sell. */
export function venueLevels(nights: readonly FourLevels[]): VenueLevels {
  const sold = nights.filter((n) => n.verifiedSale.orders !== null)
  const reach = nights.map((n) => n.exposure.instagramReachEntered).filter((r): r is number => r !== null)
  return {
    nights: nights.length,
    exposure: {
      posts: nights.reduce((s, n) => s + n.exposure.posts, 0),
      goTaps: nights.reduce((s, n) => s + n.exposure.goTaps, 0),
      instagramReachEntered: reach.length ? reach.reduce((s, r) => s + r, 0) : null,
    },
    interest: { people: nights.reduce((s, n) => s + n.interest.people, 0) },
    bookingIntent: { people: nights.reduce((s, n) => s + n.bookingIntent.people, 0) },
    verifiedSale: {
      orders: sold.length ? sold.reduce((s, n) => s + (n.verifiedSale.orders ?? 0), 0) : null,
      tickets: sold.length ? sold.reduce((s, n) => s + (n.verifiedSale.tickets ?? 0), 0) : null,
      nightsNotVisible: nights.length - sold.length,
    },
  }
}

/** A count in Australian digit grouping. A number, not a date, so it carries no time zone. */
const count = new Intl.NumberFormat('en-AU')
const n = (c: number, one: string, many: string) => `${count.format(c)} ${c === 1 ? one : many}`

/** The four lines, in plain words, exactly four. `siteNamed` names where an unseen sale happens (a provider or 'the booking site'). */
export function levelLines(v: VenueLevels, words: { siteNamed: string }): [string, string, string, string] {
  const reach = v.exposure.instagramReachEntered === null ? '' : `; Instagram's reach ${count.format(v.exposure.instagramReachEntered)}, as entered from Instagram`
  const ours = v.verifiedSale.orders === null ? null : `${n(v.verifiedSale.orders, 'order', 'orders')}, ${n(v.verifiedSale.tickets ?? 0, 'ticket', 'tickets')} on EventLinqs`
  const unseen = v.verifiedSale.nightsNotVisible > 0 ? `not visible to us for ${n(v.verifiedSale.nightsNotVisible, 'night', 'nights')} sold on ${words.siteNamed}` : null
  return [
    `Exposure: ${n(v.exposure.posts, 'post', 'posts')}, ${n(v.exposure.goTaps, 'tap', 'taps')} on their links${reach}`,
    `Interest: ${n(v.interest.people, 'person', 'people')} opened the listing`,
    `Booking intent: ${n(v.bookingIntent.people, 'person', 'people')} went on to book (a press to the booking site, never counted as a sale)`,
    `Verified sale: ${[ours, unseen].filter(Boolean).join('; ') || 'none counted'}`,
  ]
}
