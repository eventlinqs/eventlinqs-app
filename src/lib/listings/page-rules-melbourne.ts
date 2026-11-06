import { eventsFromHtml, wallClockToIso, type FoundEvent } from './collect'
import { MAJOR_SELLERS, providerOf } from '@/lib/events/booking-links'
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

/**
 * MELBOURNE'S HEADLINE ARENAS AND STADIUM (car 44, the daily big event hunt; the CONTROLLER's 15:30 of 4 November 2026:
 * Rod Laver Arena, Margaret Court Arena, John Cain Arena and AAMI Park). One platform serves all four: a list page at
 * /events/ linking each show's own page at /event/<slug>/, and each show page states its facts as one schema.org Event,
 * read by the collector's own reader (read on 4 November 2026 through the polite reader: robots allowed, 32 to 39 shows
 * linked, one Event on each sampled page; C:\dev\EVIDENCE\CAR44\probe-1.txt).
 */
/*
 * CAR 44c, THE PAGE'S OWN TIME (the CONTROLLER's 14:55 of 5 November 2026, 'STOP THE LINE, WRONG TIMES ON LIVE FROM THE
 * HUNT'). This platform writes each night's LOCAL clock into its schema.org Event with a false UTC offset (John Cain Arena:
 * 'startDate=2026-11-07T19:30:00+00:00' for 'Saturday 7 November 2026 / 7:30 pm'), so the schema gives the name, the
 * venue and the link, and the night's day and time come only from the page's own Date block:
 * '<h2>Date</h2><p class="lead">Saturday 7 November 2026</p><p>7:30 pm</p>', in Melbourne time. A run of up to three days
 * ('Thursday 12 to Saturday 14 November 2026') is a night on each day at the stated time; a longer run, a missing block
 * or a missing time lists nothing, never a guessed time.
 */
const ARENA_RUN_DAYS = 3

/** The days a Date block's line names: one day, or each day of a run of up to ARENA_RUN_DAYS. Pure. */
export function arenaDays(line: string): [number, number, number][] {
  const one = longDate(line)
  if (one) return [one]
  const run = new RegExp(
    `^(?:${WEEKDAY},?\\s+)?(\\d{1,2})(?:\\s+(${MONTH_NAMES}))?(?:\\s+(\\d{4}))?\\s+to\\s+(?:${WEEKDAY},?\\s+)?(\\d{1,2})\\s+(${MONTH_NAMES})\\s+(\\d{4})$`,
    'i',
  ).exec(line.trim())
  if (!run) return []
  const m2 = MONTHS[run[5].slice(0, 3).toLowerCase()]
  const m1 = run[2] ? MONTHS[run[2].slice(0, 3).toLowerCase()] : m2
  const y2 = Number(run[6])
  const y1 = run[3] ? Number(run[3]) : m1 > m2 ? y2 - 1 : y2
  const from = Date.UTC(y1, m1 - 1, Number(run[1]))
  const to = Date.UTC(y2, m2 - 1, Number(run[4]))
  const days = Math.round((to - from) / 86_400_000) + 1
  if (!(days >= 1 && days <= ARENA_RUN_DAYS)) return []
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(from + i * 86_400_000)
    return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()] as [number, number, number]
  })
}

function arenaRule(host: string): PageRule {
  return {
    host,
    eventPath: /^\/event\/[^/]+\/?$/,
    read(html, pageUrl) {
      const base = eventsFromHtml(html, pageUrl)[0]
      const block = /<h2\b[^>]*>\s*Date\s*<\/h2>\s*<p\b[^>]*>([^<]+)<\/p>\s*<p\b[^>]*>([^<]+)<\/p>/i.exec(html)
      if (!base || !block) return []
      const at = clock(decode(block[2]))
      const days = arenaDays(decode(block[1]))
      if (!at) return []
      const out: FoundEvent[] = []
      for (const [y, m, d] of days) {
        const startsAt = wallClockToIso(y, m, d, at[0], at[1], 0, ZONE)
        if (startsAt) out.push({ ...base, startsAt, endsAt: null, timeStatus: 'exact', timeFromWords: true })
      }
      return out
    },
  }
}
export const rodLaverArena = arenaRule('rodlaverarena.com.au')
export const johnCainArena = arenaRule('johncainarena.com.au')
export const margaretCourtArena = arenaRule('margaretcourtarena.com.au')
export const aamiPark = arenaRule('aamipark.com.au')

