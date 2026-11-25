import type { PieceKind } from './campaign'

/**
 * THE POST KIND, EXPLICIT (the PM's 01:02 item 2 of 25 November 2026; C:\dev\START-16OCT\SOCIAL-BENCHMARK-PLAYBOOK-25NOV.md
 * sections 3a and 4): every piece carries its kind in the playbook's own words (city, event, organiser, reel, story), the
 * goal that kind is for, and the measure it is judged by. Read from the piece's own kind and format, so no piece is ever
 * without one. Pure.
 */
export type PostKind = 'city' | 'event' | 'organiser' | 'reel' | 'story'

export type PostKindPlan = { readonly kind: PostKind; readonly goal: string; readonly measure: string }

/** Section 4: a post performs when, within 72 hours, it reaches twice our own average likes, or shares above its likes. */
const BAR = 'it performs when, within 72 hours, it reaches twice our average likes or shares above its likes (section 4)'

/** Section 3a, each kind's goal in the playbook's words. */
export const POST_KINDS: Readonly<Record<PostKind, PostKindPlan>> = {
  city: { kind: 'city', goal: 'saves and shares to friends, which grow followers (locals planning their week)', measure: `saves and shares; ${BAR}` },
  event: { kind: 'event', goal: 'clicks to book one night', measure: `clicks through to its booking page; ${BAR}` },
  organiser: { kind: 'organiser', goal: 'the relationship, and their followers becoming ours (a Collab post with them, law 40)', measure: `new followers and the organiser's own shares; ${BAR}` },
  reel: { kind: 'reel', goal: 'reach to people who do not follow us yet', measure: `reach beyond our followers; ${BAR}` },
  story: { kind: 'story', goal: 'habit for people who already follow us (it does not grow reach)', measure: 'replies, taps forward to the next night, and link taps from the story' },
}

/**
 * Which kind of post each piece kind is, on its format: a story is a story, whatever it shows. A creative piece (a
 * finished design through the creative intake) is read from what it shows: several nights make a city post (the weekly
 * city carousel), one night an event post.
 */
const FEED_KIND: Readonly<Record<Exclude<PieceKind, 'creative'>, PostKind>> = {
  week_ahead: 'city',
  weekend_carousel: 'city',
  free_week: 'city',
  category_spotlight: 'city',
  tonight_tomorrow: 'city',
  tonight: 'city',
  coming_up: 'event',
  daily_poster: 'event',
  creative: 'event',
  venue_spotlight: 'organiser',
  organiser_campaign: 'organiser',
  partner_kit: 'organiser',
  brand_campaign: 'city',
  discovery_reel: 'reel',
}

/** A piece's post kind, goal and measure, from its own kind and format (and, for a creative piece, how many nights it shows). Pure. */
export function postKindOf(piece: { readonly kind: PieceKind; readonly format: 'feed' | 'story'; readonly nights?: number }): PostKindPlan {
  if (piece.format === 'story') return POST_KINDS.story
  if (piece.kind === 'creative') return POST_KINDS[(piece.nights ?? 1) > 1 ? 'city' : 'event']
  return POST_KINDS[FEED_KIND[piece.kind]]
}
