import { providerOf, sameEvent, type BookingAvailability, type ListingKey } from '@/lib/events/booking-links'

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
  links: FoundLink[]
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
 * Every event a calendar feed publishes (RFC 5545 VEVENTs), read as the feed states it; anything it does not state stays
 * empty. A cancelled event is not taken, and neither is one with no LOCATION, since EventLinqs lists events people go
 * to. The LOCATION's first part, before a comma, is the venue's name and the whole line its address. A repeating event
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
      const venueName = location.split(',')[0]?.trim() ?? ''
      if (!title || !startsAt || !venueName) continue
      const own = e.get('URL') ? absolute(e.get('URL')!.value.trim(), pageUrl) : null
      const image = e.get('ATTACH') && /^image\//i.test(e.get('ATTACH')!.params['FMTTYPE'] ?? '') ? absolute(e.get('ATTACH')!.value.trim(), pageUrl) : null
      found.push({
        title: title.slice(0, 200),
        startsAt,
        endsAt: icsInstant(e.get('DTEND')),
        venueName,
        venueAddress: location.includes(',') ? location : null,
        pageUrl: own ?? pageUrl,
        imageUrl: image,
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
export type SourceChanges = 'weekly' | 'monthly' | 'rarely'

export type RegisteredSource = {
  id: string
  name: string
  pageUrl: string
  collection: CollectionPermission
  changes: SourceChanges
  lastCheckedAt: string | null
}

const RECHECK_DAYS: Readonly<Record<SourceChanges, number>> = { weekly: 6, monthly: 27, rarely: 89 }
const DAY_MS = 24 * 60 * 60 * 1000

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

/** Only what is still to come, and not more than this far ahead, is worth a person's review. */
export const COLLECT_AHEAD_DAYS = 120

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
    plans.push(listed ? { kind: 'adds_links', event, eventId: listed.eventId } : { kind: 'new', event })
  }
  return plans
}

/** The provider of every link, for the review screen ("Humanitix, Eventbrite"). */
export function providersOf(e: FoundEvent): string[] {
  return [...new Set(e.links.map((l) => providerOf(l.url)))]
}
