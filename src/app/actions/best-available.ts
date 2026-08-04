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
  /** The ONE control's price band, cents: picks only seats inside it. */
  max_price_cents: z.number().int().min(0).optional(),
  min_price_cents: z.number().int().min(0).optional(),
})

export interface BestAvailablePick {
  seat_ids: string[]
  strategy: BestAvailableStrategy | 'error'
}

export async function pickBestAvailableAction(input: {
  event_id: string
  quantity: number
  accessible_needed?: number
  max_price_cents?: number
  min_price_cents?: number
}): Promise<BestAvailablePick> {
  const parsed = BestAvailableRequestSchema.safeParse(input)
  if (!parsed.success) return { seat_ids: [], strategy: 'error' }
  const {
    event_id,
    quantity,
    accessible_needed = 0,
    max_price_cents,
    min_price_cents,
  } = parsed.data

  try {
    const client = createPublicClient()
    const [{ data: seats }, { data: event }] = await Promise.all([
      client
        .from('seats')
        .select('id, seat_map_section_id, row_label, seat_number, seat_type, status, x, y, price_cents, ticket_tier_id')
        .eq('event_id', event_id)
        .range(0, 4999),
      client.from('events').select('seat_map_id').eq('id', event_id).maybeSingle(),
    ])
    if (!seats || seats.length === 0) return { seat_ids: [], strategy: 'none' }

    // Price banding resolves each seat's live price the same way the map
    // displays it: tier price first, then the seat's own price column.
    let tierPrices = new Map<string, number>()
    if (max_price_cents != null || min_price_cents != null) {
      const tierIds = [
        ...new Set(seats.map(s => s.ticket_tier_id as string | null).filter(Boolean)),
      ] as string[]
      if (tierIds.length > 0) {
        // ticket_tiers.price IS cents (the schema's convention).
        const { data: tiers } = await client
          .from('ticket_tiers')
          .select('id, price')
          .in('id', tierIds)
        tierPrices = new Map((tiers ?? []).map(t => [t.id as string, Number(t.price) || 0]))
      }
    }

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
      price_cents:
        (s.ticket_tier_id && tierPrices.get(s.ticket_tier_id as string)) ??
        ((s.price_cents as number | null) ?? 0),
    }))

    const focal = resolveFocalPoint(layout, baSeats)
    const result = pickBestAvailable({
      seats: baSeats,
      quantity,
      focal,
      accessibleNeeded: accessible_needed,
      maxPriceCents: max_price_cents,
      minPriceCents: min_price_cents,
    })
    return { seat_ids: result.seatIds, strategy: result.strategy }
  } catch (err) {
    console.error('[best-available] pick failed:', err)
    return { seat_ids: [], strategy: 'error' }
  }
}
