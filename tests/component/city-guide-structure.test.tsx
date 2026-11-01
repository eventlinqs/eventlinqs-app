import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/city/geelong',
}))

import { CityGuide, bookingLine, WORTH_MINIMUM } from '@/components/features/city-guide/city-guide'
import { CityHeroSlider, SLIDER_MINIMUM } from '@/components/features/city-guide/city-hero-slider'
import type { EventCardData } from '@/components/features/events/event-card'
import type { DirectoryRow } from '@/lib/events/whats-on-directory'

/*
 * THE GEELONG REFERENCE PAGE (Lawal, 2 November 2026, 01:12; C:\dev\DESIGN\CITY-FIRST-1NOV\GEELONG-REFERENCE-DIRECTIVE-2NOV.md):
 * six sections in order: 1 city discovery (city chips, search, dates), 2 'Discover your kind of event' tiles with real
 * counts, 3 'Worth going out for' only from rights recorded organiser artwork and not drawn under three, 4 'Plan your
 * weekend' Friday to Sunday with All, Free and Paid, 5 'All events in <city>' with category, suburb, date and price, never
 * another city, 6 'Hosting an event in <city>?' to existing routes. Booking reads one rule. The city is data.
 */
const row = (o: Partial<DirectoryRow>): DirectoryRow => ({
  id: 'r1', href: '/events/r1', title: 'Open Mic Comedy', venue: 'The Barwon Club', city: 'Geelong', category: 'Comedy',
  categorySlug: 'comedy', price: 'Free entry', time: '6:00 pm', free: true, source: 'Walk in, no ticket needed',
  format: 'walk_in', cityKey: 'geelong', suburb: 'South Geelong', dayKey: '2026-11-03', dayLabel: 'Tuesday 3 November',
  ts: 1, thumb: null, lat: null, lng: null, ...o,
})
const days = {
  todayKey: '2026-11-02', tomorrowKey: '2026-11-03', weekendKeys: ['2026-11-07', '2026-11-08'], fridayKey: '2026-11-06',
  weekKeys: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'],
}
const rows = [
  row({}),
  row({ id: 'r2', href: '/events/r2', title: 'Katie Noonan', categorySlug: 'music', category: 'Music', price: 'Tickets on geelongartscentre.org.au', source: 'Tickets on geelongartscentre.org.au', free: false, format: 'ticketed', suburb: 'Geelong', dayKey: '2026-11-06', dayLabel: 'Friday 6 November', time: '7:30 pm', ts: 2 }),
  row({ id: 'r3', href: '/events/r3', title: 'Comedy Republic Main Stage', city: 'Melbourne', cityKey: 'melbourne', suburb: 'Melbourne' }),
  row({ id: 'r4', href: '/events/r4', title: 'Saturday Market', categorySlug: 'markets', category: 'Markets', suburb: 'Belmont', dayKey: '2026-11-07', dayLabel: 'Saturday 7 November', ts: 3 }),
  row({ id: 'r5', href: '/events/r5', title: 'Our Own Night', categorySlug: 'community', category: 'Community', price: 'From AUD $15', source: 'Tickets on EventLinqs', free: false, format: 'ticketed', suburb: 'Geelong West', dayKey: '2026-12-04', dayLabel: 'Friday 4 December', ts: 4 }),
]
const guide = (worth: EventCardData[] = []) =>
  render(
    <CityGuide
      city={{ slug: 'geelong', name: 'Geelong', state: 'VIC', lat: -38.15, lng: 144.36 }}
      stateName="Victoria"
      stateCityNames={['geelong', 'melbourne', 'ballarat', 'bendigo']}
      quickCities={[{ slug: 'geelong', name: 'Geelong' }, { slug: 'melbourne', name: 'Melbourne' }, { slug: 'ballarat', name: 'Ballarat' }, { slug: 'bendigo', name: 'Bendigo' }]}
      allCities={[]}
      rows={rows}
      days={days}
      worth={worth}
    />,
  )
const card = (i: number): EventCardData => ({
  id: `e${i}`, slug: `night-${i}`, title: `Worth night ${i}`, cover_image_url: `/images/test/${i}.jpg`, thumbnail_url: null,
  start_date: '2026-11-06T08:30:00Z', timezone: 'Australia/Melbourne', venue_name: 'Costa Hall', venue_city: 'Geelong',
  venue_country: 'Australia', created_at: '2026-11-01T00:00:00Z', category: null, ticket_tiers: [], cover_rights_recorded: true,
})

