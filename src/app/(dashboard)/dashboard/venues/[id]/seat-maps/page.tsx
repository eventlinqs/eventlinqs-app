import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { PROTECTED_SEAT_STATUSES } from '@/lib/events/seat-counts'
import { requireVenueSeatingAccess } from '@/lib/organisations/access'
import { SeatMapsClient } from './seat-maps-client'

/** The chart columns this screen reads, named so the pager's generic is explicit. */
type SeatMapRow = {
  id: string
  name: string
  total_seats: number | null
  created_at: string
  layout: unknown
}

type Props = {
  params: Promise<{ id: string }>
}

export default async function SeatMapsPage({ params }: Props) {
  const { id: venueId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Owner OR organisation member with the owner/admin/manager role (the same
  // trust level the door scanner already grants). The gate itself runs under
  // the session client (RLS applies); the venue/chart reads then run under
  // the admin client scoped to the resolved organisation, so a member is not
  // blocked by owner-scoped venue RLS.
  const access = await requireVenueSeatingAccess(supabase, user.id, venueId)
  if (!access.ok) notFound()

  const admin = createAdminClient()
  // This used to fold `venueError` into notFound(), so a blink read as a missing
  // venue; readOrThrow throws a real fault and answers null only for "no row".
  const venue = await readOrThrow('venue seat maps venue', () =>
    admin
      .from('venues')
      .select('id, name')
      .eq('id', venueId)
      .eq('organisation_id', access.organisationId)
      .eq('is_active', true)
      .single(),
  )

  if (!venue) notFound()

  /*
   * EVERY CHART THIS VENUE HAS, AND EVERY ONE OF THEM COUNTED.
   *
   * The three reads below were unbounded, so each was capped at a thousand
   * rows in silence. A venue with more charts than that is not the likely
   * case; a busy venue whose charts have carried more than a thousand
   * PUBLISHED EVENTS between them over a few years is entirely ordinary, and
   * that read feeds the "live usage" figure an organiser checks before editing
   * a chart that people already hold seats on. An undercount there reads as
   * "safe to edit".
   *
   * The paging order carries `id` last in each, so no row can fall between two
   * windows. The chart list keeps newest first for display. `readEveryRow`
   * raises on failure, which is why `mapsError` is gone: it was logged and
   * then ignored, and an empty chart list is the organiser's cue to build one
   * they already have.
   */
  const seatMaps = await readEveryRow<SeatMapRow>('venue seat maps', (from, to) =>
    admin
      .from('seat_maps')
      .select('id, name, total_seats, created_at, layout')
      .eq('venue_id', venueId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  )

  // Live usage per chart: which published events sit on it, and how many
  // of their seats are sold, reserved or held (the protected inventory).
  // The builder and the list surface this so post-publish editing is never
  // a surprise: edits stay template-side until reviewed per event.
  const liveUsage: Record<string, { events: number; protectedSeats: number }> = {}
  const sectionViews: Record<string, Record<string, string>> = {}
  const mapIds = seatMaps.map(m => m.id)
  if (mapIds.length > 0) {
    const views = await readEveryRow<{ seat_map_id: string; section_name: string; photo_url: string }>(
      'venue seat section views',
      (from, to) =>
        admin
          .from('seat_section_views')
          .select('seat_map_id, section_name, photo_url')
          .in('seat_map_id', mapIds)
          .order('id')
          .range(from, to),
    )
    for (const view of views) {
      const chart = (sectionViews[view.seat_map_id] ??= {})
      chart[view.section_name.toLowerCase()] = view.photo_url
    }
    const liveEvents = await readEveryRow<{ id: string; seat_map_id: string | null }>(
      'venue seat map live events',
      (from, to) =>
        admin
          .from('events')
          .select('id, seat_map_id')
          .in('seat_map_id', mapIds)
          .eq('status', 'published')
          .order('id')
          .range(from, to),
    )
    const byMap = new Map<string, string[]>()
    for (const ev of liveEvents) {
      if (!ev.seat_map_id) continue
      const list = byMap.get(ev.seat_map_id) ?? []
      list.push(ev.id)
      byMap.set(ev.seat_map_id, list)
    }
    /*
     * THE PROTECTED SEATS ARE THE ONES PEOPLE ALREADY HOLD, AND A READ THAT
     * FAILS MUST NOT READ AS "SAFE TO EDIT".
     *
     * This was `const { count } = await ...` with `count ?? 0`. The error was
     * not destructured at all, so a read that failed produced nought protected
     * seats, which is the sentence the chart list prints beside an Edit button.
     * It is the same flattering direction as every other defect on these
     * screens: the number that decides whether the organiser is warned was the
     * number that defaulted to no warning. It throws now, in a screen that
     * already throws on its other reads.
     */
    for (const [mapId, eventIds] of byMap) {
      const { count, error: protectedError } = await admin
        .from('seats')
        .select('id', { count: 'exact', head: true })
        .in('event_id', eventIds)
        .in('status', [...PROTECTED_SEAT_STATUSES])
      if (protectedError) {
        throw new Error(`protected seats for seat map ${mapId} could not be counted: ${protectedError.message}`)
      }
      liveUsage[mapId] = { events: eventIds.length, protectedSeats: count ?? 0 }
    }
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard/venues" className="text-sm text-ink-400 hover:text-ink-600">
          ← Venues
        </Link>
      </div>
      <SeatMapsClient
        venueId={venueId}
        venueName={venue.name}
        seatMaps={seatMaps as unknown as Parameters<typeof SeatMapsClient>[0]['seatMaps']}
        liveUsage={liveUsage}
        sectionViews={sectionViews}
      />
    </div>
  )
}
