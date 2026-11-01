import { describe, expect, it } from 'vitest'
import { eventPagesFromSitemap, pageRuleFor } from '@/lib/listings/page-rules'

/**
 * BALLARAT'S PAGE RULES (WINDOW 2, 1 November 2026, on the CONTROLLER's 15:54 page reader): Her Majesty's Theatre
 * Ballarat (which also runs Civic Hall) and the Eureka Centre Ballarat publish no schema.org Event data and no feed, but
 * each event page states its facts in regular markup (read 1 November: hermaj.com, 78 event pages; the Eureka Centre's
 * program pages). Facts only: title, each session's date and time in Melbourne, the venue and its street, the open price
 * from, the booking link. The fixtures are written for this test in the shape of those pages, not copied from them.
 */

const HM = 'https://www.hermaj.com'
const hmPage = (o: { title: string; location: string; prices: string; sessions: [string, string, string, string][] }) => `<!doctype html><html><body>
<div class="event-ticket-link main pxs "><a href="https://ballarat.sales.ticketsearch.com/sales/salesevent/1" class="pill">Tickets</a></div>
<section class="hero-block event pts pbs"><div class="type-badge fxs enter upcase">Music</div>
<div class="hero-block-event-data pxg "><div class="fxxl upcase enter">${o.title}</div><div class="fl upcase enter">1 Dec 2026</div></div></section>
<section class="event-sessions grid-12 pxg py"><div class="fsm upcase bold enter">Sessions</div><div class="event-tickets ">
${o.sessions.map(([day, date, start, finish]) => `<div class="event-ticket enter pbs"><div>
<span class="bold upcase">${day}<br>${date}</span>
<br><span>${start}</span>${finish ? ` &ndash; ${finish}` : ''}</div>
<a href="https://ballarat.sales.ticketsearch.com/sales/salesevent?ev=9&amp;evs=${start.replace(':', '')}" class="pill fill">Tickets</a>
</div>`).join('')}
</div></section>
<section class="event-info"><div class="event-info-left-list-item enter"><span class="upcase title">Location</span><span class="data">${o.location}</span></div>
<div class="event-info-left-list-item enter"><span class="upcase title">Prices</span><span class="data">${o.prices}</span></div>
<p>The presenter's own long words about the show, never kept.</p></section></body></html>`

describe("Her Majesty's Theatre Ballarat rule", () => {
  const url = `${HM}/events/bp-proof-tour-2026`
  const rule = pageRuleFor(url)

  it('is found for its event pages, and the sitemap leads only to them', () => {
    expect(rule).not.toBeNull()
    expect(rule!.host).toBe('hermaj.com')
    const xml = `<urlset><url><loc>${HM}/events/bp-proof-tour-2026</loc></url><url><loc>${HM}/whats-on</loc></url><url><loc>${HM}/events/bp-two-2027</loc></url></urlset>`
    // WINDOW 6's reader (18673099) reads a sitemap newest first: with no lastmod, from the end of the list.
    expect(eventPagesFromSitemap(xml, rule!)).toEqual([`${HM}/events/bp-two-2027`, `${HM}/events/bp-proof-tour-2026`])
  })

  it('reads one night per session, start and finish in Melbourne, the venue with its street, the session booking link', () => {
    const found = rule!.read(
      hmPage({ title: 'Bp Proof Band: Live', location: 'Civic Hall Ballarat', prices: 'Full: $74.00<br>General Admission (standing): $74.00',
        sessions: [['Friday', 'November 06, 2026', '19:30', '22:30'], ['Saturday', 'November 07, 2026', '14:00', '']] }),
      url,
    )
    expect(found).toHaveLength(2)
    expect(found[0]).toMatchObject({
      title: 'Bp Proof Band: Live',
      startsAt: '2026-11-06T08:30:00.000Z', // 7.30 pm AEDT (UTC+11)
      endsAt: '2026-11-06T11:30:00.000Z',
      venueName: 'Civic Hall Ballarat',
      venueAddress: '300-304 Mair Street, Ballarat VIC',
      pageUrl: url,
      imageUrl: null,
      description: null,
    })
    expect(found[0].links).toEqual([{ url: 'https://ballarat.sales.ticketsearch.com/sales/salesevent?ev=9&evs=1930', availability: 'on_sale', priceFromCents: 7400 }])
    expect(found[1].startsAt).toBe('2026-11-07T03:00:00.000Z')
    expect(found[1].endsAt).toBeNull()
  })

  it('the price from is the lowest price open to anyone: never a concession, child, student, community or group price', () => {
    const found = rule!.read(
      hmPage({ title: 'Bp Proof Dance', location: "Her Majesty's Theatre Ballarat",
        prices: 'A Reserve: $49<br>A Reserve Concession: $44<br>B Reserve: $39<br>Under 30: $30<br>Mob Tix: $30<br>High Five: $5 tix for secondary students<br>Groups 6+: $29',
        sessions: [['Saturday', 'December 05, 2026', '19:30', '20:30']] }),
      url,
    )
    expect(found[0].links[0].priceFromCents).toBe(3900)
    expect(found[0].venueAddress).toBe('17 Lydiard Street South, Ballarat Central VIC')
  })

  it('a finish at or before the start (past midnight on the page) is no finish, never an end before the start', () => {
    const found = rule!.read(
      hmPage({ title: 'Bp Late', location: 'Civic Hall Ballarat', prices: 'Full: $50', sessions: [['Saturday', 'November 07, 2026', '20:30', '00:10']] }),
      url,
    )
    expect(found[0].startsAt).toBe('2026-11-07T09:30:00.000Z')
    expect(found[0].endsAt).toBeNull()
  })

  it('a page with no session, or no title, lands nothing; a venue it does not know keeps its name and no street', () => {
    expect(rule!.read(hmPage({ title: 'Bp Past', location: 'Civic Hall Ballarat', prices: '', sessions: [] }), url)).toEqual([])
    expect(rule!.read('<html><body><p>nothing</p></body></html>', url)).toEqual([])
    const other = rule!.read(hmPage({ title: 'Bp Elsewhere', location: 'Mining Exchange', prices: 'Full: $20', sessions: [['Sunday', 'November 08, 2026', '18:00', '']] }), url)
    expect(other[0]).toMatchObject({ venueName: 'Mining Exchange', venueAddress: null })
  })
})

