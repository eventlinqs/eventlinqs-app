import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { PricingClient } from './pricing-client'
import { resolveEventAccess } from '@/lib/organisations/event-access'
import {
  attachLadders,
  readDynamicPricingLadders,
  readEventTicketTiers,
  type PricingTierRow,
} from '@/lib/organisers/event-tier-config'

type Props = {
  params: Promise<{ id: string }>
}

export default async function DynamicPricingPage({ params }: Props) {
  const { id: eventId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Load event - only columns that exist (no currency on events). This used to
  // fold `eventError` into notFound(), so a blink read as a missing event;
  // readOrThrow throws a real fault and answers null only for "no row".
  const event = await readOrThrow('dashboard event pricing', () =>
    supabase.from('events').select('id, title, organisation_id').eq('id', eventId).single(),
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
   * resolveRefundScope, so a venue's manager can reach the dynamic pricing for an event they run.
   */
  const access = await resolveEventAccess(eventId)
  if (!access.allowed) notFound()

  /*
   * THE LADDER IS READ IN FULL OR THE SCREEN IS NOT DRAWN AT ALL, and on this
   * page that is a data-loss rule rather than a tidiness one.
   *
   * This used to read the tiers and then `if (tiersError) notFound()`, four
   * lines under the comment above explaining that readOrThrow exists precisely
   * so a blink is never reported as a missing event, and it used to read the
   * rules with `const { data: rules }`, discarding the error entirely.
   *
   * A refused rules read does not merely show a wrong number here. The client
   * below seeds its editor from what it is handed and substitutes ONE step at
   * the base price when the list is empty, and Save replaces the stored ladder
   * with whatever is on screen. So a dropped socket plus one press of Save
   * deleted an organiser's pricing decision, silently. Both reads now throw,
   * which renders the route's error boundary and asks the organiser to try
   * again, and the ladder they cannot see is a ladder they cannot overwrite.
   */
  const tiers = await readEventTicketTiers<PricingTierRow>(
    supabase,
    eventId,
    'id, name, price, currency, dynamic_pricing_enabled, sold_count, total_capacity',
    { activeOnly: true },
  )
  const tiersWithRules = attachLadders(
    tiers,
    await readDynamicPricingLadders(supabase, tiers.map(t => t.id)),
  )

  return (
    <div className="min-h-screen bg-ink-100">
      <div className="border-b border-ink-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl flex items-center gap-4">
          <Link
            href={`/dashboard/events`}
            className="text-sm text-ink-400 hover:text-ink-600"
          >
            ← Events
          </Link>
          {/* The way back to the event this pricing belongs to, since the event
              overview is now the way in (its Pricing tab). */}
          <Link
            href={`/dashboard/events/${eventId}`}
            className="text-sm text-ink-400 hover:text-ink-600"
          >
            Overview
          </Link>
          <Link
            href={`/dashboard/events/${eventId}/edit`}
            className="text-sm text-ink-400 hover:text-ink-600"
          >
            Edit Event
          </Link>
          <span className="text-sm font-medium text-ink-900">Dynamic Pricing</span>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <PricingClient
          eventId={eventId}
          eventTitle={event.title}
          tiers={tiersWithRules}
        />
      </div>
    </div>
  )
}
