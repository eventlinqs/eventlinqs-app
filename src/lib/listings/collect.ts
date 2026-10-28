import { providerOf, sameEvent, type BookingAvailability, type ListingKey } from '@/lib/events/booking-links'
import { HORIZON_DAYS } from './horizon'
import { factChange } from './judge'

/**
 * THE WEEKLY COLLECTION RUN (the foundation's item 19, START-16OCT/EVENTLINQS-FOUNDATION-LOCKED-27OCT.md;
 * docs/walk-in/COLLECTION-RUN.md).
 *
 * "Weekly collection run that only reads sources whose terms allow it; everything reviewed before publishing."
 * Each source in the register (public.listing_sources) says what its own terms allow. The run reads only a source
 * marked 'read', only where its robots.txt allows the page, and only the page's own Event data (Google's structured
 * data, which a site publishes so that others read it). Every event found lands as a candidate for a person to
 * review; nothing is published by this run.
 *
 * Pure: the fetches and the writes are the caller's (src/lib/listings/collect-run.ts), so every rule here is driven
 * by its own test.
 */

/** The product token robots.txt groups are matched against (RFC 9309 2.2.1, case insensitive). */
export const COLLECTOR_PRODUCT = 'EventLinqs'
export const COLLECTOR_AGENT = 'EventLinqs/1.0 (+https://www.eventlinqs.com.au)'

/* ------------------------------------------------------------------ robots.txt, RFC 9309 */

type Rule = { allow: boolean; pattern: string }

/** The rules for our token, or the "*" group's when no group names us (RFC 9309 2.2.1). */
export function robotsRules(txt: string, product: string = COLLECTOR_PRODUCT): Rule[] {
  const groups: { agents: string[]; rules: Rule[] }[] = []
  let current: { agents: string[]; rules: Rule[] } | null = null
  let lastWasAgent = false
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line)
    if (!m) continue
    const key = m[1].toLowerCase()
    const value = m[2].trim()
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
    } else if (key === 'allow' || key === 'disallow') {
      lastWasAgent = false
      if (!current) continue
      /* An empty disallow allows everything: no rule. */
      if (value === '') continue
      current.rules.push({ allow: key === 'allow', pattern: value })
    } else {
      lastWasAgent = false
    }
  }
  const ours = groups.filter((g) => g.agents.includes(product.toLowerCase()))
  const chosen = ours.length > 0 ? ours : groups.filter((g) => g.agents.includes('*'))
  return chosen.flatMap((g) => g.rules)
}

function patternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$')
  const body = anchored ? pattern.slice(0, -1) : pattern
  const re = new RegExp('^' + body.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (anchored ? '$' : ''))
  return re.test(path)
}

/**
 * Whether the path may be read. "The most specific match found MUST be used" (the longest pattern); "If an "allow"
 * rule and a "disallow" rule are equivalent, then the "allow" rule SHOULD be used" (RFC 9309 2.2.2).
 */
export function robotsAllows(rules: readonly Rule[], path: string): boolean {
  let best: Rule | null = null
  for (const r of rules) {
    if (!patternMatches(r.pattern, path)) continue
    if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) best = r
  }
  return best === null || best.allow
}

/**
 * What robots.txt's own status says (RFC 9309 2.3.1.3 and 2.3.1.4): "the crawler MAY access any resources on the
 * server" on a 4xx; on a 5xx "the crawler MUST assume complete disallow". Anything we could not reach is a 5xx. A 429
 * is a site asking us to stop for now (Visit Ballarat answered one behind a bot checkpoint, 27 October 2026); the RFC
 * does not name it and its 4xx rule only permits, so it reads nothing.
 */
export function robotsVerdict(status: number | null, txt: string, path: string): 'allowed' | 'disallowed' {
  if (status !== null && status >= 200 && status < 300) return robotsAllows(robotsRules(txt), path) ? 'allowed' : 'disallowed'
  if (status !== null && status >= 400 && status < 500 && status !== 429) return 'allowed'
  return 'disallowed'
}