describe('the Geelong reference page, section by section', () => {
  it('1: the switcher reads Victoria, the cities, Change city; the five date chips are visible words', () => {
    guide()
    const group = screen.getByRole('group', { name: 'Choose a city' })
    expect([...group.querySelectorAll('a, button')].map((e) => e.textContent?.trim())).toEqual(['Victoria', 'Geelong', 'Melbourne', 'Ballarat', 'Bendigo', 'Change city'])
    const when = screen.getByRole('group', { name: 'When' })
    for (const w of ['Today', 'Tomorrow', 'This weekend', 'Next 7 days', 'Choose dates']) expect(within(when).getByText(w)).toBeInTheDocument()
  })

  it('2: tiles in Lawal\u2019s order with counts from the city\u2019s own rows, community last, none at 0, All events at the end', () => {
    guide()
    const explore = screen.getByRole('region', { name: 'Explore Geelong' })
    const tiles = within(explore).getAllByRole('button').map((b) => b.textContent?.replace(/\s+/g, ' ').trim())
    expect(tiles).toEqual(['Music1 event', 'Comedy1 event', 'Markets1 event', 'Community1 event', 'All events4 events'])
  })

  it(`3: 'Worth going out for' is not drawn under ${WORTH_MINIMUM}, and is drawn at ${WORTH_MINIMUM}`, () => {
    const { unmount } = guide([card(1), card(2)])
    expect(screen.queryByRole('region', { name: 'Worth going out for' })).toBeNull()
    unmount()
    guide([card(1), card(2), card(3)])
    expect(screen.getByRole('region', { name: 'Worth going out for' })).toBeInTheDocument()
  })

  it('4: Plan your weekend runs Friday to Sunday, with All, Free and Paid', () => {
    guide()
    const weekend = screen.getByRole('region', { name: 'This weekend in Geelong' })
    expect(within(weekend).getByText('Katie Noonan')).toBeInTheDocument()
    expect(within(weekend).getByText('Saturday Market')).toBeInTheDocument()
    expect(within(weekend).queryByText('Open Mic Comedy')).toBeNull()
    fireEvent.click(within(within(weekend).getByRole('group', { name: 'This weekend, by price' })).getByRole('button', { name: 'Free' }))
    expect(within(weekend).queryByText('Katie Noonan')).toBeNull()
    expect(within(weekend).getByText('Saturday Market')).toBeInTheDocument()
  })

  it('5: All events in Geelong lists every Geelong night and never another city; suburb and price filter it', () => {
    guide()
    const all = screen.getByRole('region', { name: 'All events in Geelong' })
    for (const t of ['Open Mic Comedy', 'Katie Noonan', 'Saturday Market', 'Our Own Night']) expect(within(all).getByText(t)).toBeInTheDocument()
    expect(within(all).queryByText('Comedy Republic Main Stage')).toBeNull()
    fireEvent.change(within(all).getByLabelText('Suburb'), { target: { value: 'Belmont' } })
    expect(within(all).getByText('Saturday Market')).toBeInTheDocument()
    expect(within(all).queryByText('Open Mic Comedy')).toBeNull()
    expect(within(all).getByText(/1 of 4/)).toBeInTheDocument()
    fireEvent.click(within(all).getByRole('button', { name: /Clear/ }))
    fireEvent.click(within(within(all).getByRole('group', { name: 'Price' })).getByRole('button', { name: 'Paid' }))
    expect(within(all).getByText('Katie Noonan')).toBeInTheDocument()
    expect(within(all).queryByText('Open Mic Comedy')).toBeNull()
  })

  it('5: a city whose rows name one suburb shows no suburb choice (a filter with one option is noise)', () => {
    render(
      <CityGuide
        city={{ slug: 'geelong', name: 'Geelong', state: 'VIC', lat: -38.15, lng: 144.36 }}
        stateName="Victoria" stateCityNames={['geelong']} quickCities={[{ slug: 'geelong', name: 'Geelong' }]} allCities={[]}
        rows={[row({ suburb: 'Geelong' }), row({ id: 'x2', href: '/events/x2', suburb: 'Geelong' })]} days={days}
      />,
    )
    expect(screen.queryByLabelText('Suburb')).toBeNull()
  })

  it('6: Hosting an event in Geelong? goes to existing routes only', () => {
    guide()
    const host = screen.getByRole('region', { name: 'Hosting an event in Geelong?' })
    expect([...host.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['#city-calendar', '/submit-event', '/organisers'])
  })

  it('Victoria widens on purpose to the state\u2019s listed cities, and says so', () => {
    guide()
    fireEvent.click(screen.getByRole('button', { name: 'Victoria' }))
    expect(screen.getAllByText('Comedy Republic Main Stage').length).toBeGreaterThan(0)
    expect(screen.getByRole('region', { name: 'Explore Victoria' })).toBeInTheDocument()
  })
})

describe('booking, one rule (the directive, D)', () => {
  it('our checkout says Book on EventLinqs; another site says Tickets on <site> with the outbound mark; free walk-in says Free entry', () => {
    expect(bookingLine({ price: 'From AUD $15', source: 'Tickets on EventLinqs', free: false })).toEqual({ price: 'From AUD $15', book: 'Book on EventLinqs', outbound: false })
    expect(bookingLine({ price: 'Tickets on geelongartscentre.org.au', source: 'Tickets on geelongartscentre.org.au', free: false })).toEqual({ price: null, book: 'Tickets on geelongartscentre.org.au', outbound: true })
    expect(bookingLine({ price: 'Free entry', source: 'Walk in, no ticket needed', free: true })).toEqual({ price: 'Free entry', book: null, outbound: false })
  })

  it('a night sold elsewhere names its site once on its row, with a mark that says another site', () => {
    guide()
    const all = screen.getByRole('region', { name: 'All events in Geelong' })
    const link = all.querySelector('a[href="/events/r2"]')
    const text = link?.textContent ?? ''
    // The phone line and the wide column are the same words in two places; one is hidden by width, never both shown.
    expect(text.split('Tickets on geelongartscentre.org.au').length - 1).toBe(2)
    expect(text).toContain('(another site)')
  })
})

describe('the slider stays built behind its own rule (not drawn on the reference page)', () => {
  it(`is not drawn at all under ${SLIDER_MINIMUM}`, () => {
    const { container } = render(<CityHeroSlider events={[card(1), card(2)]} cityName="Geelong" />)
    expect(container.innerHTML).toBe('')
  })
})
