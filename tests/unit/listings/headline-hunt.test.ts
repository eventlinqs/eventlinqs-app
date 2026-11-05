import { describe, expect, it } from 'vitest'
import { HUNT_HOLDS, HUNT_SOURCES, fold, huntDecision, huntFor, huntVenue, likelyDuplicate, plausibleHuntStart } from '@/lib/listings/headline-hunt'
import { pageRuleFor, eventPagesFromListPage } from '@/lib/listings/page-rules'

/* Car 44: the hunt's list, its venue match, and the arenas' page rule (one platform, /events/ to /event/<slug>/). */
describe('the hunt list', () => {
  it('names Melbourne, Geelong and Ballarat headline pages, and a page by its host', () => {
    expect(new Set(HUNT_SOURCES.map((h) => h.citySlug))).toEqual(new Set(['melbourne', 'geelong', 'ballarat']))
    expect(huntFor('https://www.rodlaverarena.com.au/events/')?.venues).toEqual(['Rod Laver Arena'])
    expect(huntFor('https://www.eventbrite.com.au/d/australia--geelong/events/')).toBeNull()
  })
  it("matches the night's own venue words to the venue the page speaks for, and nothing else", () => {
    const rla = huntFor('https://rodlaverarena.com.au/events/')!
    expect(huntVenue(rla, 'Rod Laver Arena')).toBe('Rod Laver Arena')
    expect(huntVenue(rla, 'Rod Laver Arena, Melbourne Park')).toBe('Rod Laver Arena')
    expect(huntVenue(rla, 'John Cain Arena')).toBeNull()
  })
})

/* Car 44b (the CONTROLLER's 01:05 of 5 November 2026). */
describe('the hunt, car 44b', () => {
  const day = (iso: string) => iso.slice(0, 10)
  it('reads Mount as Mt, and only as a whole word', () => {
    expect(fold('Mount Duneed Estate')).toBe('mt duneed estate')
    expect(fold('Paramount Theatre')).toBe('paramount theatre')
    const estate = huntFor('https://www.adayonthegreen.com.au/')!
    expect(huntVenue(estate, 'Mount Duneed Estate')).toBe('Mt Duneed Estate')
  })
  it('a likely duplicate is the same title on the same day in the same city, at any venue', () => {
    const known = [{ title: 'BOYZ II MEN', startsAt: '2026-12-05T18:00:00+11:00', citySlug: 'geelong' }]
    const night = { title: 'Boyz II Men', startsAt: '2026-12-05T19:30:00+11:00' }
    expect(likelyDuplicate(night, known, 'geelong', day)).toBe(true)
    expect(likelyDuplicate({ ...night, startsAt: '2026-12-06T19:30:00+11:00' }, known, 'geelong', day)).toBe(false)
    expect(likelyDuplicate(night, known, 'melbourne', day)).toBe(false)
    expect(likelyDuplicate({ ...night, title: 'Boyz II Men Tribute' }, known, 'geelong', day)).toBe(false)
  })
  it('a called off show, a night with no time and an unverified page still wait for a person', () => {
    expect([...HUNT_HOLDS]).toEqual(expect.arrayContaining(['similar_listing', 'called_off_words', 'midnight_start', 'source_unverified']))
  })
  it('decides by its rule a night that waited for a person from before the hunt, and never one a person refused', () => {
    const ruled = { decidedBy: 'partner_rule', confidence: 'high', kind: 'new' }
    const waiting = { status: 'waiting', decided_by: 'person', published_series_id: null }
    expect(huntDecision(waiting, ruled)).toBe('promote')
    expect(huntDecision(waiting, { ...ruled, decidedBy: 'person', confidence: 'low' })).toBe('leave')
    expect(huntDecision({ ...waiting, status: 'refused' }, ruled)).toBe('leave')
    expect(huntDecision({ status: 'accepted', decided_by: 'partner_rule', published_series_id: null }, ruled)).toBe('publish')
    expect(huntDecision({ status: 'accepted', decided_by: 'partner_rule', published_series_id: 's1' }, ruled)).toBe('leave')
    expect(huntDecision(null, ruled)).toBe('leave')
  })
  it("reads Geelong Arts Centre's rooms and Forum Melbourne by their own pages", () => {
    const gac = huntFor('https://geelongartscentre.org.au/sitemaps-1-section-event-1-sitemap.xml')!
    expect(gac.citySlug).toBe('geelong')
    expect(huntVenue(gac, 'Costa Hall')).toBe('Costa Hall')
    expect(huntVenue(gac, 'The Play House')).toBe('The Play House')
    expect(huntVenue(gac, 'Barwon Club')).toBeNull()
    expect(huntVenue(huntFor('https://forummelbourne.com.au/')!, 'Forum Melbourne')).toBe('Forum Melbourne')
  })
})

/*
 * Car 44c (the CONTROLLER's 14:55 of 5 November 2026, 'STOP THE LINE, WRONG TIMES ON LIVE FROM THE HUNT'). The arena pages
 * write their local clock into the schema.org Event with a false UTC offset; their own Date block is the truth. The three
 * source texts, as read that afternoon (C:\dev\EVIDENCE\CAR44\arena-times.txt).
 */
