import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

/**
 * A MAP LOADS ONLY WHEN THE VISITOR ASKS FOR IT (the controller's 06:16 (4), 31 October 2026). Window 5's phone test
 * found Google's Maps JavaScript API loading in the visitor's browser on every event, city and community-in-city page
 * view, about 56 map loads in one pass, outside the zero-budget spend guard (that guard sees server calls only). The
 * venue map and the city map now draw our own plate and load Google only on a press of 'Show map'; 'Open in Maps'
 * stays a plain link. The /events map view is not here: a visitor reaches it only by choosing the map view.
 *
 * Pinned against the loader itself, mocked: rendering and scrolling never ask for it; the press does, once.
 */

const importLibrary = vi.fn(() => new Promise(() => {}))
const getGoogleMapsLoader = vi.fn(() => ({ importLibrary }))

vi.mock('@/lib/maps/google-maps-loader', () => ({
  GOOGLE_MAPS_MAP_ID: undefined,
  getGoogleMapsLoader: () => getGoogleMapsLoader(),
  googleMapsAuthFailed: () => false,
  onGoogleMapsAuthFailure: () => () => {},
}))
vi.mock('@/lib/ui/audit-mode', () => ({ isAuditRun: () => false, AUDIT_FLAG: 'headless' }))

import { VenueMap } from '@/components/features/events/venue-map'
import { CityMap } from '@/components/features/city/city-map'

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30))
  })
}

beforeEach(() => {
  getGoogleMapsLoader.mockClear()
  importLibrary.mockClear()
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key'
})

describe('the venue map', () => {
  const props = { venueName: 'Corner Hotel', address: '57 Swan St', city: 'Richmond', state: 'VIC', country: 'Australia', latitude: -37.8255, longitude: 144.9935 }

  it('does not load Google when the page renders', async () => {
    render(<VenueMap {...props} />)
    await settle()
    expect(getGoogleMapsLoader).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Show map' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open in Maps' })).toBeInTheDocument()
  })

  it('loads Google once the visitor presses Show map', async () => {
    render(<VenueMap {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show map' }))
    await settle()
    expect(getGoogleMapsLoader).toHaveBeenCalledTimes(1)
  })
})

describe('the city map', () => {
  const props = { centerLng: 144.9631, centerLat: -37.8136, zoom: 11, pins: [] }

  it('does not load Google when the page renders', async () => {
    render(<CityMap {...props} />)
    await settle()
    expect(getGoogleMapsLoader).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Show map' })).toBeInTheDocument()
  })

  it('loads Google once the visitor presses Show map', async () => {
    render(<CityMap {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show map' }))
    await settle()
    expect(getGoogleMapsLoader).toHaveBeenCalledTimes(1)
  })
})
