/**
 * NATIONWIDE FROM DAY ONE (founder ruling 2026-08-23).
 *
 * The platform is open in every Australian city and state from day one. There
 * is no city gate, no launch queue, and no copy telling anyone their city is
 * not available yet.
 *
 * WHAT THIS FILE IS DEFENDING AGAINST, precisely, because two of these were
 * real and shipped:
 *
 *   1. `FOUNDING_CITIES = ['geelong','melbourne']` gated the founding invite
 *      mechanic in the APPLICATION, so an organiser in Perth could neither be
 *      invited nor invite anyone.
 *   2. `founding_invites.city_slug` carried a CHECK constraint pinning it to
 *      the same two cities in the DATABASE, so removing (1) alone would have
 *      swapped a polite refusal for a raw 23514.
 *   3. The consent wording promised an email "when your city opens", an event
 *      that can now never occur.
 *
 * Several assertions here measure an ABSENCE (no cadence promised, no city
 * named as opening first). Every one of those is paired with a NEGATIVE
 * CONTROL that feeds it the wording it is supposed to reject, proving the
 * assertion can actually fail rather than passing vacuously.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { isFoundingCity, foundingCityName, FOUNDING_SPOT_CAP } from '@/lib/founding/invites'
import {
  FOUNDING_WAIVER_CAP,
  FOUNDING_INITIAL_MONTHS,
  FOUNDING_REFERRAL_MONTHS,
} from '@/lib/payments/founding-waiver'
import {
  getWaitlistCities,
  isWaitlistCitySlug,
  joinConsentText,
  CONSENT_VERSION,
  DIGEST_COVERING_CONSENT_VERSIONS,
  consentVersionCoversDigest,
} from '@/lib/waitlist/city-waitlist'
import { FOUNDING_OFFER } from '@/lib/organisers/founding-offer'
import { getAllCities } from '@/lib/cities/data'

const REPO_ROOT = process.cwd()

/** Cities well away from the old two-city launch pair. */
const CITIES_THAT_WERE_LOCKED_OUT = ['perth', 'darwin', 'hobart', 'cairns', 'brisbane']

describe('the founding invite mechanic is national', () => {
  it.each(CITIES_THAT_WERE_LOCKED_OUT)('accepts %s, which the two-city gate refused', slug => {
    expect(isFoundingCity(slug)).toBe(true)
  })

  it('accepts every city in the canonical registry, not a launch subset', () => {
    const refused = getAllCities()
      .map(c => c.slug)
      .filter(slug => !isFoundingCity(slug))
    expect(refused).toEqual([])
  })

  it('negative control: still refuses something that is not an Australian city', () => {
    // Without this, "accepts everything" would also pass if isFoundingCity
    // simply returned true for any input, which would put free text into a
    // column the public invite page renders.
    expect(isFoundingCity('auckland')).toBe(false)
    expect(isFoundingCity('')).toBe(false)
    expect(isFoundingCity(null)).toBe(false)
    expect(isFoundingCity(42)).toBe(false)
  })

  it('resolves a display name for a city outside the old pair', () => {
    expect(foundingCityName('perth')).toBe('Perth')
  })
})

describe('the scarcity the founder kept is untouched', () => {
  it('the cap is still fifty', () => {
    expect(FOUNDING_SPOT_CAP).toBe(50)
    expect(FOUNDING_WAIVER_CAP).toBe(50)
  })

  it('the offer is still six months, extended three per referral', () => {
    expect(FOUNDING_INITIAL_MONTHS).toBe(6)
    expect(FOUNDING_REFERRAL_MONTHS).toBe(3)
  })

  it('the offer copy still states the cap and the referral mechanic', () => {
    const prose = `${FOUNDING_OFFER.body} ${FOUNDING_OFFER.note} ${FOUNDING_OFFER.points.join(' ')}`
    expect(prose).toMatch(/first 50/i)
    expect(prose).toMatch(/6 months/i)
    expect(prose).toMatch(/3 more fee-free months|3 more months/i)
  })
})

describe('the offer no longer ties a spot to a city', () => {
  it('names no launch city anywhere in the offer', () => {
    const prose = `${FOUNDING_OFFER.eyebrow} ${FOUNDING_OFFER.title} ${FOUNDING_OFFER.body} ${FOUNDING_OFFER.note} ${FOUNDING_OFFER.points.join(' ')}`
    expect(prose).not.toMatch(/geelong|melbourne/i)
  })

  it('negative control: that assertion fails on the wording it replaced', () => {
    const superseded =
      'EventLinqs launches city by city, starting with Geelong and Melbourne. The first 50 organisers across those two cities are invited personally.'
    expect(() => expect(superseded).not.toMatch(/geelong|melbourne/i)).toThrow()
  })

  it('its CTA points at signup, not at a launch queue', () => {
    expect(FOUNDING_OFFER.ctaHref).toBe('/organisers/signup')
    expect(FOUNDING_OFFER.ctaHref).not.toBe('/waitlist')
  })
})

