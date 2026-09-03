import { describe, expect, test } from 'vitest'
import {
  STREAM_COUNTRIES,
  STREAM_REGIONS,
  normaliseCountryCodes,
  describeCountries,
  countryName,
} from '@/lib/stream/countries'

describe('stream countries', () => {
  test('every curated code is a distinct upper-case ISO 3166-1 alpha-2 code with a name', () => {
    const codes = STREAM_COUNTRIES.map((c) => c.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const c of STREAM_COUNTRIES) {
      expect(c.code).toMatch(/^[A-Z]{2}$/)
      expect(c.name.trim().length).toBeGreaterThan(1)
    }
  })

  test('Australia and New Zealand lead the list', () => {
    expect(STREAM_COUNTRIES[0].code).toBe('AU')
    expect(STREAM_COUNTRIES[1].code).toBe('NZ')
  })

  test('every region quick pick expands only to codes on the list', () => {
    const known = new Set(STREAM_COUNTRIES.map((c) => c.code))
    for (const r of STREAM_REGIONS) {
      expect(r.codes.length).toBeGreaterThan(0)
      for (const code of r.codes) expect(known.has(code), `${r.name}: ${code}`).toBe(true)
    }
  })

  test('normalisation upper-cases, deduplicates, drops junk and keeps AU and NZ first', () => {
    expect(normaliseCountryCodes(['nz', 'gb', 'AU', 'gb', 'xyz', '', 'us'])).toEqual(['AU', 'NZ', 'GB', 'US'])
    expect(normaliseCountryCodes(null)).toEqual([])
    expect(normaliseCountryCodes(undefined)).toEqual([])
  })

  test('the sentence a buyer reads names the countries plainly', () => {
    expect(describeCountries([])).toBe('anywhere')
    expect(describeCountries(['AU'])).toBe('Australia')
    expect(describeCountries(['AU', 'NZ'])).toBe('Australia and New Zealand')
    expect(describeCountries(['NZ', 'AU', 'GB'])).toBe('Australia, New Zealand and United Kingdom')
    expect(describeCountries(['AU', 'NZ', 'GB', 'US', 'IN'])).toBe('Australia, New Zealand and 3 more')
  })

  test('an unknown code still reads as its code rather than throwing', () => {
    expect(countryName('AU')).toBe('Australia')
    expect(countryName('XK')).toBe('XK')
  })
})
