import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { EventForm } from '@/components/features/events/event-form'
import { RevenueSummary } from '@/components/orders/revenue-summary'
import type { Event, TicketTier, EventCategory } from '@/types/database'
import { jsonAsStringArray } from '@/lib/json-narrow'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { resolveEventAccess } from '@/lib/organisations/event-access'

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

  /*
   * ACCESS, VIA THE SHARED GATE. Two defects in one line.
   *
   * PRIVILEGE: this filtered `.eq('owner_id', user.id)` on the SESSION client, and
   * the column lockdown does not grant `authenticated` owner_id. PostgreSQL needs
   * SELECT privilege on WHERE-clause columns, so the query was refused 42501, the
   * row came back null, and the page 404'd. That is the failure that forced the
   * emergency GRANT still on production.
   *
   * AUTHORISATION: it admitted the OWNER only. resolveEventAccess admits owner or
   * a member holding owner/admin/manager, matching updateEvent and
   * resolveRefundScope, so a venue's manager can reach the edit form for an event they run. updateEvent already accepts them, so a manager could save an event they were not allowed to open.
   */
  const access = await resolveEventAccess(id)
  if (!access.allowed) notFound()

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

  const { ticket_tiers, ...restEvent } = event
  // events.tags is jsonb in the live schema; narrow to the string[] shape
  // EventForm.fromExistingEvent expects. Non-string array elements are
  // filtered out by jsonAsStringArray; non-array values yield [].
  const eventData = { ...restEvent, tags: jsonAsStringArray(restEvent.tags) }

  return (
    <div>
      <div className="mb-8 flex items-center gap-4">
        <Link href="/dashboard/events" className="text-sm text-ink-400 hover:text-ink-600">
          ← My Events
        </Link>
        <h1 className="text-2xl font-bold text-ink-900">Edit Event</h1>
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
          lineupEnabled={await isFeatureEnabled('broadcast_artists')}
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
              className="rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-center text-sm font-medium text-ink-600 hover:bg-ink-100"
            >
              View Orders
            </Link>
            <Link
              href={`/dashboard/events/${id}/discounts`}
              className="rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-center text-sm font-medium text-ink-600 hover:bg-ink-100"
            >
              Discount Codes
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
