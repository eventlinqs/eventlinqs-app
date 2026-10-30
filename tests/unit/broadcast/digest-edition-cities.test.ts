import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { editionDigestCities } from '@/lib/broadcast/digest'
import { EDITION_CITIES } from '@/lib/social/campaign'

// D5 of Lawal's DemandOS directive, 30 October 2026: 'Initially support Geelong and Melbourne'. Window 3 and window 5
// agreed at 18:01 that email and social read one list, so the two never cover different cities.
describe('the cities the weekly digest goes to', () => {
  test('are the edition cities that have someone who said yes, in the list order', () => {
    expect(editionDigestCities(['ballarat', 'melbourne', 'geelong', 'sydney'])).toEqual(['geelong', 'melbourne'])
  })
  test('a city on the list with nobody who said yes is not sent', () => {
    expect(editionDigestCities(['melbourne'])).toEqual(['melbourne'])
    expect(editionDigestCities([])).toEqual([])
  })
  test('it is the planner list itself, not a copy', () => {
    expect(editionDigestCities([...EDITION_CITIES, 'bendigo'])).toEqual([...EDITION_CITIES])
  })
})
