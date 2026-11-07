import { fromZonedInputValue } from '@/lib/dates/event-time'
import type { BookingFacts, PageEvent, PageOffer } from './booking-facts'

/**
 * ORGANISER SELF-LISTING, THE CHECKS (Lawal's rulings of 8 November 2026, 07:01 (3) and 07:05 (2)). An organiser's
 * submission publishes itself once its facts are read against the organiser's own booking page, the way Eventbrite and
 * Humanitix publish a host's event (C:\dev\EVIDENCE\EL-8NOV\self-listing\leaders-self-listing.md). Pure, so every rule
 * is tested on its own.
 *
 * THE RULE, in Lawal's words: "when a check finds a wrong fact and the organiser's own booking page shows the right one,
 * the system corrects it from that page and publishes; it does not hold it. Only a submission that cannot be verified at
 * all (no booking page, spam, or a fake) is held." The page is read three ways, the surest first:
 *   1. THE EVENT ITSELF: the page's structured data (schema.org Event) names it. Its start, end, venue, address and
 *      price correct the submission's (TryBooking's page for Kyivska Perepichka states every one).
 *   2. A SESSION OF A FESTIVAL: the page is a festival over several days and one of its ticket types names the show,
 *      with its day and time ("Mr Snotbottom - all ages Saturday 11.30am", A$26, on the Canberra Bush Fringe Festival's
 *      Humanitix page). The session's day, time and price, and the festival's venue, correct the submission's.
 *   3. THE PAGE'S WORDS: no structured data names it (GroovyTown's page for A Moment of Sanity), so the page's own words
 *      must name the event and state its date; the organiser's other facts stand.
 * Held, with its reason in plain words: the page cannot be read; it does not name the event; it does not state its
 * date; it states the event cancelled or postponed; a festival's ticket types name the show but not when; it reads as
 * spam; the same event is already listed; it has already started.
 */

export type SelfListingSubmission = {
  readonly title: string
  readonly startsAt: string
  readonly endsAt: string | null
  readonly venueName: string
  readonly venueAddress: string
  readonly timezone: string
  readonly entry: 'free' | 'free_registration' | 'paid'
  readonly priceFromCents: number | null
  readonly description: string | null
  readonly bookingUrl: string
}

export type PageReading = { readonly ok: true; readonly facts: BookingFacts } | { readonly ok: false; readonly reason: string }

/** An upcoming event already listed: its title and its start. */
export type ListedNight = { readonly title: string; readonly startsAt: string }

export type Correction = {
  readonly field: 'start' | 'end' | 'venue' | 'address' | 'price' | 'entry'
  readonly submitted: string | null
  readonly page: string | null
}

export type PublishFacts = {
  readonly title: string
  readonly startsAt: string
  readonly endsAt: string | null
  readonly venueName: string
  readonly venueAddress: string
  readonly entry: 'free' | 'free_registration' | 'paid'
  readonly priceFromCents: number | null
  /** Who the page names as the event's host, for the photo credit; null when it names none. */
  readonly host: string | null
}

export type MatchedBy = 'structured_data' | 'ticket_type' | 'page_words'

export type SelfListingVerdict =
  | { readonly verdict: 'publish'; readonly facts: PublishFacts; readonly corrections: readonly Correction[]; readonly matchedBy: MatchedBy }
  | { readonly verdict: 'hold'; readonly reason: string }

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'your', 'our', 'this', 'that', 'live', 'night', 'event', 'tickets', 'show', 'all', 'ages'])

/** The words that name an event: lowercase, no accents or punctuation, no short or common words. Pure. */
export function nameWords(s: string | null | undefined): Set<string> {
  const words = (s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length >= 3 && !STOP.has(w))
  return new Set(words)
}

/** The share of a's words that b also holds (0 when a has none). Pure. */
export function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0) return 0
  let n = 0
  for (const w of a) if (b.has(w)) n += 1
  return n / a.size
}

