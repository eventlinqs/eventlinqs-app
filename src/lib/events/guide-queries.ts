import type { SupabaseClient } from '@supabase/supabase-js'
import { EVENT_SELECT, type RawRow } from '@/lib/events/home-queries'
import { isStillListed, listingWindowOrPredicate } from '@/lib/events/listing-window'
import { PUBLIC_EVENT_MATCH } from '@/lib/events/public-visibility'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { BOOKING_LINK_COLUMNS } from '@/lib/events/booking-links'

/**
 * EVERY LISTED NIGHT FOR THE CITY GUIDE (the city-first directive, C:\dev\DESIGN\CITY-FIRST-1NOV\CITY-FIRST-DIRECTIVE-1NOV.md
 * s1 'Correct EventLinqs and external booking destinations', and the engine directive's 'every event listed, every
 * date', C:\dev\DESIGN\CITY-FIRST-1NOV\ENGINE-FINAL-DIRECTIVE-1NOV.md). WINDOW 3 found at 19:23 on 1 November 2026 that
 * the guide read the home RAILS' query, loadHomeUpcoming, which (a) leaves out every night sold on another site (the
 * founder's ruling of 15 August 2026 is for the rails, the platform's scarcest surface, never for a guide that lists
 * every event) and (b) reads one page of at most 1,000 rows, Supabase's silent ceiling. So the guide reads its own:
 * every public, published night still listed (the one listing rule), wherever it is booked, every page, in a stable
 * total order (start, then id), and a failed page throws rather than showing part of the city as if it were all.
 */
/**
 * The guide's own columns: the home rails' EVENT_SELECT and each night's outside booking links, whose price an outside
 * row names when it was read in the last 7 days (the CONTROLLER's 08:50 (6)). The embed names its foreign key, so a
 * second key between the two tables could never make it ambiguous (scripts/guards/no-ambiguous-embed.mjs).
 */
export const GUIDE_SELECT = `${EVENT_SELECT}, booking_links:event_booking_links!event_booking_links_event_id_fkey(${BOOKING_LINK_COLUMNS})`

export async function loadGuideUpcoming(supabase: SupabaseClient, now: Date): Promise<RawRow[]> {
  const rows = await readEveryRow<RawRow>('the city guide\u2019s listed events', (from, to) =>
    supabase
      .from('events')
      .select(GUIDE_SELECT)
      .match(PUBLIC_EVENT_MATCH)
      .or(listingWindowOrPredicate(now))
      .order('start_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<{ data: RawRow[] | null; error: { message: string } | null }>,
  )
  return rows.filter((r) => isStillListed(r, now))
}