/*
 * CAR 44b, THE REST OF THE CONTROLLER'S 01:05 LIST (5 November 2026). Each read through the polite reader that morning
 * (robots first, one request a second, the collector's agent): C:\dev\EVIDENCE\CAR44\look\. Facts and the link only.
 */
const WEEKDAY = '(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)'
const MONTH_NAMES = 'January|February|March|April|May|June|July|August|September|October|November|December'

/** A line as the pages write a long date: 'Saturday November 21, 2026' or 'Thursday 12 November 2026'. */
function longDate(line: string): [number, number, number] | null {
  const md = new RegExp(`^(?:${WEEKDAY},?\\s+)?(${MONTH_NAMES})\\s+(\\d{1,2}),?\\s+(\\d{4})$`, 'i').exec(line.trim())
  const dm = new RegExp(`^(?:${WEEKDAY},?\\s+)?(\\d{1,2})\\s+(${MONTH_NAMES})\\s+(\\d{4})$`, 'i').exec(line.trim())
  const [mon, day, year] = md ? [md[1], md[2], md[3]] : dm ? [dm[2], dm[1], dm[3]] : []
  const mo = mon ? MONTHS[mon.slice(0, 3).toLowerCase()] : undefined
  return mo && day && year ? [Number(year), mo, Number(day)] : null
}

/** The page's visible lines (the shape page-rules.ts reads), kept here so this file stays free of a cycle. */
function lines(html: string): string[] {
  return decode(
    html
      .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/?(p|div|li|h[1-6]|br|tr|section|article|aside|header|footer|main|dd|dt|a)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/** The first link on the page, from a point on it, to a major ticket seller, as booking-links.ts names them (the one table
 * of platform names, copy-tell-gate's allowlist). */
function sellerLink(html: string, from = 0): string | null {
  for (const m of html.slice(Math.max(0, from)).matchAll(/href="(https:\/\/[^"]+)"/gi)) {
    const url = decode(m[1])
    if (MAJOR_SELLERS.has(providerOf(url))) return url
  }
  return null
}

function ogTitle(html: string): string | null {
  const m = /<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i.exec(html) ?? /<meta[^>]+content="([^"]*)"[^>]+property="og:title"/i.exec(html)
  return m ? decode(m[1]).trim() || null : null
}

/**
 * THE MCG (mcg.org.au). Robots allows every page and names its sitemap, which lists each event page at
 * /events/<year>/<month>/<slug>; each page states its night in its banner: 'event-banner-date' ('Saturday November 21,
 * 2026') and 'event-banner-time' ('7:15PM'), its name as og:title ('Australia v England Mens T20I | MCG'), and its Ticketek
 * link in its tickets section. No street address is printed; the MCG says it stands in Yarra Park, so that is its place.
 */
export const mcg: PageRule = {
  host: 'mcg.org.au',
  eventPath: /^\/events\/\d{4}\/[a-z]+\/[^/]+\/?$/,
  read(html, pageUrl) {
    const title = (ogTitle(html) ?? '').replace(/\s*\|\s*MCG\s*$/i, '').trim()
    /* The exact class: 'event-banner-time-wrapper' comes first on the page and holds the team logos, not the time. */
    const exact = (cls: string) => textOf(new RegExp(`<div\\b[^>]*class="${cls}"[^>]*>([^<]*)</div>`, 'i').exec(html)?.[1] ?? '')
    const date = longDate(exact('event-banner-date'))
    const at = clock(exact('event-banner-time'))
    if (!title || !date || !at) return []
    const startsAt = wallClockToIso(date[0], date[1], date[2], at[0], at[1], 0, ZONE)
    if (!startsAt) return []
    const tickets = html.indexOf('id="tickets"')
    const buy = tickets >= 0 ? sellerLink(html, tickets) : null
    return [
      {
        title,
        startsAt,
        endsAt: null,
        venueName: 'Melbourne Cricket Ground',
        venueAddress: 'Yarra Park, Melbourne VIC',
        pageUrl,
        imageUrl: null,
        description: null,
        links: [{ url: buy ? withoutTracking(buy) : pageUrl, availability: 'on_sale', priceFromCents: null }],
        timeFromWords: true,
      },
    ]
  },
}

