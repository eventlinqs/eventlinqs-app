import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { bornVisibility, holdRowFor } from '@/lib/listings/held-night'

/*
 * A HELD TITLE STAYS HELD AS ITS DATES ROLL ON (7 November 2026). The CONTROLLER's 15:20 held 32 visitballarat.com.au
 * nights: every upcoming night of four weekly series. The hourly occurrence run inserts each new date of a series, and it
 * inserted them 'visibility: public' (occurrence-store.ts), so a held title would have grown a new public night each week.
 * A new date of a series with an open night hold is born private, with its own hold row, written before it is published;
 * a series with none is born public as before.
 */
describe('a new night of a held series', () => {
  it('is born private when its series has an open night hold, public when it has none', () => {
    expect(bornVisibility({ field: 'start', reason: 'no_official_page' })).toBe('private')
    expect(bornVisibility(null)).toBe('public')
  })
  it('carries its own hold row, the series hold\'s field and reason, readings empty until a page is read', () => {
    expect(holdRowFor('ev-1', 'series-1', { field: 'start', reason: 'no_official_page' })).toEqual({
      event_id: 'ev-1',
      series_id: 'series-1',
      field: 'start',
      scope: 'night',
      reason: 'no_official_page',
      readings: [],
    })
  })
  it('the occurrence store reads the series hold before it inserts, refuses when it cannot read it, and writes the hold before publishing', () => {
    const src = readFileSync('src/lib/listings/occurrence-store.ts', 'utf8')
    const create = src.slice(src.indexOf('async create('), src.indexOf('async update('))
    const read = create.indexOf(".from('listing_holds')")
    const insert = create.search(/\.from\('events'\)\s*\.insert\(/)
    const holdWrite = create.indexOf('holdRowFor(')
    const publish = create.indexOf("status: 'published'")
    expect(read, 'the hold is read').toBeGreaterThan(-1)
    expect(insert, 'the night is inserted').toBeGreaterThan(-1)
    expect(read).toBeLessThan(insert)
    expect(create).toContain('visibility: bornVisibility(hold)')
    expect(create).not.toContain("visibility: 'public'")
    expect(create).toMatch(/if \(holdError\) return refused\(/)
    expect(holdWrite).toBeGreaterThan(insert)
    expect(holdWrite).toBeLessThan(publish)
  })
})