const EU = 'https://eurekacentreballarat.com.au'
const euPage = (o: { title: string; when: string; where: string; cost: string; book?: string }) => `<html><body><div class="container">
<h1 class="small border-bottom-blue">${o.title}</h1><p>Words about the program, never kept.</p>
<div class="events-side-information column">
<h5 class="border-bottom-blue blue information-title">WHEN</h5><p class="date information dark-grey">
      ${o.when}        </p>
<h5 class="border-bottom-blue blue information-title">WHERE</h5><p class="information location dark-grey">${o.where}</p>
<h5 class="border-bottom-blue blue information-title">COST</h5><p class="information cost dark-grey">${o.cost}</p>
${o.book ? `<span class="booking-button-container"><a class="large-button" href="${o.book}" target="_blank">Click here to book</a></span>` : ''}
</div></div></body></html>`

describe('the Eureka Centre Ballarat rule', () => {
  const url = `${EU}/events/bp-proof-walk/`
  const rule = pageRuleFor(url)

  it('is found for its program pages', () => {
    expect(rule).not.toBeNull()
    expect(rule!.host).toBe('eurekacentreballarat.com.au')
    expect(rule!.eventPath.test('/events/bp-proof-walk/')).toBe(true)
    expect(rule!.eventPath.test('/events/page/2/')).toBe(false)
  })

  it("two times on one day are two nights; 'Free. Bookings via ...' is free with its booking link", () => {
    const found = rule!.read(euPage({ title: 'Bp Proof Walk', when: 'Thursday, December 03, 2026<br>10am and 2pm', where: 'Eureka Centre Ballarat',
      cost: 'Free. Bookings via Eventbrite', book: 'https://www.eventbrite.com.au/e/bp-proof-1' }), url)
    expect(found.map((f) => f.startsAt)).toEqual(['2026-12-02T23:00:00.000Z', '2026-12-03T03:00:00.000Z'])
    expect(found[0]).toMatchObject({ venueName: 'Eureka Centre Ballarat', venueAddress: '102 Stawell Street South, Ballarat VIC', endsAt: null })
    expect(found[0].links).toEqual([{ url: 'https://www.eventbrite.com.au/e/bp-proof-1', availability: 'on_sale', priceFromCents: 0 }])
  })

  it("a range keeps its finish ('2-3:30pm', '10am to 2pm'); a ticket price is the open price; no booking button links the page", () => {
    const a = rule!.read(euPage({ title: 'Bp Research', when: 'Tuesday, November 24, 2026<br>2-3:30pm', where: 'Ballarat Research Hub at Eureka (BRHAE)', cost: 'Free.' }), url)
    expect(a[0]).toMatchObject({ startsAt: '2026-11-24T03:00:00.000Z', endsAt: '2026-11-24T04:30:00.000Z', venueAddress: '102 Stawell Street South, Ballarat VIC' })
    expect(a[0].links).toEqual([{ url, availability: 'on_sale', priceFromCents: 0 }])
    const b = rule!.read(euPage({ title: 'Bp Day', when: 'Sunday, December 06, 2026<br>10am to 2pm', where: 'Eureka Centre Ballarat', cost: 'Tickets $15 ($12 concession). Bookings essential' }), url)
    expect(b[0]).toMatchObject({ startsAt: '2026-12-05T23:00:00.000Z', endsAt: '2026-12-06T03:00:00.000Z' })
    expect(b[0].links[0].priceFromCents).toBe(1500)
    const c = rule!.read(euPage({ title: 'Bp Talk', when: 'Thursday, November 05, 2026<br>5:30pm', where: 'Eureka Stockade Monument', cost: 'Included in museum entry fee' }), url)
    expect(c[0]).toMatchObject({ startsAt: '2026-11-05T06:30:00.000Z', venueName: 'Eureka Stockade Monument', venueAddress: null })
    expect(c[0].links[0].priceFromCents).toBeNull()
  })

  it('an exhibition (a date range) or a term-long series lands nothing: not one night', () => {
    expect(rule!.read(euPage({ title: 'Bp Prints', when: 'Saturday, June 06, 2026 - Sunday, February 21, 2027<br>10am-5pm', where: 'Eureka Centre Ballarat', cost: 'Included' }), url)).toEqual([])
    expect(rule!.read(euPage({ title: 'Bp Weekly', when: 'Thursday, October 08, 2026 - Thursday, December 17, 2026<br>10.30am, Every Thursday during school terms', where: 'Eureka Centre', cost: 'Free' }), url)).toEqual([])
  })
})
