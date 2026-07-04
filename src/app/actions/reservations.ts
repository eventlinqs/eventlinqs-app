'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { actionRateLimit } from '@/lib/rate-limit/action'
import { refreshInventoryCache } from '@/lib/redis/inventory-cache'
import { getOrCreateGuestSessionId } from '@/lib/auth/guest-session'
import {
  TICKETS_NOT_ON_SALE_RESERVATION_ERROR,
  ticketsOnSale,
} from '@/lib/payments/sale-status'
import {
  CreateReservationSchema,
  type CreateReservationInput,
  checkMaxPerOrder,
  summariseIssues,
} from '@/lib/reservations/validation'

// CreateReservationInput is intentionally NOT re-exported here. A 'use server'
// module may export only async server actions: a re-exported type compiles to a
// runtime value reference under the production build and throws ReferenceError
// at module load. Importers take the type from '@/lib/reservations/validation'.

export interface CreateReservationResult {
  reservation_id?: string
  expires_at?: string
  error?: string
}

export async function createReservation(
  input: CreateReservationInput
): Promise<CreateReservationResult> {
  // Throttle the funnel entry by IP. This is the first step of every checkout,
  // so capping it bounds inventory-hold abuse and downstream PaymentIntent spam.
  const rl = await actionRateLimit('checkout-reserve')
  if (!rl.ok) return { error: 'Too many attempts. Please wait a moment and try again.' }

  const parsed = CreateReservationSchema.safeParse(input)
  if (!parsed.success) {
    // RES-02: name the offending field(s) in the server log so a future
    // invalid-reservation failure is diagnosable, not an opaque string.
    console.error(
      '[reservations] invalid reservation input:',
      summariseIssues(parsed.error.issues),
    )
    return { error: 'Invalid reservation data' }
  }

  const { event_id, ticket_items, addon_items } = parsed.data

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const sessionId = user ? null : await getOrCreateGuestSessionId()

  // Organiser-Stripe sale guard. A PAID reservation must never consume
  // inventory for an event whose organiser cannot accept payments yet, so the
  // block happens before create_reservation, not at payment time. FREE-only
  // reservations are exempt (they bypass Stripe entirely). Read via the admin
  // client because the organiser Stripe fields are not exposed to anon RLS.
  // Single source of truth: @/lib/payments/sale-status.
  {
    const admin = createAdminClient()
    const tierIds = ticket_items.map(i => i.ticket_tier_id)
    const { data: guardTiers } = await admin
      .from('ticket_tiers')
      .select('id, name, price, max_per_order')
      .in('id', tierIds)

    // RES-01: enforce the organiser's per-tier max_per_order server-side, so a
    // legitimate selection (always <= max_per_order on the client) never hits
    // the generic "Invalid reservation data" and a crafted over-limit request
    // is rejected with a clear, tier-named message (defence in depth - the
    // client stepper is the only other place this was enforced).
    const limit = checkMaxPerOrder(ticket_items, guardTiers ?? [])
    if (!limit.ok) {
      return { error: limit.error }
    }

    const isPaid = (guardTiers ?? []).some(t => (t.price ?? 0) > 0)

    if (isPaid) {
      const { data: ev } = await admin
        .from('events')
        .select('organisation_id')
        .eq('id', event_id)
        .single()
      const { data: org } = ev?.organisation_id
        ? await admin
            .from('organisations')
            .select('stripe_account_id, stripe_charges_enabled')
            .eq('id', ev.organisation_id)
            .single()
        : { data: null }

      if (!ticketsOnSale({ isPaidEvent: true, org })) {
        return { error: TICKETS_NOT_ON_SALE_RESERVATION_ERROR }
      }
    }
  }

  // Build items array for the DB function
  const items = [
    ...ticket_items.map(i => ({ ticket_tier_id: i.ticket_tier_id, quantity: i.quantity })),
    ...addon_items.map(i => ({ addon_id: i.addon_id, quantity: i.quantity })),
  ]

  const { data, error } = await supabase.rpc('create_reservation', {
    p_event_id: event_id,
    p_user_id: user?.id ?? null,
    p_session_id: sessionId,
    p_items: items,
  })

  if (error || !data) {
    console.error('create_reservation error:', error)
    return { error: error?.message ?? 'Failed to reserve tickets. They may have sold out.' }
  }

  const result = data as { success: boolean; reservation_id?: string; expires_at?: string; error?: string }

  if (!result.success) {
    return { error: result.error ?? 'Unable to reserve tickets. Please try again.' }
  }

  // Refresh Redis inventory cache for all reserved tiers (fire-and-forget)
  for (const item of ticket_items) {
    refreshInventoryCache(item.ticket_tier_id, event_id).catch(err => {
      console.error('[reservations] refreshInventoryCache failed:', err)
    })
  }

  return {
    reservation_id: result.reservation_id,
    expires_at: result.expires_at,
  }
}

export async function getReservation(reservation_id: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('id', reservation_id)
    .eq('status', 'active')
    .single()

  if (error || !data) return null
  return data
}
