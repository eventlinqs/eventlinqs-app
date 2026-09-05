import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PricingClient } from './pricing-client'
import { resolveEventAccess } from '@/lib/organisations/event-access'

type Props = {
  params: Promise<{ id: string }>
}

export default async function DynamicPricingPage({ params }: Props) {
  const { id: eventId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Load event - only columns that exist (no currency on events)
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, title, organisation_id')
    .eq('id', eventId)
    .single()

  if (eventError || !event) notFound()

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

  // Load tiers with dynamic pricing rules
  const { data: tiers, error: tiersError } = await supabase
    .from('ticket_tiers')
    .select('id, name, price, currency, dynamic_pricing_enabled, sold_count, total_capacity')
    .eq('event_id', eventId)
    .eq('is_active', true)
    .order('sort_order')

  if (tiersError) {
    console.error('[pricing-page] Failed to load tiers:', tiersError)
    notFound()
  }

  // Load dynamic pricing rules for all tiers
  const tierIds = (tiers ?? []).map(t => t.id)
  const { data: rules } = tierIds.length > 0
    ? await supabase
        .from('dynamic_pricing_rules')
        .select('id, ticket_tier_id, step_order, capacity_threshold_percent, price_cents')
        .in('ticket_tier_id', tierIds)
        .order('step_order')
    : { data: [] }

  // Attach rules to tiers
  const tiersWithRules = (tiers ?? []).map(tier => ({
    ...tier,
    dynamic_pricing_rules: (rules ?? [])
      .filter(r => r.ticket_tier_id === tier.id)
      .map(r => ({
        id: r.id,
        step_order: r.step_order,
        capacity_threshold_percent: Number(r.capacity_threshold_percent),
        price_cents: r.price_cents,
      })),
  }))

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
