'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { actionRateLimit } from '@/lib/rate-limit/action'
import { refreshInventoryCache } from '@/lib/redis/inventory-cache'
import { getOrCreateGuestSessionId } from '@/lib/auth/guest-session'
import {
  isExternallyTicketed,
  saleRefusalMessage,
  ticketsOnSaleDetailed,
  type SaleRefusalReason,
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
  /**
   * WHY the sale was refused, when it was refused for a sellability reason.
   *
   * The client latches its UI on THIS, never on the prose in `error`. A refusal
   * that arrives with a reason means the checkout control must be taken away,
   * not merely accompanied by a sentence: an enabled button beside a refusal is
   * the dead-end this field exists to make impossible. Absent for ordinary
   * transient failures (rate limit, validation, inventory), which are retryable
   * and correctly leave the button live.
   */
  reason?: SaleRefusalReason
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

    /*
     * EXTERNAL TICKETING, CHECKED UNCONDITIONALLY. Founder ruling 15 August
     * 2026, non-negotiable 3.
     *
     * THIS IS DELIBERATELY OUTSIDE THE `isPaid` BRANCH, and that placement is
     * the whole point. The organiser-sellable gate below only runs for a PAID
     * event, because a free event needs no Stripe account. An externally
     * ticketed event can perfectly well have no priced tier, or no tiers at all,
     * so putting this check inside that branch would let exactly the events most
     * likely to be external walk straight past it and take a reservation for a
     * ticket we do not sell.
     *
     * The event row is read once here and reused by the paid branch, so this
     * costs no extra query.
     */
    /*
     * THE ERROR IS READ, NOT DISCARDED, AND THAT IS THE WHOLE FIX.
     *
     * THE OUTAGE THIS CLOSES, 18 August 2026. This read used to destructure only
     * `{ data: ev }`. `external_ticket_url` is named here by design, but the
     * column did not exist on production because 20260815000001 had not been
     * applied, so PostgREST failed the ENTIRE request. The error went into a
     * variable nobody declared, `ev` arrived null, `ev?.organisation_id` was
     * undefined, the organisation was therefore never read at all, and a null
     * organisation was correctly refused by the gate.
     *
     * The result was that EVERY PAID EVENT ON THE PLATFORM was refused, with a
     * message about a sale window, on a platform that has no sale-window column
     * on an event. The organiser's Stripe posture was perfect on all five fields
     * and never once consulted.
     *
     * A FAILED READ AND A REFUSED SALE ARE DIFFERENT THINGS. Both stop the sale,
     * and both must: fail closed. But only one of them is the organiser's to fix,
     * so they are now reported as different causes rather than one sentence that
     * guesses. Never collapse these two again.
     */
    const { data: ev, error: evError } = await admin
      .from('events')
      .select('organisation_id, external_ticket_url')
      .eq('id', event_id)
      .single()

    if (evError || !ev) {
      console.error(
        '[reservations] sale-gate event read FAILED, refusing without a cause the organiser can act on:',
        evError?.message ?? 'no row returned',
      )
      return { error: saleRefusalMessage('sale_lookup_failed'), reason: 'sale_lookup_failed' }
    }

    if (isExternallyTicketed(ev)) {
      return {
        error: saleRefusalMessage('externally_ticketed'),
        reason: 'externally_ticketed',
      }
    }

    if (isPaid) {
      // ALL FIVE fields the sale gate reads. It was two, and the gate then
      // silently disagreed with the charge precondition, which also requires
      // payouts_enabled, an active payout_status and a country in the Connect
      // currency map. Selecting fewer fields than the gate reads makes the
      // missing ones undefined, which refuses the sale rather than passing it:
      // fail closed, but only if the columns are actually here.
      const { data: org, error: orgError } = await admin
        .from('organisations')
        .select(
          'stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_account_country, payout_status',
        )
        .eq('id', ev.organisation_id)
        .single()

      // Same distinction, one level down. A permissions change or a renamed
      // column here must not be reported to an organiser as a payment-setup
      // problem they cannot find.
      const decision = ticketsOnSaleDetailed({
        isPaidEvent: true,
        org,
        lookupFailed: Boolean(orgError),
      })

      if (!decision.onSale) {
        if (orgError) {
          console.error(
            '[reservations] sale-gate organisation read FAILED:',
            orgError.message,
          )
        }
        return { error: saleRefusalMessage(decision.reason), reason: decision.reason }
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
