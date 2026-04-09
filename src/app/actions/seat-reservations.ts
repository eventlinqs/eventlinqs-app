'use server'

import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const CreateSeatReservationSchema = z.object({
  event_id: z.string().uuid(),
  seat_ids: z.array(z.string().uuid()).min(1).max(20),
  ttl_minutes: z.number().int().min(5).max(60).optional(),
})

export type CreateSeatReservationInput = z.infer<typeof CreateSeatReservationSchema>

export interface SeatReservationResult {
  reservation_id?: string
  expires_at?: string
  error?: string
}

export async function createSeatReservation(
  input: CreateSeatReservationInput
): Promise<SeatReservationResult> {
  const parsed = CreateSeatReservationSchema.safeParse(input)
  if (!parsed.success) {
    return { error: 'Invalid reservation data' }
  }

  const { event_id, seat_ids, ttl_minutes = 10 } = parsed.data

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase.rpc('create_seat_reservation', {
    p_event_id: event_id,
    p_user_id: user?.id ?? null,
    p_seat_ids: seat_ids,
    p_ttl_minutes: ttl_minutes,
  })

  if (error) {
    console.error('[seat-reservations] create_seat_reservation RPC failed:', error)
    return { error: error.message ?? 'Failed to reserve seats. They may have been taken.' }
  }

  const result = data as {
    success: boolean
    reservation_id?: string
    expires_at?: string
    error?: string
  }

  if (!result.success) {
    return { error: result.error ?? 'One or more seats are no longer available. Please try again.' }
  }

  return {
    reservation_id: result.reservation_id,
    expires_at: result.expires_at,
  }
}
