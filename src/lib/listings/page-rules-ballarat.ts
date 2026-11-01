import { wallClockToIso, type FoundEvent } from './collect'
import type { PageRule } from './page-rules'

/**
 * BALLARAT'S PAGE RULES (WINDOW 2, 1 November 2026, on the CONTROLLER's 15:54 page reader and its 16:41 order: sources
 * on WINDOW 6's framework). Two primary sources with no schema.org Event data and no feed, whose event pages state their
 * facts in regular markup, read 1 November and recorded in C:\dev\EVIDENCE\CITY-FIRST-1NOV\ballarat-coverage-audit.md:
 *
 *  - HER MAJESTY'S THEATRE BALLARAT (hermaj.com; it also runs Civic Hall Ballarat). robots.txt disallows only /kirby/;
 *    its own sitemap (/sitemap.xml) lists every event page under /events/. Each page names the title, each session as a
 *    weekday and 'Month D, YYYY' with a 24 hour start and finish, the location, the prices and each session's box office
 *    link.
 *  - THE EUREKA CENTRE BALLARAT (City of Ballarat). Its event sitemap (/event-sitemap.xml) lists its program pages
 *    under /events/; each states WHEN (one date, then its time or times), WHERE, COST and a booking button.
 *
 * FACTS ONLY (Lawal's ruling of 15:34): title, each night's start (and finish where stated) in Melbourne time, the venue
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
  return decode(html.replace(/\r/g, '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim()
}

const MONTHS: Readonly<Record<string, number>> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }

/** A tier a buyer must qualify for is never the 'from' price: a concession, an age, a group, a community, a package. */
const RESTRICTED = /concession|child|senior|student|mob tix|under \d+|\d+ years|high five|group|family|vip|meet|companion|pensioner/i

/** The lowest price open to anyone, in cents: 'Label: $49' pairs, restricted tiers left out; null when none is stated. */
function openPriceCents(text: string): number | null {
  let best: number | null = null
  for (const line of text.split(/\n|\(|\)/)) {
    for (const m of line.matchAll(/([^$:]{0,40}?):?\s*\$\s?(\d[\d,]*(?:\.\d{2})?)/g)) {
      if (RESTRICTED.test(m[1]) || RESTRICTED.test(line.slice(m.index ?? 0, (m.index ?? 0) + m[0].length + 30))) continue
      const cents = Math.round(Number(m[2].replace(/,/g, '')) * 100)
      best = best === null ? cents : Math.min(best, cents)
    }
  }
  return best
}

const HM_VENUES: Readonly<Record<string, string>> = {
  "her majesty's theatre ballarat": '17 Lydiard Street South, Ballarat Central VIC',
  'civic hall ballarat': '300-304 Mair Street, Ballarat VIC',
}

export const herMajestysBallarat: PageRule = {
  host: 'hermaj.com',
  eventPath: /^\/events\/[^/]+\/?$/,
  read(html, pageUrl) {
    const t = /<div class="fxxl[^"]*">([\s\S]*?)<\/div>/i.exec(html)
    const title = t ? clean(t[1]).replace(/\s+/g, ' ') : ''
    if (!title) return []
    const info = new Map<string, string>()
    for (const m of html.matchAll(/<span class="upcase title">([\s\S]*?)<\/span>\s*<span class="data">([\s\S]*?)<\/span>/gi)) {
      info.set(clean(m[1]).toLowerCase(), clean(m[2]))
    }
    const venueName = (info.get('location') ?? '').replace(/\s+/g, ' ') || "Her Majesty's Theatre Ballarat"
    const priceFromCents = openPriceCents(info.get('prices') ?? '')
    const out: FoundEvent[] = []
    for (const s of html.matchAll(/<div class="event-ticket[ "][^>]*>([\s\S]*?)<\/a>/gi)) {
      const block = s[1]
      const d = /<span class="bold upcase">\s*[A-Za-z]+<br>\s*([A-Za-z]+) (\d{1,2}), (\d{4})\s*<\/span>/i.exec(block)
      const tm = /<span>(\d{1,2}):(\d{2})<\/span>(?:\s*(?:&ndash;|&#8211;|\u2013|-)\s*(\d{1,2}):(\d{2}))?/i.exec(block)
      const mo = d ? MONTHS[d[1].slice(0, 3).toLowerCase()] : undefined
      if (!d || !mo || !tm) continue
      const startsAt = wallClockToIso(Number(d[3]), mo, Number(d[2]), Number(tm[1]), Number(tm[2]), 0, ZONE)
      if (!startsAt) continue
      const finish = tm[3] ? wallClockToIso(Number(d[3]), mo, Number(d[2]), Number(tm[3]), Number(tm[4]), 0, ZONE) : null
      // A finish past midnight reads as an earlier clock on the same date: no finish rather than an end before the start.
      const endsAt = finish && Date.parse(finish) > Date.parse(startsAt) ? finish : null
      const link = /href="([^"]+)"/i.exec(block)
      out.push({
        title,
        startsAt,
        endsAt,
        venueName,
        venueAddress: HM_VENUES[venueName.toLowerCase()] ?? null,
        pageUrl,
        imageUrl: null,
        description: null,
        links: [{ url: link ? decode(link[1]) : pageUrl, availability: 'on_sale', priceFromCents }],
      })
    }
    return out
  },
}

