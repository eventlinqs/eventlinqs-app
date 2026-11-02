// THE PLATFORM IS NOT AN ORGANISER (WINDOW 1's data point of 2 November 2026, 12:17; CONTROLLER 12:23 (D)).
// Migration 20261101132001 gives every organisation its organisers row, and one of them is 'EventLinqs listings',
// the platform's own listings organisation, which holds every curated night whatever its host. Counted as an
// organiser it would read as claimed and publishing hundreds of nights in the funnel, sit in the acquisition desk,
// the daily twenty and the organiser score. One rule, src/lib/growth/platform-organiser.ts, takes it out of every
// growth and outreach read of the organisers; scripts/guards/growth-reads-skip-the-platform.mjs keeps every reader on it.

import { describe, expect, test } from 'vitest'
import { LISTINGS_ORGANISATION_SLUG } from '@/lib/listings/shown-organiser'
import { readPlatformOrganiserIds, withoutPlatformOrganisers } from '@/lib/growth/platform-organiser'

type Call = { table: string; filters: [string, string, unknown][] }

/** A client that answers the two reads the rule makes, and records them. */
function fakeDb(orgs: { id: string; slug: string }[], organisers: { id: string; organisation_id: string | null }[]) {
  const calls: Call[] = []
  const db = {
    from(table: string) {
      const call: Call = { table, filters: [] }
      calls.push(call)
      const rows = () => {
        let out: Record<string, unknown>[] = table === 'organisations' ? orgs : organisers
        for (const [op, col, value] of call.filters) {
          if (op === 'eq') out = out.filter((r) => r[col] === value)
          if (op === 'in') out = out.filter((r) => (value as unknown[]).includes(r[col]))
        }
        return out.map((r) => ({ id: r.id }))
      }
      const q = {
        select: () => q,
        eq: (col: string, value: unknown) => (call.filters.push(['eq', col, value]), q),
        in: (col: string, value: unknown) => (call.filters.push(['in', col, value]), q),
        limit: () => q,
        then: (resolve: (r: { data: unknown; error: null }) => unknown) => resolve({ data: rows(), error: null }),
      }
      return q
    },
  }
  return { db, calls }
}

describe('the platform is not an organiser', () => {
  test('the organisers row of the EventLinqs listings organisation is read by its slug', async () => {
    const { db, calls } = fakeDb(
      [
        { id: 'org-listings', slug: LISTINGS_ORGANISATION_SLUG },
        { id: 'org-real', slug: 'geelong-jazz-club' },
      ],
      [
        { id: 'g-listings', organisation_id: 'org-listings' },
        { id: 'g-real', organisation_id: 'org-real' },
        { id: 'g-found', organisation_id: null },
      ],
    )
    const ids = await readPlatformOrganiserIds(db as never)
    expect([...ids]).toEqual(['g-listings'])
    expect(calls[0]).toEqual({ table: 'organisations', filters: [['eq', 'slug', LISTINGS_ORGANISATION_SLUG]] })
  })

  test('no listings organisation on this database means no organiser is left out', async () => {
    const { db, calls } = fakeDb([{ id: 'org-real', slug: 'geelong-jazz-club' }], [{ id: 'g-real', organisation_id: 'org-real' }])
    const ids = await readPlatformOrganiserIds(db as never)
    expect(ids.size).toBe(0)
    expect(calls.map((c) => c.table)).toEqual(['organisations'])
  })

  test('every other organiser stays, in its order, found hosts with no organisation included', () => {
    const rows = [{ id: 'g-real' }, { id: 'g-listings' }, { id: 'g-found' }]
    expect(withoutPlatformOrganisers(rows, new Set(['g-listings']))).toEqual([{ id: 'g-real' }, { id: 'g-found' }])
  })

  test('rows keyed on organiser_id, as the acquisition facts are, are judged by that key', () => {
    const rows = [{ organiser_id: 'g-listings', name: 'EventLinqs listings' }, { organiser_id: 'g-real', name: 'Geelong Jazz Club' }]
    expect(withoutPlatformOrganisers(rows, new Set(['g-listings']), (r) => r.organiser_id)).toEqual([{ organiser_id: 'g-real', name: 'Geelong Jazz Club' }])
  })

  test('an empty set changes nothing', () => {
    const rows = [{ id: 'a' }, { id: 'b' }]
    expect(withoutPlatformOrganisers(rows, new Set())).toEqual(rows)
  })
})