/** A local date and clock in a zone, from an instant: { date: 'YYYY-MM-DD', time: 'HH:MM' }. Pure. */
export function localParts(iso: string, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Whether page words state this local date ('24 November', 'November 24th', '24/11/2026', '2026-11-24'). Pure. */
export function wordsStateDate(text: string, date: string): boolean {
  const [y, m, d] = date.split('-').map(Number)
  const mon = MONTHS[m - 1]
  const day = String(d)
  const patterns = [
    new RegExp(`\\b0?${day}(st|nd|rd|th)?\\s+(of\\s+)?${mon}[a-z]*\\b`),
    new RegExp(`\\b${mon}[a-z]*\\.?\\s+0?${day}(st|nd|rd|th)?\\b`),
    new RegExp(`\\b0?${day}[/.]0?${m}[/.](${y}|${String(y).slice(2)})\\b`),
    new RegExp(`\\b${date}\\b`),
  ]
  return patterns.some((p) => p.test(text))
}

const WEEKDAYS: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }

/** The day and time a ticket type names ('Mr Snotbottom - all ages Saturday 11.30am' is Saturday at 11:30). Pure. */
export function sessionOf(offerName: string): { weekday: number | null; time: string | null } {
  const w = /\b(sun|mon|tue|wed|thu|fri|sat)(day|sday|nesday|rsday|urday|s|t|r|rs)?\b/i.exec(offerName)
  const t = /\b(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)\b/i.exec(offerName)
  let time: string | null = null
  if (t) {
    const h = Number(t[1]) % 12 + (t[3].toLowerCase() === 'pm' ? 12 : 0)
    if (Number(t[1]) >= 1 && Number(t[1]) <= 12) time = `${String(h).padStart(2, '0')}:${t[2] ?? '00'}`
  }
  return { weekday: w ? WEEKDAYS[w[1].toLowerCase()] : null, time }
}

