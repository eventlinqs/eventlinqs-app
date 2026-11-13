import { COLLECTOR_AGENT, eventsFromBody, robotsVerdict } from './collect'
import { FETCH_TIMEOUT_MS, type Fetcher } from './collect-run'
import { scoutSite } from './source-scout'
import { fold } from './headline-hunt'
import { CAPTURE_RULE_CITIES, type CaptureCity } from './capture-rule'

/**
 * THE SCOUT RUNS ITSELF (Lawal's 10:42 of 13 November 2026: 'the scout runs itself nightly, reads robots and terms, adds
 * every source that permits and has event data'; the Engine Book's capture section, part 8). Once a night, inside the
 * collection run's own budget (no schedule added), it tries a few sites EventLinqs already knows (venues and organisers
 * in the CRM with a website) that are not yet sources, politely (our named reader, robots.txt first, one request a
 * second, a stop at the first 403 or 429), and registers a site as a source when ALL of these hold:
 *
 *   1. robots.txt allows the page it would read;
 *   2. the page carries a reader the engine already has without a person: a calendar feed or the page's own schema.org
 *      Event data (a site that needs a page rule written is listed for a window instead);
 *   3. a dry run of the engine itself reads at least one future night from it, and that night is placed in one of the
 *      guide cities (a venue's own city, or for an organiser the city of a venue EventLinqs holds that its nights name);
 *   4. its terms permit: no terms page found, or every terms page found says nothing of automated reading, robots,
 *      scraping, crawling, data mining, harvesting, extraction, reproduction, republishing or commercial use (the fixed
 *      words below; any one refuses, quoted). Facts and links only, never images or descriptions: the shape Lawal turned
 *      to 'read' for AAMI Park on 5 November and this morning's sources were registered in.
 *
 * Each registration is written the way the morning's reviewed writes were (listing_sources_read_needs_permission,
 * _read_needs_terms, _verified_is_dated), its robots and terms quoted with the page and the day; the collection run reads
 * it from its next turn and the capture rule publishes its checked nights. A refused or unreadable site is skipped and
 * said in the run's result; nothing is guessed.
 */

/** Sites tried a night: each costs about eight requests at one a second. */
export const SCOUT_PER_NIGHT = 12

/**
 * The hour of the collection run that scouts, in Melbourne: the 23:25 turn, the night's (Lawal's 'nightly'), so a source
 * it registers is read in the next morning's 05:25 turn; and the first scheduled proof falls the night it ships (his
 * 12:40 of 13 November 2026: every engine finished tonight).
 */
export const SCOUT_HOUR = 23

/** Any one of these in a terms page refuses the site (the Engine Book's capture section, part 8). */
export const TERMS_REFUSE: readonly { name: string; re: RegExp }[] = [
  { name: 'automated', re: /\bautomat(?:ed|ic|ically|ion)\b/i },
  { name: 'robot', re: /\brobots?\b(?!\.txt)/i },
  { name: 'scraping', re: /\bscrap(?:e|es|ed|ing|er|ers)\b/i },
  { name: 'crawling', re: /\bcrawl(?:s|ed|ing|er|ers)?\b/i },
  { name: 'spider', re: /\bspiders?\b/i },
  { name: 'data mining', re: /\bdata[\s-]mining\b/i },
  { name: 'harvesting', re: /\bharvest(?:s|ed|ing)?\b/i },
  { name: 'extraction', re: /\bextract(?:s|ed|ing|ion)?\b/i },
  { name: 'reproduction', re: /\breproduc(?:e|es|ed|ing|tion)\b/i },
  { name: 'republishing', re: /\brepublish(?:es|ed|ing)?\b/i },
  { name: 'commercial use', re: /\bcommercial(?:ly)?\b/i },
]

/** The usual addresses of a site's terms, tried when its home page links none. */
export const TERMS_PATHS = ['/terms', '/terms-of-use', '/terms-and-conditions', '/copyright', '/disclaimer'] as const

/** Where a site's own nights are usually listed, tried in order after its home page. */
export const EVENT_PATHS = ['/events', '/whats-on', '/gigs', '/shows'] as const

/** The visible text of a page, its markup and scripts dropped. Pure. */
export function pageText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The site's own terms pages its page links (same host), by their words or address. Pure. */
export function termsLinks(html: string, base: string): string[] {
  let host = ''
  try {
    host = new URL(base).hostname.replace(/^www\./, '')
  } catch {
    return []
  }
  const out: string[] = []
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const words = pageText(m[2])
    if (!/\b(terms|conditions|copyright|legal|disclaimer)\b/i.test(`${m[1]} ${words}`)) continue
    if (/\b(ticket|sale|refund|privacy|booking|hire|purchase)\b/i.test(words) && !/\b(use|website|site)\b/i.test(words)) continue
    try {
      const u = new URL(m[1].replace(/&amp;/g, '&'), base)
      if (u.hostname.replace(/^www\./, '') !== host) continue
      u.hash = ''
      if (!out.includes(u.toString())) out.push(u.toString())
    } catch {
      continue
    }
  }
  return out.slice(0, 3)
}

