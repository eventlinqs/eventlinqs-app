import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('@/components/features/events/venue-map-lazy', () => ({
  VenueMapLazy: (p: { venueName: string | null }) => <div data-map-for={p.venueName ?? ''} />,
}))

import { EventVenueSection } from '@/components/events/event-page/event-venue-section'
import { EVENT_PAGE_SECTIONS } from '@/components/events/event-page/event-sections'

/*
 * ONE EVENT PAGE (the CONTROLLER's 31 October 10:05; Lawal 08:57: the AMCF page showed no map while Michael's did): the
 * venue is ONE component on every event page, whatever its admission state: the map with its pin, then getting there
 * (the venue, its address or the organiser's own getting-there words, access notes, Get directions).
 */
const FED = {
  venue_name: 'Fed Square',
  venue_address: 'Corner of Swanston and Flinders Streets',
  venue_city: 'Melbourne',
  venue_state: 'VIC',
  venue_country: 'AU',
  venue_latitude: -37.818,
  venue_longitude: 144.969,
}

const markers = (root: HTMLElement) => Array.from(root.querySelectorAll('[data-event-section]')).map((el) => el.getAttribute('data-event-section'))

describe('the one venue section', () => {
  it('draws the map with its pin, then getting there with the address and Get directions', () => {
    const { container } = render(<EventVenueSection event={FED} heading={<h2>Getting there and access</h2>} />)
    expect(markers(container)).toEqual(['map', 'getting-there'])
    expect(container.querySelector('[data-map-for="Fed Square"]')).not.toBeNull()
    expect(container.textContent).toContain('Corner of Swanston and Flinders Streets')
    const link = container.querySelector('a[href^="https://www.google.com/maps/dir/"]')
    expect(link?.getAttribute('href')).toBe('https://www.google.com/maps/dir/?api=1&destination=-37.818%2C144.969')
  })

  it("prints the organiser's own getting-there words and access notes when it has them", () => {
    const { container } = render(
      <EventVenueSection event={FED} heading={<h2>x</h2>} gettingThere="Fed Square is easily accessible by train." accessNotes="Lift access to all areas." />,
    )
    expect(container.textContent).toContain('Fed Square is easily accessible by train.')
    expect(container.textContent).toContain('Lift access to all areas.')
  })

  it('says the venue and address once: a page whose facts already state them draws the map and Get directions only', () => {
    const { container } = render(<EventVenueSection event={FED} heading={<h2>Venue</h2>} addressStatedAbove />)
    expect(markers(container)).toEqual(['map', 'getting-there'])
    expect(container.textContent).not.toContain('Corner of Swanston and Flinders Streets')
    expect(container.querySelectorAll('a[href^="https://www.google.com/maps/dir/"]').length).toBe(1)
  })

  it('draws nothing for an event with no venue', () => {
    const { container } = render(<EventVenueSection event={{ ...FED, venue_name: null, venue_address: null, venue_latitude: null, venue_longitude: null }} heading={<h2>x</h2>} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('every event page draws the shared sections through the spine, in its one order', () => {
  it('the spine is hero, facts, map, getting there, organiser', () => {
    expect(EVENT_PAGE_SECTIONS).toEqual(['hero', 'facts', 'map', 'getting-there', 'organiser'])
  })

  // Both templates, read as text with line ends normalised (the gate tree checks out CRLF).
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')
  for (const file of ['src/app/events/[slug]/page.tsx', 'src/components/events/walk-in/walk-in-event-page.tsx']) {
    it(`${file} draws the venue through EventVenueSection and never VenueMapLazy itself`, () => {
      const src = read(file)
      expect(src).toContain('<EventVenueSection')
      expect(src).not.toContain('<VenueMapLazy')
    })
    it(`${file} marks hero, facts and organiser in that order around the venue`, () => {
      const src = read(file)
      const at = (name: string) => src.indexOf(`<EventSection name="${name}"`)
      const venue = src.indexOf('<EventVenueSection')
      expect(at('hero')).toBeGreaterThan(-1)
      expect(at('hero')).toBeLessThan(at('facts'))
      expect(at('facts')).toBeLessThan(venue)
      expect(venue).toBeLessThan(at('organiser'))
    })
  }
})
