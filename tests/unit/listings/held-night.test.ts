import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { bornVisibility, holdCarriesItsNextAction, holdRowFor } from '@/lib/listings/held-night'

/*
 * A HELD TITLE STAYS HELD AS ITS DATES ROLL ON (7 November 2026). The CONTROLLER's 15:20 held 32 visitballarat.com.au
 * nights: every upcoming night of four weekly series. The hourly occurrence run inserts each new date of a series, and it
 * inserted them 'visibility: public' (occurrence-store.ts), so a held title would have grown a new public night each week.
 * A new date of a series with an open night hold is born private, with its own hold row, written before it is published;
 * a series with none is born public as before.
 *
 * AND THAT HOLD CARRIES ITS NEXT ACTION (WINDOW 5A, 20 November 2026): every open hold must name its next source and check
 * time (listing_holds_open_carries_its_next_action). The row named neither, so production refused it every hour for eight
 * held weekly series ('1171 nights, 0 made, 8 failed ... its hold could not be written: new row for relation
 * "listing_holds" violates check constraint "listing_holds_o...', the listings row of 08:10 that day).
 */
const SERIES_HOLD = {
  field: 'start',
  reason: 'no_official_page',
  state: 'unconfirmed',
  next_source: 'https://visitballarat.com.au/whats-on/hop-temple-trivia',
  next_check_at: '2026-11-23T06:29:24.285+00:00',
  sources_tried: [{ url: 'https://hoptemple.com.au/', read_at: '2026-11-16T06:29:24.285+00:00' }],
}

// The database's own rule, as 20261107170001 writes it: released, or a next source and a check time.
const theDatabaseTakes = (row: { released_at?: string | null; next_source?: unknown; next_check_at?: unknown }) =>
  row.released_at != null || (row.next_source != null && row.next_check_at != null)

describe('a new night of a held series', () => {
  it('is born private when its series has an open night hold, public when it has none', () => {
    expect(bornVisibility(SERIES_HOLD)).toBe('private')
    expect(bornVisibility(null)).toBe('public')
  })
  it("carries its own hold row: the series hold's field, reason, state, next source, next check and sources tried, readings empty until a page is read", () => {
    expect(holdRowFor('ev-1', 'series-1', SERIES_HOLD)).toEqual({
      event_id: 'ev-1',
      series_id: 'series-1',
      field: 'start',
      scope: 'night',
      reason: 'no_official_page',
      readings: [],
      state: 'unconfirmed',
      next_source: 'https://visitballarat.com.au/whats-on/hop-temple-trivia',
      next_check_at: '2026-11-23T06:29:24.285+00:00',
      sources_tried: [{ url: 'https://hoptemple.com.au/', read_at: '2026-11-16T06:29:24.285+00:00' }],
    })
  })
  it('writes a row the database takes (listing_holds_open_carries_its_next_action)', () => {
    expect(theDatabaseTakes(holdRowFor('ev-1', 'series-1', SERIES_HOLD))).toBe(true)
  })
  it('knows a series hold with no next action, so no night is made from it', () => {
    expect(holdCarriesItsNextAction(SERIES_HOLD)).toBe(true)
    expect(holdCarriesItsNextAction({ ...SERIES_HOLD, next_source: null })).toBe(false)
    expect(holdCarriesItsNextAction({ ...SERIES_HOLD, next_check_at: null })).toBe(false)
    expect(holdCarriesItsNextAction({ ...SERIES_HOLD, next_source: '' })).toBe(false)
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
  it("reads the series hold's next action and makes no night from a hold without one, before the night is inserted", () => {
    const src = readFileSync('src/lib/listings/occurrence-store.ts', 'utf8')
    const create = src.slice(src.indexOf('async create('), src.indexOf('async update('))
    expect(create).toContain('.select(SERIES_HOLD_COLUMNS)')
    const check = create.search(/if \(hold && !holdCarriesItsNextAction\([^)]*\)\) \{\s*return refused\(/)
    expect(check, 'a hold without a next action refuses the night').toBeGreaterThan(-1)
    expect(check).toBeLessThan(create.search(/\.from\('events'\)\s*\.insert\(/))
  })
})