export type TermsJudgement = { permits: true; quote: string } | { permits: false; word: string; quote: string }

/** The sentence of a text a word sits in, trimmed to a quote. Pure. */
function sentenceAround(text: string, at: number): string {
  const start = Math.max(text.lastIndexOf('. ', at) + 2, at - 220, 0)
  const endDot = text.indexOf('. ', at)
  const end = Math.min(endDot === -1 ? text.length : endDot + 1, at + 220)
  return text.slice(start, end).trim()
}

/**
 * The terms pages' verdict by the fixed words: the first refusing word found, quoted in its sentence; else they permit,
 * said as what was read (the shape of this morning's quotes). `read` names the pages and the day. Pure.
 */
export function judgeTerms(pages: readonly { url: string; text: string }[], day: string): TermsJudgement {
  for (const p of pages) {
    for (const w of TERMS_REFUSE) {
      const m = w.re.exec(p.text)
      if (m) return { permits: false, word: w.name, quote: `${sentenceAround(p.text, m.index)} (${p.url}, read ${day})` }
    }
  }
  if (pages.length === 0) {
    return {
      permits: true,
      quote: `No terms of use or copyright page is linked from its page or found at ${TERMS_PATHS.join(', ')} (read ${day} by the nightly scout); facts and links only.`,
    }
  }
  return {
    permits: true,
    quote: `Its terms (${pages.map((p) => p.url).join(', ')}) say nothing of automated reading, robots, scraping, data mining, reproduction or commercial use (read ${day} by the nightly scout); facts and links only.`,
  }
}

export type ScoutCandidate = {
  /** Who the site belongs to, as EventLinqs holds them. */
  name: string
  kind: 'venue' | 'organiser'
  website: string
  /** A venue's own city; an organiser's is read from its nights. */
  citySlug: CaptureCity | null
  venueId: string | null
}

/** The city most of the nights' venues sit in, among venues EventLinqs holds; null when none matches. Pure. */
export function cityOfNights(
  nights: readonly { venueName: string }[],
  knownByCity: ReadonlyMap<CaptureCity, readonly string[]>,
): CaptureCity | null {
  let best: CaptureCity | null = null
  let bestCount = 0
  for (const [city, venues] of knownByCity) {
    const folded = new Set(venues.map(fold))
    const count = nights.filter((n) => folded.has(fold(n.venueName))).length
    if (count > bestCount) {
      best = city
      bestCount = count
    }
  }
  return best
}

