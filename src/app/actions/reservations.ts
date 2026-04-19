'use server'

import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { refreshInventoryCache } from '@/lib/redis/inventory-cache'
import { getOrCreateGuestSessionId } from '@/lib/auth/guest-session'

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
