import { describe, expect, it } from 'vitest'
import { HUNT_HOLDS, HUNT_SOURCES, fold, huntFor, huntVenue, likelyDuplicate } from '@/lib/listings/headline-hunt'
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
  it("reads Geelong Arts Centre's rooms and Forum Melbourne by their own pages", () => {
    const gac = huntFor('https://geelongartscentre.org.au/sitemaps-1-section-event-1-sitemap.xml')!
    expect(gac.citySlug).toBe('geelong')
    expect(huntVenue(gac, 'Costa Hall')).toBe('Costa Hall')
    expect(huntVenue(gac, 'The Play House')).toBe('The Play House')
    expect(huntVenue(gac, 'Barwon Club')).toBeNull()
    expect(huntVenue(huntFor('https://forummelbourne.com.au/')!, 'Forum Melbourne')).toBe('Forum Melbourne')
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
