import { eventsFromHtml, wallClockToIso, type FoundEvent } from './collect'
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

/**
 * SAILORS REST (sailorsrestgeelong.com.au, a Geelong waterfront venue running its own nights). Read 13 November 2026 by
 * the polite reader: robots.txt allows its pages; no schema.org Event data; its own /event-sitemap.xml lists each event page
 * under /event/. Each page has one h1 (the title), a line 'Event Date: December 4, 2026', then the night's programme as
 * lines with a ' | ' before their times ('Live Acoustic by Riley Catherall | 5-8 PM', 'DJ | 8 PM-Late'), then the venue's
 * own opening hours ('Friday 3:00pm to Late'), which are never the night's time. Its terms publish no restriction and its
 * robots.txt allows it: the shape of AAMI Park's source, which Lawal turned to 'read' on 5 November, reading its own
 * programme for facts only; the PM's 09:05 of 13 November turns such a source to 'read' once it has a reader.
 *
 * The start is the earliest time in the programme lines; a page with none is that day with no time ('date_only', held for
 * a person by the publication gate, law 19 (d)), never a filled in time. 'FREE' on one item is never the night's price
 * (checklist E6: never infer free).
 */
const SAILORS_REST_TIME = /\|\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:[-\u2013\u2014]|to)\s*(?:\d{1,2}(?:[:.]\d{2})?\s*(am|pm)|late)|\|\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/gi

export const sailorsRest: PageRule = {
  host: 'sailorsrestgeelong.com.au',
  eventPath: /^\/event\/[^/]+\/?$/,
  read(html, pageUrl) {
    const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)
    const title = h1 ? titleOf(h1[1]) : ''
    const text = decode(html.replace(/\r/g, '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/(p|div|h[1-6]|li|span|td|dt|dd)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
    const lines = text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
    const at = lines.findIndex((l) => /^Event Date:/i.test(l))
    const date = at < 0 ? null : /^Event Date:\s*([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/i.exec(lines[at])
    const mo = date ? MONTHS[date[1].slice(0, 3).toLowerCase()] : undefined
    if (!title || !date || !mo) return []
    const [y, d] = [Number(date[3]), Number(date[2])]
    let earliest: [number, number] | null = null
    for (const line of lines.slice(at + 1, at + 25)) {
      if (!line.includes('|')) continue
      for (const m of line.matchAll(SAILORS_REST_TIME)) {
        // A range takes its meridiem from its end ('5-8 PM' is 5 pm); a lone time carries its own.
        const h = m[1] ?? m[5]
        const mi = m[2] ?? m[6]
        const ap = m[3] ?? m[4] ?? m[7]
        const c = h && ap ? clock(`${h}${mi ? `:${mi}` : ''} ${ap}`) : null
        if (c && (!earliest || c[0] * 60 + c[1] < earliest[0] * 60 + earliest[1])) earliest = c
      }
    }
    const startsAt = earliest ? wallClockToIso(y, mo, d, earliest[0], earliest[1], 0, ZONE) : wallClockToIso(y, mo, d, 0, 0, 0, ZONE)
    if (!startsAt) return []
    return [{
      title,
      startsAt,
      endsAt: null,
      venueName: 'Sailors Rest',
      venueAddress: null,
      pageUrl,
      imageUrl: null,
      description: null,
      links: [{ url: pageUrl, availability: 'on_sale', priceFromCents: null }],
      timeStatus: earliest ? 'exact' : 'date_only',
      timeFromWords: true,
    }]
  },
}

/**
 * LOVE CENTRAL GEELONG (centralgeelong.com.au, central Geelong's own events guide: Pako Festa, the Geelong Revival, the
 * Pier music summer concerts and more). Read 13 November 2026 by the polite reader: robots.txt allows its pages (its
 * content signals: search yes, AI training no, use reference; listing facts with a link back is search use, and nothing
 * here trains anything); no terms page restricts reuse. Its own sitemap (events-sitemap.xml) lists each event page under
 * /events/, and each carries schema.org Event data, so the rule is the collector's own JSON-LD reader (as Comedy
 * Republic's). Facts only, as every source.
 */
export const centralGeelong: PageRule = {
  host: 'centralgeelong.com.au',
  eventPath: /^\/events\/[^/]+\/?$/,
  read: (html, pageUrl) => eventsFromHtml(html, pageUrl),
}

/**
 * GEELONG GALLERY (geelonggallery.org.au, 55 Little Malop Street). Read 13 November 2026 by the polite reader: robots.txt
 * allows every page; no terms page restricts reuse; no schema.org Event data. Its own sitemap (cpt_event-sitemap.xml)
 * lists each event page under /events/. Each page names the event in its h1 and lists each session as a date line
 * ('Saturday 5 December 2026') followed by its times ('11.00am to 3.30pm'); the gallery's own opening hours ('from 10am
 * to 5pm') follow no date line and are never a session. Every session is one night (Lawal's ruling of 7 November 2026).
 * Its prices name tiers (members and others), so none is taken (checklist E6). Facts only.
 */
// Its own /visit/ page (read 13 November 2026): '55 Little Malop Street, Geelong, VIC 3220'.
const GALLERY_STREET = '55 Little Malop Street, Geelong VIC 3220'

export const geelongGallery: PageRule = {
  host: 'geelonggallery.org.au',
  eventPath: /^\/events\/[^/]+\/?$/,
  read(html, pageUrl) {
    const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)
    // A dash joining two words reads as a colon ('Workshop: Inspired by ...'); titleOf makes every other dash a hyphen.
    const title = h1 ? titleOf(h1[1].replace(/([A-Za-z])\s*[\u2013\u2014]\s*([A-Za-z])/g, '$1: $2')) : ''
    if (!title) return []
    const lines = decode(html.replace(/\r/g, '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/(p|div|li|span|h[1-6]|td|dt|dd)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
      .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
    const out: FoundEvent[] = []
    for (let i = 0; i < lines.length - 1; i += 1) {
      const d = /^(?:[A-Za-z]{6,9}\s+)?(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/.exec(lines[i])
      const mo = d ? MONTHS[d[2].slice(0, 3).toLowerCase()] : undefined
      const t = /^(\d{1,2}(?:[.:]\d{2})?\s*(?:am|pm))\s+to\s+(\d{1,2}(?:[.:]\d{2})?\s*(?:am|pm))$/i.exec(lines[i + 1])
      if (!d || !mo || !t) continue
      const start = clock(t[1].replace(/\s+/g, ''))
      const end = clock(t[2].replace(/\s+/g, ''))
      if (!start) continue
      const startsAt = wallClockToIso(Number(d[3]), mo, Number(d[1]), start[0], start[1], 0, ZONE)
      const endsAt = end ? wallClockToIso(Number(d[3]), mo, Number(d[1]), end[0], end[1], 0, ZONE) : null
      if (!startsAt || out.some((e) => e.startsAt === startsAt)) continue
      out.push({
        title,
        startsAt,
        endsAt: endsAt && endsAt > startsAt ? endsAt : null,
        venueName: 'Geelong Gallery',
        venueAddress: GALLERY_STREET,
        pageUrl,
        imageUrl: null,
        description: null,
        links: [{ url: pageUrl, availability: 'on_sale', priceFromCents: null }],
        timeStatus: 'exact',
        timeFromWords: true,
      })
    }
    return out
  },
}

export const GEELONG_PAGE_RULES: readonly PageRule[] = [gmhbaStadium, mtDuneedEstate, sailorsRest, centralGeelong, geelongGallery]
