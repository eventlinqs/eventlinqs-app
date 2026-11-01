import { wallClockToIso, type FoundEvent } from './collect'

/**
 * THE PAGE READER'S RULES (the CONTROLLER's 15:54 of 1 November 2026: a primary page with no schema.org Event data and
 * no feed is read by a rule written for that source). A rule names the source's host, which of its pages are event
 * pages, and how the page states its facts. It reads FACTS ONLY (Lawal's ruling of 15:34: "we list every event's facts,
 * never its photo"): the title, each performance's date and time in the source's own zone, the venue and its street, the
 * lowest price, and the page itself as the place to book. Never the source's description, never its image.
 *
 * The collector (./collect-run.ts) reaches the event pages through the source's OWN sitemap, obeys robots.txt for every
 * page, waits between pages, and sends every find through the same judge to a person at /admin/collected. Pure: no
 * fetching here, so each rule is driven by its own test (tests/unit/listings/page-reader.test.ts).
 *
 * Adding a source is adding a rule here, with its test, after its robots.txt and terms are read and recorded in the
 * register (C:\dev\EVIDENCE\CITY-FIRST-1NOV\geelong-source-registry.md).
 */

export type PageRule = {
  /** The source's host, without www. */
  readonly host: string
  /** The paths of its event pages, as its sitemap lists them. */
  readonly eventPath: RegExp
  /** The facts on one event page: one FoundEvent per performance; nothing when the page is archived or unreadable. */
  read(html: string, pageUrl: string): FoundEvent[]
}

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' }

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

/** The page's visible text, one block element per line, scripts and styles dropped. */
export function textLines(html: string): string[] {
  const body = html
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/?(p|div|li|h[1-6]|br|tr|section|article|aside|header|footer|main|dd|dt|a)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  return decode(body)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function firstHeading(html: string): string | null {
  const m = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)
  const t = m ? decode(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : ''
  return t || null
}

const MONTHS: Readonly<Record<string, number>> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }

/** '07:00pm' or '7pm' or '19:30' to [19, 0]. */
function clockOf(line: string): [number, number] | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(line.replace(/\./g, ':'))
  if (!m) return null
  let h = Number(m[1])
  const mi = m[2] ? Number(m[2]) : 0
  const ap = m[3]?.toLowerCase()
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  if (!ap && !m[2]) return null
  return h < 24 && mi < 60 ? [h, mi] : null
}

/** The lines between a label (exactly 'Label:') and the next label line. */
function block(lines: readonly string[], label: string): string[] {
  const i = lines.findIndex((l) => l.toLowerCase() === `${label.toLowerCase()}:`)
  if (i < 0) return []
  const out: string[] = []
  for (const l of lines.slice(i + 1)) {
    if (/^[A-Z][A-Za-z ]{1,30}:$/.test(l)) break
    out.push(l)
  }
  return out
}

/**
 * GEELONG ARTS CENTRE (and Costa Hall, which it runs). Read 1 November 2026: robots.txt allows its pages for every agent
 * but GPTBot and Google-Extended; its own sitemap (sitemaps-1-section-event-1-sitemap.xml) lists its event pages under
 * /whats-on/; each page states its facts as labelled blocks ('Performances:' with a date line then a time line per
 * performance, 'Ticket Prices:', 'Venue:' with the room's name then its street) and marks a past show 'This is an
 * archived Event'. Every room it lists is in central Geelong, so the street is completed with the city.
 */
