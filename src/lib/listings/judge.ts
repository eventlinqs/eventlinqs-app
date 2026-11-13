import { SAME_START_WITHIN_MS, SAME_TITLE_SHARE, sameVenue, titleShare, titleWords, type ListingKey } from '@/lib/events/booking-links'
import { daysAhead, HORIZON_ZONE } from './horizon'
import { classify } from '@/lib/categories/classify'
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
  /* ENGINE P0, the publication gate (the engine directive, Phase 5; LAW 19 section 4; migration 20261105160001). */
  /** Its stated UTC offset is not its venue zone's offset on that date: never shifted, never published unseen. */
  | 'offset_mismatch'
  /** The source gives a date with no time: no time is ever filled in. */
  | 'no_time'
  /** A concert, show, comedy or club night, or a match, starting 00:00 to 09:59 local, not stated in the page's words. */
  | 'implausible_time'
  /** One Event spanning more than a day with no performance of its own named. */
  | 'multi_day_span'
  /** Its ticket link answers 404 or 410 at the seller (LAW 19 section 4.2 (5); migration 20261106090001). */
  | 'link_unreached'
  /** Its source's canary is open and this record is outside the canary's tenth (LAW 19 section 7.4; migration 20261106170001). */
  | 'canary_hold'
  /* CAPTURE PUBLISHES BY ITSELF (./capture-rule.ts; Lawal's 10:42 to 11:05 of 13 November 2026; migration 20261113113001). */
  /** Its venue words name no venue EventLinqs holds in that city. */
  | 'venue_not_known'
  /** Its title is longer than a listing's 80 characters: a person names it. */
  | 'title_too_long'
  /** Its title carries a word the platform bans. */
  | 'banned_words'
  /** Neither its own words nor its source give a category. */
  | 'no_category'

export const REASON_LABELS: Readonly<Record<CandidateReason, string>> = {
  source_unverified: 'Source not verified',
  no_venue_address: 'No venue address',
  midnight_start: 'Starts at midnight (no time given?)',
  called_off_words: 'Says cancelled, postponed or rescheduled',
  time_changed: 'Time changed on a listed night',
  venue_changed: 'Venue changed on a listed night',
  similar_listing: 'A similar night is listed there that day',
  offset_mismatch: 'Its time zone offset is not the venue zone',
  no_time: 'No start time given',
  implausible_time: 'Starts before 10 am for its kind',
  multi_day_span: 'Spans several days with no performance named',
  link_unreached: 'Its ticket link does not reach the seller',
  canary_hold: 'Its source is in a canary; held until the canary passes',
  venue_not_known: 'Its venue is not one EventLinqs holds in that city',
  title_too_long: 'Its title is longer than 80 characters',
  banned_words: 'Its title carries a banned word',
  no_category: 'No category from its words or its source',
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
  /**
   * Everything the source states this read. A listed night whose OWN start the source still states has not moved: a found
   * night beside it the same day is a second session (the Little Mermaid's 1:30 pm and 7:00 pm, Geelong Arts Centre, 6
   * November 2026), never that night's time changed.
   */
  found: readonly FoundEvent[] = [],
): { eventId: string; change: 'time_changed' | 'venue_changed' } | null {
  const key = keyOf(e)
  const stillStated = (k: KnownEvent) =>
    found.some((f) => f !== e && Math.abs(new Date(f.startsAt).getTime() - new Date(k.startsAt).getTime()) < 60_000 && sameVenue(k, keyOf(f)) && titleShare(k.title, f.title) >= SAME_TITLE_SHARE)
  for (const k of known) {
    if (citySlug && k.citySlug && k.citySlug.toLowerCase() !== citySlug.toLowerCase()) continue
    if (titleShare(k.title, e.title) < SAME_TITLE_SHARE || !sharesEnoughWords(k.title, e.title)) continue
    if (stillStated(k)) continue
    const apart = Math.abs(new Date(k.startsAt).getTime() - new Date(e.startsAt).getTime())
    const venue = sameVenue(k, key)
    if (venue && apart > SAME_START_WITHIN_MS && sameDay(k.startsAt, e.startsAt)) return { eventId: k.eventId, change: 'time_changed' }
    if (!venue && apart <= SAME_START_WITHIN_MS) return { eventId: k.eventId, change: 'venue_changed' }
  }
  return null
}

