import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { WeekendDay } from '@/lib/events/weekend-days'
import type { EventCardData } from '@/components/features/events/event-card'

/**
 * The shared chrome suspends and is not what this file is about, the same
 * reason and the same mock as tests/component/fee-sentence-spacing.test.tsx.
 * Without it the render produces an empty body and every assertion below fails
 * for a reason that has nothing to do with the page.
 */
vi.mock('@/components/layout/PageShell', () => ({
  PageShell: ({ children }: { children: unknown }) => children,
}))

/**
 * The REAL `EventCard` renders here, and it carries a save button that calls
 * `useRouter`. The router is shimmed rather than the card being stubbed out,
 * because a test that replaced the card would no longer prove that the day
 * groups render cards at all, which is half of what it is for.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/this-weekend',
  useSearchParams: () => new URLSearchParams(),
}))

const { WeekendLandingPage } = await import('@/components/templates/WeekendLandingPage')

/**
 * THE WEEKEND LANDING RENDERS TWO STATES AND BOTH ARE THE PAGE (close-out AQ3).
 *
 * The drives prove the populated page and the empty page against a real server
 * and real rows (scripts/verify/weekend-surface-drive.mjs and
 * weekend-empty-state-drive.mjs). What they cannot do cheaply is exercise the
 * SHAPE of a weekend that does not exist yet: a single day, a day with one
 * event, a weekend that straddles a month. Those are here.
 *
 * WHY THE EMPTY CASE IS COVERED TWICE, in a drive and again here. Emptying the
 * weekend for the drive means drafting every event in the window, restarting the
 * server and putting them back, which is ninety seconds of mutated shared TEST
 * state. That is worth doing once for the proof; it is not worth doing on every
 * `npm test`. This is the cheap half, and it is what would catch somebody
 * deleting the empty branch.
 */

function day(key: string, heading: string, titles: string[]): WeekendDay<EventCardData> {
  return {
    key,
    heading,
    events: titles.map((title, i) => ({
      id: `${key}-${i}`,
      slug: `lane-c-${key}-${i}`,
      title,
      cover_image_url: null,
      thumbnail_url: null,
      start_date: `${key}T09:00:00.000Z`,
      timezone: 'Australia/Sydney',
      venue_name: 'The Wool Exchange',
      venue_city: 'Geelong',
      venue_country: 'Australia',
      created_at: '2026-09-01T00:00:00.000Z',
      category: null,
      ticket_tiers: [],
      is_free: true,
      // The grouping only needs a date and a zone; the card needs a whole row.
      // Cast once, here, rather than writing out every column the card ignores.
    })) as unknown as EventCardData[],
  }
}

const base = {
  weekend: 'Saturday 19 and Sunday 20 September',
  heroImage: '/images/hero/homepage-day-festival.jpg',
  heroAlt: 'A crowd at an outdoor event',
  cities: [{ slug: 'geelong', name: 'Geelong', count: 2 }],
}

describe('WeekendLandingPage', () => {
  it('with two days, heads each one with its own date and keeps them in order', () => {
    render(
      <WeekendLandingPage
        {...base}
        total={3}
        days={[
          day('2026-09-19', 'Saturday 19 September', ['Saturday one', 'Saturday two']),
          day('2026-09-20', 'Sunday 20 September', ['Sunday one']),
        ]}
      />,
    )
    const headings = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
    expect(headings).toContain('Saturday 19 September')
    expect(headings).toContain('Sunday 20 September')
    expect(headings.indexOf('Saturday 19 September')).toBeLessThan(headings.indexOf('Sunday 20 September'))
  })

  it('counts each day in its own eyebrow, singular and plural, and never on a line of its own', () => {
    /*
     * The count sits in the eyebrow because a third line in that block made every
     * day section 36px taller than `contain-intrinsic-size` reserved for it, and
     * the Sunday group measured 10.4% out against a 10% budget (close-out C8B.3).
     * Pinning the wording here means the line cannot come back by accident.
     */
    render(
      <WeekendLandingPage
        {...base}
        total={3}
        days={[
          day('2026-09-19', 'Saturday 19 September', ['Saturday one', 'Saturday two']),
          day('2026-09-20', 'Sunday 20 September', ['Sunday one']),
        ]}
      />,
    )
    expect(screen.getByText('2 events on sale')).toBeInTheDocument()
    expect(screen.getByText('1 event also on')).toBeInTheDocument()
  })

  it('with no days, renders the shared designed empty state and a next action', () => {
    render(<WeekendLandingPage {...base} total={0} days={[]} cities={[]} />)
    expect(
      screen.getByRole('heading', { name: 'The first event of this weekend could be yours.' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start selling tickets' })).toHaveAttribute(
      'href',
      '/organisers/signup',
    )
    expect(screen.getByRole('link', { name: 'Browse all events' })).toHaveAttribute('href', '/events')
    // And it still says WHICH weekend it is empty for, which is the difference
    // between a designed empty state and a blank band.
    expect(screen.getAllByText(/Saturday 19 and Sunday 20 September/).length).toBeGreaterThan(0)
  })

  it('names the weekend in the hero whether or not anything is on', () => {
    const { unmount } = render(<WeekendLandingPage {...base} total={0} days={[]} cities={[]} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("What's on this weekend")
    unmount()
    render(
      <WeekendLandingPage
        {...base}
        total={1}
        days={[day('2026-09-19', 'Saturday 19 September', ['Only one'])]}
      />,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("What's on this weekend")
  })

  it('shows the city strip only when a city actually holds one of this weekend events', () => {
    const days = [day('2026-09-19', 'Saturday 19 September', ['Saturday one'])]
    const { unmount } = render(<WeekendLandingPage {...base} total={1} days={days} cities={[]} />)
    expect(screen.queryByRole('heading', { name: 'Cities with something on' })).toBeNull()
    unmount()

    render(
      <WeekendLandingPage
        {...base}
        total={1}
        days={days}
        cities={[{ slug: 'geelong', name: 'Geelong', count: 1 }]}
      />,
    )
    const strip = screen.getByRole('heading', { name: 'Cities with something on' }).parentElement!
    expect(within(strip).getByRole('link', { name: /Geelong/ })).toHaveAttribute('href', '/city/geelong')
  })

  it('one event still shows its day, it is never hidden for being alone', () => {
    /*
     * CLAUDE.md, "ONE EVENT SHOWS THE RAIL": thinness is answered by filling a
     * surface, never by deleting it. A count threshold on a day group would hide
     * the only organiser in the country with something on a Sunday.
     */
    render(
      <WeekendLandingPage
        {...base}
        total={1}
        days={[day('2026-09-20', 'Sunday 20 September', ['The only one'])]}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Sunday 20 September' })).toBeInTheDocument()
    expect(screen.getByText('1 event on sale')).toBeInTheDocument()
  })
})
