import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PricingClient } from './pricing-client'

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

  // Verify ownership
  const { data: org } = await supabase
    .from('organisations')
    .select('id')
    .eq('id', event.organisation_id)
    .eq('owner_id', user.id)
    .single()

  if (!org) notFound()

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
