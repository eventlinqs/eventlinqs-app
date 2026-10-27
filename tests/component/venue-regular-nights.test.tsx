import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { VenueRegularNights } from '@/components/features/venues/venue-regular-nights'
import type { VenueSeries } from '@/lib/listings/venue-series'

/**
 * WI2 Part 3a: a venue's regular nights, each in words, its next dates as
 * links, and for a night EventLinqs listed, that fact and when it was checked.
 */
const night = (over: Partial<VenueSeries>): VenueSeries => ({
  id: 's1',
  name: 'Saturday Live Music',
  rule: 'weekly',
  day: 6,
  starts_at: '20:00:00',
  ends_at: '23:30:00',
  anchor_date: '2026-10-31',
  timezone: 'Australia/Melbourne',
  listing_source: 'eventlinqs',
  last_checked_on: '2026-10-18',
  next: [
    { slug: 'saturday-live-music-2026-10-31', start_date: '2026-10-31T09:00:00Z' },
    { slug: 'saturday-live-music-2026-11-07', start_date: '2026-11-07T09:00:00Z' },
  ],
  ...over,
})

describe('VenueRegularNights', () => {
  it('says each night in words and links each next date to its own page', () => {
    render(<VenueRegularNights venueName="Hop Temple" series={[night({})]} />)
    expect(screen.getByRole('heading', { name: 'Every week at Hop Temple' })).toBeInTheDocument()
    const item = screen.getByRole('heading', { name: 'Saturday Live Music' }).closest('li') as HTMLElement
    expect(within(item).getByText('Every Saturday, 8pm to 11:30pm')).toBeInTheDocument()
    const links = within(item).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/events/saturday-live-music-2026-10-31',
      '/events/saturday-live-music-2026-11-07',
    ])
    expect(links[0]).toHaveTextContent('Sat 31 Oct')
  })

  it('says an EventLinqs listing is listed from public information and when it was checked', () => {
    render(<VenueRegularNights venueName="Hop Temple" series={[night({})]} />)
    expect(screen.getByText('Hosted by Hop Temple. Listed by EventLinqs from public information. Last checked 18 October.')).toBeInTheDocument()
  })

  it("says nothing of the kind for the organiser's own night", () => {
    render(<VenueRegularNights venueName="Hop Temple" series={[night({ listing_source: 'organiser' })]} />)
    expect(screen.queryByText(/Listed by EventLinqs/)).toBeNull()
  })

  it('renders nothing without a night', () => {
    const { container } = render(<VenueRegularNights venueName="Hop Temple" series={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
