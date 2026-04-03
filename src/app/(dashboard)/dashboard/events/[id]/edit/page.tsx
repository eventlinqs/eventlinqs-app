import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { EventForm } from '@/components/features/events/event-form'
import type { Event, TicketTier, EventCategory } from '@/types/database'

type Props = {
  params: Promise<{ id: string }>
}

export default async function EditEventPage({ params }: Props) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: event } = await supabase
    .from('events')
    .select('*, ticket_tiers(*)')
    .eq('id', id)
    .single() as { data: (Event & { ticket_tiers: TicketTier[] }) | null }

  if (!event) notFound()

  // Verify the user owns this event's organisation
  const { data: org } = await supabase
    .from('organisations')
    .select('id')
    .eq('id', event.organisation_id)
    .eq('owner_id', user.id)
    .single()

  if (!org) notFound()

  const { data: categories } = await supabase
    .from('event_categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order') as { data: EventCategory[] | null }

  const { ticket_tiers, ...eventData } = event

  return (
    <div>
      <div className="mb-8 flex items-center gap-4">
        <Link href="/dashboard/events" className="text-sm text-gray-500 hover:text-gray-700">
          ← My Events
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit Event</h1>
      </div>

      {event.status === 'published' && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This event is live. Changes will be visible to the public as soon as you save.
        </div>
      )}

      <EventForm
        userId={user.id}
        organisationId={event.organisation_id}
        categories={categories ?? []}
        editMode
        existingEventId={event.id}
        existingEvent={eventData}
        existingTiers={ticket_tiers ?? []}
        existingStatus={event.status}
      />
    </div>
  )
}
