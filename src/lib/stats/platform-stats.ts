import 'server-only'
import { createPublicClient } from '@/lib/supabase/public-client'

/**
 * Honest, live platform social proof. Counts are read from the connected
 * database (published events only) via the PUBLIC (anon) client, so the
 * numbers a marketing surface shows are the numbers the catalogue actually
 * holds - never a fabricated stat (CLAUDE.md Law 4: real platform truths
 * only). On any read failure every field is null and the consuming band
 * renders nothing: a missing band is honest, an invented number is not.
 *
 * `organisers` counts organisations with at least one published event (an
 * organiser you can actually browse to), not raw signups. `cities` counts
 * the distinct venue cities behind those events. Both derive from one
 * lightweight column read capped at PostgREST's row limit; if the catalogue
 * outgrows that, move the dedupe into a database view.
 */
export interface PlatformStats {
  eventsListed: number | null
  organisers: number | null
  cities: number | null
  source: 'live' | 'unavailable'
}

/** The one query shape this resolver needs; injectable for tests. */
export interface StatsReadClient {
  from(table: string): {
    select(
      columns: string,
      opts: { count: 'exact' }
    ): {
      eq(
        column: string,
        value: string
      ): PromiseLike<{
        data: Array<{ organisation_id: string | null; venue_city: string | null }> | null
        error: unknown
        count: number | null
      }>
    }
  }
}

export async function getPlatformStats(opts?: { client?: StatsReadClient }): Promise<PlatformStats> {
  try {
    const client = opts?.client ?? (createPublicClient() as unknown as StatsReadClient)
    const { data, error, count } = await client
      .from('events')
      .select('organisation_id, venue_city', { count: 'exact' })
      .eq('status', 'published')
    if (error || !data) throw error ?? new Error('no rows')

    const organisers = new Set(
      data.map(r => r.organisation_id).filter(Boolean)
    ).size
    const cities = new Set(
      data
        .map(r => (r.venue_city ?? '').trim().toLowerCase())
        .filter(Boolean)
    ).size

    return {
      eventsListed: count ?? data.length,
      organisers,
      cities,
      source: 'live',
    }
  } catch {
    // A marketing page must never 500 or show an invented number.
    return { eventsListed: null, organisers: null, cities: null, source: 'unavailable' }
  }
}