/** '10am', '5:30pm', '10.30am' to [h, m]; the meridiem may come from the range's end ('2-3:30pm'). */
function clock(s: string, meridiem?: string): [number, number] | null {
  const m = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/i.exec(s.trim())
  if (!m) return null
  let h = Number(m[1])
  const ap = (m[3] ?? meridiem ?? '').toLowerCase()
  if (!ap) return null
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  const mi = m[2] ? Number(m[2]) : 0
  return h < 24 && mi < 60 ? [h, mi] : null
}

const EUREKA_STREET = '102 Stawell Street South, Ballarat VIC'

export const eurekaCentreBallarat: PageRule = {
  host: 'eurekacentreballarat.com.au',
  eventPath: /^\/events\/(?!page\/)[^/]+\/?$/,
  read(html, pageUrl) {
    const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)
    const title = h1 ? clean(h1[1]).replace(/\s+/g, ' ').replace(/\s+[\u2013\u2014-]\s+/g, ': ') : ''
    const field = (cls: string) => {
      const m = new RegExp(`<p class="[^"]*\\b${cls}\\b[^"]*">([\\s\\S]*?)</p>`, 'i').exec(html)
      return m ? clean(m[1]) : ''
    }
    const when = field('date')
    const [dateLine, timeLine = ''] = when.split('\n').map((l) => l.trim())
    // One date only: a range is an exhibition or a term-long series, not one night.
    const d = /^[A-Za-z]+,\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/.exec(dateLine ?? '')
    const mo = d ? MONTHS[d[1].slice(0, 3).toLowerCase()] : undefined
    if (!title || !d || !mo) return []
    const y = Number(d[3])
    const day = Number(d[2])
    const nights: { start: [number, number]; end: [number, number] | null }[] = []
    for (const part of timeLine.split(/\s*(?:,|&|\band\b)\s*/i)) {
      const range = /^(\d{1,2}(?:[:.]\d{2})?)\s*(am|pm)?\s*(?:-|to)\s*(\d{1,2}(?:[:.]\d{2})?)\s*(am|pm)$/i.exec(part.trim())
      if (range) {
        const end = clock(range[3], range[4])
        let start = clock(range[1], range[2] ?? range[4])
        if (start && end && !range[2] && start[0] > end[0]) start = clock(range[1], 'am')
        if (start) nights.push({ start, end })
        continue
      }
      const one = clock(part)
      if (one) nights.push({ start: one, end: null })
    }
    if (nights.length === 0) return []
    const venueName = field('location') || 'Eureka Centre Ballarat'
    const cost = field('cost')
    const priceFromCents = /^free\b/i.test(cost) ? 0 : openPriceCents(cost)
    const book = /<span class="booking-button-container">\s*<a[^>]*href="([^"]+)"/i.exec(html)
    const url = book ? decode(book[1]).replace(/[?&]aff=[^&]*$/, '') : pageUrl
    const at = (c: [number, number]) => wallClockToIso(y, mo, day, c[0], c[1], 0, ZONE)
    return nights.flatMap(({ start, end }) => {
      const startsAt = at(start)
      if (!startsAt) return []
      const finish = end ? at(end) : null
      return [{
        title,
        startsAt,
        endsAt: finish && Date.parse(finish) > Date.parse(startsAt) ? finish : null,
        venueName,
        venueAddress: /eureka centre|at eureka/i.test(venueName) ? EUREKA_STREET : null,
        pageUrl,
        imageUrl: null,
        description: null,
        links: [{ url, availability: 'on_sale' as const, priceFromCents }],
      }]
    })
  },
}

export const BALLARAT_PAGE_RULES: readonly PageRule[] = [herMajestysBallarat, eurekaCentreBallarat]