/* ------------------------------------------------------------------ the page's own Event data */

/** schema.org's Event and its subtypes a listing can be (https://schema.org/Event, "More specific Types"). */
const EVENT_TYPES = new Set([
  'event',
  'businessevent',
  'childrensevent',
  'comedyevent',
  'danceevent',
  'educationevent',
  'exhibitionevent',
  'festival',
  'foodevent',
  'literaryevent',
  'musicevent',
  'screeningevent',
  'socialevent',
  'sportsevent',
  'theaterevent',
  'visualartsevent',
])

export type FoundLink = { url: string; availability: BookingAvailability; priceFromCents: number | null }

export type FoundEvent = {
  title: string
  startsAt: string
  endsAt: string | null
  venueName: string
  venueAddress: string | null
  pageUrl: string
  imageUrl: string | null
  /** The source's own words about the event, as it states them; kept only where the source permits descriptions. */
  description: string | null
  links: FoundLink[]
}

/** Longest description a candidate carries (listing_candidates_description, 20261028140001), cut on a whole character. */
const DESCRIPTION_MAX = 2000

function descriptionOf(v: string | null): string | null {
  const t = (v ?? '').trim()
  return t ? Array.from(t).slice(0, DESCRIPTION_MAX).join('').trim() : null
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

function typesOf(node: { [k: string]: Json }): string[] {
  const t = node['@type']
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === 'string').map((x) => x.toLowerCase().replace(/^https?:\/\/schema\.org\//, ''))
}

function nodesOf(value: Json, out: { [k: string]: Json }[] = []): { [k: string]: Json }[] {
  if (Array.isArray(value)) value.forEach((v) => nodesOf(v, out))
  else if (value && typeof value === 'object') {
    out.push(value)
    if (value['@graph']) nodesOf(value['@graph'], out)
  }
  return out
}

function text(v: Json | undefined): string | null {
  if (typeof v === 'string') return v.trim() || null
  if (Array.isArray(v)) return text(v[0])
  if (v && typeof v === 'object') return text(v['url'] ?? v['name'] ?? v['@id'])
  return null
}

function addressOf(v: Json | undefined): string | null {
  if (typeof v === 'string') return v.trim() || null
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const parts = [v['streetAddress'], v['addressLocality'], v['addressRegion'], v['postalCode']].map((p) => (typeof p === 'string' ? p.trim() : '')).filter(Boolean)
    return parts.length > 0 ? parts.join(', ') : null
  }
  return null
}

/** Google's availability values (InStock, SoldOut, PreOrder; and schema.org's others) to the link's. */
function availabilityOf(v: Json | undefined): BookingAvailability {
  const a = (text(v) ?? '').toLowerCase().replace(/^https?:\/\/schema\.org\//, '')
  if (a === 'soldout' || a === 'outofstock' || a === 'discontinued') return 'sold_out'
  if (a === 'preorder' || a === 'presale') return 'not_yet'
  return 'on_sale'
}

function absolute(url: string | null, base: string): string | null {
  if (!url) return null
  try {
    const u = new URL(url, base)
    return u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

/** Every event a page publishes in its own JSON-LD, read as the page states it; anything it does not state stays empty. */
export function eventsFromHtml(html: string, pageUrl: string): FoundEvent[] {
  const found: FoundEvent[] = []
  const blocks = html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  for (const [, body] of blocks) {
    let parsed: Json
    try {
      parsed = JSON.parse(body.trim()) as Json
    } catch {
      continue
    }
    for (const node of nodesOf(parsed)) {
      if (!typesOf(node).some((t) => EVENT_TYPES.has(t))) continue
      const status = (text(node['eventStatus']) ?? '').toLowerCase()
      if (status.includes('cancelled') || status.includes('movedonline')) continue
      const title = text(node['name'])
      const startsAt = text(node['startDate'])
      const location = Array.isArray(node['location']) ? node['location'][0] : node['location']
      const place = location && typeof location === 'object' && !Array.isArray(location) ? location : null
      /* EventLinqs lists events people go to: the location must be a Place (or say no type), never anything else. */
      if (place && place['@type'] !== undefined && !typesOf(place).some((t) => t === 'place' || t.endsWith('venue') || t === 'localbusiness')) continue
      const venueName = place ? text(place['name']) : null
      if (!title || !startsAt || Number.isNaN(Date.parse(startsAt)) || !venueName) continue
      const offers = nodesOf(node['offers'] ?? null)
      const links: FoundLink[] = []
      for (const o of offers) {
        const url = absolute(text(o['url']), pageUrl)
        if (!url || links.some((l) => l.url === url)) continue
        const price = typeof o['price'] === 'number' ? o['price'] : typeof o['price'] === 'string' ? Number(o['price']) : NaN
        const currency = text(o['priceCurrency'])
        links.push({
          url,
          availability: availabilityOf(o['availability']),
          priceFromCents: Number.isFinite(price) && price >= 0 && (currency === null || currency === 'AUD') ? Math.round(price * 100) : null,
        })
      }
      const endsAt = text(node['endDate'])
      found.push({
        title,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt && !Number.isNaN(Date.parse(endsAt)) ? new Date(endsAt).toISOString() : null,
        venueName,
        venueAddress: place ? addressOf(place['address']) : null,
        pageUrl: absolute(text(node['url']), pageUrl) ?? pageUrl,
        imageUrl: absolute(text(node['image']), pageUrl),
        description: descriptionOf(typeof node['description'] === 'string' ? node['description'] : null),
        links,
      })
    }
  }
  return found
}

/* ------------------------------------------------------------------ calendar feeds, RFC 5545 */

/**
 * The zone a calendar's floating times are read in: every source in the register is Victorian (the four cities), so a
 * time with no zone of its own is Melbourne's wall clock, never the server's.
 */
const FEED_ZONE = 'Australia/Melbourne'

/** RFC 5545 3.1: "Unfolding is accomplished by removing the CRLF and the linear white-space character that immediately follows." */
function unfold(ics: string): string[] {
  return ics.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n')
}

/** RFC 5545 3.3.11: ESCAPED-CHAR = ("\\" / "\;" / "\," / "\N" / "\n"). */
function unescapeText(v: string): string {
  return v.replace(/\\([\\;,nN])/g,(_, c: string) => (c === 'n' || c === 'N' ? '\n' : c)).trim()
}

type IcsProp = { value: string; params: Record<string, string> }

function propOf(line: string): { name: string; prop: IcsProp } | null {
  /* The name and its parameters end at the first colon outside a quoted parameter value (RFC 5545 3.1). */
  let colon = -1
  for (let i = 0, quoted = false; i < line.length && colon < 0; i++) {
    if (line[i] === '"') quoted = !quoted
    else if (line[i] === ':' && !quoted) colon = i
  }
  if (colon <= 0) return null
  const [name, ...rawParams] = line.slice(0, colon).split(';')
  const params: Record<string, string> = {}
  for (const p of rawParams) {
    const eq = p.indexOf('=')
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '')
  }
  return { name: name.toUpperCase(), prop: { value: line.slice(colon + 1), params } }
}

/** A wall clock in a zone to its instant: two passes, as the offset depends on the instant being solved for. */
function wallClockToIso(y: number, mo: number, d: number, h: number, mi: number, s: number, zone: string): string | null {
  const offsetAt = (instant: number): number | null => {
    try {
      const at: Record<string, number> = {}
      for (const p of new Intl.DateTimeFormat('en-US', { timeZone: zone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(instant))) {
        if (p.type !== 'literal') at[p.type] = Number(p.value)
      }
      return Date.UTC(at.year, at.month - 1, at.day, at.hour % 24, at.minute, at.second) - instant
    } catch {
      return null
    }
  }
  const asIfUtc = Date.UTC(y, mo - 1, d, h, mi, s)
  const first = offsetAt(asIfUtc)
  if (first === null) return null
  const second = offsetAt(asIfUtc - first)
  if (second === null) return null
  return new Date(asIfUtc - second).toISOString()
}

/**
 * RFC 5545 3.3.5's three forms (FORM #2 "DATE WITH UTC TIME" ends in Z; FORM #3 names a TZID; FORM #1 is floating) and
 * 3.3.4's DATE, an all day event, read as the start of that day in the feed's zone.
 */
function icsInstant(prop: IcsProp | undefined): string | null {
  if (!prop) return null
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(prop.value.trim())
  if (!m) return null
  const [, y, mo, d, h = '00', mi = '00', s = '00', z] = m
  if (z) return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)).toISOString()
  return wallClockToIso(+y, +mo, +d, +h, +mi, +s, prop.params['TZID'] || FEED_ZONE)
}

/**
 * The venue a LOCATION names: its first part, before a comma, and of that the part before a spaced hyphen. Geelong
 * Regional Libraries' feed (28 October 2026) writes the venue, a spaced hyphen and a room, the room often empty:
 * "Geelong Library and Heritage Centre (The Dome) - ". A hyphen inside a name ("Biyal-a Armstrong Creek Library") stays.
 */
export function venueOfLocation(location: string): string {
  const first = location.split(',')[0] ?? ''
  return (first.split(/\s+-(?:\s|$)/)[0] ?? '').trim()
}

/**
 * Every event a calendar feed publishes (RFC 5545 VEVENTs), read as the feed states it; anything it does not state stays
 * empty. A cancelled event is not taken, and neither is one with no LOCATION, since EventLinqs lists events people go
 * to. The LOCATION's venue is venueOfLocation's and the whole line, where it has a comma, its address. A repeating event
 * (RRULE) is read at its first date only; the next run reads the feed again.
 */
export function eventsFromIcs(ics: string, pageUrl: string): FoundEvent[] {
  const found: FoundEvent[] = []
  let event: Map<string, IcsProp> | null = null
  for (const line of unfold(ics)) {
    const upper = line.trim().toUpperCase()
    if (upper === 'BEGIN:VEVENT') {
      event = new Map()
      continue
    }
    if (upper === 'END:VEVENT') {
      const e = event
      event = null
      if (!e) continue
      if ((e.get('STATUS')?.value ?? '').trim().toUpperCase() === 'CANCELLED') continue
      const title = e.get('SUMMARY') ? unescapeText(e.get('SUMMARY')!.value) : ''
      const startsAt = icsInstant(e.get('DTSTART'))
      const location = e.get('LOCATION') ? unescapeText(e.get('LOCATION')!.value).replace(/\s*\n\s*/g, ', ') : ''
      const venueName = venueOfLocation(location)
      if (!title || !startsAt || !venueName) continue
      const own = e.get('URL') ? absolute(e.get('URL')!.value.trim(), pageUrl) : null
      /* No address of its own: the feed's, told apart by the event's UID, so two events at one instant stay two. */
      const uid = e.get('UID')?.value.trim()
      const fallback = uid ? `${pageUrl.split('#')[0]}#${encodeURIComponent(uid)}` : pageUrl
      const image = e.get('ATTACH') && /^image\//i.test(e.get('ATTACH')!.params['FMTTYPE'] ?? '') ? absolute(e.get('ATTACH')!.value.trim(), pageUrl) : null
      found.push({
        title: title.slice(0, 200),
        startsAt,
        endsAt: icsInstant(e.get('DTEND')),
        venueName,
        venueAddress: location.includes(',') ? location : null,
        pageUrl: own ?? fallback,
        imageUrl: image,
        description: descriptionOf(e.get('DESCRIPTION') ? unescapeText(e.get('DESCRIPTION')!.value) : null),
        links: [],
      })
      continue
    }
    if (!event) continue
    const p = propOf(line)
    if (p && !event.has(p.name)) event.set(p.name, p.prop)
  }
  return found
}

/** What a source's answer holds: a calendar feed (RFC 5545) or a page with its own Event data. */
export function eventsFromBody(body: string, pageUrl: string): FoundEvent[] {
  return /^\s*BEGIN:VCALENDAR/i.test(body) ? eventsFromIcs(body, pageUrl) : eventsFromHtml(body, pageUrl)
}

/* ------------------------------------------------------------------ the register and the plan */

export type CollectionPermission = 'read' | 'ask' | 'never'
export type SourceChanges = 'daily' | 'weekly' | 'monthly' | 'rarely'

/**
 * What a source permits EventLinqs to use (the checklist's D4; listing_sources.permits_*, 20261028140001): its facts
 * (title, date, venue), its descriptions, its images and its links. The database allows descriptions and images only
 * where reuse of photos, posters and descriptions is answered yes, and refuses a candidate carrying what its source does
 * not permit.
 */
export type PermittedContent = { facts: boolean; descriptions: boolean; images: boolean; links: boolean }

/** The register's default, and what a source gives when nothing more is permitted. */
export const FACTS_ONLY: PermittedContent = Object.freeze({ facts: true, descriptions: false, images: false, links: false })

export type RegisteredSource = {
  id: string
  name: string
  pageUrl: string
  collection: CollectionPermission
  changes: SourceChanges
  lastCheckedAt: string | null
  /** The last moment a read of this source succeeded (listing_sources.last_success_at). */
  lastSuccessAt: string | null
  permits: PermittedContent
  /** The register has verified its terms and page (listing_sources.verification = 'verified'). */
  verified: boolean
  /**
   * A partner's own feed: an organiser submission or venue partnership source that names a real organiser
   * (listing_sources.organisation_id, not EventLinqs' own listings organisation) or a claimed venue (venue_id), and
   * names its venue and its category, so a night it gives can be published. Only a partner's high confidence finds are
   * accepted without a person (./collect-run.ts).
   */
  partner: boolean
  /** A partner source's own venue (listing_sources.venue_id): its nights publish there, and only nights held there. */
  partnerVenue: { name: string; address: string | null } | null
}

/**
 * A found event with only what its source permits: the image blank unless images are permitted, the description blank
 * unless descriptions are, no links unless links are. Null when the source permits no facts, so nothing lands.
 */
export function withPermittedContent(e: FoundEvent, permits: PermittedContent): FoundEvent | null {
  if (!permits.facts) return null
  return {
    ...e,
    imageUrl: permits.images ? e.imageUrl : null,
    description: permits.descriptions ? e.description : null,
    links: permits.links ? [...e.links] : [],
  }
}

/* A daily source is due again after 18 hours, so a run that starts a little early or late still reads it each day. */
const RECHECK_DAYS: Readonly<Record<SourceChanges, number>> = { daily: 0.75, weekly: 6, monthly: 27, rarely: 89 }
const DAY_MS = 24 * 60 * 60 * 1000

/** A source's pace, in days: how often its own page changes. */
export const PACE_DAYS: Readonly<Record<SourceChanges, number>> = { daily: 1, weekly: 7, monthly: 30, rarely: 90 }

/**
 * Whether a source's last successful collection is current (the checklist's D3): stale once it is more than twice its
 * pace old, 'never' when no read has succeeded yet.
 */
export function sourceFreshness(s: Pick<RegisteredSource, 'changes' | 'lastSuccessAt'>, now: Date): 'never' | 'fresh' | 'stale' {
  if (!s.lastSuccessAt) return 'never'
  return now.getTime() - new Date(s.lastSuccessAt).getTime() > 2 * PACE_DAYS[s.changes] * DAY_MS ? 'stale' : 'fresh'
}

/** Failed runs in a row from a source's newest, after which the register flags it for a person (the engine plan part A). */
export const FAILING_AFTER_RUNS = 3

/** How many of a source's newest runs failed one after another; runs are given newest first. */
export function failuresInARow(runs: readonly { succeeded: boolean }[]): number {
  const i = runs.findIndex((r) => r.succeeded)
  return i === -1 ? runs.length : i
}

/**
 * The acquisition order (the checklist's D5), as listing_sources.acquisition_order computes it from source_type:
 * 1 organiser submissions, 2 licensed datasets and feeds, 3 venue partnerships, 4 manual editorial discovery.
 */
export type SourceType = 'organiser_submission' | 'licensed_dataset' | 'subscription_feed' | 'venue_partnership' | 'manual_research'

export const ACQUISITION_PATHS: readonly { order: 1 | 2 | 3 | 4; label: string; types: readonly SourceType[] }[] = [
  { order: 1, label: 'Organiser submissions', types: ['organiser_submission'] },
  { order: 2, label: 'Licensed datasets and feeds', types: ['licensed_dataset', 'subscription_feed'] },
  { order: 3, label: 'Venue partnerships', types: ['venue_partnership'] },
  { order: 4, label: 'Manual editorial discovery', types: ['manual_research'] },
]

export const SOURCE_TYPE_LABELS: Readonly<Record<SourceType, string>> = {
  organiser_submission: 'Organiser submission',
  licensed_dataset: 'Licensed dataset',
  subscription_feed: 'Subscription feed',
  venue_partnership: 'Venue partnership',
  manual_research: 'Manual research',
}

/** The sources this run reads: only those whose terms allow it, each when its own pace says it is due. */
export function dueSources(sources: readonly RegisteredSource[], now: Date): RegisteredSource[] {
  return sources.filter(
    (s) =>
      s.collection === 'read' &&
      (s.lastCheckedAt === null || now.getTime() - new Date(s.lastCheckedAt).getTime() >= RECHECK_DAYS[s.changes] * DAY_MS),
  )
}

export type KnownEvent = ListingKey & { eventId: string }

export type CandidatePlan =
  | { kind: 'new'; event: FoundEvent }
  | { kind: 'adds_links'; event: FoundEvent; eventId: string }
  /** A night EventLinqs lists whose time or venue the source now states differently (./judge.ts): always a person. */
  | { kind: 'changes_facts'; event: FoundEvent; eventId: string; change: 'time_changed' | 'venue_changed' }

/**
 * Only what is still to come, and not more than this far ahead, is worth a person's review: the end of the rolling
 * horizon (./horizon.ts, 46 to 90 days for relationships). It was 120 before the engine plan of 28 October 2026.
 */
export const COLLECT_AHEAD_DAYS = HORIZON_DAYS.relationships

function keyOf(e: FoundEvent): ListingKey {
  return { venueId: null, venueName: e.venueName, venueAddress: e.venueAddress, title: e.title, startsAt: e.startsAt }
}

/**
 * What each found event becomes for review: a new listing, or a link added to an event EventLinqs already lists
 * (the 12:30 (1): "a second source adds a link, never a second card"). Two pages naming one event in one run are one
 * candidate with both pages' links.
 */
export function planCandidates(found: readonly FoundEvent[], known: readonly KnownEvent[], now: Date): CandidatePlan[] {
  const plans: CandidatePlan[] = []
  const limit = now.getTime() + COLLECT_AHEAD_DAYS * DAY_MS
  for (const e of found) {
    const at = new Date(e.startsAt).getTime()
    if (at < now.getTime() || at > limit) continue
    const same = plans.find((p) => sameEvent(keyOf(p.event), keyOf(e)))
    if (same) {
      for (const l of e.links) if (!same.event.links.some((x) => x.url === l.url)) same.event.links.push(l)
      continue
    }
    const listed = known.find((k) => sameEvent(k, keyOf(e)))
    const event = { ...e, links: [...e.links] }
    if (listed) {
      plans.push({ kind: 'adds_links', event, eventId: listed.eventId })
      continue
    }
    const moved = factChange(e, known)
    plans.push(moved ? { kind: 'changes_facts', event, eventId: moved.eventId, change: moved.change } : { kind: 'new', event })
  }
  return plans
}

/** The provider of every link, for the review screen ("Humanitix, Eventbrite"). */
export function providersOf(e: FoundEvent): string[] {
  return [...new Set(e.links.map((l) => providerOf(l.url)))]
}
