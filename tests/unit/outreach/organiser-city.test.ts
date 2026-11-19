import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { foundOnPage, organiserCitySlugs } from '@/lib/outreach/organiser-city'

/*
 * AN ORGANISER'S CITY, READ FROM ROWS (train AE, 20 November 2026; the PM's 08:37 item 4, T7). The seven organisers
 * written on 20 November had no city in code: only a linked venue counted. Their cities were read from the EventLinqs
 * night or venue page each was found on. Three roads, in order, each a row; no row, no city.
 */
type Rows = Record<string, Record<string, unknown>[]>

function fakeDb(tables: Rows) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])]
      const chain: Record<string, unknown> = {
        select: () => chain,
        in: (col: string, values: unknown[]) => ((rows = rows.filter((r) => values.includes(r[col]))), chain),
        eq: (col: string, value: unknown) => ((rows = rows.filter((r) => r[col] === value)), chain),
        is: (col: string, value: unknown) => ((rows = rows.filter((r) => (r[col] ?? null) === value)), chain),
        gt: () => chain,
        not: () => chain,
        order: () => chain,
        limit: () => chain,
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok),
      }
      return chain
    },
  }
}

const NOW = new Date('2026-11-20T00:00:00Z')

describe('the EventLinqs page an organiser was found on', () => {
  it('names an event or a venue by its slug, and nothing else', () => {
    expect(foundOnPage('https://www.eventlinqs.com.au/events/bendigo-symphony-orchestra-messiah-sacred-heart-cathedral-2026-12-12')).toEqual({
      kind: 'event',
      slug: 'bendigo-symphony-orchestra-messiah-sacred-heart-cathedral-2026-12-12',
    })
    expect(foundOnPage('https://www.eventlinqs.com.au/venues/archive-wine-bar')).toEqual({ kind: 'venue', slug: 'archive-wine-bar' })
    expect(foundOnPage('https://www.mso.com.au/performance/2026-edward-scissorhands-in-concert')).toBeNull()
    expect(foundOnPage('https://www.eventbrite.com.au/o/38476008843')).toBeNull()
    expect(foundOnPage(null)).toBeNull()
  })
})

describe("each organiser's city by the first road that has one", () => {
  const db = fakeDb({
    organiser_venues: [{ organiser_id: 'linked', venue_id: 'v-geelong' }],
    venues: [
      { id: 'v-geelong', slug: 'costa-hall', city_slug: 'geelong', removed_at: null },
      { id: 'v-belmont', slug: 'archive-wine-bar', city_slug: 'geelong', removed_at: null },
    ],
    events: [
      { slug: 'bso-messiah-2026-12-12', city_primary: 'bendigo', organisation_id: null, status: 'published' },
      { slug: 'own-night', city_primary: 'ballarat', organisation_id: 'org-own', status: 'published' },
    ],
  })

  it('reads a linked venue, then the page found on (an event, then a venue), then a night under their own account', async () => {
    const out = await organiserCitySlugs(
      db as never,
      [
        { id: 'linked', found_on: 'https://www.eventlinqs.com.au/events/bso-messiah-2026-12-12', organisation_id: null },
        { id: 'found-event', found_on: 'https://www.eventlinqs.com.au/events/bso-messiah-2026-12-12', organisation_id: null },
        { id: 'found-venue', found_on: 'https://www.eventlinqs.com.au/venues/archive-wine-bar', organisation_id: null },
        { id: 'own', found_on: null, organisation_id: 'org-own' },
        { id: 'none', found_on: 'https://www.mso.com.au/performance/x', organisation_id: null },
      ],
      NOW,
    )
    expect(Object.fromEntries(out)).toEqual({ linked: 'geelong', 'found-event': 'bendigo', 'found-venue': 'geelong', own: 'ballarat' })
    expect(out.has('none')).toBe(false)
  })

  it('reads nothing for no organisers', async () => {
    expect((await organiserCitySlugs(db as never, [], NOW)).size).toBe(0)
  })
})

describe('the planner and the drafter use it', () => {
  it("a play's cities cohort reads each organiser's city by the three roads, leaving out test organisers and those another approved play names", () => {
    const whole = readFileSync('src/lib/outreach/planner.ts', 'utf8')
    expect(whole).toContain("import { organiserCitySlugs } from './organiser-city'")
    const start = whole.indexOf('export async function planPlays')
    const src = whole.slice(start, whole.indexOf('export async function', start + 1))
    expect(src).toContain('const cities = await organiserCitySlugs(db, real, deps.now)')
    expect(src).toContain('const real = (rows.data ?? []).filter((o) => !o.is_test && !named.has(o.id))')
    expect(src).not.toContain(".from('organiser_venues').select('organiser_id').in('venue_id'")
  })
  it("the drafter fills the letter's organiser, city, slug and its own fallback for what they run", () => {
    const src = readFileSync('src/lib/outreach/facts.ts', 'utf8')
    expect(src).toContain('facts.organiser = organiser.data.name?.trim() || null')
    expect(src).toContain("facts['what they run, or events'] = 'events'")
    expect(src).toContain("facts['city slug'] = city.data?.name ? citySlug : null")
    expect(src).toContain("facts['city slug'] = city.data?.name ? venue.city_slug : null")
  })
})
