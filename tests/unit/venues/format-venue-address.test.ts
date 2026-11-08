// One venue address formatter (close-out UX1.2).
//
// The production defect, verbatim from the served HTML of the first real
// outside organiser event on 9 September 2026:
//
//   Quakers Centre, Quakers Centre, 484 William Street, West Melbourne, VIC, Australia
//
// The close-out asked for the fix at the formatter and for proof on a venue
// whose name IS part of its address and one whose name is not. Both are here.

import { describe, expect, test } from 'vitest'
import { addressNamingItsPlace, formatVenueAddress, formatVenueWithAddress } from '@/lib/venues/format-venue-address'

/** The real event, exactly as the row reads on production. */
const QUAKERS = {
  name: 'Quakers Centre',
  address: '484 William Street',
  city: 'West Melbourne',
  state: 'VIC',
  country: 'Australia',
}

describe('the reported defect', () => {
  test('the venue name appears exactly once', () => {
    const line = formatVenueWithAddress(QUAKERS)
    expect(line).toBe('Quakers Centre, 484 William Street, West Melbourne, VIC, Australia')
    expect(line?.match(/Quakers Centre/g)).toHaveLength(1)
  })

  test('the doubled string can no longer be produced', () => {
    expect(formatVenueWithAddress(QUAKERS)).not.toContain('Quakers Centre, Quakers Centre')
  })
})

describe('a venue whose name IS part of its address', () => {
  const nameInAddress = { ...QUAKERS, address: 'Quakers Centre, 484 William Street' }

  test('the name is still shown once', () => {
    expect(formatVenueWithAddress(nameInAddress)).toBe(
      'Quakers Centre, 484 William Street, West Melbourne, VIC, Australia',
    )
  })

  test('and the address-only form drops it, because the heading already says it', () => {
    expect(formatVenueAddress(nameInAddress)).toBe('484 William Street, West Melbourne, VIC, Australia')
  })

  // The name field is the venue's canonical spelling and is composed first, so
  // it is the one that survives. Whatever casing or punctuation the organiser
  // typed into the free-text address is the copy that gets dropped, which is
  // the right way round: the record wins over the retyping.
  test('however the organiser cased or punctuated it, the canonical name shows', () => {
    expect(
      formatVenueWithAddress({ ...QUAKERS, address: 'QUAKERS CENTRE., 484 William Street' }),
    ).toBe('Quakers Centre, 484 William Street, West Melbourne, VIC, Australia')
  })
})

describe('a venue whose name is NOT part of its address', () => {
  test('nothing is dropped', () => {
    expect(formatVenueAddress(QUAKERS)).toBe('484 William Street, West Melbourne, VIC, Australia')
    expect(formatVenueWithAddress(QUAKERS)).toContain('Quakers Centre')
  })
})

describe('a substring is not a duplicate', () => {
  test('West Melbourne beside Melbourne keeps both, because a suburb is not its city', () => {
    const line = formatVenueWithAddress({
      name: 'The Corner',
      address: '57 Swan Street',
      city: 'Richmond',
      state: 'VIC',
      country: 'Australia',
    })
    expect(line).toBe('The Corner, 57 Swan Street, Richmond, VIC, Australia')
  })

  test('a repeated city typed into the address is still collapsed', () => {
    expect(
      formatVenueWithAddress({
        name: 'Festival Hall',
        address: '300 Dudley Street, West Melbourne',
        city: 'West Melbourne',
        state: 'VIC',
        country: 'Australia',
      }),
    ).toBe('Festival Hall, 300 Dudley Street, West Melbourne, VIC, Australia')
  })
})

describe('missing parts never leave punctuation behind', () => {
  test.each([
    [{ name: 'Quakers Centre' }, 'Quakers Centre'],
    [{ name: 'Quakers Centre', city: 'West Melbourne' }, 'Quakers Centre, West Melbourne'],
    [{ address: '484 William Street', country: 'Australia' }, '484 William Street, Australia'],
  ])('%j formats without a dangling comma', (parts, expected) => {
    expect(formatVenueWithAddress(parts)).toBe(expected)
  })

  test('nothing at all is null, not an empty string with commas', () => {
    expect(formatVenueWithAddress({})).toBeNull()
    expect(formatVenueWithAddress({ name: null, address: null, city: '   ' })).toBeNull()
    expect(formatVenueAddress({ name: 'Quakers Centre' })).toBeNull()
  })
})

/*
 * THE LOCALITY LINE IS NOT SAID TWICE (LAUNCH-READINESS row 17, read on production on 7 November 2026). The event page
 * of the 2026 Boxing Day Test read 'Yarra Park, Melbourne VIC, Melbourne, VIC, Australia', and the same read of every
 * published upcoming night found 28 of 82 venue rows, on 406 nights, printing their city or state twice: each address
 * already ends in Australia Post's last line, 'the locality or suburb, state and postcode'
 * (https://auspost.com.au/personal/sending/sending-guidelines/addressing-guidelines, fetched 7 November 2026), and the
 * guide's city and state were added after it. The rows below are those rows, as production holds them.
 */
