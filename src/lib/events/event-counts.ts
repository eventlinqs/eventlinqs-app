import { listingKey } from './guide-sections'
import { listingWindowOrPredicate } from './listing-window'
import { PUBLIC_EVENT_MATCH } from './public-visibility'
import { readEveryRow } from '@/lib/supabase/read-every-row'

/**
 * EVERY COUNT OF EVENTS READS THE GUIDE'S ONE DEFINITION (the CONTROLLER's 08:50 (2), from the 5 November audit,
 * C:\dev\EVIDENCE\AUDIT-5NOV\counts.txt). An EVENT is a title at a venue, trimmed, any case: the city guide's eventKey
 * (listingKey, src/lib/events/guide-sections.ts). A DATE is one listed night. The audit found /organisers printing
 * '815 events live right now' and the city tiles 'Melbourne 211 events' over DATES, while each guide counted 97 events
 * for Melbourne and 398 across Australia; every surface that says 'events' now counts events.
 */
export interface CountRow {
  title: string
  venue_name: string | null
  venue_city: string | null
}

/** The number of events (distinct eventKeys) in the rows. Pure. */
export function countEvents(rows: readonly Pick<CountRow, 'title' | 'venue_name'>[]): number {
  return new Set(rows.map((r) => listingKey({ title: r.title ?? '', venue: r.venue_name }))).size
}

/**
 * Each city name's events, where the row's venue_city contains the name in any case: the same match the city tiles made
 * with venue_city ILIKE '%<name>%', counted in events instead of rows. Pure.
 */
export function eventsPerCityName(rows: readonly CountRow[], names: readonly string[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const name of names) {
    const needle = name.toLowerCase()
    out.set(name, countEvents(rows.filter((r) => (r.venue_city ?? '').toLowerCase().includes(needle))))
  }
  return out
}

/** The one read shape the tiles need: a page of public, still-listed events, ordered on the unique id. */
export interface CountReadClient {
  from(table: string): {
    select(columns: string): {
      match(filter: Record<string, string>): {
        or(filters: string): {
          order(column: string, opts: { ascending: boolean }): {
            range(from: number, to: number): PromiseLike<{ data: CountRow[] | null; error: { message: string } | null }>
          }
        }
      }
    }
  }
}

/**
 * Every public event still inside its listing window (the /events rule: PUBLIC_EVENT_MATCH and the listing window), each
 * row's title, venue and venue city, read past the 1,000 row response cap. Throws on a failed page rather than counting
 * part of the catalogue.
 */
export async function readListedRows(client: CountReadClient, now: Date): Promise<CountRow[]> {
  return readEveryRow<CountRow>('listed events for the event counts', (from, to) =>
    client
      .from('events')
      .select('title, venue_name, venue_city')
      .match(PUBLIC_EVENT_MATCH)
      .or(listingWindowOrPredicate(now))
      .order('id', { ascending: true })
      .range(from, to),
  )
}
