import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * THE EVENT PAGE MAP SHOWS, BY GOOGLE'S MAPS EMBED API (Lawal's word through the controller's 08:27 (3), 31 October
 * 2026): an event page carries its map with the venue pin on load. The Maps Embed API is an iframe Google serves, "free
 * to use with unlimited requests" with "no daily or usage rate limitations"
 * (https://developers.google.com/maps/documentation/embed/usage-and-billing, last updated 2026-10-28, fetched
 * 31 October 2026), so the event page no longer loads the metered Maps JavaScript API at all. The city and /events maps
 * are not changed here. Without a browser key or a place, our own plate stands and 'Open in Maps' stays a plain link.
 */

const getGoogleMapsLoader = vi.fn(() => null)
vi.mock('@/lib/maps/google-maps-loader', () => ({
  GOOGLE_MAPS_MAP_ID: undefined,
  getGoogleMapsLoader: () => getGoogleMapsLoader(),
  googleMapsAuthFailed: () => false,
  onGoogleMapsAuthFailure: () => () => {},
}))

import { VenueMap } from '@/components/features/events/venue-map'

const base = { venueName: 'Federation Square', address: 'Swanston St & Flinders St', city: 'Melbourne', state: 'VIC', country: 'Australia', latitude: -37.818, longitude: 144.9691 }

beforeEach(() => {
  getGoogleMapsLoader.mockClear()
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'browser-key'
})

describe('the event page map', () => {
  it('shows Google\'s embedded map with the venue pin, without the Maps JavaScript API', () => {
    render(<VenueMap {...base} />)
    const frame = screen.getByTitle('Map of Federation Square') as HTMLIFrameElement
    const src = new URL(frame.getAttribute('src') ?? '')
    expect(`${src.origin}${src.pathname}`).toBe('https://www.google.com/maps/embed/v1/place')
    expect(src.searchParams.get('key')).toBe('browser-key')
    expect(src.searchParams.get('q')).toBe('-37.818,144.9691')
    expect(frame.getAttribute('loading')).toBe('lazy')
    expect(getGoogleMapsLoader).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Show map' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Open in Maps' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Get directions' })).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=-37.818%2C144.9691')
  })

  it('places a venue with no stored point by its address', () => {
    render(<VenueMap {...base} latitude={null} longitude={null} />)
    const src = new URL(screen.getByTitle('Map of Federation Square').getAttribute('src') ?? '')
    expect(src.searchParams.get('q')).toBe('Federation Square, Swanston St & Flinders St, Melbourne, VIC, Australia')
  })

  it('keeps our own plate when no browser key is set, and never an empty frame', () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = ''
    render(<VenueMap {...base} />)
    expect(screen.queryByTitle('Map of Federation Square')).toBeNull()
    expect(screen.getByRole('link', { name: 'Open in Maps' })).toBeInTheDocument()
  })
})