describe('an address that already ends in its locality, state and postcode', () => {
  test.each([
    [{ name: 'Melbourne Cricket Ground', address: 'Yarra Park, Melbourne VIC', city: 'Melbourne', state: 'VIC', country: 'Australia' }, 'Yarra Park, Melbourne VIC, Australia'],
    [{ name: "Bird's Basement", address: '11 Singers Lane, Melbourne VIC 3000', city: 'Melbourne', state: 'VIC', country: 'Australia' }, '11 Singers Lane, Melbourne VIC 3000, Australia'],
    [{ name: 'Chilwell Library', address: '51 Russell Street, Newtown VIC 3220', city: 'Geelong', state: 'VIC', country: 'Australia' }, '51 Russell Street, Newtown VIC 3220, Australia'],
    [{ name: 'Kardinia Park Precinct', address: 'Geelong VIC 3220', city: 'Geelong', state: 'VIC', country: 'Australia' }, 'Geelong VIC 3220, Australia'],
    [{ name: 'Costa Hall', address: '1 Gheringhap St, Geelong VIC 3220', city: 'Geelong', state: 'VIC', country: 'AU' }, '1 Gheringhap St, Geelong VIC 3220, AU'],
  ])('%j says its locality once', (parts, expected) => {
    expect(formatVenueAddress(parts)).toBe(expected)
    expect(formatVenueWithAddress(parts)).toBe(`${parts.name}, ${expected}`)
  })

  test('a state written out in full is the same state', () => {
    expect(formatVenueAddress({ address: '1 Bay Street, Geelong Victoria 3220', city: 'Geelong', state: 'VIC', country: 'Australia' })).toBe(
      '1 Bay Street, Geelong Victoria 3220, Australia',
    )
  })

  test('a segment of state and postcode alone states the state, and the city is still said', () => {
    expect(formatVenueAddress({ address: 'Brunton Avenue, Melbourne, VIC 3002', city: 'Melbourne', state: 'VIC', country: 'Australia' })).toBe(
      'Brunton Avenue, Melbourne, VIC 3002, Australia',
    )
  })

  test('a street that only ends in a state word is not a locality line', () => {
    expect(formatVenueAddress({ address: '57 Swan Street', city: 'Richmond', state: 'VIC', country: 'Australia' })).toBe('57 Swan Street, Richmond, VIC, Australia')
  })

  test('outside Australia the rule does not apply', () => {
    expect(formatVenueAddress({ address: '1 Queen Street, Auckland Central WA', city: 'Auckland', state: 'Auckland', country: 'New Zealand' })).toBe(
      '1 Queen Street, Auckland Central WA, Auckland, New Zealand',
    )
  })
})

describe('a postcode sits where an Australian address expects it', () => {
  test('after the state, before the country', () => {
    expect(
      formatVenueWithAddress({
        name: 'Geelong Arena',
        address: '1 Bay Street',
        city: 'Geelong',
        state: 'VIC',
        postcode: '3220',
        country: 'Australia',
      }),
    ).toBe('Geelong Arena, 1 Bay Street, Geelong, VIC, 3220, Australia')
  })
})

describe('the street names its place (8 November 2026: "800 High Street, Melbourne" was in Thornbury)', () => {
  test.each([
    ['800 High Street', 'Thornbury', 'Melbourne', '800 High Street, Thornbury'],
    ['30 Aberdeen Street', 'Geelong West', 'Geelong', '30 Aberdeen Street, Geelong West'],
    ['91 Inglis Street', 'West Bendigo', 'Bendigo', '91 Inglis Street, West Bendigo'],
    ['717 Flinders St', 'Docklands', 'Melbourne', '717 Flinders St, Docklands'],
    ['Outside Pipers Cafe, 403 Wendouree Pde', 'Lake Wendouree', 'Ballarat', 'Outside Pipers Cafe, 403 Wendouree Pde, Lake Wendouree'],
  ])('%s in %s gains its suburb', (address, suburb, city, expected) => {
    expect(addressNamingItsPlace(address, suburb, city)).toBe(expected)
  })
  test.each([
    ['Downstairs, 586 Little Bourke St', 'Melbourne CBD', 'Melbourne'],
    ['17 Lydiard Street South', 'Ballarat Central', 'Ballarat'],
    ['Kardinia Park Precinct, Geelong VIC 3220', 'South Geelong', 'Geelong'],
    ['31 Sturt St Southbank 3006', 'Southbank', 'Melbourne'],
    ['176 Little Lonsdale Street', 'Melbourne', 'Melbourne'],
    ['800 High Street, Thornbury', 'Thornbury', 'Melbourne'],
  ])('%s (%s) is kept as it is', (address, suburb, city) => {
    expect(addressNamingItsPlace(address, suburb, city)).toBe(address)
  })
  test('nothing to add without a street or a suburb', () => {
    expect(addressNamingItsPlace(null, 'Thornbury', 'Melbourne')).toBeNull()
    expect(addressNamingItsPlace('800 High Street', null, 'Melbourne')).toBe('800 High Street')
  })
})
