// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LocationPicker } from '@/components/ui/location-picker'
import {
  PICKER_CITIES_ENDPOINT,
  fetchPickerCatalogue,
  loadedPickerCatalogue,
  resetPickerCatalogueForTests,
} from '@/lib/locations/picker-cities-client'
import type { DetectedLocation } from '@/lib/geo/detect'

/**
 * THE CITY CATALOGUE IS FETCHED ON INTENT AND IS NOT IN THE DOCUMENT.
 *
 * ============================================================================
 * WHAT THESE PROVE THAT A GUARD CANNOT
 * ============================================================================
 *
 * `scripts/guards/no-catalogue-in-every-document.mjs` proves the catalogue is
 * absent from the built documents. Absence is exactly half the change, and it
 * is the half that is free: deleting the prop would satisfy it and leave a
 * dialog with no cities in it. What a guard reading bytes cannot see is whether
 * the dialog still works, whether the list still arrives, and what a visitor is
 * shown in the seconds where it has not.
 *
 * So these run the component. The cases that matter are the ones a reasonable
 * person would not think to write:
 *
 *   NOTHING IS REQUESTED BEFORE INTENT. The whole saving is that a visitor who
 *   never reaches for the picker never pays for the catalogue. A version that
 *   fetched on mount would pass every other test here and would have moved the
 *   cost rather than removed it, which close-out C8B.4 names as the thing to
 *   refuse.
 *
 *   A CLICK THAT BEATS THE NETWORK SHOWS A SKELETON, NOT "No cities match".
 *   With an empty list the dialog's own search branch would have said no city
 *   matches an empty query, which is a false statement about this platform's
 *   coverage and is the exact shape of the Geelong report.
 *
 *   THREE PICKERS ON ONE PAGE MAKE ONE REQUEST. The header renders two and the
 *   homepage banner a third. Three copies of the same effect would be three
 *   requests the moment a pointer crossed two of them.
 */

vi.mock('@/lib/analytics/plausible', () => ({ trackEvent: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
}))

const CATALOGUE = {
  australia: [
    { city: 'Melbourne', country: 'Australia', countryCode: 'AU', slug: 'melbourne', latitude: -37.81, longitude: 144.96, isLaunchCity: true },
    { city: 'Geelong', country: 'Australia', countryCode: 'AU', slug: 'geelong', latitude: -38.15, longitude: 144.36, isLaunchCity: true },
  ],
  internationalByCountry: [],
}

const LOCATION: DetectedLocation = {
  city: 'Melbourne',
  country: 'Australia',
  countryCode: 'AU',
  latitude: -37.81,
  longitude: 144.96,
  source: 'cookie',
}

/** A fetch whose response this test releases by hand, so the in-flight window is testable. */
function deferredFetch() {
  let release: (value: unknown) => void = () => {}
  const held = new Promise(resolve => { release = resolve })
  const calls: string[] = []
  const impl = vi.fn(async (url: string) => {
    calls.push(url)
    await held
    return { ok: true, status: 200, json: async () => CATALOGUE } as unknown as Response
  })
  return { impl, calls, release: () => release(null) }
}

function resolvedFetch() {
  return vi.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => CATALOGUE }) as unknown as Response)
}

beforeEach(() => {
  resetPickerCatalogueForTests()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the catalogue is not fetched until a visitor reaches for the picker', () => {
  test('mounting_the_trigger_requests_nothing', () => {
    const f = resolvedFetch()
    vi.stubGlobal('fetch', f)
    render(<LocationPicker currentLocation={LOCATION} />)
    // THE ASSERTION THE WHOLE ITEM RESTS ON. Fetching on mount would take the
    // bytes out of the document and put them straight back on the wire during
    // the same page load, which is a resequencing dressed as a reduction.
    expect(f).not.toHaveBeenCalled()
  })

  test('pointer_intent_requests_the_catalogue_without_opening_the_dialog', async () => {
    const f = resolvedFetch()
    vi.stubGlobal('fetch', f)
    render(<LocationPicker currentLocation={LOCATION} />)
    fireEvent.pointerEnter(screen.getByRole('button', { name: /Change location/ }))
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1))
    expect(f.mock.calls[0][0]).toBe(PICKER_CITIES_ENDPOINT)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('keyboard_focus_requests_it_too_because_a_keyboard_user_never_hovers', async () => {
    const f = resolvedFetch()
    vi.stubGlobal('fetch', f)
    render(<LocationPicker currentLocation={LOCATION} />)
    fireEvent.focus(screen.getByRole('button', { name: /Change location/ }))
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1))
  })

  test('the_trigger_still_names_the_current_city_with_nothing_fetched', () => {
    vi.stubGlobal('fetch', resolvedFetch())
    render(<LocationPicker currentLocation={LOCATION} />)
    expect(screen.getByText('Melbourne')).toBeTruthy()
  })
})