/**
 * A ONE-OFF NIGHT MOVED TO ANOTHER DAY (LAW 19 section 4.2 (4), its date half; 6 November 2026). When EventLinqs lists
 * exactly one coming night of this event at this venue, the source now states exactly one night of it, and the two fall
 * on different days, the source has moved it: the listed night's id, for a time change a person decides. Never a second
 * night published beside the first. A recurring night (more than one listed, or more than one stated) is never paired,
 * so a weekly session entering the horizon stays new. Pure.
 */
export function movedToAnotherDay(
  e: FoundEvent,
  found: readonly FoundEvent[],
  known: readonly KnownEvent[],
  now: Date,
  citySlug: string | null = null,
): string | null {
  const alike = (k: ListingKey, f: FoundEvent) =>
    titleShare(k.title, f.title) >= SAME_TITLE_SHARE && sharesEnoughWords(k.title, f.title) && sameVenue(k, keyOf(f))
  const mine = known.filter(
    (k) =>
      (!citySlug || !k.citySlug || k.citySlug.toLowerCase() === citySlug.toLowerCase()) &&
      new Date(k.startsAt).getTime() >= now.getTime() &&
      alike(k, e),
  )
  if (mine.length !== 1 || sameDay(mine[0].startsAt, e.startsAt)) return null
  return found.filter((f) => alike(mine[0], f)).length === 1 ? mine[0].eventId : null
}

/** The night kinds an early start is implausible for (LAW 19 section 4): from the title's own words, or a match. */
const NIGHT_KINDS = new Set(['music', 'comedy', 'nightlife', 'theatre'])
const MATCH = /\s(?:v|vs)\.?\s/i
const melbourneHour = new Intl.DateTimeFormat('en-AU', { timeZone: HORIZON_ZONE, hour: 'numeric', hourCycle: 'h23' })

/** A night kind starting 00:00 to 09:59 local whose time was not read from the page's own words. Pure. */
export function implausibleStart(e: Pick<FoundEvent, 'title' | 'startsAt' | 'timeStatus' | 'timeFromWords'>): boolean {
  if (e.timeFromWords || e.timeStatus === 'date_only') return false
  if (Number(melbourneHour.format(new Date(e.startsAt))) >= 10) return false
  return NIGHT_KINDS.has(classify({ title: e.title }).primary ?? '') || MATCH.test(` ${e.title} `)
}

const folded = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * A found night of the same title inside an organiser's own published event (no listing series; its start day to its stated
 * end): that event, under the venue's other name, never a second listing. AMCF's organiser lists the festival at 'Fed
 * Square' from Friday 20 to Sunday 22 November 2026; Fed Square's feed states its days at 'Federation Square',
 * and on 5 November the partner rule published the Saturday and Sunday beside it (the engine accuracy sweep, 6 November).
 */
export function insideOwnEvent(e: Pick<FoundEvent, 'title' | 'startsAt'>, known: readonly KnownEvent[]): boolean {
  const t = new Date(e.startsAt).getTime()
  return known.some(
    (k) =>
      !k.seriesId &&
      Boolean(k.endsAt) &&
      folded(k.title) === folded(e.title) &&
      (sameDay(k.startsAt, e.startsAt) || (t >= new Date(k.startsAt).getTime() && t <= new Date(k.endsAt as string).getTime())),
  )
}

/** A source's site: the host of a page it was read from, lower case and 'www.' aside; null for no page. Pure. */
export function sourceHostOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).host.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

