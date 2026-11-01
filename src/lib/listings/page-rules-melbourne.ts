import { eventsFromHtml, wallClockToIso, type FoundEvent } from './collect'
import type { PageRule } from './page-rules'

/**
 * MELBOURNE'S PAGE RULES (WINDOW 2, 1 November 2026, the CONTROLLER's 16:41: Melbourne sources on WINDOW 6's framework).
 * How each page reads: C:\dev\EVIDENCE\CITY-FIRST-1NOV\melbourne-rules-w2.md; each source's terms reading and permitted
 * method: WINDOW 5's melbourne-source-registry.md. A rule says how a page states its facts; whether a source is read
 * stays the registry's decision and a person's confirmation. FACTS ONLY: title, each night's start in Melbourne time,
 * venue and street, price from, the booking link; never the description, never an image.
 */

const ZONE = 'Australia/Melbourne'
const MONTHS: Readonly<Record<string, number>> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ', rsquo: "'" }

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

function textOf(html: string): string {
  return decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/** The first element carrying a class, as text. */
function byClass(html: string, tag: string, cls: string): string | null {
  const m = new RegExp(`<${tag}\\b[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(html)
  return m ? textOf(m[1]) || null : null
}

/** '9:00 PM', '6:30pm', '7pm' to [21, 0]. */
function clock(s: string): [number, number] | null {
  const m = /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)/i.exec(s)
  if (!m) return null
  let h = Number(m[1])
  if (m[3].toLowerCase() === 'pm' && h < 12) h += 12
  if (m[3].toLowerCase() === 'am' && h === 12) h = 0
  const mi = m[2] ? Number(m[2]) : 0
  return h < 24 && mi < 60 ? [h, mi] : null
}

function withoutTracking(url: string): string {
  return url.replace(/([?&])utm_[a-z]+=[^&]*/gi, '$1').replace(/[?&]+$/, '').replace(/&{2,}/g, '&').replace(/\?&/, '?')
}

/**
 * COMEDY REPUBLIC (comedyrepublic.com.au, 231 Bourke Street). Read 1 November: robots.txt disallows only /wp-admin/; its
 * terms carry no clause on reuse or automated access; each show page under /shows/ carries one schema.org Event per
 * performance (start, end, room, street, price, the performance's own booking link); its sitemap
 * (/wp-sitemap-posts-show-1.xml) lists the show pages. The rule is the collector's own JSON-LD reader.
 */
export const comedyRepublic: PageRule = {
  host: 'comedyrepublic.com.au',
  eventPath: /^\/shows\/[^/]+\/?$/,
  read: (html, pageUrl) => eventsFromHtml(html, pageUrl),
}

/**
 * THE COMIC'S LOUNGE (thecomicslounge.com.au, Level 1, 26 Errol Street, North Melbourne). Read 1 November: robots.txt
 * holds only the content-signals preamble, no rule and no signal; its sitemap (/sitemap.xml) lists each show page under
 * /events/; each page is ONE night: 'h1.event-hero-title', 'p.event-checkout-meta' ('6th Nov, 2026 · doors 8:30 PM ·
 * show 9:00 PM'; the night starts at the SHOW time), 'p.event-detail-price' ('From $35', where stated); tickets are
 * sold on the page itself. Its street is the site's own Organization data.
 */
export const comicsLounge: PageRule = {
  host: 'thecomicslounge.com.au',
  eventPath: /^\/events\/[^/]+\/?$/,
  read(html, pageUrl) {
    const title = byClass(html, 'h1', 'event-hero-title')
    const meta = byClass(html, 'p', 'event-checkout-meta') ?? ''
    const d = /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})[a-z]*,?\s+(\d{4})/.exec(meta)
    const show = /show\s+(\d{1,2}(?:[:.]\d{2})?\s*[ap]m)/i.exec(meta)
    const mo = d ? MONTHS[d[2].toLowerCase()] : undefined
    const at = show ? clock(show[1]) : null
    if (!title || !d || !mo || !at) return []
    const startsAt = wallClockToIso(Number(d[3]), mo, Number(d[1]), at[0], at[1], 0, ZONE)
    if (!startsAt) return []
    const price = /\$\s?(\d+(?:\.\d{2})?)/.exec(byClass(html, 'p', 'event-detail-price') ?? '')
    const city = byClass(html, 'span', 'event-hero-date-city') ?? byClass(html, 'div', 'event-hero-date-city')
    const northMelbourne = !city || /north melbourne/i.test(city)
    const event: FoundEvent = {
      title,
      startsAt,
      endsAt: null,
      venueName: "The Comic's Lounge",
      venueAddress: northMelbourne ? 'Level 1, 26 Errol Street, North Melbourne VIC' : null,
      pageUrl,
      imageUrl: null,
      description: null,
      links: [{ url: pageUrl, availability: 'on_sale', priceFromCents: price ? Math.round(Number(price[1]) * 100) : null }],
    }
    return [event]
  },
}

/**
 * FORUM MELBOURNE (forummelbourne.com.au, 154 Flinders Street). Read 1 November: robots.txt holds only the
 * content-signals preamble, no rule and no signal; its sitemap (/sitemap.xml) lists each show under /shows/; each page
 * states 'span.full-date' ('Mon 2 Nov 2026') and 'span.time' ('6:30pm') inside 'div.calendar', and its Ticketek link
 * ('Buy Tickets'). No price is printed on the page.
 */
export const forumMelbourne: PageRule = {
  host: 'forummelbourne.com.au',
  eventPath: /^\/shows\/[^/]+\/?$/,
  read(html, pageUrl) {
    const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)
    const title = h1 ? textOf(h1[1]) : ''
    if (!title) return []
    const buy = /<a[^>]*href="([^"]+)"[^>]*>\s*Buy Tickets/i.exec(html)
    const link = buy ? withoutTracking(decode(buy[1])) : pageUrl
    const seen = new Set<string>()
    const out: FoundEvent[] = []
    for (const m of html.matchAll(/<span class="full-date">([^<]+)<\/span>\s*<span class="time">([^<]+)<\/span>/gi)) {
      const d = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/.exec(m[1])
      const mo = d ? MONTHS[d[2].toLowerCase()] : undefined
      const at = clock(m[2])
      if (!d || !mo || !at) continue
      const startsAt = wallClockToIso(Number(d[3]), mo, Number(d[1]), at[0], at[1], 0, ZONE)
      if (!startsAt || seen.has(startsAt)) continue
      seen.add(startsAt)
      out.push({
        title,
        startsAt,
        endsAt: null,
        venueName: 'Forum Melbourne',
        venueAddress: '154 Flinders Street, Melbourne VIC',
        pageUrl,
        imageUrl: null,
        description: null,
        links: [{ url: link, availability: 'on_sale', priceFromCents: null }],
      })
    }
    return out
  },
}

export const MELBOURNE_PAGE_RULES: readonly PageRule[] = [comedyRepublic, comicsLounge, forumMelbourne]