/**
 * LIVE NATION'S VENUE SITES: the Palais Theatre and Festival Hall. Each home page links its shows at
 * /all-events/<slug>-tickets-ae<id>; each show page states, after its name and 'Events', a date line ('Dec 12 2026') and
 * the day with its time ('Saturday: 7:30 pm'), its Ticketmaster link, and the venue's own address in its page data
 * (Festival Hall '300 Dudley Street, West Melbourne, VIC', '3003'; the Palais 'Next door to Luna Park, St Kilda'). A date
 * with no time ('Wednesday', 'RUN TIMES TBC') or marked 'VENUE CHANGE' is not listed.
 */
function liveNationVenue(host: string, venueName: string): PageRule {
  return {
    host,
    eventPath: /^\/all-events\/[a-z0-9-]+-tickets-ae\d+\/?$/,
    read(html, pageUrl) {
      const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)
      const title = h1 ? textOf(h1[1]) : ''
      if (!title) return []
      const ls = lines(html)
      const start = ls.findIndex((l, i) => l === 'Events' && ls[i - 1] === title)
      if (start < 0) return []
      const address = /\\?"address\\?":\\?"([^"\\]+)\\?"[^}]*?\\?"zipCode\\?":\\?"([^"\\]*)\\?"/.exec(html)
      const venueAddress = address ? `${address[1]}${address[2] ? ` ${address[2]}` : ''}` : null
      const buy = sellerLink(html)
      const out: FoundEvent[] = []
      for (let i = start + 1; i < Math.min(ls.length, start + 40); i += 1) {
        const d = /^([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{4})$/.exec(ls[i])
        if (!d) continue
        const mo = MONTHS[d[1].toLowerCase()]
        const day = /^[A-Za-z]+:\s*(\d{1,2}:\d{2}\s*[ap]m)$/i.exec(ls[i + 1] ?? '')
        if (!mo || !day || /^VENUE CHANGE$/i.test(ls[i + 2] ?? '')) continue
        const at = clock(day[1])
        const startsAt = at ? wallClockToIso(Number(d[3]), mo, Number(d[2]), at[0], at[1], 0, ZONE) : null
        if (!startsAt || out.some((e) => e.startsAt === startsAt)) continue
        out.push({
          title,
          startsAt,
          endsAt: null,
          venueName,
          venueAddress,
          pageUrl,
          imageUrl: null,
          description: null,
          links: [{ url: buy ?? pageUrl, availability: 'on_sale', priceFromCents: null }],
          timeFromWords: true,
        })
      }
      return out
    },
  }
}
export const palaisTheatre = liveNationVenue('palaistheatre.com.au', 'Palais Theatre')
export const festivalHall = liveNationVenue('festivalhall.com.au', 'Festival Hall')

/**
 * MELBOURNE RECITAL CENTRE (melbournerecital.com.au). Robots allows every page and names its sitemap, which lists each
 * production at /whats-on/current-productions/<slug>/; each page's own data (__NEXT_DATA__) names every performance as
 * 'YYYY-MM-DD HH:MM (id)' ('2027-02-22 19:00 (25624)'), and the venue's address ('31 Sturt St Southbank 3006'). Its
 * tickets are sold on its own pages, so the link is the production's page.
 */
export const melbourneRecitalCentre: PageRule = {
  host: 'melbournerecital.com.au',
  eventPath: /^\/whats-on\/current-productions\/[^/]+\/?$/,
  read(html, pageUrl) {
    const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)
    const title = h1 ? textOf(h1[1]) : ''
    const data = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i.exec(html)?.[1] ?? ''
    if (!title || !data) return []
    const address = /"address"\s*:\s*"([^"]+)"/.exec(data)?.[1] ?? null
    const out: FoundEvent[] = []
    for (const m of data.matchAll(/"contentType"\s*:\s*"tessituraPerformance"\s*,\s*"name"\s*:\s*"(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}) \(\d+\)"/g)) {
      const startsAt = wallClockToIso(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), 0, ZONE)
      if (!startsAt || out.some((e) => e.startsAt === startsAt)) continue
      out.push({
        title,
        startsAt,
        endsAt: null,
        venueName: 'Melbourne Recital Centre',
        venueAddress: address,
        pageUrl,
        imageUrl: null,
        description: null,
        links: [{ url: pageUrl, availability: 'on_sale', priceFromCents: null }],
        timeFromWords: true,
      })
    }
    return out
  },
}

