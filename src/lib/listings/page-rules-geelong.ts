import { wallClockToIso, type FoundEvent } from './collect'
import type { PageRule } from './page-rules'
import { RESTRICTED_TIER } from './open-tier'

/**
 * GEELONG'S BIG NIGHTS, TWO PAGE RULES (WINDOW 2, 2 November 2026, on the CONTROLLER's 15:34 order: "the engine's next
 * sources by order: GMHBA Stadium's own events page ... Mt Duneed Estate concerts ... each by its own page, polite fetch,
 * facts only"). Neither source publishes schema.org Event data or a feed; each event page states its facts in regular
 * markup. Read 2 November 2026 by the collector's own agent, robots.txt first, one request a second, and recorded in
 * C:\dev\EVIDENCE\CITY-FIRST-1NOV\geelong-big-rules\:
 *
 *  - GMHBA STADIUM (Kardinia Park Stadium Trust, kardiniapark.vic.gov.au). robots.txt disallows nothing; its sitemap
 *    index names /event-sitemap.xml, which lists each event page under /event/. Each page has one h1 (the title), one
 *    'event-hero-date' block ('Wed, 2 Dec 2026 7:35 pm') and, where tickets are sold, a link reading HERE to the seller.
 *    The street is the Trust's own: 354 Moorabool Street, South Geelong 3220.
 *  - MT DUNEED ESTATE (its concerts are A Day On The Green's, adayonthegreen.com.au). robots.txt allows all; its sitemap
 *    lists each tour stop under /currenttours/<tour>/<stop>, and the estate is the /geelong stop. Each page names the
 *    date ('Sat 28 Nov 2026'), the venue, the ticket table and a Set Times table: 'Gates Open' is the night's start and
 *    'Approximate Finish' its finish. Tickets are sold through Ticketmaster from the tour page, so the page is the link.
 *
 * FACTS ONLY (Lawal's ruling of 1 November, 15:34): title, start (and finish where stated) in Melbourne time, the venue
 * and its street, the lowest price open to anyone, the booking link. Never the description, never an image. Self
 * contained (no import from ./page-rules but its type), so the rule list can include these without a cycle.
 */

const ZONE = 'Australia/Melbourne'
const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ', ndash: '-', mdash: '-', rsquo: "'" }

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

function clean(html: string): string {
  return decode(html.replace(/\r/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/** A title as the page gives it, its en or em dash a plain hyphen (our copy carries no dash). */
function titleOf(html: string): string {
  return clean(html).replace(/\s+[\u2013\u2014]\s+/g, ': ').replace(/[\u2013\u2014]/g, '-')
}

const MONTHS: Readonly<Record<string, number>> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }

/** '7:35 pm', '12:00 pm', '4:00pm', '10am' to [h, m]; null without a meridiem. */
function clock(s: string): [number, number] | null {
  const m = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)$/i.exec(s.trim())
  if (!m) return null
  let h = Number(m[1])
  const ap = m[3].toLowerCase()
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  const mi = m[2] ? Number(m[2]) : 0
  return h < 24 && mi < 60 ? [h, mi] : null
}

/** 'D Mon YYYY' (a weekday before it is allowed) to [y, m, d]. */
function day(s: string): [number, number, number] | null {
  const m = /^(?:[A-Za-z]{3,9},?\s+)?(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/.exec(s.trim())
  const mo = m ? MONTHS[m[2].slice(0, 3).toLowerCase()] : undefined
  return m && mo ? [Number(m[3]), mo, Number(m[1])] : null
}

const GMHBA_STREET = '354 Moorabool Street, South Geelong VIC 3220'

export const gmhbaStadium: PageRule = {
  host: 'kardiniapark.vic.gov.au',
  eventPath: /^\/event\/[^/]+\/?$/,
  read(html, pageUrl) {
    const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)
    const title = h1 ? titleOf(h1[1]) : ''
    const when = /<div class="event-hero-date">([\s\S]*?)<\/div>/i.exec(html)
    const w = when ? /^(.+?\d{4})\s+(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm))$/i.exec(clean(when[1])) : null
    const d = w ? day(w[1]) : null
    const c = w ? clock(w[2]) : null
    if (!title || !d || !c) return []
    const startsAt = wallClockToIso(d[0], d[1], d[2], c[0], c[1], 0, ZONE)
    if (!startsAt) return []
    const seller = /<a\b[^>]*href="([^"]+)"[^>]*>\s*HERE\s*<\/a>/i.exec(html)
    const event: FoundEvent = {
      title,
      startsAt,
      endsAt: null,
      venueName: 'GMHBA Stadium',
      venueAddress: GMHBA_STREET,
      pageUrl,
      imageUrl: null,
      description: null,
      links: [{ url: seller ? decode(seller[1]) : pageUrl, availability: 'on_sale', priceFromCents: null }],
    }
    return [event]
  },
}

