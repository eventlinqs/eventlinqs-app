import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { collectionStore } from '@/lib/listings/collect-store'

/*
 * EVERY HELD NIGHT CARRIES THE SITES IT WAS READ FROM (the AUSX pair, 7 November 2026; ./cross-source-twin.test.ts). The
 * council's two AUSX rows came from a hand import, no candidate, so the sites come from both the published candidate's page
 * and an import's own listing check; the daily confirmations ('collection run, source ...') are left out of the read.
 * Production's three rows as the store reads them, through a fake client that applies the filters the store asks for.
 */
type Row = Record<string, unknown>
const TABLES: Record<string, Row[]> = {
  events: [
    { id: 'ausx-council', title: 'Boost Mobile AUSX Open Geelong', start_date: '2026-11-07T02:00:00Z', end_date: null, venue_id: null, venue_name: 'AUSX Open', venue_address: null, city_primary: 'geelong', listing_series_id: 's-council' },
    { id: 'ausx-kardinia', title: 'AUSX Open Geelong', start_date: '2026-11-07T07:00:00Z', end_date: null, venue_id: 'v1', venue_name: 'GMHBA Stadium', venue_address: '354 Moorabool St', city_primary: 'geelong', listing_series_id: 's-kardinia' },
    { id: 'confirmed-only', title: 'Front Bar Trivia', start_date: '2026-11-11T09:00:00Z', end_date: null, venue_id: null, venue_name: "Murphy's Geelong", venue_address: null, city_primary: 'geelong', listing_series_id: 's-trivia' },
    { id: 'organiser-own', title: 'AMCF 2026', start_date: '2026-11-20T00:00:00Z', end_date: '2026-11-22T09:00:00Z', venue_id: null, venue_name: 'Fed Square', venue_address: null, city_primary: 'melbourne', listing_series_id: null },
  ],
  listing_candidates: [{ id: 'c1', published_series_id: 's-kardinia', page_url: 'https://www.kardiniapark.vic.gov.au/event/ausx-open-geelong/' }],
  listing_checks: [
    { id: 'k1', series_id: 's-council', source_url: 'https://www.geelongcity.vic.gov.au/whats-happening/events/boost-mobile-ausx-open', import_file: 'import-2026-10-27-wi3-ticketed-43.csv sha256:eebcd2e00737' },
    { id: 'k2', series_id: 's-kardinia', source_url: 'https://www.kardiniapark.vic.gov.au/event/ausx-open-geelong/', import_file: 'big event hunt, source 19a295f8' },
    { id: 'k3', series_id: 's-trivia', source_url: 'https://www.murphysgeelong.com.au/whats-on', import_file: 'collection run, source abc' },
  ],
}

function fakeDb(): SupabaseClient {
  return {
    from(table: string) {
      let rows = [...(TABLES[table] ?? [])]
      const builder = {
        select: () => builder,
        gte: () => builder,
        lte: () => builder,
        order: () => builder,
        not(column: string, op: string, value: unknown) {
          if (op === 'is') rows = rows.filter((r) => r[column] !== null && r[column] !== undefined)
          if (op === 'like') {
            const prefix = String(value).replace(/%$/, '')
            rows = rows.filter((r) => !String(r[column]).startsWith(prefix))
          }
          return builder
        },
        range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
      }
      return builder
    },
  } as unknown as SupabaseClient
}

describe('the held nights the collection judges against', () => {
  it('each carries the sites it was read from: an import check, a published candidate, never a daily confirmation', async () => {
    const known = await collectionStore(fakeDb()).known(new Date('2026-11-07T00:00:00Z'))
    const hosts = Object.fromEntries(known.map((k) => [k.eventId, k.sourceHosts]))
    expect(hosts['ausx-council']).toEqual(['geelongcity.vic.gov.au'])
    expect(hosts['ausx-kardinia']).toEqual(['kardiniapark.vic.gov.au'])
    expect(hosts['confirmed-only']).toEqual([])
    expect(hosts['organiser-own']).toEqual([])
  })
})
