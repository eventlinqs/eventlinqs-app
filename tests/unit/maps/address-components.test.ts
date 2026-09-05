import { describe, expect, test } from 'vitest'
import { composeLocality, composeStreetLine, venueFieldsFromPlace } from '@/lib/maps/address-components'

/**
 * The component arrays below are the shape Google returned for "Forum
 * Melbourne" on 4 September 2026 through the Places library (seven components,
 * C:\dev\EVIDENCE\A3-places-js-probe-20260904.txt), with a unit-style variant
 * and a park variant to cover the street-line rules.
 */
const FORUM = {
  id: 'ChIJ-forum-melbourne',
  displayName: 'Forum Melbourne',
  formattedAddress: '154 Flinders St, Melbourne VIC 3000, Australia',
  latitude: -37.8166268,
  longitude: 144.9695761,
  addressComponents: [
    { longText: '154', shortText: '154', types: ['street_number'] },
    { longText: 'Flinders Street', shortText: 'Flinders St', types: ['route'] },
    { longText: 'Melbourne', shortText: 'Melbourne', types: ['locality', 'political'] },
    { longText: 'City of Melbourne', shortText: 'Melbourne', types: ['administrative_area_level_2', 'political'] },
    { longText: 'Victoria', shortText: 'VIC', types: ['administrative_area_level_1', 'political'] },
    { longText: 'Australia', shortText: 'AU', types: ['country', 'political'] },
    { longText: '3000', shortText: '3000', types: ['postal_code'] },
  ],
}

describe('venueFieldsFromPlace', () => {
  test('maps a CBD venue into the six venue fields, the coordinates and the place id', () => {
    expect(venueFieldsFromPlace(FORUM)).toEqual({
      venue_name: 'Forum Melbourne',
      venue_address: '154 Flinders Street',
      venue_city: 'Melbourne',
      venue_state: 'VIC',
      venue_country: 'Australia',
      venue_postal_code: '3000',
      venue_latitude: -37.8166268,
      venue_longitude: 144.9695761,
      venue_place_id: 'ChIJ-forum-melbourne',
    })
  })

  test('a suburb venue reports the suburb as the city, which is what Google calls the locality', () => {
    const fitzroy = {
      ...FORUM,
      displayName: 'The Night Cat',
      addressComponents: [
        { longText: '137', shortText: '137', types: ['street_number'] },
        { longText: 'Johnston Street', shortText: 'Johnston St', types: ['route'] },
        { longText: 'Fitzroy', shortText: 'Fitzroy', types: ['locality', 'political'] },
        { longText: 'City of Yarra', shortText: 'Yarra', types: ['administrative_area_level_2', 'political'] },
        { longText: 'Victoria', shortText: 'VIC', types: ['administrative_area_level_1', 'political'] },
        { longText: 'Australia', shortText: 'AU', types: ['country', 'political'] },
        { longText: '3065', shortText: '3065', types: ['postal_code'] },
      ],
    }
    const out = venueFieldsFromPlace(fitzroy)
    expect(out.venue_city).toBe('Fitzroy')
    expect(out.venue_address).toBe('137 Johnston Street')
  })

  test('a unit becomes the Australian "unit/number" street line', () => {
    const components = [
      { longText: 'Shop 3', shortText: 'Shop 3', types: ['subpremise'] },
      { longText: '154', shortText: '154', types: ['street_number'] },
      { longText: 'Flinders Street', shortText: 'Flinders St', types: ['route'] },
    ]
    expect(composeStreetLine(components)).toBe('Shop 3/154 Flinders Street')
  })

  test('a place with no street number keeps the route alone, never the formatted address', () => {
    const park = {
      ...FORUM,
      displayName: 'Catani Gardens',
      formattedAddress: 'Jacka Blvd, St Kilda VIC 3182, Australia',
      addressComponents: [
        { longText: 'Jacka Boulevard', shortText: 'Jacka Blvd', types: ['route'] },
        { longText: 'St Kilda', shortText: 'St Kilda', types: ['locality', 'political'] },
        { longText: 'Victoria', shortText: 'VIC', types: ['administrative_area_level_1', 'political'] },
        { longText: 'Australia', shortText: 'AU', types: ['country', 'political'] },
        { longText: '3182', shortText: '3182', types: ['postal_code'] },
      ],
    }
    const out = venueFieldsFromPlace(park)
    expect(out.venue_address).toBe('Jacka Boulevard')
    expect(out.venue_city).toBe('St Kilda')
    expect(out.venue_address).not.toContain('3182')
  })

  test('falls back through postal_town and sublocality for the locality', () => {
    expect(composeLocality([{ longText: 'Townsville City', shortText: 'Townsville City', types: ['postal_town'] }])).toBe('Townsville City')
    expect(composeLocality([{ longText: 'Pyrmont', shortText: 'Pyrmont', types: ['sublocality_level_1', 'sublocality', 'political'] }])).toBe('Pyrmont')
    expect(composeLocality([])).toBe('')
  })

  test('coordinates are stored only as a pair; one missing half nulls both', () => {
    expect(venueFieldsFromPlace({ ...FORUM, longitude: null }).venue_latitude).toBeNull()
    expect(venueFieldsFromPlace({ ...FORUM, latitude: Number.NaN }).venue_longitude).toBeNull()
  })

  test('a place with nothing yields empty strings and nulls, never undefined', () => {
    const out = venueFieldsFromPlace({})
    for (const [k, v] of Object.entries(out)) {
      expect(v, k).not.toBeUndefined()
    }
    expect(out.venue_place_id).toBeNull()
    expect(out.venue_name).toBe('')
  })
})