/** A ticket a buyer must add to another, or qualify for, is never the 'from' price: one list for every reader (./open-tier.ts). */
const NOT_OPEN = RESTRICTED_TIER
const MT_DUNEED = /\b(?:mt|mount) duneed estate\b/i
const MT_DUNEED_STREET = '65 Pettavel Road, Geelong VIC'

export const mtDuneedEstate: PageRule = {
  host: 'adayonthegreen.com.au',
  eventPath: /^\/currenttours\/[^/]+\/geelong\/?$/,
  read(html, pageUrl) {
    const venue = /<h5\b[^>]*>([^<]*duneed[^<]*)<\/h5>/i.exec(html)
    const venueName = venue ? clean(venue[1]) : ''
    if (!MT_DUNEED.test(venueName)) return []
    const date = /<h2 class="fw-bold[^"]*">([\s\S]*?)<\/h2>/i.exec(html)
    const d = date ? day(clean(date[1])) : null
    const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)
    // The headline is the h1's own text; its span names the tour, not the night.
    const title = h1 ? titleOf(h1[1].replace(/<span\b[\s\S]*?<\/span>/gi, ' ')) : ''
    const times = new Map<string, string>()
    for (const m of html.matchAll(/<td\b[^>]*>\s*(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm))\s*<td>\s*<td\b[^>]*>([\s\S]*?)<\/td>/gi)) {
      times.set(clean(m[2]).toLowerCase(), m[1])
    }
    const gates = times.get('gates open')
    const start = gates ? clock(gates) : null
    if (!title || !d || !start) return []
    const at = (c: [number, number]) => wallClockToIso(d[0], d[1], d[2], c[0], c[1], 0, ZONE)
    const startsAt = at(start)
    if (!startsAt) return []
    const finishClock = times.get('approximate finish')
    const finish = finishClock ? clock(finishClock) : null
    const endsAt = finish ? at(finish) : null
    let priceFromCents: number | null = null
    // The ticket table: one row per ticket, its label in the first cell and its price in the last.
    for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => clean(c[1]))
      const price = /^\$(\d[\d,]*(?:\.\d{2})?)$/.exec(cells[cells.length - 1] ?? '')
      if (cells.length < 2 || !price || NOT_OPEN.test(cells[0])) continue
      const cents = Math.round(Number(price[1].replace(/,/g, '')) * 100)
      priceFromCents = priceFromCents === null ? cents : Math.min(priceFromCents, cents)
    }
    return [{
      title,
      startsAt,
      endsAt: endsAt && Date.parse(endsAt) > Date.parse(startsAt) ? endsAt : null,
      venueName,
      venueAddress: MT_DUNEED_STREET,
      pageUrl,
      imageUrl: null,
      description: null,
      links: [{ url: pageUrl, availability: 'on_sale', priceFromCents }],
    }]
  },
}

export const GEELONG_PAGE_RULES: readonly PageRule[] = [gmhbaStadium, mtDuneedEstate]
