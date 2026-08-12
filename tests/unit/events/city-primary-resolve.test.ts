import { describe, it, expect } from 'vitest'
import { resolveCitySlug, normaliseLocality } from '@/lib/cities/resolve'
import { getAllCities } from '@/lib/cities/data'

/**
 * `events.city_primary` is the ONE column every city-scoped surface reads,
 * including the weekly local digest. Before this resolver the organiser
 * wizard never wrote it, so an organiser could publish a Geelong event that
 * the Geelong audience could never be shown. These tests guard the fill, and
 * guard just as hard against filling it WRONGLY, because an event filed under
 * a city the organiser did not choose is worse than one filed under none.
 */

describe('resolveCitySlug fills city_primary from what the organiser typed', () => {
  it('resolves every canonical city by its display name', () => {
    for (const city of getAllCities()) {
      expect(resolveCitySlug(city.name)).toBe(city.slug)
    }
  })

  it('resolves every canonical city by its own slug', () => {
    for (const city of getAllCities()) {
      expect(resolveCitySlug(city.slug)).toBe(city.slug)
    }
  })

  it('ignores case and surrounding whitespace', () => {
    expect(resolveCitySlug('  GEELONG ')).toBe('geelong')
    expect(resolveCitySlug('geelong')).toBe('geelong')
    expect(resolveCitySlug('Geelong')).toBe('geelong')
  })

  it('handles the two-word cities in every shape an organiser types them', () => {
    expect(resolveCitySlug('Gold Coast')).toBe('gold-coast')
    expect(resolveCitySlug('gold-coast')).toBe('gold-coast')
    expect(resolveCitySlug('GOLD  COAST')).toBe('gold-coast')
    expect(resolveCitySlug('Sunshine Coast')).toBe('sunshine-coast')
  })

  it('takes the locality when the field carries the state as well', () => {
    expect(resolveCitySlug('Melbourne, VIC')).toBe('melbourne')
    expect(resolveCitySlug('Geelong, Victoria')).toBe('geelong')
  })
})

describe('resolveCitySlug never guesses', () => {
  it('returns null for empty, null and undefined', () => {
    expect(resolveCitySlug(null)).toBeNull()
    expect(resolveCitySlug(undefined)).toBeNull()
    expect(resolveCitySlug('')).toBeNull()
    expect(resolveCitySlug('   ')).toBeNull()
  })

  it('does not claim a suburb for its city', () => {
    expect(resolveCitySlug('North Melbourne')).toBeNull()
    expect(resolveCitySlug('South Geelong')).toBeNull()
    expect(resolveCitySlug('Melbourne CBD')).toBeNull()
  })

  it('returns null for a town the platform has no city page for', () => {
    expect(resolveCitySlug('Torquay')).toBeNull()
    expect(resolveCitySlug('Byron Bay')).toBeNull()
    expect(resolveCitySlug('Auckland')).toBeNull()
  })

  it('never resolves to a slug outside the canonical registry', () => {
    const canonical = new Set(getAllCities().map((c) => c.slug))
    const probes = ['Sydney', 'gold coast', 'nowhere', 'Hobart, TAS', '', 'Perth']
    for (const probe of probes) {
      const resolved = resolveCitySlug(probe)
      if (resolved !== null) expect(canonical.has(resolved)).toBe(true)
    }
  })
})

describe('the venue_city values already in the catalogue all resolve', () => {
  // Observed on the TEST database, 8 August 2026: the distinct venue_city
  // values across the 330 published events that carried a null city_primary.
  const observed = [
    'Geelong', 'Brisbane', 'Sydney', 'Gold Coast', 'Perth', 'Darwin', 'Ballarat',
    'Melbourne', 'Adelaide', 'Canberra', 'Hobart', 'Wollongong', 'Newcastle',
    'Sunshine Coast', 'Townsville', 'Cairns', 'Toowoomba', 'Albury', 'Launceston',
    'Bendigo',
  ]

  it('resolves every one of them, so the backfill leaves nothing behind', () => {
    for (const value of observed) {
      expect(resolveCitySlug(value), `${value} should resolve`).not.toBeNull()
    }
  })
})

describe('normaliseLocality', () => {
  it('folds case, punctuation and diacritics to one comparable form', () => {
    expect(normaliseLocality('Gold-Coast')).toBe('gold coast')
    expect(normaliseLocality('  MELBOURNE  ')).toBe('melbourne')
    expect(normaliseLocality('Ballàrat')).toBe('ballarat')
  })
})
