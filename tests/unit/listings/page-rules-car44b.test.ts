import { describe, expect, it } from 'vitest'
import { eventPagesFromSitemap, pageRuleFor } from '@/lib/listings/page-rules'
import { HUNT_SOURCES, huntFor, huntOrder, huntVenue } from '@/lib/listings/headline-hunt'

/*
 * Car 44b, the rest of the CONTROLLER's 01:05 list (his 11:45 of 5 November 2026). Each page's shape as read that morning
 * through the polite reader (C:\dev\EVIDENCE\CAR44\look\), cut to the parts each rule reads.
 */
const rule = (url: string) => {
  const r = pageRuleFor(url)
  if (!r) throw new Error(`no rule for ${url}`)
  return r
}

describe('the MCG', () => {
  const url = 'https://www.mcg.org.au/events/2026/november/australia-v-england-mens-t20i-21-nov-2026'
  const html = `<html><head><meta property="og:title" content="Australia v England Mens T20I | MCG" /></head><body>
    <a href="https://premier.ticketek.com.au/shows/show.aspx?sh=YARRAPRK26">Parking</a>
    <h1 class="event-banner-heading"><span class="event-banner-subtitle">T20 International</span></h1>
    <div class="event-banner-date">Saturday November 21, 2026</div>
    <div class="event-banner-time-wrapper"> <div class="image-wrapper"><img alt="Cricket Australia logo"></div>
    <div class="event-banner-time"> 7:15PM </div></div>
    <section id="tickets"><a href="https://premier.ticketek.com.au/shows/show.aspx?sh=T20MCG0127">Find Tickets</a></section>
  </body></html>`
  it("reads the banner's night, its name and the tickets section's own link", () => {
    expect(rule(url).eventPath.test(new URL(url).pathname)).toBe(true)
    expect(rule(url).read(html, url)).toEqual([
      expect.objectContaining({
        title: 'Australia v England Mens T20I',
        startsAt: '2026-11-21T08:15:00.000Z',
        venueName: 'Melbourne Cricket Ground',
        venueAddress: 'Yarra Park, Melbourne VIC',
        links: [expect.objectContaining({ url: 'https://premier.ticketek.com.au/shows/show.aspx?sh=T20MCG0127' })],
      }),
    ])
  })
  it('lists nothing without a stated time', () => {
    expect(rule(url).read(html.replace('7:15PM', 'TBC'), url)).toEqual([])
  })
})

describe("Live Nation's venue sites, the Palais and Festival Hall", () => {
  const page = (host: string, body: string) =>
    `<html><body><h1>Aaron Chen</h1><div>Events</div>${body}
     <a href="https://www.ticketmaster.com.au/event/1300655AD6BC87BE?brand=palais">Buy Tickets</a>
     <script>self.__next_f.push([1,"{\\"name\\":\\"${host}\\",\\"address\\":\\"Next door to Luna Park, St Kilda\\",\\"latitude\\":-37.86,\\"zipCode\\":\\"\\"}"])</script>
     </body></html>`
  it('reads each dated night with its time, and leaves a night with no time or a venue change', () => {
    const url = 'https://www.palaistheatre.com.au/all-events/aaron-chen-tickets-ae1459877'
    const html = page('Palais Theatre', '<div>Dec 12 2026</div><div>Saturday: 7:30 pm</div><div>Dec 13 2026</div><div>Sunday</div><div>Dec 14 2026</div><div>Monday: 8:00 pm</div><div>VENUE CHANGE</div>')
    expect(rule(url).read(html, url)).toEqual([
      expect.objectContaining({
        title: 'Aaron Chen',
        startsAt: '2026-12-12T08:30:00.000Z',
        venueName: 'Palais Theatre',
        venueAddress: 'Next door to Luna Park, St Kilda',
        links: [expect.objectContaining({ url: 'https://www.ticketmaster.com.au/event/1300655AD6BC87BE?brand=palais' })],
      }),
    ])
  })
  it("names Festival Hall by its own host and reads only its show pages", () => {
    const r = rule('https://www.festivalhall.com.au/')
    expect(r.eventPath.test('/all-events/joost-klein-tickets-ae1487240')).toBe(true)
    expect(r.eventPath.test('/whats-on')).toBe(false)
    const url = 'https://www.festivalhall.com.au/all-events/x-tickets-ae1'
    expect(r.read(page('Festival Hall', '<div>Nov 28 2026</div><div>Saturday: 8:00 pm</div>'), url)[0]).toMatchObject({ venueName: 'Festival Hall' })
  })
})

