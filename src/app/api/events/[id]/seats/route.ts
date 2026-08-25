import { NextResponse } from 'next/server'
import { createPublicClient } from '@/lib/supabase/public-client'
import { PUBLIC_EVENT_MATCH } from '@/lib/events/public-visibility'

/**
 * GET /api/events/[id]/seats - the seat chart for a publicly visible event.
 *
 * ============================================================================
 * WHY THIS EXISTS: 400KB OF SEATS IN THE HTML
 * ============================================================================
 *
 * The event page passed the whole seat array to `SeatSelectorLazy` as a prop.
 * Lazy loading splits the CODE; a prop crossing the server/client boundary is
 * SERIALISED INTO THE DOCUMENT regardless, so the chart's data shipped in the
 * initial HTML of every seated event whether the buyer scrolled to it or not.
 *
 * Measured on /events/arena-sessions-large-room-performance-test, the page the
 * Lighthouse gate happened to pick, on 25 August 2026:
 *
 *   document                 571,171 bytes uncompressed, 79KB transferred
 *   inline script            483,048 chars, 85 percent of the page
 *   largest inline script    401,036 chars
 *   `seat_number` in it      1,200 occurrences
 *   `seat_map_section_id`    1,200 occurrences, 22,800 chars of key name alone
 *
 * Lighthouse mobile on that page: LCP 4,396ms (cap 4,500), performance 0.78
 * (floor 0.80), main-thread work 2,033ms. The document itself was the largest
 * resource on the page by a factor of three, and the LCP could not land before
 * it finished arriving.
 *
 * Nothing was wasted on the query: it already selects exactly the ten columns
 * the selector declares. The problem is not the columns, it is that 1,200 rows
 * for an interactive canvas below the fold were being pushed into the critical
 * path of a page whose first screen is a photograph and a price.
 *
 * ============================================================================
 * AUTH POSTURE: PUBLIC BY DESIGN, AND GATED ON THE SAME PREDICATE AS THE PAGE
 * ============================================================================
 *
 * A seat chart is what a buyer sees before choosing a seat, so it must be
 * readable without an account. It must NOT be readable for an event the public
 * cannot see, or this route becomes a way to read the seat map of a draft,
 * private or cancelled event by guessing an id.
 *
 * So the event is resolved first, through `PUBLIC_EVENT_MATCH`, the single
 * shared visibility rule (`one-visibility-source` fails the build if a
 * discovery read composes its own). No match, no seats, 404 - the same answer
 * the page gives.
 *
 * `createPublicClient` is the ANON client, so RLS applies on top: the database
 * enforces the rule a second time, independently of this file.
 *
 * ============================================================================
 * CACHING: NONE, DELIBERATELY
 * ============================================================================
 *
 * `seats.status` is what stops two buyers being sold the same seat. A cached
 * seat map is a stale seat map, and the whole point of the pass this route
 * belongs to is that a stored copy nothing invalidates will eventually be
 * wrong. The query is the one the page was already running on every render; it
 * has moved, not multiplied.
 */
export const dynamic = 'force-dynamic'

/** Exactly the columns SeatData declares. Nothing else crosses the wire. */
const SEAT_COLUMNS =
  'id, row_label, seat_number, seat_type, status, x, y, price_cents, seat_map_section_id, ticket_tier_id'

/**
 * PostgREST caps a single response, so the chart is paged.
 *
 * The event page already did this and the reason is recorded there: a room can
 * hold more seats than one response returns, and a silent truncation renders a
 * chart with holes in it, which reads as "those seats are gone" rather than as
 * a bug.
 */
const PAGE = 1000
const MAX_SEATS = 10000

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const supabase = createPublicClient()

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id')
    .eq('id', id)
    .match(PUBLIC_EVENT_MATCH)
    .maybeSingle()

  if (eventError) {
    // NOT SWALLOWED. A discarded error read as "no such row" is precisely how
    // every organiser profile became a 404 for weeks.
    console.error('[api/events/seats] event lookup failed for %s:', id, eventError)
    return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  }
  if (!event) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const seats: unknown[] = []
  for (let from = 0; from < MAX_SEATS; from += PAGE) {
    const { data, error } = await supabase
      .from('seats')
      .select(SEAT_COLUMNS)
      .eq('event_id', id)
      .order('row_label')
      .order('seat_number')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) {
      console.error('[api/events/seats] seat page %d failed for %s:', from, id, error)
      return NextResponse.json({ error: 'unavailable' }, { status: 503 })
    }
    seats.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }

  return NextResponse.json(
    { seats },
    { headers: { 'cache-control': 'no-store' } },
  )
}
