import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CURATED_HOMEPAGE_HEROES,
  HOMEPAGE_HERO_LICENCE_NOTE,
  pickCuratedHomepageHero,
  utcDayOfYear,
} from '@/lib/images/homepage-hero-curated'

/**
 * THE CURATED HOMEPAGE HERO (close-out C17.2, 7 September 2026).
 *
 * With no featured event the homepage wears one of the founder's licensed
 * rasters, chosen by the UTC day so a render never flickers between rerenders
 * on the same day and the set still turns over. The set is read from the
 * attribution file beside the assets, so these tests also pin that every
 * curated slug is backed by both rasters and that the licence holder is named.
 */
const ROOT = process.cwd()

describe('the curated set', () => {
  it('is non-empty and read from the attribution file beside the assets', () => {
    const attribution = JSON.parse(readFileSync(join(ROOT, 'public/images/hero/homepage-hero-attribution.json'), 'utf8')) as {
      note: string
      heroes: Array<{ slug: string; alt: string }>
    }
    expect(CURATED_HOMEPAGE_HEROES.length).toBeGreaterThan(0)
    expect(CURATED_HOMEPAGE_HEROES.map((h) => h.slug)).toEqual(attribution.heroes.map((h) => h.slug))
    expect(HOMEPAGE_HERO_LICENCE_NOTE).toBe(attribution.note)
  })

  it('names who holds the licence, next to the assets', () => {
    expect(HOMEPAGE_HERO_LICENCE_NOTE).toMatch(/licen[cs]e held by/i)
  })

  it('every curated hero has a jpg and an avif under public/images/hero, and an alt', () => {
    for (const hero of CURATED_HOMEPAGE_HEROES) {
      expect(hero.image).toBe(`/images/hero/${hero.slug}.jpg`)
      expect(existsSync(join(ROOT, 'public', hero.image)), `${hero.image} missing`).toBe(true)
      expect(existsSync(join(ROOT, 'public/images/hero', `${hero.slug}.avif`)), `${hero.slug}.avif missing`).toBe(true)
      expect(hero.alt.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('pickCuratedHomepageHero', () => {
  it('is deterministic within a day: every render on one date agrees', () => {
    const morning = new Date('2026-09-07T00:00:01Z')
    const night = new Date('2026-09-07T23:59:59Z')
    expect(pickCuratedHomepageHero(morning)).toEqual(pickCuratedHomepageHero(night))
  })

  it('turns over day to day and covers the whole set across consecutive days', () => {
    const seen = new Set<string>()
    for (let d = 0; d < CURATED_HOMEPAGE_HEROES.length; d += 1) {
      seen.add(pickCuratedHomepageHero(new Date(Date.UTC(2026, 8, 7 + d, 12))).slug)
    }
    expect(seen.size).toBe(CURATED_HOMEPAGE_HEROES.length)
  })

  it('always returns a member of the set', () => {
    for (const day of [0, 1, 100, 200, 364]) {
      const pick = pickCuratedHomepageHero(new Date(Date.UTC(2026, 0, 1 + day, 12)))
      expect(CURATED_HOMEPAGE_HEROES).toContainEqual(pick)
    }
  })

  it('counts the UTC day of the year from zero', () => {
    expect(utcDayOfYear(new Date('2026-01-01T05:00:00Z'))).toBe(0)
    expect(utcDayOfYear(new Date('2026-12-31T23:00:00Z'))).toBe(364)
  })
})