describe('Melbourne Recital Centre', () => {
  const url = 'https://www.melbournerecital.com.au/whats-on/current-productions/jonathan-pie/'
  const data = JSON.stringify({
    props: {
      page: {
        address: '31 Sturt St Southbank 3006',
        performances: [
          { contentType: 'tessituraPerformance', name: '2027-02-22 19:00 (25624)' },
          { contentType: 'tessituraPerformance', name: '2027-02-23 19:00 (25625)' },
        ],
      },
    },
  })
  const html = `<html><body><h1>Jonathan Pie</h1><script id="__NEXT_DATA__" type="application/json">${data}</script></body></html>`
  it("reads every performance the page's own data names, at the venue's own address", () => {
    const found = rule(url).read(html, url)
    expect(found.map((e) => e.startsAt)).toEqual(['2027-02-22T08:00:00.000Z', '2027-02-23T08:00:00.000Z'])
    expect(found[0]).toMatchObject({ title: 'Jonathan Pie', venueName: 'Melbourne Recital Centre', venueAddress: '31 Sturt St Southbank 3006' })
  })
})

describe('Federation Square', () => {
  const url = 'https://fedsquare.com/events/50-years-of-3rrr-feat-courtney-barnett-party-dozen-kaiit'
  it('reads a dated day with its hours, free where it says so, and nothing for a page with no single day', () => {
    const html = '<h1>50 Years of 3RRR</h1><div>Music</div><div>Free</div><div>Dates</div><div>Thursday 12 November 2026</div><div>6:15pm - 9:30pm</div><div>Venue</div><div>Main Square</div>'
    expect(rule(url).read(html, url)).toEqual([
      expect.objectContaining({ startsAt: '2026-11-12T07:15:00.000Z', venueName: 'Federation Square', links: [expect.objectContaining({ priceFromCents: 0 })] }),
    ])
    expect(rule(url).read('<h1>Happy Hour</h1><div>Dates</div><div>Weekdays</div><div>2pm - 5pm</div><div>Venue</div>', url)).toEqual([])
  })
  it('reads its sitemap, which has no lastmod and lists its newest pages first, in its own order', () => {
    const xml = '<urlset><url><loc>https://fedsquare.com/events/newest</loc></url><url><loc>https://fedsquare.com/events/older</loc></url></urlset>'
    expect(eventPagesFromSitemap(xml, rule(url))).toEqual(['https://fedsquare.com/events/newest', 'https://fedsquare.com/events/older'])
  })
})

describe("the hunt's list and order, car 44b", () => {
  it('speaks for each new venue by its own host', () => {
    for (const [page, venue] of [
      ['https://www.mcg.org.au/sitemap.xml', 'Melbourne Cricket Ground'],
      ['https://www.palaistheatre.com.au/', 'Palais Theatre'],
      ['https://www.festivalhall.com.au/', 'Festival Hall'],
      ['https://www.melbournerecital.com.au/sitemap.xml', 'Melbourne Recital Centre'],
      ['https://fedsquare.com/sitemap.xml', 'Federation Square'],
    ]) {
      expect(huntVenue(huntFor(page)!, venue)).toBe(venue)
    }
    expect(new Set(HUNT_SOURCES.map((h) => h.host)).size).toBe(HUNT_SOURCES.length)
  })
  it('reads the source read longest ago first, every hunt source due, and no other source', () => {
    const hunt = HUNT_SOURCES[0]
    const s = (id: string, at: string | null, h: typeof hunt | null = hunt) => ({ id, hunt: h, lastCheckedAt: at })
    const order = huntOrder([s('a', '2026-11-05T01:00:00Z'), s('b', null), s('c', '2026-11-04T18:00:00Z'), s('x', null, null)])
    expect(order.map((o) => o.id)).toEqual(['b', 'c', 'a'])
    expect(order.every((o) => o.lastCheckedAt === null)).toBe(true)
  })
})
