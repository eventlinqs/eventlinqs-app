'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'
import { refreshInventoryCache } from '@/lib/redis/inventory-cache'
import { getOrCreateGuestSessionId } from '@/lib/auth/guest-session'
import {
  TICKETS_NOT_ON_SALE_RESERVATION_ERROR,
  ticketsOnSale,
} from '@/lib/payments/sale-status'

const ReservationItemSchema = z.object({
  ticket_tier_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(20),
})

const AddonItemSchema = z.object({
  addon_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(20),
})

const CreateReservationSchema = z.object({
  event_id: z.string().uuid(),
  ticket_items: z.array(ReservationItemSchema).min(1),
  addon_items: z.array(AddonItemSchema).default([]),
})

export type CreateReservationInput = z.infer<typeof CreateReservationSchema>

export interface CreateReservationResult {
  reservation_id?: string
  expires_at?: string
  error?: string
}

export async function createReservation(
  input: CreateReservationInput
): Promise<CreateReservationResult> {
  const parsed = CreateReservationSchema.safeParse(input)
  if (!parsed.success) {
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
      .select('price')
      .in('id', tierIds)
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
