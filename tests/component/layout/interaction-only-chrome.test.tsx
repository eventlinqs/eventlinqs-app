// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HeaderSearchTrigger } from '@/components/layout/header-search-trigger'
import { LocationPicker } from '@/components/ui/location-picker'
import type { DetectedLocation } from '@/lib/geo/detect'
import type { PickerCityGroups } from '@/lib/locations/picker-cities'

/**
 * C8 SHELL. The search overlay and the city dialog are reached by a dynamic
 * import so they are not first-load JavaScript on all 133 routes.
 *
 * WHAT THESE TESTS ARE FOR, and it is not the bytes. The byte count is measured
 * by `node scripts/perf/first-load-budget.mjs` against a real build and enforced
 * by scripts/guards/initial-bundle-budget.mjs; the source shape is held by
 * scripts/guards/interaction-only-chrome-is-split.mjs. What neither of those can
 * see is whether the surface still WORKS once it is behind a dynamic import, and
 * that is the risk this change actually carries: a performance change that
 * quietly breaks the thing it defers is a bad trade at any number of bytes.
 *
 * So these run the components, and they are honest about which half they prove.
 *
 * WHAT THEY CANNOT PROVE, said plainly because the obvious test here is a trap.
 * "Nothing is in the DOM before an interaction" passes against the OLD code too:
 * both surfaces already returned null while closed, so the rendered output was
 * identical before and after this change. A test that reads as proof of the
 * split and would pass without it is worse than no test, so those assertions are
 * named for what they are, a paint check on the trigger.
 *
 * THE ONE ASSERTION THAT DOES TELL THEM APART is the tick after the click. A
 * static import resolves synchronously and the dialog is in the DOM in the same
 * tick; a dynamic one cannot be, whatever the module registry has cached. The
 * two `not_in_the_same_tick` tests below are therefore the executable form of
 * the split, and they go red the moment either import becomes static again.
 */

vi.mock('@/lib/analytics/plausible', () => ({ trackEvent: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
}))

const CITIES: PickerCityGroups = {
  australia: [
    { city: 'Melbourne', country: 'Australia', countryCode: 'AU', slug: 'melbourne', latitude: -37.81, longitude: 144.96, isLaunchCity: true },
    { city: 'Geelong', country: 'Australia', countryCode: 'AU', slug: 'geelong', latitude: -38.15, longitude: 144.36, isLaunchCity: true },
  ],
  internationalByCountry: [],
  validSlugs: ['melbourne', 'geelong'],
}

const LOCATION: DetectedLocation = {
  city: 'Melbourne',
  country: 'Australia',
  countryCode: 'AU',
  latitude: -37.81,
  longitude: 144.96,
  source: 'cookie',
}

afterEach(cleanup)

describe('the global search overlay is not in the shell', () => {
  test('the_trigger_paints_on_its_own_with_no_dialog_behind_it', () => {
    render(<HeaderSearchTrigger variant="mobile-icon" />)
    // A paint check on the trigger, not proof of the split: the overlay returned
    // null while closed before this change too.
    expect(screen.getByRole('button', { name: 'Open search' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByPlaceholderText(/search/i)).toBeNull()
  })

  test('the_overlay_is_not_in_the_dom_in_the_same_tick_as_the_click', () => {
    render(<HeaderSearchTrigger variant="mobile-icon" />)
    fireEvent.click(screen.getByRole('button', { name: 'Open search' }))
    // THE ASSERTION THAT DISTINGUISHES A DYNAMIC IMPORT FROM A STATIC ONE. A
    // static import is already evaluated, so React would render the overlay in
    // this same synchronous commit. A dynamic one resolves on a microtask at the
    // earliest, so nothing is here yet. Make the import static again and this
    // goes red.
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('pointer_intent_arms_it_without_opening_it', async () => {
    render(<HeaderSearchTrigger variant="mobile-icon" />)
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Open search' }))
    // Intent fetches the chunk. It must never be mistaken for an open: a
    // visitor whose pointer crosses the header has not asked for a dialog.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  test('clicking_the_trigger_opens_the_overlay', async () => {
    render(<HeaderSearchTrigger variant="mobile-icon" />)
    fireEvent.click(screen.getByRole('button', { name: 'Open search' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  test('the_slash_shortcut_opens_the_overlay_with_no_hover_first', async () => {
    render(<HeaderSearchTrigger variant="desktop-pill" />)
    // A keyboard user never fires pointerenter, so the shortcut has to arm and
    // open in one action or it would reach a component that was never imported.
    fireEvent.keyDown(window, { key: '/' })
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })
})

describe('the city dialog is not in the shell', () => {
  test('the_trigger_paints_on_its_own_with_no_dialog_behind_it', () => {
    render(<LocationPicker currentLocation={LOCATION} cities={CITIES} />)
    expect(screen.getByRole('button', { name: /Change location/ })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('Geelong')).toBeNull()
  })

  test('the_dialog_is_not_in_the_dom_in_the_same_tick_as_the_click', () => {
    render(<LocationPicker currentLocation={LOCATION} cities={CITIES} />)
    fireEvent.click(screen.getByRole('button', { name: /Change location/ }))
    // See the note on the overlay's twin: a static import would have the whole
    // city list committed synchronously here.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('Geelong')).toBeNull()
  })

  test('clicking_the_trigger_opens_the_dialog_with_its_cities', async () => {
    render(<LocationPicker currentLocation={LOCATION} cities={CITIES} />)
    fireEvent.click(screen.getByRole('button', { name: /Change location/ }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByText('Geelong')).toBeTruthy()
  })

  test('escape_closes_the_dialog', async () => {
    render(<LocationPicker currentLocation={LOCATION} cities={CITIES} />)
    fireEvent.click(screen.getByRole('button', { name: /Change location/ }))
    await screen.findByRole('dialog')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  test('reopening_the_dialog_starts_with_an_empty_search', async () => {
    /*
     * THE ONE BEHAVIOUR THIS SPLIT CHANGED THE MECHANISM OF. The dialog's query,
     * its global-cities disclosure and its geolocation error used to be reset by
     * hand in the parent's close handler. They now live in the panel, so closing
     * unmounts them. The user-visible contract is identical and this asserts it
     * rather than trusting the refactor.
     */
    render(<LocationPicker currentLocation={LOCATION} cities={CITIES} />)
    fireEvent.click(screen.getByRole('button', { name: /Change location/ }))
    await screen.findByRole('dialog')
    const search = screen.getByPlaceholderText('Search for a city')
    fireEvent.change(search, { target: { value: 'geel' } })
    expect((search as HTMLInputElement).value).toBe('geel')

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: /Change location/ }))
    await screen.findByRole('dialog')
    expect((screen.getByPlaceholderText('Search for a city') as HTMLInputElement).value).toBe('')
  })

  test('the_trigger_still_names_the_current_city_before_anything_is_fetched', () => {
    // The trigger is the only part of this surface that paints on first render,
    // so it is the only part a deferral could have taken away by accident.
    render(<LocationPicker currentLocation={LOCATION} cities={CITIES} />)
    expect(screen.getByText('Melbourne')).toBeTruthy()
  })
})