describe('the dialog once the catalogue lands', () => {
  test('clicking_the_trigger_opens_the_dialog_with_its_cities', async () => {
    vi.stubGlobal('fetch', resolvedFetch())
    render(<LocationPicker currentLocation={LOCATION} />)
    fireEvent.click(screen.getByRole('button', { name: /Change location/ }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(await screen.findByText('Geelong')).toBeTruthy()
  })

  test('searching_still_finds_a_city_the_catalogue_carries', async () => {
    vi.stubGlobal('fetch', resolvedFetch())
    render(<LocationPicker currentLocation={LOCATION} />)
    fireEvent.click(screen.getByRole('button', { name: /Change location/ }))
    await screen.findByText('Geelong')
    fireEvent.change(screen.getByPlaceholderText('Search for a city'), { target: { value: 'geel' } })
    expect(screen.getByText('Geelong')).toBeTruthy()
  })
})

describe('the window where the click beats the network', () => {
  test('the_list_area_shows_a_skeleton_and_never_says_no_cities_match', async () => {
    const f = deferredFetch()
    vi.stubGlobal('fetch', f.impl)
    render(<LocationPicker currentLocation={LOCATION} />)
    fireEvent.click(screen.getByRole('button', { name: /Change location/ }))
    await screen.findByRole('dialog')

    // The defect this replaces: an empty catalogue reaching the search branch,
    // which tells a visitor no city matches when the truth is that the list has
    // not arrived.
    expect(screen.queryByText(/No cities match/)).toBeNull()
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByText('Loading the city list')).toBeTruthy()

    f.release()
    expect(await screen.findByText('Geelong')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  test('use_my_location_is_disabled_until_the_catalogue_can_answer_it', async () => {
    const f = deferredFetch()
    vi.stubGlobal('fetch', f.impl)
    render(<LocationPicker currentLocation={LOCATION} />)
    fireEvent.click(screen.getByRole('button', { name: /Change location/ }))
    await screen.findByRole('dialog')
    const geo = screen.getByRole('button', { name: /Use my current location/ })
    // Enabled with no list, it would run the haversine search over nothing and
    // report "Could not match your location to a supported city", which is a
    // false statement about the visitor's city.
    expect((geo as HTMLButtonElement).disabled).toBe(true)
    f.release()
    await screen.findByText('Geelong')
    await waitFor(() => expect((screen.getByRole('button', { name: /Use my current location/ }) as HTMLButtonElement).disabled).toBe(false))
  })
})

describe('when the catalogue cannot be fetched', () => {
  test('the_dialog_says_so_and_offers_a_retry_that_requests_again', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 } as unknown as Response)
      .mockResolvedValue({ ok: true, status: 200, json: async () => CATALOGUE } as unknown as Response)
    vi.stubGlobal('fetch', f)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<LocationPicker currentLocation={LOCATION} />)
    fireEvent.click(screen.getByRole('button', { name: /Change location/ }))
    await screen.findByRole('dialog')
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText(/The city list did not load/)).toBeTruthy()
    // Never an empty list dressed as an answer.
    expect(screen.queryByText(/No cities match/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Geelong')).toBeTruthy()
    expect(f).toHaveBeenCalledTimes(2)
    error.mockRestore()
  })
})

describe('three pickers on one page make one request', () => {
  test('the_second_and_third_join_the_first', async () => {
    const f = resolvedFetch()
    vi.stubGlobal('fetch', f)
    render(
      <>
        <LocationPicker currentLocation={LOCATION} variant="pill" />
        <LocationPicker currentLocation={LOCATION} variant="onDark" />
        <LocationPicker currentLocation={LOCATION} variant="inline" />
      </>,
    )
    const triggers = screen.getAllByRole('button', { name: /Change location/ })
    expect(triggers).toHaveLength(3)
    for (const t of triggers) fireEvent.pointerEnter(t)
    await waitFor(() => expect(loadedPickerCatalogue()).not.toBeNull())
    expect(f).toHaveBeenCalledTimes(1)
  })
})

describe('the shared fetcher', () => {
  test('a_failure_is_not_cached_so_a_retry_is_a_real_retry', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 } as unknown as Response)
      .mockResolvedValue({ ok: true, status: 200, json: async () => CATALOGUE } as unknown as Response)
    vi.stubGlobal('fetch', f)
    await expect(fetchPickerCatalogue()).rejects.toThrow(/503/)
    await expect(fetchPickerCatalogue()).resolves.toMatchObject({ australia: expect.any(Array) })
    expect(f).toHaveBeenCalledTimes(2)
  })

  test('a_success_is_cached_so_the_second_open_costs_nothing', async () => {
    const f = resolvedFetch()
    vi.stubGlobal('fetch', f)
    await fetchPickerCatalogue()
    await fetchPickerCatalogue()
    expect(f).toHaveBeenCalledTimes(1)
    expect(loadedPickerCatalogue()).not.toBeNull()
  })

  test('a_body_the_dialog_cannot_read_rejects_rather_than_resolving_to_an_empty_list', async () => {
    // A 200 carrying the wrong shape is the dangerous case: resolved to an empty
    // catalogue it renders as "this platform has no cities", which is a finding
    // about the platform printed from a defect in the wire.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ cities: [] }) }) as unknown as Response))
    await expect(fetchPickerCatalogue()).rejects.toThrow(/shape the dialog cannot read/)
  })

  test('validSlugs_is_not_read_from_the_wire_because_it_is_not_sent', async () => {
    vi.stubGlobal('fetch', resolvedFetch())
    const catalogue = await fetchPickerCatalogue()
    // The server route deliberately withholds it: the dialog never reads it and
    // sending it would put the defect back in a smaller font.
    expect(Object.keys(catalogue).sort()).toEqual(['australia', 'internationalByCountry'])
  })
})
