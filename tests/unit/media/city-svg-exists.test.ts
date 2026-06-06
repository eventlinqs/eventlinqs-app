import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { LOCAL_CITY_SVG } from '@/lib/events/home-queries'

/**
 * Pre-launch hardening item 8 (regression guard).
 *
 * The homepage city rail builds `/cities/<slug>.svg` for any slug in
 * LOCAL_CITY_SVG and `/cities/_fallback.svg` for the rest. A slug listed in the
 * set without a real file under public/cities/ 404s in production. This locks
 * the invariant: every slug in LOCAL_CITY_SVG has a matching file, and the
 * shared fallback always exists.
 */

const CITIES_DIR = join(process.cwd(), 'public', 'cities')

describe('city SVG assets exist for every referenced slug', () => {
  it('the shared fallback exists', () => {
    expect(existsSync(join(CITIES_DIR, '_fallback.svg'))).toBe(true)
  })

  it('every LOCAL_CITY_SVG slug has a real public/cities/<slug>.svg', () => {
    const missing = [...LOCAL_CITY_SVG].filter(
      slug => !existsSync(join(CITIES_DIR, `${slug}.svg`)),
    )
    expect(
      missing,
      `LOCAL_CITY_SVG lists slugs with no public/cities/<slug>.svg (would 404): ${missing.join(', ')}`,
    ).toEqual([])
  })
})