/** Every local date from the first to the last, inclusive. Pure. */
function datesBetween(first: string, last: string): string[] {
  const out: string[] = []
  for (let t = Date.parse(`${first}T00:00:00Z`); t <= Date.parse(`${last}T00:00:00Z`) && out.length < 62; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

const SPAM_WORDS = /\b(casino|crypto|bitcoin|forex|airdrop|viagra|cialis|escort|payday loan|betting tips|seo services|backlinks)\b/i
const SHORTENERS = /^(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|cutt\.ly|rebrand\.ly|shorturl\.at)$/i

const sameInstant = (a: string | null, b: string | null) => a !== null && b !== null && Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 60_000
const hasClock = (s: string | null): s is string => s !== null && /T\d{2}:\d{2}/.test(s)
const spanDays = (e: PageEvent) => (hasClock(e.startDate) && hasClock(e.endDate) ? (Date.parse(e.endDate) - Date.parse(e.startDate)) / 86_400_000 : 0)
const cents = (dollars: number) => Math.round(dollars * 100)

/** Whether an event of this title is already listed on the same local date. */
function alreadyListed(title: string, startsAt: string, tz: string, listed: readonly ListedNight[]): boolean {
  const mine = nameWords(title)
  const day = localParts(startsAt, tz).date
  return listed.some((l) => {
    const theirs = nameWords(l.title)
    return localParts(l.startsAt, tz).date === day && overlap(mine, theirs) >= 0.8 && overlap(theirs, mine) >= 0.8
  })
}

/** Path 1: the page event that IS this submission (its name, or the page's own title when it states one event). */
function theEvent(title: string, facts: BookingFacts): PageEvent | null {
  const mine = nameWords(title)
  let best: PageEvent | null = null
  let bestScore = 0
  for (const e of facts.events) {
    const s = overlap(mine, nameWords(e.name))
    if (s > bestScore) {
      best = e
      bestScore = s
    }
  }
  // A festival over several days is the event only when the submission names the festival itself.
  if (best && bestScore >= 0.5 && (spanDays(best) <= 1 || bestScore >= 0.8)) return best
  if (facts.events.length === 1 && spanDays(facts.events[0]) <= 1 && overlap(mine, nameWords(facts.title)) >= 0.5) return facts.events[0]
  return null
}

/** Path 2: the festival whose ticket types name this show, and those ticket types. */
function theSessions(title: string, facts: BookingFacts): { event: PageEvent; offers: PageOffer[] } | null {
  const mine = nameWords(title)
  for (const e of facts.events) {
    const offers = e.offers.filter((o) => overlap(mine, nameWords(o.name)) >= 0.6)
    if (offers.length) return { event: e, offers }
  }
  return null
}

export function judgeSelfListing(
  sub: SelfListingSubmission,
  reading: PageReading,
  listed: readonly ListedNight[],
  now: Date,
): SelfListingVerdict {
  const hold = (reason: string): SelfListingVerdict => ({ verdict: 'hold', reason })
  const tz = sub.timezone

  const host = new URL(sub.bookingUrl).hostname.replace(/^www\./, '')
  if (SHORTENERS.test(host)) return hold('Its booking link is a link shortener, so the page behind it cannot be checked.')
  const links = (sub.description ?? '').match(/https?:\/\//g)?.length ?? 0
  if (links > 3 || SPAM_WORDS.test(`${sub.title} ${sub.description ?? ''}`)) return hold('It reads as spam, not an event.')

  if (!reading.ok) return hold(`Its booking page could not be read (${reading.reason}).`)
  const facts = reading.facts
  if (SPAM_WORDS.test(facts.title ?? '')) return hold('Its booking page reads as spam, not an event.')

  const corrections: Correction[] = []
  let startsAt = sub.startsAt
  let endsAt = sub.endsAt
  let venueName = sub.venueName
  let venueAddress = sub.venueAddress
  let entry = sub.entry
  let price = sub.priceFromCents
  let pageHost: string | null = null
  let matchedBy: MatchedBy

  const correctStart = (to: string) => {
    if (sameInstant(to, startsAt)) return
    corrections.push({ field: 'start', submitted: startsAt, page: to })
    // The organiser's length of night travels with the corrected start, when they gave one.
    if (endsAt) endsAt = new Date(Date.parse(endsAt) + (Date.parse(to) - Date.parse(startsAt))).toISOString()
    startsAt = to
  }
  const correctVenue = (e: PageEvent) => {
    if (e.locationName && overlap(nameWords(venueName), nameWords(e.locationName)) < 0.5) {
      corrections.push({ field: 'venue', submitted: venueName, page: e.locationName })
      venueName = e.locationName
    }
    if (e.address && overlap(nameWords(venueAddress), nameWords(e.address)) < 0.5) {
      corrections.push({ field: 'address', submitted: venueAddress, page: e.address })
      venueAddress = e.address
    }
  }
  const correctPrice = (lowDollars: number | null, allFree: boolean) => {
    if (entry === 'paid' && allFree) {
      corrections.push({ field: 'entry', submitted: 'paid', page: 'free' })
      entry = 'free'
      price = null
    } else if (lowDollars !== null && lowDollars > 0) {
      if (entry !== 'paid') {
        corrections.push({ field: 'entry', submitted: entry, page: 'paid' })
        entry = 'paid'
      }
      if (price !== cents(lowDollars)) {
        corrections.push({ field: 'price', submitted: price === null ? null : (price / 100).toFixed(2), page: lowDollars.toFixed(2) })
        price = cents(lowDollars)
      }
    }
  }

  const e = theEvent(sub.title, facts)
  const sessions = e ? null : theSessions(sub.title, facts)
  if (e) {
    matchedBy = 'structured_data'
    pageHost = e.organiser
    if (e.status && /cancel|postpon/i.test(e.status)) return hold('Its booking page says the event is cancelled or postponed.')
    if (hasClock(e.startDate)) correctStart(new Date(e.startDate).toISOString())
    else if (e.startDate && /^\d{4}-\d{2}-\d{2}/.test(e.startDate)) {
      // The page states the day only: the day is corrected, the organiser's own clock kept.
      const mine = localParts(startsAt, tz)
      if (e.startDate.slice(0, 10) !== mine.date) correctStart(fromZonedInputValue(`${e.startDate.slice(0, 10)}T${mine.time}`, tz))
    }
    if (hasClock(e.endDate) && Date.parse(e.endDate) > Date.parse(startsAt) && !sameInstant(e.endDate, endsAt)) {
      corrections.push({ field: 'end', submitted: endsAt, page: new Date(e.endDate).toISOString() })
      endsAt = new Date(e.endDate).toISOString()
    }
    correctVenue(e)
    correctPrice(e.lowPrice, e.offers.length > 0 && e.offers.every((o) => o.price === 0) && (e.lowPrice === null || e.lowPrice === 0))
  } else if (sessions) {
    matchedBy = 'ticket_type'
    const fest = sessions.event
    pageHost = fest.organiser
    if (fest.status && /cancel|postpon/i.test(fest.status)) return hold('Its booking page says the festival is cancelled or postponed.')
    // The sessions the ticket types name, as instants: each weekday falls on one day of the festival.
    const first = fest.startDate ? localParts(new Date(fest.startDate).toISOString(), tz).date : null
    const last = fest.endDate ? localParts(new Date(fest.endDate).toISOString(), tz).date : first
    const named = sessions.offers
      .map((o) => ({ offer: o, ...sessionOf(o.name ?? '') }))
      .flatMap((s) => {
        if (s.weekday === null || s.time === null || !first || !last) return []
        const day = datesBetween(first, last).find((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === s.weekday)
        return day ? [{ offer: s.offer, at: fromZonedInputValue(`${day}T${s.time}`, tz) }] : []
      })
    if (named.length === 0) return hold("Its festival's booking page names the show but not when it is on.")
    // The session nearest the one the organiser gave: the same day first, then the nearest time.
    const mine = Date.parse(startsAt)
    const myDay = localParts(startsAt, tz).date
    const chosen = [...named].sort(
      (a, b) =>
        Number(localParts(b.at, tz).date === myDay) - Number(localParts(a.at, tz).date === myDay) ||
        Math.abs(Date.parse(a.at) - mine) - Math.abs(Date.parse(b.at) - mine),
    )[0]
    correctStart(chosen.at)
    // A session's end is not on the page; the organiser's own end stands only on the same day after the start.
    if (endsAt && (Date.parse(endsAt) <= Date.parse(startsAt) || localParts(endsAt, tz).date !== localParts(startsAt, tz).date)) endsAt = null
    correctVenue(fest)
    correctPrice(chosen.offer.price, chosen.offer.price === 0)
  } else {
    // No structured data names it: the page's own words must name it and state its date.
    const mine = nameWords(sub.title)
    const inWords = [...mine].filter((w) => facts.text.includes(w)).length / Math.max(1, mine.size)
    if (inWords < 0.6) return hold('Its booking page does not name this event.')
    if (!wordsStateDate(facts.text, localParts(startsAt, tz).date)) return hold("Its booking page does not state the event's date.")
    matchedBy = 'page_words'
  }

  if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) endsAt = null
  if (Date.parse(startsAt) <= now.getTime()) return hold('The event has already started.')
  if (alreadyListed(sub.title, startsAt, tz, listed)) return hold('The same event is already listed on that date.')

  return {
    verdict: 'publish',
    facts: { title: sub.title, startsAt, endsAt, venueName, venueAddress, entry, priceFromCents: price, host: pageHost },
    corrections,
    matchedBy,
  }
}
