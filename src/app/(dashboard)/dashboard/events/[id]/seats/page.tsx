import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageOrganisationSeating } from '@/lib/organisations/access'
import { SeatsManagementClient } from './seats-client'
import { SyncChartButton } from './sync-chart-button'

type Props = {
  params: Promise<{ id: string }>
}

export default async function SeatsManagementPage({ params }: Props) {
  const { id: eventId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: event, error: eventError } = await admin
    .from('events')
    .select('id, title, organisation_id, has_reserved_seating, seat_map_id')
    .eq('id', eventId)
    .single()

  if (eventError || !event) notFound()

  // Owner OR owner/admin/manager member (the door-scan trust level).
  const allowed = await canManageOrganisationSeating(supabase, user.id, event.organisation_id)
  if (!allowed) notFound()

  if (!event.has_reserved_seating) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-ink-400">This event does not use reserved seating.</p>
        <Link
          href={`/dashboard/events/${eventId}/edit`}
          className="mt-4 inline-block text-sm text-gold-500 hover:underline"
        >
          Edit event to enable reserved seating
        </Link>
      </div>
    )
  }

  // Chunked past PostgREST's 1,000-row response cap so large charts show
  // every seat (same fix as the attendee map).
  const fetchAllSeats = async () => {
    const PAGE = 1000
    function pageQuery(from: number) {
      return supabase
        .from('seats')
        .select('id, row_label, seat_number, seat_type, status, held_reason, seat_map_section_id, x, y')
        .eq('event_id', eventId)
        .order('row_label')
        .order('seat_number')
        .order('id')
        .range(from, from + PAGE - 1)
    }
    const all: NonNullable<Awaited<ReturnType<typeof pageQuery>>['data']> = []
    for (let from = 0; from < 10000; from += PAGE) {
      const { data, error } = await pageQuery(from)
      if (error) return { data: all, error }
      all.push(...(data ?? []))
      if (!data || data.length < PAGE) break
    }
    return { data: all, error: null }
  }
  const [seatsResult, sectionsResult] = await Promise.all([
    fetchAllSeats(),
    event.seat_map_id
      ? supabase
          .from('seat_map_sections')
          .select('id, name, color')
          .eq('seat_map_id', event.seat_map_id)
          .order('sort_order')
      : Promise.resolve({ data: [] as { id: string; name: string; color: string }[], error: null }),
  ])

  if (seatsResult.error) {
    console.error('[seats/page] failed to load seats:', seatsResult.error)
  }

  return (
    <div>
      <div className="mb-6 border-b border-ink-200 bg-white px-4 py-4 sm:px-6 lg:px-8 -mx-4 sm:-mx-6 lg:-mx-8">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/events" className="text-sm text-ink-400 hover:text-ink-600">
            ← Events
          </Link>
          <Link
            href={`/dashboard/events/${eventId}/edit`}
            className="text-sm text-ink-400 hover:text-ink-600"
          >
            {event.title}
          </Link>
          <span className="text-sm font-medium text-ink-900">Seat Management</span>
          {event.seat_map_id && (
            <span className="ml-auto">
              <SyncChartButton eventId={eventId} />
            </span>
          )}
        </div>
      </div>

      <SeatsManagementClient
        eventId={eventId}
        seats={seatsResult.data ?? []}
        sections={sectionsResult.data ?? []}
      />
    </div>
  )
}
