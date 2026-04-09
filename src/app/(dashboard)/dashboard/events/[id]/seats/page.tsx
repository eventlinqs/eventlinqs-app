import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { SeatsManagementClient } from './seats-client'

type Props = {
  params: Promise<{ id: string }>
}

export default async function SeatsManagementPage({ params }: Props) {
  const { id: eventId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, title, organisation_id, has_reserved_seating, seat_map_id')
    .eq('id', eventId)
    .single()

  if (eventError || !event) notFound()

  // Verify ownership
  const { data: org } = await supabase
    .from('organisations')
    .select('id')
    .eq('id', event.organisation_id)
    .eq('owner_id', user.id)
    .single()

  if (!org) notFound()

  if (!event.has_reserved_seating) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-gray-500">This event does not use reserved seating.</p>
        <Link
          href={`/dashboard/events/${eventId}/edit`}
          className="mt-4 inline-block text-sm text-blue-600 hover:underline"
        >
          Edit event to enable reserved seating
        </Link>
      </div>
    )
  }

  const [seatsResult, sectionsResult] = await Promise.all([
    supabase
      .from('seats')
      .select('id, row_label, seat_number, seat_type, status, held_reason, seat_map_section_id')
      .eq('event_id', eventId)
      .order('row_label')
      .order('seat_number'),
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
      <div className="mb-6 border-b border-gray-200 bg-white px-4 py-4 sm:px-6 lg:px-8 -mx-4 sm:-mx-6 lg:-mx-8">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/events" className="text-sm text-gray-500 hover:text-gray-700">
            ← Events
          </Link>
          <Link
            href={`/dashboard/events/${eventId}/edit`}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            {event.title}
          </Link>
          <span className="text-sm font-medium text-gray-900">Seat Management</span>
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