const geelongArtsCentre: PageRule = {
  host: 'geelongartscentre.org.au',
  eventPath: /^\/whats-on\/(?:[^/]+\/)+[^/]+\/?$/,
  read(html, pageUrl) {
    const lines = textLines(html)
    if (lines.some((l) => /^This is an archived Event$/i.test(l))) return []
    const title = firstHeading(html)
    if (!title) return []
    /* Each performance is a date then its time; the page puts them on one line (inline spans) or two, and may follow a
       night with 'Sold Out'. Read across the whole block so either layout reads the same. */
    const performances: { startsAt: string; soldOut: boolean }[] = []
    const perfText = block(lines, 'Performances').join(' ')
    const PERF = /(?:[A-Za-z]{3},?\s+)?(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))(\s+Sold Out)?/gi
    for (const m of perfText.matchAll(PERF)) {
      const mo = MONTHS[m[2].toLowerCase()]
      const clock = clockOf(m[4].replace(/\s+/g, ''))
      if (!mo || !clock) continue
      const at = wallClockToIso(Number(m[3]), mo, Number(m[1]), clock[0], clock[1], 0, 'Australia/Melbourne')
      if (at) performances.push({ startsAt: at, soldOut: Boolean(m[5]) })
    }
    if (performances.length === 0) return []
    const prices = block(lines, 'Ticket Prices')
      .filter((l) => !/fee/i.test(l))
      .flatMap((l) => [...l.matchAll(/\$\s?(\d+(?:\.\d{2})?)/g)].map((m) => Math.round(Number(m[1]) * 100)))
    const paid = prices.filter((c) => c > 0)
    const priceFromCents = prices.length === 0 ? null : paid.length > 0 ? Math.min(...paid) : 0
    const venue = block(lines, 'Venue').filter((l) => !/^venue info$/i.test(l))
    const venueName = venue[0] ?? 'Geelong Arts Centre'
    const street = venue[1] && /\d/.test(venue[1]) ? venue[1] : null
    return performances.map(({ startsAt, soldOut }) => ({
      title,
      startsAt,
      endsAt: null,
      venueName,
      venueAddress: street ? `${street}, Geelong VIC` : null,
      pageUrl,
      imageUrl: null,
      description: null,
      links: [{ url: pageUrl, availability: soldOut ? ('sold_out' as const) : ('on_sale' as const), priceFromCents }],
    }))
  },
}

export const PAGE_RULES: readonly PageRule[] = [geelongArtsCentre]

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/** The rule for a URL's site, or null when no rule is written for it. */
export function pageRuleFor(url: string): PageRule | null {
  const host = hostOf(url)
  return host ? PAGE_RULES.find((r) => r.host === host) ?? null : null
}

/** The event pages a sitemap lists for a rule: same host, a path the rule reads, each once, in the sitemap's order. */
/**
 * A rule's event pages from a sitemap, NEWEST FIRST, so a read capped at PAGE_READ_CAP reaches the current program:
 * hermaj.com lists its 145 event pages oldest first and eurekacentreballarat.com.au its 237 (WINDOW 2, 1 November
 * 2026), so sitemap order left the Eureka Centre's newest 37 unread. By lastmod (sitemaps.org's W3C date) where every
 * page carries one, else from the end of the list, where a site that appends its new shows puts them.
 */
export function eventPagesFromSitemap(xml: string, rule: PageRule): string[] {
  const found: Array<{ loc: string; at: number | null }> = []
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
    const locMatch = /<loc>\s*([^<\s]+)\s*<\/loc>/i.exec(m[1])
    if (!locMatch) continue
    const loc = decode(locMatch[1])
    let u: URL
    try {
      u = new URL(loc)
    } catch {
      continue
    }
    if (u.hostname.replace(/^www\./, '') !== rule.host || !rule.eventPath.test(u.pathname)) continue
    if (found.some((f) => f.loc === loc)) continue
    const lastmod = /<lastmod>\s*([^<\s]+)\s*<\/lastmod>/i.exec(m[1])
    const at = lastmod ? Date.parse(lastmod[1]) : NaN
    found.push({ loc, at: Number.isNaN(at) ? null : at })
  }
  const newestLast = [...found].reverse()
  if (found.length > 0 && found.every((f) => f.at !== null)) {
    return newestLast.sort((a, b) => (b.at as number) - (a.at as number)).map((f) => f.loc)
  }
  return newestLast.map((f) => f.loc)
}

/** Whether a body is a sitemap (a urlset), not a page. */
export function isSitemap(body: string): boolean {
  return /<urlset[\s>]/i.test(body.slice(0, 2000))
}
