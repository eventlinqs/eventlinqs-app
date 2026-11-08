import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/city/geelong',
}))

import { CityGuide, bookingLine, countLine, eventCount } from '@/components/features/city-guide/city-guide'
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
  categorySlug: 'comedy', price: 'Free entry', time: '6:00 pm', free: true, source: 'Free · Walk in',
  format: 'walk_in', cityKey: 'geelong', suburb: 'South Geelong', dayKey: '2026-11-03', dayLabel: 'Tuesday 3 November',
  ts: 1, thumb: null, lat: null, lng: null, ...o,
})
const days = {
  todayKey: '2026-11-02', tomorrowKey: '2026-11-03', weekendKeys: ['2026-11-06', '2026-11-07', '2026-11-08'],
  weekKeys: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'],
}
const rows = [
  row({}),
  row({ id: 'r2', href: '/events/r2', title: 'Katie Noonan', categorySlug: 'music', category: 'Music', price: '', source: 'Tickets at Geelong Arts Centre', free: false, format: 'ticketed', suburb: 'Geelong', dayKey: '2026-11-06', dayLabel: 'Friday 6 November', time: '7:30 pm', ts: 2 }),
  row({ id: 'r3', href: '/events/r3', title: 'Comedy Republic Main Stage', city: 'Melbourne', cityKey: 'melbourne', suburb: 'Melbourne' }),
  row({ id: 'r4', href: '/events/r4', title: 'Saturday Market', categorySlug: 'markets', category: 'Markets', suburb: 'Belmont', dayKey: '2026-11-07', dayLabel: 'Saturday 7 November', ts: 3 }),
  row({ id: 'r5', href: '/events/r5', title: 'Our Own Night', categorySlug: 'community', category: 'Community', price: 'From AUD $15', source: 'Book on EventLinqs', free: false, format: 'ticketed', suburb: 'Geelong West', dayKey: '2026-12-04', dayLabel: 'Friday 4 December', ts: 4 }),
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
      stateHref="/state/victoria"
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
    // The CONTROLLER's 14:10: Victoria and the other cities are links, the city this is shows selected (aria-current).
    expect([...group.querySelectorAll('a, button, [aria-current]')].map((e) => e.textContent?.trim())).toEqual(['Victoria', 'Geelong', 'Melbourne', 'Ballarat', 'Bendigo', 'Change city'])
    expect(within(group).getByRole('link', { name: 'Victoria' }).getAttribute('href')).toBe('/state/victoria')
    expect(group.querySelector('[aria-current="page"]')?.textContent).toBe('Geelong')
    const when = screen.getByRole('group', { name: 'When' })
    for (const w of ['Today', 'This weekend', 'This week', 'This month', 'Next 3 months', 'All dates', 'Pick dates']) expect(within(when).getByText(w)).toBeInTheDocument()
  })

  it('2: tiles in Lawal\u2019s order with counts from the city\u2019s own rows, community last, none at 0, All events at the end', () => {
    guide()
    const explore = screen.getByRole('region', { name: 'Explore Geelong' })
    const tiles = within(explore).getAllByRole('button').map((b) => b.textContent?.replace(/\s+/g, ' ').trim())
    expect(tiles).toEqual(['Music1 event', 'Comedy1 event', 'Markets1 event', 'Community1 event', 'All events4 events'])
  })

  // Round 3, LOCKED (Lawal 17:00 to 17:10; ROUND3-DIRECTIVE-2NOV.md): Big nights by a stated rule, the rails, no listing twice.
  // Law 18 (Lawal, 4 November 2026, 15:12): and only with its photograph.
  it('3: Big nights shows only a paid night at a named big venue WITH its photograph, and is not drawn without one', () => {
    const { unmount } = guide()
    expect(screen.queryByRole('region', { name: 'Big nights in Geelong' })).toBeNull()
    unmount()
    render(
      <CityGuide
        city={{ slug: 'geelong', name: 'Geelong', state: 'VIC', lat: -38.15, lng: 144.36 }}
        stateName="Victoria" stateCityNames={['geelong']} quickCities={[{ slug: 'geelong', name: 'Geelong' }]} allCities={[]}
        rows={[...rows, row({ id: 'b1', href: '/events/b1', title: 'Hindley Street Country Club', venue: 'Costa Hall', free: false, format: 'ticketed', price: 'From AUD $59', source: 'Tickets at Geelong Arts Centre', dayKey: '2026-11-14', ts: 9, thumb: '/p/own.jpg' })]}
        days={days}
      />,
    )
    const big = screen.getByRole('region', { name: 'Big nights in Geelong' })
    expect(within(big).getByText('Hindley Street Country Club')).toBeInTheDocument()
    expect(screen.getAllByText('Hindley Street Country Club')).toHaveLength(1)
  })

  it('4: This weekend runs Friday to Sunday as cards, and every Geelong listing appears once on the page', () => {
    guide()
    const weekend = screen.getByRole('region', { name: 'This weekend in Geelong' })
    expect(within(weekend).getByText('Katie Noonan')).toBeInTheDocument()
    expect(within(weekend).getByText('Saturday Market')).toBeInTheDocument()
    expect(within(weekend).queryByText('Open Mic Comedy')).toBeNull()
    for (const t of ['Open Mic Comedy', 'Katie Noonan', 'Saturday Market', 'Our Own Night']) expect(screen.getAllByText(t)).toHaveLength(1)
  })

  it('5: All events in Geelong never shows another city; suburb and price filter it, and then it is the whole answer', () => {
    guide()
    const all = screen.getByRole('region', { name: 'All events in Geelong' })
    expect(within(all).getByText('Our Own Night')).toBeInTheDocument()
    expect(within(all).queryByText('Comedy Republic Main Stage')).toBeNull()
    fireEvent.change(within(all).getByLabelText('Suburb'), { target: { value: 'Belmont' } })
    expect(within(all).getByText('Saturday Market')).toBeInTheDocument()
    expect(within(all).queryByText('Open Mic Comedy')).toBeNull()
    expect(within(all).getByText('Next 3 months: 1 event, 1 date. 4 events in all.')).toBeInTheDocument()
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

  it('6: Hosting an event in Geelong? goes to existing routes only, and offers no claim while claims are off', () => {
    // Round 2 (d), Lawal 2 November 12:05: the block's offers come only from the platform's real terms. Claiming is behind
    // feature_flags.listing_claims (OFF on production, read 14:30: until Lawal approves the privacy version naming claims).
    guide()
    const host = screen.getByRole('region', { name: 'Hosting an event in Geelong?' })
    expect([...host.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/submit-event?city=geelong#submit', '/organisers'])
    expect(host.textContent).not.toMatch(/claim/i)
  })

  it('6: with claims on, the claim card leads the block', () => {
    render(
      <CityGuide
        city={{ slug: 'geelong', name: 'Geelong', state: 'VIC', lat: -38.15, lng: 144.36 }}
        stateName="Victoria" stateCityNames={['geelong']} quickCities={[{ slug: 'geelong', name: 'Geelong' }]} allCities={[]}
        rows={rows} days={days} claimsOn
      />,
    )
    const host = screen.getByRole('region', { name: 'Hosting an event in Geelong?' })
    expect([...host.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['#city-calendar', '/submit-event?city=geelong#submit', '/organisers'])
  })

  it('the Victoria page (scope state) holds the state\u2019s listed cities and says so; Victoria is its current chip', () => {
    render(
      <CityGuide
        city={{ slug: 'melbourne', name: 'Melbourne', state: 'VIC', lat: -37.81, lng: 144.96 }}
        stateName="Victoria"
        stateCityNames={['geelong', 'melbourne', 'ballarat', 'bendigo']}
        quickCities={[{ slug: 'geelong', name: 'Geelong' }, { slug: 'melbourne', name: 'Melbourne' }, { slug: 'ballarat', name: 'Ballarat' }, { slug: 'bendigo', name: 'Bendigo' }]}
        allCities={[]}
        rows={rows}
        days={days}
        scope="state"
        stateHref="/state/victoria"
      />,
    )
    expect(screen.getAllByText('Comedy Republic Main Stage').length).toBeGreaterThan(0)
    expect(screen.getByRole('region', { name: 'Explore Victoria' })).toBeInTheDocument()
    const group = screen.getByRole('group', { name: 'Choose a city' })
    expect(group.querySelector('[aria-current="page"]')?.textContent).toBe('Victoria')
    expect(within(group).getByRole('link', { name: 'Melbourne' }).getAttribute('href')).toBe('/city/melbourne')
  })
})

describe('a long city is cheap to lay out (2 November 2026, Lighthouse on the preview: TBT 250 to 306 ms over 7,965 elements)', () => {
  it('every month group of the list skips layout until it nears the screen, keeping its place (content-visibility auto)', () => {
    guide()
    const all = screen.getByRole('region', { name: 'All events in Geelong' })
    const days = [...all.querySelectorAll('section[aria-label]')]
    expect(days.length).toBeGreaterThan(0)
    for (const d of days) expect(d.className).toContain('[content-visibility:auto]')
    for (const d of days) expect(d.className).toContain('[contain-intrinsic-size:auto_480px]')
  })
})

describe('booking, one rule, each fact once, never a domain (the directive, D; Lawal 2 November 09:00, refinements 1 and 4)', () => {
  it('our checkout says Book on EventLinqs; another site Tickets at <seller> with the outbound mark; free walk-in Free · Walk in, said once', () => {
    expect(bookingLine({ price: 'From AUD $15', source: 'Book on EventLinqs', free: false })).toEqual({ said: 'From AUD $15', book: 'Book on EventLinqs', outbound: false })
    expect(bookingLine({ price: '', source: 'Tickets at Geelong Arts Centre', free: false })).toEqual({ said: null, book: 'Tickets at Geelong Arts Centre', outbound: true })
    expect(bookingLine({ price: 'Free, registration required', source: 'Register at Geelong Regional Libraries', free: true })).toEqual({ said: 'Free', book: 'Register at Geelong Regional Libraries', outbound: true })
    expect(bookingLine({ price: '', source: 'Get tickets', free: false })).toEqual({ said: null, book: 'Get tickets', outbound: true })
    expect(bookingLine({ price: 'Free entry', source: 'Free · Walk in', free: true })).toEqual({ said: 'Free · Walk in', book: null, outbound: false })
  })

  it('a night sold elsewhere names its seller once on its row, with a mark that says another site', () => {
    guide()
    const text = document.querySelector('a[href="/events/r2"]')?.textContent ?? ''
    expect(text.split('Tickets at Geelong Arts Centre').length - 1).toBe(1)
    expect(text).toContain('(another site)')
  })

  it('a free walk-in row says Free · Walk in once, in its one meta line, and nothing else about price', () => {
    guide()
    const text = document.querySelector('a[href="/events/r1"]')?.textContent ?? ''
    expect(text).toContain('Comedy · Free · Walk in')
    expect(text.split('Free').length - 1).toBe(1)
    expect(text).not.toContain('Free entry')
  })

  it('no row anywhere on the page names a domain', () => {
    guide()
    for (const a of document.querySelectorAll('a[href^="/events/"]')) {
      expect(a.textContent ?? '').not.toMatch(/\b[a-z0-9-]+\.(com|org|net|au|club)\b/i)
    }
  })
})

describe('the count is told honestly, events and dates (the CONTROLLER 09:13 (3))', () => {
  it('a weekly night is one event on many dates; the line and the tiles count events', () => {
    const weekly = [row({ id: 'w1', dayKey: '2026-11-03' }), row({ id: 'w2', href: '/events/w2', dayKey: '2026-11-10', dayLabel: 'Tuesday 10 November' }), row({ id: 'w3', href: '/events/w3', dayKey: '2026-11-17', dayLabel: 'Tuesday 17 November' })]
    expect(eventCount(weekly)).toBe(1)
    expect(countLine(weekly, null, 'All dates')).toBe('All dates: 1 event, 3 dates.')
    // The CONTROLLER's 08:50 (1), from the 5 November audit: the range's own name, what it holds, then the whole count.
    expect(countLine(weekly.slice(0, 1), weekly, 'This week')).toBe('This week: 1 event, 1 date. 1 event in all.')
    render(
      <CityGuide
        city={{ slug: 'geelong', name: 'Geelong', state: 'VIC', lat: -38.15, lng: 144.36 }}
        stateName="Victoria" stateCityNames={['geelong']} quickCities={[{ slug: 'geelong', name: 'Geelong' }]} allCities={[]}
        rows={weekly} days={days}
      />,
    )
    expect(screen.getByText('Next 3 months: 1 event, 3 dates.')).toBeInTheDocument()
    expect(screen.queryByText(/coming up in/)).toBeNull()
    const explore = screen.getByRole('region', { name: 'Explore Geelong' })
    expect(within(explore).getAllByRole('button').map((b) => b.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['Comedy1 event', 'All events1 event'])
  })
})

describe('the filters are shorter on a phone, every control kept (Lawal 2 November 09:00, refinement 3)', () => {
  it('the whole-country search sits on the search row; the distance is one chip with the choice in force', () => {
    guide()
    const link = screen.getByRole('link', { name: 'Search all of Australia' })
    expect(link.textContent).toBe('All of Australia')
    const distance = screen.getByLabelText('Distance') as HTMLSelectElement
    expect([...distance.options].map((o) => o.textContent)).toEqual(['In Geelong', 'Within 25 km', 'Within 50 km'])
    fireEvent.change(distance, { target: { value: '25' } })
    expect(screen.getByText(/^Next 3 months, Geelong and within 25 km: \d+ events?, \d+ dates?\./)).toBeInTheDocument()
  })
})

describe('the slider stays built behind its own rule (not drawn on the reference page)', () => {
  it(`is not drawn at all under ${SLIDER_MINIMUM}`, () => {
    const { container } = render(<CityHeroSlider events={[card(1), card(2)]} cityName="Geelong" />)
    expect(container.innerHTML).toBe('')
  })
})

/*
 * THE EMAIL ALERTS SIGN UP, WHERE THE GUIDE PROMISES IT (the CONTROLLER's 22:06 of 4 November 2026; the forms check: the
 * only sign up panel on the platform, email-signup-panel.tsx, was on no page and wrote a table nothing sends to). Each
 * city guide links the real one, /waitlist (joinCityWaitlist: versioned consent, a Resend confirmation, one click
 * unsubscribe), with its city chosen, in the words of the consent the person reads: alerts, never a weekly promise.
 */
describe('each city guide links its email alerts sign up', () => {
  it("'Get Geelong alerts by email' opens the sign up with Geelong chosen", () => {
    guide()
    const link = screen.getByRole('link', { name: /Get Geelong alerts by email/ })
    expect(link.getAttribute('href')).toBe('/waitlist?city=geelong')
  })
})
