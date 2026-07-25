import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveSeatingOrganisation } from '@/lib/organisations/access'
import { SeatMapsClient } from './seat-maps-client'

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
  const org = await resolveSeatingOrganisation(supabase, user.id)
  if (!org) notFound()

  const admin = createAdminClient()
  const { data: venue, error: venueError } = await admin
    .from('venues')
    .select('id, name')
    .eq('id', venueId)
    .eq('organisation_id', org.id)
    .eq('is_active', true)
    .single()

  if (venueError || !venue) notFound()

  const { data: seatMaps, error: mapsError } = await admin
    .from('seat_maps')
    .select('id, name, total_seats, created_at, layout')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (mapsError) {
    console.error('[seat-maps/page] failed to load seat maps:', mapsError)
  }

  // Live usage per chart: which published events sit on it, and how many
  // of their seats are sold, reserved or held (the protected inventory).
  // The builder and the list surface this so post-publish editing is never
  // a surprise: edits stay template-side until reviewed per event.
  const liveUsage: Record<string, { events: number; protectedSeats: number }> = {}
  const mapIds = (seatMaps ?? []).map(m => m.id)
  if (mapIds.length > 0) {
    const { data: liveEvents } = await admin
      .from('events')
      .select('id, seat_map_id')
      .in('seat_map_id', mapIds)
      .eq('status', 'published')
    const byMap = new Map<string, string[]>()
    for (const ev of liveEvents ?? []) {
      if (!ev.seat_map_id) continue
      const list = byMap.get(ev.seat_map_id) ?? []
      list.push(ev.id)
      byMap.set(ev.seat_map_id, list)
    }
    for (const [mapId, eventIds] of byMap) {
      const { count } = await admin
        .from('seats')
        .select('id', { count: 'exact', head: true })
        .in('event_id', eventIds)
        .in('status', ['reserved', 'sold', 'held'])
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
        seatMaps={(seatMaps ?? []) as unknown as Parameters<typeof SeatMapsClient>[0]['seatMaps']}
        liveUsage={liveUsage}
      />
    </div>
  )
}
