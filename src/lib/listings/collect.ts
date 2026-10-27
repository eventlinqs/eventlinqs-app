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
