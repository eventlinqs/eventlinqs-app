import { describe, expect, it } from 'vitest'
import { HUNT_SOURCES, huntFor, huntVenue } from '@/lib/listings/headline-hunt'
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