/**
 * ONE EVENT FROM TWO SOURCES (class N of the engine accuracy sweep; the CONTROLLER's 03:31 of 7 November 2026). The id of a
 * night ANOTHER source already lists with the same title on the same Melbourne day in the same city, at any venue; else
 * null. The City of Greater Geelong's feed listed 'Boost Mobile AUSX Open Geelong' at the venue 'AUSX Open' at 1:00 pm and
 * Kardinia Park's page gave 'AUSX Open Geelong' at GMHBA Stadium at 6:00 pm the same Saturday: a sponsor's name and a
 * second venue name, so neither the same-venue check below nor the hunt's same-title check saw one event twice. A source is
 * the site a night was read from (its host, 'www.' aside): the council's rows came from a hand import whose listing check
 * names www.geelongcity.vic.gov.au, so a source id alone would not have named them. A known night whose source is not on
 * record is never a twin (never guessed), and one site's own nights are never each other's twins (a library's same session
 * at two branches the same day is two sessions). Pure.
 */
export function crossSourceTwin(
  e: Pick<FoundEvent, 'title' | 'startsAt'>,
  known: readonly KnownEvent[],
  sourceHost: string,
  citySlug: string | null,
): string | null {
  const reading = sourceHost.toLowerCase().replace(/^www\./, '')
  for (const k of known) {
    if (!k.sourceHosts || k.sourceHosts.length === 0 || k.sourceHosts.includes(reading)) continue
    if (citySlug && k.citySlug && k.citySlug.toLowerCase() !== citySlug.toLowerCase()) continue
    if (!sameDay(k.startsAt, e.startsAt)) continue
    if (!oneTitle(k.title, e.title)) continue
    return k.eventId
  }
  return null
}

/**
 * Two sites name one event when its titles are the same, or the shorter, at least three words, sits wholly inside the
 * longer ('AUSX Open Geelong' inside 'Boost Mobile AUSX Open Geelong'). The judge's half share is too loose across sites:
 * put through production's 881 upcoming nights on 7 November 2026 it also called "Sailors' Rest New Year's Eve" and
 * "New Year's Eve Buffet Dinner", two venues' own dinners, one event. Pure.
 */
function oneTitle(a: string, b: string): boolean {
  if (folded(a) === folded(b)) return true
  const wa = titleWords(a)
  const wb = titleWords(b)
  const [short, long] = wa.size <= wb.size ? [wa, wb] : [wb, wa]
  return short.size >= 3 && [...short].every((w) => long.has(w))
}

export function judgeCandidate(input: {
  plan: CandidatePlan
  sourceVerified: boolean
  known: readonly KnownEvent[]
  /** The site reading this night (its host), and its city: with them, a night another site already lists that day waits. */
  sourceHost?: string | null
  citySlug?: string | null
}): Judgement {
  const { plan, sourceVerified, known, sourceHost, citySlug = null } = input
  const e = plan.event
  const reasons: CandidateReason[] = []
  if (!sourceVerified) reasons.push('source_unverified')
  if (!e.venueAddress || !e.venueAddress.trim()) reasons.push('no_venue_address')
  if (melbourneClock.format(new Date(e.startsAt)) === '00:00') reasons.push('midnight_start')
  if (e.calledOff || CALLED_OFF.test(e.title) || CALLED_OFF.test(e.description ?? '')) reasons.push('called_off_words')
  if (e.timeStatus === 'offset_mismatch') reasons.push('offset_mismatch')
  if (e.timeStatus === 'date_only') reasons.push('no_time')
  if (e.timeStatus === 'multi_day') reasons.push('multi_day_span')
  if (implausibleStart(e)) reasons.push('implausible_time')
  if (plan.kind === 'changes_facts') reasons.push(plan.change)
  if (plan.kind === 'new') {
    const key = keyOf(e)
    const alike = known.some((k) => {
      const share = titleShare(k.title, e.title)
      return share >= SIMILAR_TITLE_SHARE && share < SAME_TITLE_SHARE && sameVenue(k, key) && sameDay(k.startsAt, e.startsAt)
    })
    if (alike || insideOwnEvent(e, known) || (sourceHost && crossSourceTwin(e, known, sourceHost, citySlug) !== null)) reasons.push('similar_listing')
  }
  return { confidence: reasons.length === 0 ? 'high' : 'low', reasons }
}
