import { providerOf, sameEvent, type BookingAvailability, type ListingKey } from '@/lib/events/booking-links'
import { HORIZON_DAYS } from './horizon'
import { PLATFORM_TIME_ZONE, fromZonedInputValue } from '@/lib/dates/event-time'
import { factChange, movedToAnotherDay } from './judge'
import type { HuntSource } from './headline-hunt'
import type { SourceCanary } from './canary'

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
  /**
   * How far the start can be trusted (the engine directive, Phase 4; the independent review's defects 1 to 4): 'exact';
   * 'offset_mismatch' (the stated UTC offset is not the venue zone's on that date, never shifted); 'date_only' (no time
   * given, never filled in); 'multi_day' (one Event spanning days with no performance named). Absent means exact.
   */
  timeStatus?: 'exact' | 'offset_mismatch' | 'date_only' | 'multi_day'
  /** The start was read from the page's own visible words (a page rule), not only from a schema (LAW 19 section 4). */
  timeFromWords?: boolean
  /** The source marks it postponed or rescheduled (schema.org eventStatus): a person decides. */
  calledOff?: boolean
}

/** The zone a found night is read in when its source states no zone: the four guide cities are all in Victoria. */
export const SOURCE_ZONE = 'Australia/Melbourne'

/** A zone's UTC offset in minutes at an instant (DST aware). Pure. */
export function zoneOffsetMinutes(instant: number, zone: string): number | null {
  try {
    const at: Record<string, number> = {}
    for (const p of new Intl.DateTimeFormat('en-US', { timeZone: zone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(instant))) {
      if (p.type !== 'literal') at[p.type] = Number(p.value)
    }
    return Math.round((Date.UTC(at.year, at.month - 1, at.day, at.hour % 24, at.minute, at.second) - instant) / 60000)
  } catch {
    return null
  }
}

/**
 * A schema.org startDate as the engine reads it (the research note's order of trust, rule 4): with no offset, the venue
 * zone's wall clock; a date alone, that day with no time ('date_only', never a filled in time); with an offset, the instant
 * as stated, 'exact' only when that offset is the zone's own on that date, else 'offset_mismatch' (never shifted). Pure.
 */
export function readStartDate(raw: string, zone: string = SOURCE_ZONE): { startsAt: string; timeStatus: 'exact' | 'offset_mismatch' | 'date_only' } | null {
  const s = raw.trim()
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (dateOnly) {
    const at = wallClockToIso(+dateOnly[1], +dateOnly[2], +dateOnly[3], 0, 0, 0, zone)
    return at ? { startsAt: at, timeStatus: 'date_only' } : null
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i.exec(s)
  if (!m) {
    const t = Date.parse(s)
    return Number.isNaN(t) ? null : { startsAt: new Date(t).toISOString(), timeStatus: 'exact' }
  }
  const [, y, mo, d, h, mi, sec = '0', off] = m
  if (!off) {
    const at = wallClockToIso(+y, +mo, +d, +h, +mi, +sec, zone)
    return at ? { startsAt: at, timeStatus: 'exact' } : null
  }
  const t = Date.parse(s)
  if (Number.isNaN(t)) return null
  const stated = off.toUpperCase() === 'Z' ? 0 : (off[0] === '-' ? -1 : 1) * (Number(off.slice(1, 3)) * 60 + Number(off.slice(-2)))
  const own = zoneOffsetMinutes(t, zone)
  return { startsAt: new Date(t).toISOString(), timeStatus: own !== null && own === stated ? 'exact' : 'offset_mismatch' }
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

/**
 * Each performance an Event names (schema.org subEvent; the independent review's defect 4): a night of its own, taking
 * from its parent whatever it does not state itself (its name, place, offers, page). An Event with none is itself. Pure.
 */
function performancesOf(node: { [k: string]: Json }): { node: { [k: string]: Json }; isPerformance: boolean }[] {
  const subs = nodesOf(node['subEvent'] ?? null).filter((s) => s['startDate'] !== undefined)
  if (subs.length === 0) return [{ node, isPerformance: false }]
  return subs.map((s) => ({ node: { ...node, subEvent: null, endDate: null, ...s } as { [k: string]: Json }, isPerformance: true }))
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
    for (const parent of nodesOf(parsed)) {
      if (!typesOf(parent).some((t) => EVENT_TYPES.has(t))) continue
      for (const { node, isPerformance } of performancesOf(parent)) {
      const status = (text(node['eventStatus']) ?? '').toLowerCase()
      if (status.includes('cancelled') || status.includes('movedonline')) continue
      /* Postponed and rescheduled are kept, and held for a person (the independent review's defect 5). */
      const calledOff = status.includes('postponed') || status.includes('rescheduled')
      const title = text(node['name'])
      const rawStart = text(node['startDate'])
      const location = Array.isArray(node['location']) ? node['location'][0] : node['location']
      const place = location && typeof location === 'object' && !Array.isArray(location) ? location : null
      /* EventLinqs lists events people go to: the location must be a Place (or say no type), never anything else. */
      if (place && place['@type'] !== undefined && !typesOf(place).some((t) => t === 'place' || t.endsWith('venue') || t === 'localbusiness')) continue
      const venueName = place ? text(place['name']) : null
      const start = rawStart ? readStartDate(rawStart) : null
      if (!title || !start || !venueName) continue
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
      const rawEnd = text(node['endDate'])
      const end = rawEnd ? readStartDate(rawEnd) : null
      /* One Event spanning more than a day with no performance of its own named is held, never read as its first night. */
      const spansDays = !isPerformance && end !== null && Date.parse(end.startsAt) - Date.parse(start.startsAt) > DAY_MS
      found.push({
        title,
        startsAt: start.startsAt,
        endsAt: end && end.timeStatus !== 'date_only' ? end.startsAt : null,
        venueName,
        venueAddress: place ? addressOf(place['address']) : null,
        pageUrl: absolute(text(node['url']), pageUrl) ?? pageUrl,
        imageUrl: absolute(text(node['image']), pageUrl),
        description: descriptionOf(typeof node['description'] === 'string' ? node['description'] : null),
        links,
        timeStatus: start.timeStatus !== 'exact' ? start.timeStatus : spansDays ? 'multi_day' : 'exact',
        ...(calledOff ? { calledOff } : {}),
      })
      }
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

/** RFC 5545 3.3.11: ESCAPED-CHAR = ("\\" / "\;" / "\," / "\N" / "\n"). Text encoded twice is repaired as it is read. */
function unescapeText(v: string): string {
  /* Repaired before the trim: a twice-encoded no-break space at the end would otherwise lose its second half to trim()
     and leave its first character behind (Geelong Regional Libraries' feed, 1 November 2026). */
  return repairDoubleEncoded(v.replace(/\\([\\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c))).trim()
}

/* Windows-1252's characters at 0x80 to 0x9F, by code point (https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/WINDOWS/CP1252.TXT),
   the bytes a twice encoded text most often shows as. Written as numbers, so the source holds no such character. */
const CP1252_HIGH = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87],
  [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91],
  [0x2019, 0x92], [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97], [0x02dc, 0x98],
  [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
])

/** The byte a character stands for when UTF-8 was read as Windows-1252, or null. */
function byteOf(code: number): number | null {
  if (code < 0x100) return code
  return CP1252_HIGH.get(code) ?? null
}

/** A UTF-8 lead byte read as one character, followed by a continuation byte read as another. */
function looksTwiceEncoded(text: string): boolean {
  for (let i = 0; i + 1 < text.length; i++) {
    const lead = text.charCodeAt(i)
    const next = byteOf(text.charCodeAt(i + 1))
    if (lead >= 0xc2 && lead <= 0xf4 && next !== null && next >= 0x80 && next <= 0xbf) return true
  }
  return false
}

/**
 * Text a source encoded as UTF-8 twice (the registered trade mark sign arriving as the two characters U+00C2 U+00AE;
 * Geelong Regional Libraries' feed of 1 November 2026), read back as the source meant it: every character taken as its
 * Windows-1252 byte and the bytes read as UTF-8. Only where that reading is valid UTF-8 throughout; anything else, a
 * real accent included, is left alone.
 */
export function repairDoubleEncoded(text: string): string {
  if (!looksTwiceEncoded(text)) return text
  const bytes: number[] = []
  for (const ch of text) {
    const b = byteOf(ch.codePointAt(0)!)
    if (b === null) return text
    bytes.push(b)
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes))
  } catch {
    return text
  }
}

/**
 * A night's own page where its feed names none (RFC 5545 has URL, and not every feed writes it): a host whose event
 * pages are known by the feed's UID. Geelong Regional Libraries' events site serves each night at /event/<UID>
 * (https://events.grlc.vic.gov.au/event/17563312 read 200 on 1 November 2026, the UID of that night in its feed).
 */
const OWN_PAGE_BY_UID: Record<string, (uid: string) => string> = {
  'events.grlc.vic.gov.au': (uid) => `https://events.grlc.vic.gov.au/event/${encodeURIComponent(uid)}`,
}

function ownPageOf(feedUrl: string, uid: string | undefined): string | null {
  if (!uid || !/^[A-Za-z0-9._-]+$/.test(uid)) return null
  try {
    const rule = OWN_PAGE_BY_UID[new URL(feedUrl).hostname]
    return rule ? rule(uid) : null
  } catch {
    return null
  }
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
export function wallClockToIso(y: number, mo: number, d: number, h: number, mi: number, s: number, zone: string): string | null {
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
 * Windows time zone names, as a calendar exported from Outlook or Exchange writes them in a TZID, mapped to IANA zones by
 * CLDR's windowsZones.xml, territory 001 (https://github.com/unicode-org/cldr/blob/main/common/supplemental/windowsZones.xml,
 * read 6 November 2026), for Australia and its nearest neighbours. Intl reads none of these names: before this table a
 * Windows TZID made wallClockToIso answer null and the event was dropped in silence (the independent review's risk 10).
 */
export const WINDOWS_ZONES: Readonly<Record<string, string>> = {
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'E. Australia Standard Time': 'Australia/Brisbane',
  'Cen. Australia Standard Time': 'Australia/Adelaide',
  'AUS Central Standard Time': 'Australia/Darwin',
  'W. Australia Standard Time': 'Australia/Perth',
  'Tasmania Standard Time': 'Australia/Hobart',
  'Lord Howe Standard Time': 'Australia/Lord_Howe',
  'Aus Central W. Standard Time': 'Australia/Eucla',
  'New Zealand Standard Time': 'Pacific/Auckland',
  UTC: 'Etc/UTC',
}

function readableZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-AU', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/**
 * The IANA zone a TZID names: as written, a Windows name by CLDR, or a path ending in a zone
 * ('/mozilla.org/20050126_1/Australia/Melbourne'); the feed's zone when there is no TZID; null when nothing resolves it,
 * and the event is then read in the feed's zone and HELD (offset_mismatch), never dropped.
 */
export function icsZone(tzid: string | undefined): string | null {
  if (tzid === undefined || tzid.trim() === '') return FEED_ZONE
  const t = tzid.trim()
  if (WINDOWS_ZONES[t]) return WINDOWS_ZONES[t]
  if (readableZone(t)) return t
  const tail = /([A-Za-z]+(?:\/[A-Za-z_+-]+)+)$/.exec(t)?.[1]
  return tail && readableZone(tail) ? tail : null
}

/** One RFC 5545 date or date-time as it is written (3.3.4, 3.3.5), with the zone it is read in. */
type IcsTime = { y: number; mo: number; d: number; h: number; mi: number; s: number; utc: boolean; dateOnly: boolean; zone: string | null }

function icsTime(prop: IcsProp | undefined): IcsTime | null {
  if (!prop) return null
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(prop.value.trim())
  if (!m) return null
  const [, y, mo, d, h, mi, s, z] = m
  return { y: +y, mo: +mo, d: +d, h: +(h ?? 0), mi: +(mi ?? 0), s: +(s ?? 0), utc: Boolean(z), dateOnly: h === undefined, zone: z ? 'Etc/UTC' : icsZone(prop.params['TZID']) }
}

/** An IcsTime's instant: UTC as written, else the wall clock in its zone (the feed's when its TZID resolves to none). */
function isoOf(t: IcsTime, y = t.y, mo = t.mo, d = t.d): string | null {
  if (t.utc) return new Date(Date.UTC(y, mo - 1, d, t.h, t.mi, t.s)).toISOString()
  return wallClockToIso(y, mo, d, t.h, t.mi, t.s, t.zone ?? FEED_ZONE)
}

/**
 * RFC 5545 3.3.5's three forms (FORM #2 "DATE WITH UTC TIME" ends in Z; FORM #3 names a TZID; FORM #1 is floating) and
 * 3.3.4's DATE, an all-day event, read as the start of that day in the feed's zone.
 */
function icsInstant(prop: IcsProp | undefined): string | null {
  const t = icsTime(prop)
  return t ? isoOf(t) : null
}

/** An RRULE this reader expands (RFC 5545 3.3.10): DAILY, WEEKLY with BYDAY, MONTHLY with BYMONTHDAY or BYDAY. */
type IcsRule = { freq: 'DAILY' | 'WEEKLY' | 'MONTHLY'; interval: number; count: number | null; until: IcsTime | null; byDay: { n: number | null; wd: number }[]; byMonthDay: number[] }
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const RULE_PARTS = new Set(['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'BYMONTHDAY', 'WKST'])

/** The rule, or null for one with a part this reader does not expand: that event is read at its first date only. */
function rruleOf(value: string, zone: string | null): IcsRule | null {
  const parts = new Map(value.split(';').filter(Boolean).map((p): [string, string] => [p.split('=')[0].trim().toUpperCase(), (p.split('=')[1] ?? '').trim()]))
  const freq = parts.get('FREQ')
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY') return null
  if ([...parts.keys()].some((k) => !RULE_PARTS.has(k))) return null
  if ((parts.get('WKST') ?? 'MO').toUpperCase() !== 'MO') return null
  const interval = Number(parts.get('INTERVAL') ?? 1)
  if (!Number.isInteger(interval) || interval < 1) return null
  const count = parts.has('COUNT') ? Number(parts.get('COUNT')) : null
  if (count !== null && !(Number.isInteger(count) && count > 0)) return null
  let until: IcsTime | null = null
  if (parts.has('UNTIL')) {
    until = icsTime({ value: parts.get('UNTIL') ?? '', params: {} })
    if (!until) return null
    // A local UNTIL is read in the zone of its DTSTART; 'bounds the recurrence rule in an inclusive manner' (3.3.10).
    if (!until.utc) until = { ...until, zone, ...(until.dateOnly ? { h: 23, mi: 59, s: 59 } : {}) }
  }
  const byDay: IcsRule['byDay'] = []
  for (const tok of (parts.get('BYDAY') ?? '').split(',').filter(Boolean)) {
    const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(tok.toUpperCase())
    if (!m) return null
    const n = m[1] ? Number(m[1]) : null
    if (n !== null && (freq !== 'MONTHLY' || n === 0 || Math.abs(n) > 5)) return null
    byDay.push({ n, wd: WEEKDAYS.indexOf(m[2]) })
  }
  const byMonthDay = (parts.get('BYMONTHDAY') ?? '').split(',').filter(Boolean).map(Number)
  if (byMonthDay.some((n) => !Number.isInteger(n) || n === 0 || Math.abs(n) > 31)) return null
  if (byMonthDay.length && (freq !== 'MONTHLY' || byDay.length)) return null
  if (freq === 'DAILY' && byDay.length) return null
  return { freq, interval, count, until, byDay, byMonthDay }
}

const ICS_DAY_MS = 86_400_000

/** The local calendar dates of a recurrence set in order, DTSTART's first ('defines the first instance', 3.8.5.3), bounded. */
function* recurrenceDates(start: IcsTime, rule: IcsRule): Generator<{ y: number; mo: number; d: number }> {
  const at = (t: number) => {
    const dt = new Date(t)
    return { y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
  }
  const s0 = Date.UTC(start.y, start.mo - 1, start.d)
  yield at(s0)
  if (rule.freq === 'DAILY') {
    for (let k = 1; k <= 3660; k++) yield at(s0 + k * rule.interval * ICS_DAY_MS)
    return
  }
  if (rule.freq === 'WEEKLY') {
    const days = rule.byDay.length ? rule.byDay.map((b) => b.wd) : [new Date(s0).getUTCDay()]
    const monday = s0 - ((new Date(s0).getUTCDay() + 6) % 7) * ICS_DAY_MS
    for (let k = 0; k <= 530; k += rule.interval) {
      const week = [...new Set(days)].map((wd) => monday + k * 7 * ICS_DAY_MS + ((wd + 6) % 7) * ICS_DAY_MS).sort((a, b) => a - b)
      for (const t of week) if (t > s0) yield at(t)
    }
    return
  }
  for (let k = 0; k <= 240; k += rule.interval) {
    const y = start.y + Math.floor((start.mo - 1 + k) / 12)
    const mo = ((start.mo - 1 + k) % 12) + 1
    const len = new Date(Date.UTC(y, mo, 0)).getUTCDate()
    const ds: number[] = []
    if (rule.byMonthDay.length) {
      for (const n of rule.byMonthDay) ds.push(n > 0 ? n : len + 1 + n)
    } else if (rule.byDay.length) {
      for (const b of rule.byDay) {
        const all: number[] = []
        for (let d = 1; d <= len; d++) if (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() === b.wd) all.push(d)
        // '+1MO ... represents the first Monday within the month, whereas -1MO represents the last Monday' (3.3.10).
        if (b.n === null) ds.push(...all)
        else {
          const pick = b.n > 0 ? all[b.n - 1] : all[all.length + b.n]
          if (pick !== undefined) ds.push(pick)
        }
      }
    } else ds.push(start.d)
    for (const d of [...new Set(ds)].filter((d) => d >= 1 && d <= len).sort((a, b) => a - b)) {
      const t = Date.UTC(y, mo - 1, d)
      if (t > s0) yield at(t)
    }
  }
}

/** The most instances one rule lands in a run; the horizon ends a weekly rule long before it. */
const MAX_INSTANCES = 200

/**
 * Every instance of one VEVENT within the collection horizon: its DTSTART alone when it has no RRULE (or one this reader
 * does not expand), else each instance from now to the horizon, less every EXDATE ('excluding any start DATE-TIME values
 * specified by "EXDATE"', 3.8.5.1) and every instance an override replaces (RECURRENCE-ID, 3.8.4.4). Each instance keeps
 * the DTSTART's wall clock in its own zone, so a weekly 7 pm stays 7 pm across a daylight saving change.
 */
function instancesOf(e: Map<string, IcsProp>, exdates: IcsProp[], replaced: Set<number>, now: Date): { startsAt: string; endsAt: string | null }[] {
  const start = icsTime(e.get('DTSTART'))
  if (!start) return []
  const first = isoOf(start)
  if (!first) return []
  const end = icsInstant(e.get('DTEND'))
  const span = end ? Date.parse(end) - Date.parse(first) : null
  const rule = e.get('RRULE') ? rruleOf(e.get('RRULE')!.value, start.zone) : null
  if (!rule) return replaced.has(Date.parse(first)) ? [] : [{ startsAt: first, endsAt: end }]
  const out: { startsAt: string; endsAt: string | null }[] = []
  const excluded = new Set<number>()
  const excludedDays = new Set<string>()
  for (const x of exdates) {
    for (const v of x.value.split(',')) {
      const t = icsTime({ value: v, params: x.params })
      if (!t) continue
      if (t.dateOnly) excludedDays.add(`${t.y}-${t.mo}-${t.d}`)
      else {
        const iso = isoOf(t.utc || x.params['TZID'] ? t : { ...t, zone: start.zone })
        if (iso) excluded.add(Date.parse(iso))
      }
    }
  }
  const until = rule.until ? Date.parse(isoOf(rule.until) ?? '') : Infinity
  const horizon = now.getTime() + HORIZON_DAYS.relationships * ICS_DAY_MS
  let n = 0
  for (const day of recurrenceDates(start, rule)) {
    const iso = isoOf(start, day.y, day.mo, day.d)
    if (!iso) break
    const t = Date.parse(iso)
    if (t > until || t > horizon) break
    n += 1
    if (rule.count !== null && n > rule.count) break
    if (excluded.has(t) || excludedDays.has(`${day.y}-${day.mo}-${day.d}`) || replaced.has(t)) continue
    if (t < now.getTime() - ICS_DAY_MS) continue
    out.push({ startsAt: iso, endsAt: span !== null ? new Date(t + span).toISOString() : null })
    if (out.length >= MAX_INSTANCES) break
  }
  return out
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
 * is each of its instances within the collection horizon, less its EXDATEs and the instances its overrides replace; an
 * override (RECURRENCE-ID) is its own night, or no night when it is cancelled. A TZID nothing resolves is read in the
 * feed's zone and held for a person (offset_mismatch).
 */
export function eventsFromIcs(ics: string, pageUrl: string, now: Date = new Date()): FoundEvent[] {
  /* Two passes: every VEVENT first, so an override anywhere in the feed replaces its instance of the master. */
  const vevents: { props: Map<string, IcsProp>; exdates: IcsProp[] }[] = []
  let event: { props: Map<string, IcsProp>; exdates: IcsProp[] } | null = null
  for (const line of unfold(ics)) {
    const upper = line.trim().toUpperCase()
    if (upper === 'BEGIN:VEVENT') {
      event = { props: new Map(), exdates: [] }
      continue
    }
    if (upper === 'END:VEVENT') {
      if (event) vevents.push(event)
      event = null
      continue
    }
    if (!event) continue
    const p = propOf(line)
    if (!p) continue
    if (p.name === 'EXDATE') event.exdates.push(p.prop)
    else if (!event.props.has(p.name)) event.props.set(p.name, p.prop)
  }
  const replacedOf = new Map<string, Set<number>>()
  for (const v of vevents) {
    const uid = v.props.get('UID')?.value.trim()
    const rid = icsInstant(v.props.get('RECURRENCE-ID'))
    if (!uid || !rid) continue
    const set = replacedOf.get(uid) ?? new Set<number>()
    set.add(Date.parse(rid))
    replacedOf.set(uid, set)
  }
  const found: FoundEvent[] = []
  for (const { props: e, exdates } of vevents) {
    if ((e.get('STATUS')?.value ?? '').trim().toUpperCase() === 'CANCELLED') continue
    const title = e.get('SUMMARY') ? unescapeText(e.get('SUMMARY')!.value) : ''
    const location = e.get('LOCATION') ? unescapeText(e.get('LOCATION')!.value).replace(/\s*\n\s*/g, ', ') : ''
    const venueName = venueOfLocation(location)
    if (!title || !venueName) continue
    const uid = e.get('UID')?.value.trim()
    const override = e.has('RECURRENCE-ID')
    const instances = instancesOf(e, exdates, !override && uid ? (replacedOf.get(uid) ?? new Set()) : new Set(), now)
    if (instances.length === 0) continue
    const own = e.get('URL') ? absolute(e.get('URL')!.value.trim(), pageUrl) : ownPageOf(pageUrl, uid)
    /* No address of its own: the feed's, told apart by the event's UID, so two events at one instant stay two. */
    const fallback = uid ? `${pageUrl.split('#')[0]}#${encodeURIComponent(uid)}` : pageUrl
    const image = e.get('ATTACH') && /^image\//i.test(e.get('ATTACH')!.params['FMTTYPE'] ?? '') ? absolute(e.get('ATTACH')!.value.trim(), pageUrl) : null
    const start = icsTime(e.get('DTSTART'))
    const unresolved = start !== null && !start.utc && start.zone === null
    for (const { startsAt, endsAt } of instances) {
      found.push({
        title: title.slice(0, 200),
        startsAt,
        endsAt,
        venueName,
        venueAddress: location.includes(',') ? location : null,
        pageUrl: own ?? fallback,
        imageUrl: image,
        description: descriptionOf(e.get('DESCRIPTION') ? unescapeText(e.get('DESCRIPTION')!.value) : null),
        links: [],
        ...(unresolved ? { timeStatus: 'offset_mismatch' as const } : {}),
      })
    }
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
  /** The source's own city (listing_sources.city_slug): its fact changes and its known venues are this city's only. */
  citySlug?: string | null
  /** A headline venue's own What's on page on the daily big event hunt's list (./headline-hunt.ts), else null. */
  hunt?: HuntSource | null
  /**
   * A venue's own programme that publishes by the hunt's rule without joining the hunt's schedule (OWN_PROGRAMME_SOURCES,
   * ./headline-hunt.ts; Lawal's 10:42 of 13 November 2026), else null.
   */
  ownProgramme?: HuntSource | null
  /** Its open records canary (LAW 19 section 7.4, ./canary.ts), else null: a rule then publishes only its tenth. */
  canary?: SourceCanary
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

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
/** The pace, in hours, of a source holding nights in the next seven days (the ruling's floor of 6). */
const THIS_WEEK_RECHECK_HOURS = 6
/** How far ahead a night makes its source a this-week source. */
export const THIS_WEEK_DAYS = 7
/** The early morning run's hour, in the platform's zone: every source is read at least once a day from here. */
export const MORNING_RUN_HOUR = 4

/** The instant the current day's morning run began: today's 04:00 in the platform's zone, or yesterday's before it. */
export function morningRunStart(now: Date): number {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: PLATFORM_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const today = new Date(fromZonedInputValue(`${day}T0${MORNING_RUN_HOUR}:00`, PLATFORM_TIME_ZONE)).getTime()
  return today <= now.getTime() ? today : today - DAY_MS
}

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

/**
 * Whether a source's last check failed: it was checked, and no read has succeeded since (last_success_at moves only on
 * a read that succeeded, and last_checked_at on every check).
 */
export function lastCheckFailed(s: Pick<RegisteredSource, 'lastCheckedAt' | 'lastSuccessAt'>): boolean {
  if (s.lastCheckedAt === null) return false
  return s.lastSuccessAt === null || new Date(s.lastSuccessAt).getTime() < new Date(s.lastCheckedAt).getTime()
}

/**
 * The sources this run reads: only those whose terms allow it, each when the re-read schedule says it is due: every
 * source once a day from the morning run, one holding nights in the next seven days every 6 hours
 * (tests/unit/listings/this-week-read-hourly.test.ts). A source whose last check FAILED is therefore read again within
 * the day (the Supreme Specification's demonstration 18, 'a failed job is logged and recoverable';
 * tests/unit/listings/failed-source-retried.test.ts). The pace a source declares (changes) no longer stretches past a day.
 */
export function dueSources(sources: readonly RegisteredSource[], now: Date, thisWeek: ReadonlySet<string> = new Set()): RegisteredSource[] {
  return sources.filter((s) => {
    if (s.collection !== 'read') return false
    if (s.lastCheckedAt === null) return true
    /* THE RE-READ SCHEDULE (Lawal, 1 November 2026, 16:15; the controller's 16:15 (B)). Every source at least once a
       day, in the first run after 04:00 in the platform's zone, so each day's guide is right before people look; a
       source holding nights in the next seven days every 6 hours. A failed check is therefore retried within the day. */
    const last = new Date(s.lastCheckedAt).getTime()
    if (last < morningRunStart(now)) return true
    return thisWeek.has(s.id) && now.getTime() - last >= THIS_WEEK_RECHECK_HOURS * HOUR_MS
  })
}

/** citySlug: the night's own city (events.city_primary), so another city's same-named night is never 'this night moved'. */
/** seriesId: the regular night it is one date of (events.listing_series_id), null for an organiser's own night. */
export type KnownEvent = ListingKey & {
  eventId: string
  citySlug?: string | null
  seriesId?: string | null
  /** Its stated end, where it has one: an organiser's own event spanning days covers every night inside it (./judge.ts). */
  endsAt?: string | null
  /** The sites its series was read from (hosts, 'www.' aside), where on record: a night another site lists is one event twice. */
  sourceHosts?: readonly string[] | null
}

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
export function planCandidates(
  found: readonly FoundEvent[],
  known: readonly KnownEvent[],
  now: Date,
  /** The source's own city (listing_sources.city_slug): a fact change is only ever a night of this city. */
  citySlug: string | null = null,
): CandidatePlan[] {
  const plans: CandidatePlan[] = []
  const limit = now.getTime() + COLLECT_AHEAD_DAYS * DAY_MS
  for (const e of found) {
    const at = new Date(e.startsAt).getTime()
    if (at < now.getTime() || at > limit) continue
    /* TWO SESSIONS STAY TWO (car 46; the independent review's defect 6): what ONE source states at two exact starts, on
       one page or two (a 2 pm and a 4 pm matinee; Geelong Regional Libraries' Baby time at 10:30 and 11:30 on 16 November,
       events 17255956 and 17245487), is two sessions, never one; only the same exact start, stated twice, is one night. */
    const time = (iso: string) => new Date(iso).getTime()
    const same = plans.find((p) => sameEvent(keyOf(p.event), keyOf(e)) && time(p.event.startsAt) === at)
    if (same) {
      for (const l of e.links) if (!same.event.links.some((x) => x.url === l.url)) same.event.links.push(l)
      continue
    }
    /* A listed night is this session only when its start is this one, or when this source states no session at its start
       (then the source has moved it: a time change for a person, below). */
    const listed = known.find(
      (k) => sameEvent(k, keyOf(e)) && (time(k.startsAt) === at || !found.some((f) => f !== e && time(f.startsAt) === time(k.startsAt) && sameEvent(keyOf(f), k))),
    )
    const event = { ...e, links: [...e.links] }
    /* A LISTED NIGHT AT ANOTHER TIME IS A CHANGE, NEVER A CONFIRMATION (car 46; LAW 19 section 4: a time that differs from
       the last verified value is held). sameEvent's two hour window finds the night; a start a minute or more away from
       the one held is a time change for a person, never a silent 'adds_links' that confirms the stale time (Geelong
       Regional Libraries' 'Baby time', 16 November: 10:30 on its page, 11:30 held, confirmed daily from 2 November). */
    if (listed && Math.abs(new Date(listed.startsAt).getTime() - at) >= 60_000) {
      plans.push({ kind: 'changes_facts', event, eventId: listed.eventId, change: 'time_changed' })
      continue
    }
    if (listed) {
      plans.push({ kind: 'adds_links', event, eventId: listed.eventId })
      continue
    }
    const moved = factChange(e, known, citySlug, found)
    if (moved) {
      plans.push({ kind: 'changes_facts', event, eventId: moved.eventId, change: moved.change })
      continue
    }
    /* A one-off night the source moved to another day is a time change for a person, never a second night beside the
       first (LAW 19 section 4.2 (4), its date half; tests/unit/listings/law19-publication-gate.test.ts). */
    const movedDay = movedToAnotherDay(e, found, known, now, citySlug)
    plans.push(movedDay ? { kind: 'changes_facts', event, eventId: movedDay, change: 'time_changed' } : { kind: 'new', event })
  }
  return plans
}

/**
 * THE CLIFF (the controller's 15:40 of 1 November 2026). A night a source lists again, that EventLinqs already holds as
 * one date of a regular series, confirms that series: one check per series per read, from the page it was found on.
 * Only a plain re-find counts; a night found with different facts (changes_facts) goes to a person and confirms nothing.
 */
export function seriesConfirmations(
  plans: readonly { kind: string; eventId?: string; event: { pageUrl: string } }[],
  known: readonly KnownEvent[],
): { seriesId: string; sourceUrl: string }[] {
  const out: { seriesId: string; sourceUrl: string }[] = []
  for (const p of plans) {
    if (p.kind !== 'adds_links' || !p.eventId) continue
    const seriesId = known.find((k) => k.eventId === p.eventId)?.seriesId
    if (!seriesId || out.some((c) => c.seriesId === seriesId)) continue
    out.push({ seriesId, sourceUrl: p.event.pageUrl })
  }
  return out
}

/** The provider of every link, for the review screen ("Humanitix, Eventbrite"). */
export function providersOf(e: FoundEvent): string[] {
  return [...new Set(e.links.map((l) => providerOf(l.url)))]
}