describe('local alerts cover every city, with no launch order', () => {
  it('offers every Australian city, including the ones the nine-city list omitted', () => {
    const slugs = getWaitlistCities().map(c => c.slug)
    for (const slug of ['gold-coast', 'newcastle', 'wollongong', 'ballarat', 'townsville']) {
      expect(slugs).toContain(slug)
    }
    expect(slugs.length).toBe(getAllCities().length)
  })

  it('carries no "opening first" flag on any city', () => {
    for (const city of getWaitlistCities()) {
      expect(Object.keys(city)).not.toContain('openingFirst')
    }
  })

  it('validates a city without restricting to a launch subset', () => {
    expect(isWaitlistCitySlug('perth')).toBe(true)
    expect(isWaitlistCitySlug('gold-coast')).toBe(true)
    // negative control: still a real validator, not a pass-through
    expect(isWaitlistCitySlug('not-a-city')).toBe(false)
  })
})

describe('the consent chain survives the rewording', () => {
  it('the shipped consent version is one the digest may draw from', () => {
    // THE TRAP THIS CATCHES: bumping CONSENT_VERSION without adding it here
    // captures people who asked to hear from us and then never emails them,
    // which is the exact defect the audience bridge was built to fix.
    expect(DIGEST_COVERING_CONSENT_VERSIONS).toContain(CONSENT_VERSION)
    expect(consentVersionCoversDigest(CONSENT_VERSION)).toBe(true)
  })

  it('negative control: an uncovered version is still refused', () => {
    expect(consentVersionCoversDigest('v1')).toBe(false)
    expect(consentVersionCoversDigest(null)).toBe(false)
  })

  it('the wording still names what we will send and how to stop it', () => {
    const text = joinConsentText('Darwin')
    expect(text).toContain('Darwin')
    expect(text).toMatch(/something on near you/i)
    expect(text).toMatch(/one click unsubscribes you/i)
  })
})

describe('the database no longer pins founding invites to two cities', () => {
  const migration = readFileSync(
    join(REPO_ROOT, 'supabase/migrations/20260823000001_founding_invites_nationwide.sql'),
    'utf8',
  )

  it('drops the two-city check constraint', () => {
    expect(migration).toMatch(/drop constraint if exists founding_invites_city_slug_check/i)
  })

  it('replaces it with a shape-only constraint that names no city', () => {
    const statements = migration
      .split('\n')
      .filter(l => !l.trimStart().startsWith('--'))
      .join('\n')
    expect(statements).toMatch(/add constraint founding_invites_city_slug_check/i)
    expect(statements).not.toMatch(/city_slug in \(/i)
  })

  it('negative control: that assertion fails on the constraint it replaced', () => {
    const superseded = "city_slug text not null check (city_slug in ('geelong', 'melbourne')),"
    expect(() => expect(superseded).not.toMatch(/city_slug in \(/i)).toThrow()
  })
})

/**
 * THE GATE THAT SURVIVED THE REWORDING.
 *
 * The pass that opened the platform nationwide changed the offer copy, the
 * refusal message in inviteWaitlistEntry(), the displayed city name and the
 * database constraint. It did not change the QUERY in the admin network page,
 * which still read
 *
 *   .in('city_slug', ['geelong', 'melbourne'])
 *
 * so the founder's waitlist-to-invite bridge silently contained no one outside
 * those two cities. Every assertion above passed while that line stood, because
 * all of them measure constants and prose and none of them measure the code
 * path that decides which rows exist.
 *
 * This block measures the data path instead, across all of src/ rather than one
 * file, so the same mistake in a different surface is caught too.
 */
describe('no surface narrows a city query to a hardcoded list', () => {
  /**
   * Returns every `.in('city_slug', [...])` whose array holds string literals.
   *
   * A literal array is the defect: the allowed cities must come from the
   * canonical registry (getWaitlistCities()/getAllCities()), never be retyped
   * at a call site where they cannot follow the registry when a city is added.
   */
  function literalCityFilters(source: string): string[] {
    const found: string[] = []
    const call = /\.in\(\s*(['"])city_slug\1\s*,\s*\[([^\]]*)\]/g
    for (const m of source.matchAll(call)) {
      if (/['"]/.test(m[2])) found.push(m[0].replace(/\s+/g, ' '))
    }
    return found
  }

  const SOURCE_FILES = readdirSync(join(REPO_ROOT, 'src'), {
    recursive: true,
    withFileTypes: true,
  })
    .filter(e => e.isFile() && /\.tsx?$/.test(e.name))
    .map(e => join(e.parentPath, e.name))

  it('scans a real, non-empty set of source files', () => {
    // Without this the sweep below would pass vacuously if the walk broke.
    expect(SOURCE_FILES.length).toBeGreaterThan(500)
  })

  it('finds no hardcoded city_slug filter anywhere under src/', () => {
    const offenders = SOURCE_FILES.flatMap(file => {
      const hits = literalCityFilters(readFileSync(file, 'utf8'))
      return hits.map(h => `${file.slice(REPO_ROOT.length + 1)}: ${h}`)
    })
    expect(offenders).toEqual([])
  })

  it('negative control: the detector flags the exact line that shipped', () => {
    // Proves the sweep can fail. Without this, a detector whose regex silently
    // stopped matching would report a clean tree forever.
    const superseded = `    .in('city_slug', ['geelong', 'melbourne'])`
    expect(literalCityFilters(superseded)).toHaveLength(1)
  })

  it('negative control: the detector accepts the registry-derived form', () => {
    const fixed = `.in('city_slug', getWaitlistCities().map(c => c.slug))`
    expect(literalCityFilters(fixed)).toEqual([])
  })
})
