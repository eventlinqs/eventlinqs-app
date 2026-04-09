import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { EventForm } from '@/components/features/events/event-form'
import { RevenueSummary } from '@/components/orders/revenue-summary'
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

  const { data: venuesWithMaps } = await supabase
    .from('venues')
    .select('id, name, seat_maps(id, name, total_seats)')
    .eq('organisation_id', event.organisation_id)
    .eq('is_active', true)
    .order('name')

  const venues = (venuesWithMaps ?? []).map(v => ({
    id: v.id,
    name: v.name,
    seat_maps: (v.seat_maps ?? []).filter((m: { id: string; name: string; total_seats: number }) => m),
  }))

  // Revenue data for the sidebar card
  const { data: revenueData } = await supabase
    .from('orders')
    .select('total_cents, platform_fee_cents, processing_fee_cents, currency')
    .eq('event_id', id)
    .eq('status', 'confirmed')

  const revenue = revenueData ?? []
  const grossCents = revenue.reduce((s: number, o: { total_cents: number }) => s + o.total_cents, 0)
  const platformFeeCents = revenue.reduce((s: number, o: { platform_fee_cents: number }) => s + o.platform_fee_cents, 0)
  const processingFeeCents = revenue.reduce((s: number, o: { processing_fee_cents: number }) => s + o.processing_fee_cents, 0)
  const revCurrency = revenue[0]?.currency ?? event.ticket_tiers?.[0]?.currency ?? 'AUD'

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

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <EventForm
          userId={user.id}
          organisationId={event.organisation_id}
          categories={categories ?? []}
          venues={venues}
          editMode
          existingEventId={event.id}
          existingEvent={eventData}
          existingTiers={ticket_tiers ?? []}
          existingStatus={event.status}
        />

        <div className="space-y-4">
          <RevenueSummary
            grossCents={grossCents}
            platformFeeCents={platformFeeCents}
            processingFeeCents={processingFeeCents}
            currency={revCurrency}
          />
          <div className="flex flex-col gap-2">
            <Link
              href={`/dashboard/events/${id}/orders`}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              View Orders
            </Link>
            <Link
              href={`/dashboard/events/${id}/discounts`}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Discount Codes
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
