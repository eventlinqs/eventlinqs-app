import { getRedisClient } from './client'
import { createClient } from '@/lib/supabase/server'

const TTL_SECONDS = 30

export interface TierInventory {
  sold: number
  reserved: number
  total: number
  available: number
  percent_sold: number
}

export interface EventInventory {
  total_sold: number
  total_reserved: number
  total_capacity: number
  available: number
  percent_sold: number
}

function tierKey(tierId: string) {
  return `tier:${tierId}:inventory`
}

function eventKey(eventId: string) {
  return `event:${eventId}:inventory`
}

// ─── Tier inventory ────────────────────────────────────────────────────────

export async function getTierInventory(tierId: string): Promise<TierInventory | null> {
  const redis = getRedisClient()

  if (redis) {
    try {
      const cached = await redis.get<TierInventory>(tierKey(tierId))
      if (cached) return cached
    } catch (err) {
      console.error('[inventory-cache] getTierInventory Redis read failed:', err)
    }
  }

  // Fallback to Postgres
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('ticket_tiers')
      .select('sold_count, reserved_count, total_capacity')
      .eq('id', tierId)
      .single()

    if (error || !data) {
      console.error('[inventory-cache] getTierInventory DB read failed:', error)
      return null
    }

    const available = Math.max(0, data.total_capacity - data.sold_count - data.reserved_count)
    const percent_sold = data.total_capacity > 0
      ? Math.round((data.sold_count / data.total_capacity) * 100)
      : 0

    const inventory: TierInventory = {
      sold: data.sold_count,
      reserved: data.reserved_count,
      total: data.total_capacity,
      available,
      percent_sold,
    }

    // Populate cache for next read
    await setTierInventory(tierId, inventory)
    return inventory
  } catch (err) {
    console.error('[inventory-cache] getTierInventory DB fallback failed:', err)
    return null
  }
}

export async function setTierInventory(tierId: string, data: TierInventory): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return

  try {
    await redis.set(tierKey(tierId), data, { ex: TTL_SECONDS })
  } catch (err) {
    console.error('[inventory-cache] setTierInventory failed:', err)
    // Never throw - Redis failures must not break the app
  }
}

export async function invalidateTierInventory(tierId: string): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return

  try {
    await redis.del(tierKey(tierId))
  } catch (err) {
    console.error('[inventory-cache] invalidateTierInventory failed:', err)
  }
}

// ─── Event inventory (aggregate across all tiers) ──────────────────────────

export async function getEventInventory(eventId: string): Promise<EventInventory | null> {
  const redis = getRedisClient()

  if (redis) {
    try {
      const cached = await redis.get<EventInventory>(eventKey(eventId))
      if (cached) return cached
    } catch (err) {
      console.error('[inventory-cache] getEventInventory Redis read failed:', err)
    }
  }

  // Fallback to Postgres
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('ticket_tiers')
      .select('sold_count, reserved_count, total_capacity')
      .eq('event_id', eventId)
      .eq('is_active', true)

    if (error || !data) {
      console.error('[inventory-cache] getEventInventory DB read failed:', error)
      return null
    }

    const total_sold = data.reduce((s, t) => s + t.sold_count, 0)
    const total_reserved = data.reduce((s, t) => s + t.reserved_count, 0)
    const total_capacity = data.reduce((s, t) => s + t.total_capacity, 0)
    const available = Math.max(0, total_capacity - total_sold - total_reserved)
    const percent_sold = total_capacity > 0
      ? Math.round((total_sold / total_capacity) * 100)
      : 0

    const inventory: EventInventory = {
      total_sold,
      total_reserved,
      total_capacity,
      available,
      percent_sold,
    }

    await setEventInventory(eventId, inventory)
    return inventory
  } catch (err) {
    console.error('[inventory-cache] getEventInventory DB fallback failed:', err)
    return null
  }
}

export async function setEventInventory(eventId: string, data: EventInventory): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return

  try {
    await redis.set(eventKey(eventId), data, { ex: TTL_SECONDS })
  } catch (err) {
    console.error('[inventory-cache] setEventInventory failed:', err)
  }
}

export async function invalidateEventInventory(eventId: string): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return

  try {
    await redis.del(eventKey(eventId))
  } catch (err) {
    console.error('[inventory-cache] invalidateEventInventory failed:', err)
  }
}

/**
 * Recompute and refresh BOTH the tier cache AND the event aggregate cache
 * from the database. Call this after any inventory change.
 */
export async function refreshInventoryCache(tierId: string, eventId: string): Promise<void> {
  await invalidateTierInventory(tierId)
  await invalidateEventInventory(eventId)
  // Re-populate from DB immediately so next read is fast
  await getTierInventory(tierId)
  await getEventInventory(eventId)
}