/** The night's rotation: a stable order that changes each day, so every candidate is tried in turn. Pure. */
export function scoutOrder<C extends { website: string }>(candidates: readonly C[], day: string): C[] {
  const key = (s: string) => {
    let h = 2166136261
    for (const ch of `${day}|${s}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
    return h
  }
  return [...candidates].sort((a, b) => key(a.website) - key(b.website))
}

export type ScoutRegistration = {
  name: string
  kind: 'venue' | 'organiser'
  citySlug: CaptureCity
  pageUrl: string
  robotsUrl: string
  robotsQuote: string
  termsUrl: string
  termsQuote: string
  adapter: 'ics' | 'jsonld'
  venueId: string | null
  day: string
}

export type ScoutOutcome = { site: string; outcome: string; registered: boolean }

export interface ScoutStore {
  /** Venues in the guide cities and CRM organisers with a website whose host is no source yet. */
  candidates(): Promise<ScoutCandidate[]>
  /** The venues EventLinqs holds in each guide city (the capture rule's own list). */
  knownVenueNames(citySlug: string): Promise<readonly string[]>
  /** Writes the source, read and verified, as the morning's reviewed writes did; false when its page is already one. */
  register(row: ScoutRegistration): Promise<boolean>
}

async function get(fetcher: Fetcher, url: string): Promise<{ status: number | null; body: string }> {
  try {
    const res = await fetcher(url, { headers: { 'User-Agent': COLLECTOR_AGENT, Accept: 'text/html,text/calendar,text/plain' }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    return { status: res.status, body: res.status >= 200 && res.status < 300 ? await res.text() : '' }
  } catch {
    return { status: null, body: '' }
  }
}

const melbourneDay = (at: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)

/** The robots.txt lines that decide the page, quoted (or the plain fact when it sets none). Pure. */
function robotsQuote(status: number | null, body: string, day: string): string {
  if (status === 404 || (status !== null && status >= 200 && status < 300 && !body.trim())) return `robots.txt sets no rule for any agent (read ${day}).`
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^(user-agent|allow|disallow|sitemap)\s*:/i.test(l)).slice(0, 12)
  return `${lines.map((l) => `[${l}]`).join(' ')} (read ${day})`.slice(0, 2000)
}

/**
 * One night's scouting: tries up to `cap` candidates in today's order, each politely, and registers each that passes
 * every check above. Stops when the deadline nears. Returns what happened at each site.
 */
export async function runScout(
  store: ScoutStore,
  fetcher: Fetcher,
  now: Date,
  deadline: number,
  options: { cap?: number; pauseMs?: number } = {},
): Promise<ScoutOutcome[]> {
  const cap = options.cap ?? SCOUT_PER_NIGHT
  const pauseMs = options.pauseMs ?? 1000
  const day = melbourneDay(now)
  const pause = () => (pauseMs > 0 ? new Promise((r) => setTimeout(r, pauseMs)) : Promise.resolve())
  const out: ScoutOutcome[] = []
  const knownByCity = new Map<CaptureCity, readonly string[]>()
  for (const city of CAPTURE_RULE_CITIES) {
    try {
      knownByCity.set(city, await store.knownVenueNames(city))
    } catch {
      knownByCity.set(city, [])
    }
  }
  for (const c of scoutOrder(await store.candidates(), day).slice(0, cap)) {
    if (Date.now() >= deadline) break
    let origin: string
    try {
      origin = new URL(c.website).origin
    } catch {
      out.push({ site: c.website, outcome: 'not an address', registered: false })
      continue
    }
    const robots = await get(fetcher, `${origin}/robots.txt`)
    if (robots.status === 403 || robots.status === 429 || (robots.status !== null && robots.status >= 500) || robots.status === null) {
      out.push({ site: origin, outcome: `robots.txt answered ${robots.status ?? 'nothing'}: not read`, registered: false })
      continue
    }
    const sitemapUrls = [...robots.body.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1])
    let found: { url: string; adapter: 'ics' | 'jsonld'; feed: string | null; body: string } | null = null
    let refused: string | null = null
    let homeHtml = ''
    for (const path of ['', ...EVENT_PATHS]) {
      const url = path ? `${origin}${path}` : c.website
      const at = new URL(url)
      if (robotsVerdict(robots.status, robots.body, at.pathname + at.search) === 'disallowed') continue
      await pause()
      const page = await get(fetcher, url)
      if (page.status === 403 || page.status === 429) {
        refused = `the site answered ${page.status}: never read`
        break
      }
      if (!path) homeHtml = page.body
      const v = scoutSite({ url, robotsAllowed: true, status: page.status, html: page.body, sitemapUrls })
      if (v.adapter === 'ics' || v.adapter === 'jsonld') {
        found = { url, adapter: v.adapter, feed: v.adapter === 'ics' ? (v.feeds.find((f) => /^https:/i.test(f)) ?? null) : null, body: page.body }
        if (!homeHtml) homeHtml = page.body
        break
      }
    }
    if (refused) {
      out.push({ site: origin, outcome: refused, registered: false })
      continue
    }
    if (!found || (found.adapter === 'ics' && !found.feed)) {
      out.push({ site: origin, outcome: 'no calendar feed or Event data on its page: a page rule would be needed', registered: false })
      continue
    }
    const readUrl = found.feed ?? found.url
    const readAt = new URL(readUrl)
    if (readAt.origin !== origin || robotsVerdict(robots.status, robots.body, readAt.pathname + readAt.search) === 'disallowed') {
      out.push({ site: origin, outcome: 'its feed is on another site or barred by robots.txt', registered: false })
      continue
    }
    let text = found.body
    if (found.feed) {
      await pause()
      text = (await get(fetcher, found.feed)).body
    }
    const nights = eventsFromBody(text, readUrl).filter((e) => Date.parse(e.startsAt) > now.getTime())
    if (nights.length === 0) {
      out.push({ site: origin, outcome: 'the engine reads no future night from it', registered: false })
      continue
    }
    const city = c.citySlug ?? cityOfNights(nights, knownByCity)
    if (!city) {
      out.push({ site: origin, outcome: `${nights.length} future night(s), none at a venue EventLinqs holds in a guide city`, registered: false })
      continue
    }
    const termsPages: { url: string; text: string }[] = []
    const linked = termsLinks(homeHtml, c.website)
    const tries = linked.length > 0 ? linked : TERMS_PATHS.map((p) => `${origin}${p}`)
    for (const t of tries) {
      const at = new URL(t)
      if (robotsVerdict(robots.status, robots.body, at.pathname) === 'disallowed') continue
      await pause()
      const page = await get(fetcher, t)
      if (page.status === 403 || page.status === 429) {
        refused = `the site answered ${page.status} on its terms: never read`
        break
      }
      if (page.status !== null && page.status >= 200 && page.status < 300 && page.body) termsPages.push({ url: t, text: pageText(page.body) })
    }
    if (refused) {
      out.push({ site: origin, outcome: refused, registered: false })
      continue
    }
    const terms = judgeTerms(termsPages, day)
    if (!terms.permits) {
      out.push({ site: origin, outcome: `its terms name ${terms.word}: not registered (${terms.quote.slice(0, 160)})`, registered: false })
      continue
    }
    const registered = await store.register({
      name: c.name,
      kind: c.kind,
      citySlug: city,
      pageUrl: readUrl,
      robotsUrl: `${origin}/robots.txt`,
      robotsQuote: robotsQuote(robots.status, robots.body, day),
      termsUrl: termsPages[0]?.url ?? c.website,
      termsQuote: terms.quote,
      adapter: found.adapter,
      venueId: c.venueId,
      day,
    })
    out.push({ site: origin, outcome: registered ? `registered: ${found.adapter}, ${nights.length} future night(s), ${city}` : 'already a source', registered })
  }
  return out
}
