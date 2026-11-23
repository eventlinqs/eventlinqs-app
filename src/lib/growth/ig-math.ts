import { isStillListed } from '@/lib/events/listing-window'

/**
 * /ig, THE INSTAGRAM PAGE (Lawal, 23 November 2026, 12:47: "one mobile page, for example eventlinqs.com.au/ig, listing
 * every event currently promoted on our Instagram, newest first, each with a picture we may show, name, day, venue and
 * one button to its EventLinqs listing (which carries the verified onward booking link); filled automatically from what
 * the engine has published in the last 14 days and still upcoming; an event that has passed drops off by itself;
 * tracked (source instagram, the post's id)." And: "Do not assume that changing Instagram's bio link for each event is
 * a sustainable solution." The bio is set once, to this page.)
 *
 * WHAT COUNTS AS PROMOTED ON OUR INSTAGRAM. A social_piece_postings row on platform 'instagram' (one per piece per
 * network, migration 20261122124501), posted in the last IG_DAYS, naming the nights its approved revision named
 * (social_piece_revisions.event_ids at the posting's approval). The post's id is its piece's id: a piece goes to
 * Instagram once (social_piece_postings_one_per_platform), and the piece is what every other report and the /go hop
 * already count by.
 *
 * WHICH EVENTS ARE LISTED. Every night those posts named that is still public (the site's own visibility read, done by
 * ig.ts) and still listed by the one listing rule (listing-window.ts isStillListed, the lead the ending purge keeps), so
 * a night leaves the page by itself at its end. Newest post first; each event once: the nights of one listing (its
 * title at its venue, guide-sections.ts listingKey) are one item, drawn as its soonest night still ahead, with how many
 * more of its nights the posts named, and credited to the newest post that named any of them.
 *
 * WHERE THE BUTTON GOES. The event's own EventLinqs listing on this site, tagged for the visit ledger (arrival.ts reads
 * every utm tag; traffic-channel.ts counts utm_source=instagram as organic social): source instagram, medium social,
 * campaign ig, content the post's id.
 *
 * Pure: src/lib/growth/ig.ts reads the rows.
 */

export const IG_DAYS = 14

const DAY_MS = 24 * 60 * 60 * 1000

/** A post's address on Instagram: the only posts this page lists. */
const INSTAGRAM_POST = /^https:\/\/(www\.)?instagram\.com\//i

/** One post the engine published to Instagram, with the nights its approved revision named. */
export interface IgPost {
  /** The post's id: its piece (social_pieces.id). */
  readonly postId: string
  readonly postUrl: string
  readonly postedAt: string
  readonly eventIds: readonly string[]
}

/** A night a post named, as the public visibility read returned it; a night missing from the map is not public. */
export interface IgNight {
  readonly id: string
  readonly start_date: string
  readonly end_date: string | null
  readonly timezone: string | null
  /** Its listing: guide-sections.ts listingKey of its title and venue, so a run of nights is one item. */
  readonly listing: string
}

/** One item on the page: the night drawn, the post it is credited to, and how many more of its nights the posts named. */
export interface IgPick {
  readonly eventId: string
  readonly postId: string
  readonly postedAt: string
  readonly more: number
}

/** The events /ig lists now: newest post first, each event once, every night still public and still ahead. */
export function igPicks(posts: readonly IgPost[], nights: ReadonlyMap<string, IgNight>, now: Date): IgPick[] {
  const t = now.getTime()
  const from = t - IG_DAYS * DAY_MS
  const newestFirst = posts
    .filter((p) => {
      const at = Date.parse(p.postedAt)
      return INSTAGRAM_POST.test(p.postUrl) && Number.isFinite(at) && at <= t && at >= from
    })
    .sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt) || a.postId.localeCompare(b.postId))

  // Each listing once, in the order of the newest post that named it, holding every night of it any post named.
  const listings = new Map<string, { postId: string; postedAt: string; nights: Map<string, IgNight> }>()
  for (const p of newestFirst) {
    for (const id of p.eventIds) {
      const night = nights.get(id)
      if (!night || !isStillListed(night, now)) continue
      const held = listings.get(night.listing) ?? { postId: p.postId, postedAt: p.postedAt, nights: new Map<string, IgNight>() }
      held.nights.set(night.id, night)
      listings.set(night.listing, held)
    }
  }

  return [...listings.values()].map((l) => {
    const soonest = [...l.nights.values()].sort((a, b) => Date.parse(a.start_date) - Date.parse(b.start_date) || a.id.localeCompare(b.id))[0]
    return { eventId: soonest.id, postId: l.postId, postedAt: l.postedAt, more: l.nights.size - 1 }
  })
}

/** The listing's path tagged for the visit ledger: source instagram, medium social, campaign ig, content the post's id. */
export function igHref(listingPath: string, postId: string): string {
  const u = new URL(listingPath, 'https://eventlinqs.invalid')
  u.searchParams.set('utm_source', 'instagram')
  u.searchParams.set('utm_medium', 'social')
  u.searchParams.set('utm_campaign', 'ig')
  u.searchParams.set('utm_content', postId)
  return `${u.pathname}${u.search}`
}
