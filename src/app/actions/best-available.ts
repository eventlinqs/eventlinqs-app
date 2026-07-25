'use server'

import { z } from 'zod'
import { createPublicClient } from '@/lib/supabase/public-client'
import {
  pickBestAvailable,
  resolveFocalPoint,
  type BASeat,
  type BestAvailableStrategy,
} from '@/lib/seating/best-available'

/**
 * Best-available v2 (S1): the server-side pick. Reads the live seat state
 * and the chart's focal point, runs the pure cascade, and returns the seat
 * ids for the client to reserve through the normal one-winner reservation
 * RPC. Read-only: this action holds nothing and writes nothing, so a lost
 * race stays impossible (the reservation RPC remains the only gate).
 */

const BestAvailableRequestSchema = z.object({
  event_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(20),
  accessible_needed: z.number().int().min(0).max(20).optional(),
})

export interface BestAvailablePick {
  seat_ids: string[]
  strategy: BestAvailableStrategy | 'error'
}

export async function pickBestAvailableAction(input: {
  event_id: string
  quantity: number
  accessible_needed?: number
}): Promise<BestAvailablePick> {
  const parsed = BestAvailableRequestSchema.safeParse(input)
  if (!parsed.success) return { seat_ids: [], strategy: 'error' }
  const { event_id, quantity, accessible_needed = 0 } = parsed.data

  try {
    const client = createPublicClient()
    const [{ data: seats }, { data: event }] = await Promise.all([
      client
        .from('seats')
        .select('id, seat_map_section_id, row_label, seat_number, seat_type, status, x, y')
        .eq('event_id', event_id)
        .range(0, 4999),
      client.from('events').select('seat_map_id').eq('id', event_id).maybeSingle(),
    ])
    if (!seats || seats.length === 0) return { seat_ids: [], strategy: 'none' }

    let layout: Parameters<typeof resolveFocalPoint>[0] = null
    if (event?.seat_map_id) {
      const { data: map } = await client
        .from('seat_maps')
        .select('layout')
        .eq('id', event.seat_map_id)
        .maybeSingle()
      layout = (map?.layout ?? null) as Parameters<typeof resolveFocalPoint>[0]
    }

    const baSeats: BASeat[] = seats.map(s => ({
      id: s.id as string,
      section_id: (s.seat_map_section_id as string | null) ?? null,
      row_label: s.row_label as string,
      seat_number: String(s.seat_number),
      x: s.x as number,
      y: s.y as number,
      status: s.status as string,
      seat_type: s.seat_type as string,
    }))

    const focal = resolveFocalPoint(layout, baSeats)
    const result = pickBestAvailable({
      seats: baSeats,
      quantity,
      focal,
      accessibleNeeded: accessible_needed,
    })
    return { seat_ids: result.seatIds, strategy: result.strategy }
  } catch (err) {
    console.error('[best-available] pick failed:', err)
    return { seat_ids: [], strategy: 'error' }
  }
}