/**
 * FEDERATION SQUARE (fedsquare.com). Robots allows every page; its sitemap lists 1,906 event pages, NEWEST FIRST, with no
 * lastmod; each page states 'Dates' then a day ('Thursday 12 November 2026') and its hours ('6:15pm - 9:30pm'), and
 * 'Free' where it is free. A page with no single dated day ('Weekdays', a season) is not listed. Every night is at
 * Federation Square, the venue EventLinqs holds.
 */
export const fedSquare: PageRule = {
  host: 'fedsquare.com',
  eventPath: /^\/events\/[^/]+\/?$/,
  newestFirst: true,
  read(html, pageUrl) {
    const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)
    const title = h1 ? textOf(h1[1]) : ''
    const ls = lines(html)
    const from = ls.indexOf('Dates')
    if (!title || from < 0) return []
    const until = ls.indexOf('Venue', from)
    const free = ls.slice(0, from).includes('Free')
    const out: FoundEvent[] = []
    for (let i = from + 1; i < (until > from ? until : from + 12); i += 1) {
      const date = longDate(ls[i])
      const at = clock(/^(\d{1,2}(?::\d{2})?\s*[ap]m)/i.exec(ls[i + 1] ?? '')?.[1] ?? '')
      if (!date || !at) continue
      const startsAt = wallClockToIso(date[0], date[1], date[2], at[0], at[1], 0, ZONE)
      if (!startsAt || out.some((e) => e.startsAt === startsAt)) continue
      out.push({
        title,
        startsAt,
        endsAt: null,
        venueName: 'Federation Square',
        venueAddress: null,
        pageUrl,
        imageUrl: null,
        description: null,
        links: [{ url: pageUrl, availability: 'on_sale', priceFromCents: free ? 0 : null }],
        timeFromWords: true,
      })
    }
    return out
  },
}

/**
 * BIRD'S BASEMENT (birdsbasement.com, 11 Singers Lane). Read 6 November 2026 through the polite reader: robots.txt allows its
 * show pages; each page under /show/<id>/<slug> carries one schema.org Event per date with a DATE ONLY startDate, and states
 * its times in words, once for every date: 'Early Show Starts: 7:30 pm' (/show/1779) and, on some, 'Late Show Starts: 10:00
 * pm' as well (/show/1773). Where the page states exactly one show time, every date starts at it (from the words); where it
 * states two, which dates run which show is not stated, so every date stays date only and nothing is guessed.
 */
export const birdsBasement: PageRule = {
  host: 'birdsbasement.com',
  eventPath: /^\/show\/\d+\/[^/]+\/?$/,
  read(html, pageUrl) {
    const found = eventsFromHtml(html, pageUrl)
    const stated = [...textOf(html).matchAll(/\b(?:Early |Late )?Show Starts?:\s*(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm))/gi)]
      .map((m) => clock(m[1]))
      .filter((c): c is [number, number] => c !== null)
    const times = [...new Set(stated.map(([h, mi]) => `${h}:${mi}`))]
    if (times.length !== 1) return found
    const [h, mi] = times[0].split(':').map(Number)
    return found.map((f): FoundEvent => {
      if (f.timeStatus !== 'date_only') return f
      const [y, mo, d] = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
        .format(new Date(f.startsAt))
        .split('-')
        .map(Number)
      const at = wallClockToIso(y, mo, d, h, mi, 0, ZONE)
      return at ? { ...f, startsAt: at, timeStatus: 'exact', timeFromWords: true } : f
    })
  },
}

export const MELBOURNE_PAGE_RULES: readonly PageRule[] = [
  comedyRepublic, comicsLounge, forumMelbourne, rodLaverArena, johnCainArena, margaretCourtArena, aamiPark,
  mcg, palaisTheatre, festivalHall, melbourneRecitalCentre, fedSquare, birdsBasement,
]
