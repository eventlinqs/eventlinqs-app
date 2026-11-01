import { SAME_START_WITHIN_MS, SAME_TITLE_SHARE, sameVenue, titleShare, titleWords, type ListingKey } from '@/lib/events/booking-links'
import { daysAhead, HORIZON_ZONE } from './horizon'
import type { CandidatePlan, FoundEvent, KnownEvent } from './collect'

/**
 * THE EXCEPTION QUEUE'S JUDGE (the engine plan's part E, 28 October 2026: "an exception queue for low-confidence rows";
 * the directive's section 21, "founder management by exception").
 *
 * A found night is high confidence only when nothing about it needs a person. Each reason below is one a person can
 * act on, and every reason that applies is given, in this order, so /admin/collected says why a row waits. Only a high
 * confidence row from a partner's own feed may publish without a person (./collect-run.ts); everything else queues.
 */

export type CandidateReason =
  /** The register has not verified the source's terms and page (listing_sources.verification). */
  | 'source_unverified'
  /** The venue has a name and no address, so the night cannot be placed on a map or matched to a host. */
  | 'no_venue_address'
  /** It starts at 00:00 in Melbourne: almost always a date published with no time. */
  | 'midnight_start'
  /** Its own words say cancelled, postponed or rescheduled. */
  | 'called_off_words'
  /** A night EventLinqs lists at this venue that day, title alike, now starts more than two hours away. */
  | 'time_changed'
  /** A night EventLinqs lists at this start, title alike, now names a different venue. */
  | 'venue_changed'
  /** A different night with a partly alike title is listed at the same venue that day: maybe the same, maybe not. */
  | 'similar_listing'

export const REASON_LABELS: Readonly<Record<CandidateReason, string>> = {
  source_unverified: 'Source not verified',
  no_venue_address: 'No venue address',
  midnight_start: 'Starts at midnight (no time given?)',
  called_off_words: 'Says cancelled, postponed or rescheduled',
  time_changed: 'Time changed on a listed night',
  venue_changed: 'Venue changed on a listed night',
  similar_listing: 'A similar night is listed there that day',
}

export type Confidence = 'high' | 'low'
export type Judgement = { confidence: Confidence; reasons: CandidateReason[] }

/** Below SAME_TITLE_SHARE (one event) and at or above this, two titles are alike enough to ask a person. */
export const SIMILAR_TITLE_SHARE = 0.25

const CALLED_OFF = /\b(cancell?ed|postponed|rescheduled)\b/i

const melbourneClock = new Intl.DateTimeFormat('en-AU', { timeZone: HORIZON_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

function keyOf(e: FoundEvent): ListingKey {
  return { venueId: null, venueName: e.venueName, venueAddress: e.venueAddress, title: e.title, startsAt: e.startsAt }
}

function sameDay(a: string, b: string): boolean {
  return daysAhead(new Date(a), new Date(b)) === 0
}

/**
 * A moved night is a strong claim, so its titles share at least two words, or a one-word title whole. titleShare alone
 * divides by the shorter title, and on 1 November 2026 the two-word 'Artists Assemble!' (a children's art club at
 * Newcomb Library) shared only 'artists' with 'Community Night for Artists & Creatives' at another Geelong venue an hour
 * later, scored a half and was read as that night moved.
 */
function sharesEnoughWords(a: string, b: string): boolean {
  const wa = titleWords(a)
  const wb = titleWords(b)
  let shared = 0
  for (const w of wa) if (wb.has(w)) shared += 1
  return shared >= Math.min(2, wa.size, wb.size) && shared > 0
}

/**
 * A changed fact on a night EventLinqs already lists: the same venue the same Melbourne day with a title alike but a
 * start more than two hours away (time_changed), or the same start with a title alike at another venue
 * (venue_changed). Next week's night of a weekly series is a different day, so it is never a moved night.
 */
export function factChange(
  e: FoundEvent,
  known: readonly KnownEvent[],
  /**
   * The source's own city. A night of ANOTHER city is never this night moved: on 1 November 2026, 119 Geelong library
   * nights waited as 'venue_changed' against Bendigo's same-named 'Toddler Time', and accepting one would have moved a
   * Bendigo night to a Geelong branch. A known night with no recorded city is still compared, as before.
   */
  citySlug: string | null = null,
): { eventId: string; change: 'time_changed' | 'venue_changed' } | null {
  const key = keyOf(e)
  for (const k of known) {
    if (citySlug && k.citySlug && k.citySlug.toLowerCase() !== citySlug.toLowerCase()) continue
    if (titleShare(k.title, e.title) < SAME_TITLE_SHARE || !sharesEnoughWords(k.title, e.title)) continue
    const apart = Math.abs(new Date(k.startsAt).getTime() - new Date(e.startsAt).getTime())
    const venue = sameVenue(k, key)
    if (venue && apart > SAME_START_WITHIN_MS && sameDay(k.startsAt, e.startsAt)) return { eventId: k.eventId, change: 'time_changed' }
    if (!venue && apart <= SAME_START_WITHIN_MS) return { eventId: k.eventId, change: 'venue_changed' }
  }
  return null
}

export function judgeCandidate(input: { plan: CandidatePlan; sourceVerified: boolean; known: readonly KnownEvent[] }): Judgement {
  const { plan, sourceVerified, known } = input
  const e = plan.event
  const reasons: CandidateReason[] = []
  if (!sourceVerified) reasons.push('source_unverified')
  if (!e.venueAddress || !e.venueAddress.trim()) reasons.push('no_venue_address')
  if (melbourneClock.format(new Date(e.startsAt)) === '00:00') reasons.push('midnight_start')
  if (CALLED_OFF.test(e.title) || CALLED_OFF.test(e.description ?? '')) reasons.push('called_off_words')
  if (plan.kind === 'changes_facts') reasons.push(plan.change)
  if (plan.kind === 'new') {
    const key = keyOf(e)
    const alike = known.some((k) => {
      const share = titleShare(k.title, e.title)
      return share >= SIMILAR_TITLE_SHARE && share < SAME_TITLE_SHARE && sameVenue(k, key) && sameDay(k.startsAt, e.startsAt)
    })
    if (alike) reasons.push('similar_listing')
  }
  return { confidence: reasons.length === 0 ? 'high' : 'low', reasons }
}