describe("the arenas' own Date block, never the schema's offset", () => {
  const arenaPage = (o: { type: string; name: string; startDate: string; endDate?: string; venue: string; date: string; time: string }) =>
    `<script type="application/ld+json">${JSON.stringify({
      '@type': o.type,
      name: o.name,
      startDate: o.startDate,
      ...(o.endDate ? { endDate: o.endDate } : {}),
      location: { name: o.venue, address: 'Olympic Boulevard, Melbourne VIC 3001' },
      offers: { url: 'https://www.ticketmaster.com.au/event/1', availability: 'InStock' },
    })}</script>
    <h1 class="text-white text-uppercase mb-2"> ${o.name}</h1>
    <h2 class="overline text-uppercase mb-1">Date</h2><p class="lead mb-1">${o.date}</p><p class=""> ${o.time}</p>
    <h2 class="overline text-uppercase mb-1">Venue</h2><p class="lead mb-2">${o.venue}</p>`
  const read = (url: string, html: string) => pageRuleFor(url)!.read(html, url).map((e) => e.startsAt)

  it("John Cain Arena: 'Saturday 7 November 2026 / 7:30 pm' is 7:30 pm in Melbourne, whatever '+00:00' says", () => {
    const url = 'https://johncainarena.com.au/event/melbourne-united-vs-brisbane-bullets-round-8-2026-27/'
    const html = arenaPage({ type: 'SportsEvent', name: 'Melbourne United vs Brisbane Bullets', startDate: '2026-11-07T19:30:00+00:00', venue: 'John Cain Arena', date: 'Saturday 7 November 2026', time: '7:30 pm' })
    expect(read(url, html)).toEqual(['2026-11-07T08:30:00.000Z'])
  })
  it("Rod Laver Arena: 'Thursday 12 to Saturday 14 November 2026 / 7:50 pm' is three nights at 7:50 pm", () => {
    const url = 'https://rodlaverarena.com.au/event/benson-boone-wanted-man-tour-melbourne-2026/'
    const html = arenaPage({ type: 'MusicEvent', name: 'Benson Boone', startDate: '2026-11-12T19:50:00+00:00', endDate: '2026-11-14T19:50:00+00:00', venue: 'Rod Laver Arena', date: 'Thursday 12 to Saturday 14 November 2026', time: '7:50 pm' })
    expect(read(url, html)).toEqual(['2026-11-12T08:50:00.000Z', '2026-11-13T08:50:00.000Z', '2026-11-14T08:50:00.000Z'])
  })
  it("AAMI Park: 'Friday 13 November 2026 / 7:20 pm' is 7:20 pm in Melbourne", () => {
    const url = 'https://aamipark.com.au/event/iron-maiden-run-for-your-lives-world-tour-2026/'
    const html = arenaPage({ type: 'MusicEvent', name: 'Iron Maiden', startDate: '2026-11-13T19:20:00+00:00', venue: 'AAMI Park', date: 'Friday 13 November 2026', time: '7:20 pm' })
    expect(read(url, html)).toEqual(['2026-11-13T08:20:00.000Z'])
  })
  it('lists nothing it would have to guess: no Date block, no time, or a run longer than three days', () => {
    const url = 'https://rodlaverarena.com.au/event/a-long-run/'
    const base = { type: 'MusicEvent', name: 'A Long Run', startDate: '2026-11-27T19:30:00+00:00', venue: 'Rod Laver Arena', date: 'Friday 27 November 2026', time: '7:30 pm' }
    expect(read(url, arenaPage(base).replace(/<h2[^>]*>Date<\/h2>/, ''))).toEqual([])
    expect(read(url, arenaPage({ ...base, time: 'TBC' }))).toEqual([])
    expect(read(url, arenaPage({ ...base, date: 'Friday 27 November to Sunday 6 December 2026' }))).toEqual([])
    expect(read(url, arenaPage({ ...base, date: 'Saturday 28 November to Sunday 29 November 2026' }))).toHaveLength(2)
  })
  it('the hunt lists by rule no night starting between midnight and 9 am in Melbourne', () => {
    expect(plausibleHuntStart('2026-11-07T19:30:00.000Z')).toBe(false) // Sunday 6:30 am, the fault as it showed on live
    expect(plausibleHuntStart('2026-11-07T08:30:00.000Z')).toBe(true) // Saturday 7:30 pm
    expect(plausibleHuntStart('2026-12-05T23:00:00.000Z')).toBe(true) // Sunday 10 am
  })
})

describe("the arenas' page rule", () => {
  it('reads each show page the list page links, on the same host only', () => {
    const rule = pageRuleFor('https://rodlaverarena.com.au/events/')!
    expect(rule).not.toBeNull()
    const html = '<a href="/event/a-big-show/">A</a><a href="https://rodlaverarena.com.au/event/second/">B</a><a href="https://elsewhere.com/event/x/">C</a><a href="/events/">All</a>'
    expect(eventPagesFromListPage(html, 'https://rodlaverarena.com.au/events/', rule)).toEqual([
      'https://rodlaverarena.com.au/event/a-big-show/',
      'https://rodlaverarena.com.au/event/second/',
    ])
  })
})
