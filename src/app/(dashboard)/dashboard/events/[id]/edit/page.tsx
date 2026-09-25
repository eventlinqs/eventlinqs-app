import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow, type Read } from '@/lib/supabase/read-or-throw'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { EventForm } from '@/components/features/events/event-form'
import { AccessibilityFields } from '@/components/features/accessibility/accessibility-fields'
import { accessibilityInputFrom } from '@/lib/accessibility/fields'
import { RevenueSummary } from '@/components/orders/revenue-summary'
import type { Event, TicketTier } from '@/types/database'
import { jsonAsStringArray } from '@/lib/json-narrow'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { resolveEventAccess } from '@/lib/organisations/event-access'
import { readStreamLink } from '@/lib/stream/link'
import { readEventRevenue } from '@/lib/organisers/event-revenue'
import { readEventCategories, readOrganisationVenues } from '@/lib/organisers/event-form-options'

type Props = {
  params: Promise<{ id: string }>
}

export default async function EditEventPage({ params }: Props) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Through readOrThrow: a failed read answers 500, never a false 404 on the
  // organiser's own event (src/lib/supabase/read-or-throw.ts).
  const event = await readOrThrow(
    'dashboard event edit',
    () =>
      supabase.from('events').select('*, ticket_tiers(*)').eq('id', id).single() as unknown as Read<
        Event & { ticket_tiers: TicketTier[] }
      >,
  )

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

  /*
   * THE FORM'S OPTION LISTS, READ IN FULL AND LOUDLY.
   *
   * Both of these discarded their error and stated no bound, so a refused read
   * drew a category select with no options on a form where category is
   * required. The shared readers page and throw; see
   * src/lib/organisers/event-form-options.ts.
   */
  const [categories, venues] = await Promise.all([
    readEventCategories(supabase),
    readOrganisationVenues(supabase, event.organisation_id),
  ])

  /*
   * REVENUE FOR THE SIDEBAR CARD, THROUGH THE ONE READER BOTH SCREENS USE.
   *
   * This was four lines that summed `.eq('status', 'confirmed')` over an
   * unbounded, unordered read whose error was discarded, and it rendered the
   * SAME `RevenueSummary` component as /dashboard/events/[id]/orders while
   * disagreeing with it about every figure the moment a refund existed. The
   * three defects and their measurements are in src/lib/organisers/event-revenue.ts.
   *
   * The reader throws on a failed read, so this page now answers 500 rather
   * than telling an organiser their sold-out event earned nothing.
   *
   * READ WITH AN ADMIN CLIENT, AFTER the resolveEventAccess gate above, which
   * is exactly what the orders screen does with the same rows. Not a
   * convenience: an organiser's own session CANNOT read `refunds`, because the
   * permissive "Admins read all refunds" policy evaluates a subquery on
   * `admin_users`, whose own policy selects from `admin_users`, and PostgreSQL
   * answers 42P17 to every authenticated reader. Driven on 20 September 2026:
   * with the session client this page went to its error boundary at 1440, 768
   * and 390.
   */
  const revenue = await readEventRevenue(createAdminClient(), id, {
    fallbackCurrency: event.ticket_tiers?.[0]?.currency ?? 'AUD',
  })

  // The stream link lives in the vault, not on the events row. Read under the
  // organiser's own session so RLS scopes it to their events.
  const existingStreamUrl = await readStreamLink(supabase, id)

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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <EventForm
          userId={user.id}
          organisationId={event.organisation_id}
          categories={categories}
          venues={venues}
          editMode
          existingEventId={event.id}
          existingEvent={eventData}
          existingTiers={ticket_tiers ?? []}
          existingStreamUrl={existingStreamUrl}
          existingStatus={event.status}
          lineupEnabled={await isFeatureEnabled('broadcast_artists')}
          />

          {/*
            ACCESSIBILITY (close-out SEO5 step 4), saved on its own.

            It is NOT part of the form above and must not become part of it. The
            columns behind it are created by a migration that is parked awaiting
            the founder (docs/migrations-pending/20260914000002_accessibility_fields.sql),
            and PostgREST fails a whole statement on a column it does not have,
            so folding these twelve fields into `updateEvent` would stop every
            organiser saving every event until he applied it. Separated, the
            worst case is this panel saying the fields are not available yet.
          */}
          <AccessibilityFields
            scope="event"
            subjectId={event.id}
            initial={accessibilityInputFrom(event as unknown as Record<string, unknown>, 'event')}
          />
        </div>

        <div className="space-y-4">
          {/* refundedCents is passed for the same reason the orders screen
              passes it: without it a fully refunded order nets to its full
              value and the organiser reads money back that they gave back. */}
          <RevenueSummary
            grossCents={revenue.grossCents}
            platformFeeCents={revenue.platformFeeCents}
            processingFeeCents={revenue.processingFeeCents}
            refundedCents={revenue.refundedCents}
            currency={revenue.currency}
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
