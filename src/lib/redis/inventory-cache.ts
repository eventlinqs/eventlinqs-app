import { unstable_cache, revalidateTag } from 'next/cache'
import { getRedisClient } from './client'
import { createPublicClient } from '@/lib/supabase/public-client'

const TTL_SECONDS = 30
const STATIC_REVALIDATE_SECONDS = 30

/**
 * THE TAG ON THE SEAT COUNTS, AND THE ONE THING THAT CLEARS IT.
 *
 * `getTierInventoryStatic` and `getEventInventoryStatic` are what the public
 * event page reads to decide whether to show "N left" or "Sold out". Both carry
 * this tag. Until 25 August 2026 NOTHING in the repository ever passed it to
 * revalidateTag, so the only thing that expired it was its own 30 second timer.
 *
 * That is the same shape that put eight deleted events on /events: a tag
 * declared where a cache is built and never named where the data changes. It is
 * smaller here only because the window is 30 seconds rather than thirty minutes,
 * and 30 seconds of a stale seat count during an on-sale is still a buyer
 * clicking a ticket that is already gone.
 *
 * Exported so scripts/guards/maintained-aggregates.mjs can see that the
 * declaration and the invalidation name the same string.
 */
export const INVENTORY_CACHE_TAG = 'inventory'

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
    const supabase = createPublicClient()
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
    const supabase = createPublicClient()
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
 *
 * THERE ARE THREE LAYERS HERE AND THIS USED TO CLEAR ONLY TWO. Redis holds the
 * hot copy, Next's data cache holds the copy the STATIC render reads, and
 * Postgres owns the truth. Both call sites (the reservation server action and
 * the Stripe webhook) called this function faithfully, and it cleared Redis and
 * left the Next layer alone, so the public event page went on serving the
 * pre-sale seat count for up to its full 30 second window after a sale.
 *
 * `revalidateTag(tag, { expire: 0 })`, NOT `updateTag`, and the reason is
 * mechanical rather than a preference. `updateTag` "is only available inside
 * Server Functions"
 * (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cacheTag.md)
 * and one of the two callers is the Stripe webhook, a route handler, where it
 * would throw. The same docs name this exact case:
 *
 *   "For webhooks or third-party services that need immediate expiration, you
 *    can pass `{ expire: 0 }` as the second argument"
 *   (.../04-functions/revalidateTag.md, shipped with next@16.3.0,
 *    read 25 August 2026)
 *
 * The second argument is not optional cosmetics: omitting it is deprecated in
 * next@16, and the default `"max"` profile is stale-while-revalidate, which
 * would serve the pre-sale count one more time to the very next buyer. For a
 * seat that has just been taken, serving it once more is the failure.
 */
export async function refreshInventoryCache(tierId: string, eventId: string): Promise<void> {
  /*
   * FIRST, AND SYNCHRONOUSLY, WHICH IS NOT A STYLE CHOICE.
   *
   * Both callers invoke this fire-and-forget:
   *
   *     refreshInventoryCache(item.ticket_tier_id, eventId).catch(err => ...)
   *
   * with no await. Everything after the first `await` in here therefore runs
   * once the caller has moved on, and `revalidateTag` needs the request store
   * that Next binds to the surrounding request or action. Placed at the bottom
   * it would be reached outside that store, throw, and be swallowed by the
   * caller's `.catch` - a cache invalidation that logs an error and clears
   * nothing, which is the same as not having it.
   *
   * The statement before the first await runs in the caller's context, so it is
   * placed there. It is also correct in ordering terms: every caller runs this
   * AFTER the database write, so the truth is already committed and expiring the
   * copy first can only mean a fresh read.
   */
  revalidateTag(INVENTORY_CACHE_TAG, { expire: 0 })

  await invalidateTierInventory(tierId)
  await invalidateEventInventory(eventId)
  // Re-populate from DB immediately so next read is fast
  await getTierInventory(tierId)
  await getEventInventory(eventId)
}

// ─── Static-render variants ────────────────────────────────────────────────
//
// Why a separate path: the regular getters perform Upstash `redis.get` /
// `redis.set` which are `cache: 'no-store'` fetches under the hood. Calling
// them inside an ISR render forces Next.js to mark the route as Dynamic
// (DYNAMIC_SERVER_USAGE) even when wrapped in try/catch. Wrapping in
// `unstable_cache` puts the inner fetches inside Next's data cache so
// they're treated as cacheable for the static render.
//
// The static variants intentionally DON'T populate Redis on miss - the
// regular Postgres-fallback code is reused but the side-effect SET is
// skipped via a no-write fetch path. Checkout / admin code paths still
// write through `setTierInventory` directly when they have a fresh value
// to publish.

async function fetchTierInventoryFromDb(tierId: string): Promise<TierInventory | null> {
  try {
    const supabase = createPublicClient()
    const { data, error } = await supabase
      .from('ticket_tiers')
      .select('sold_count, reserved_count, total_capacity')
      .eq('id', tierId)
      .single()
    if (error || !data) return null
    const available = Math.max(0, data.total_capacity - data.sold_count - data.reserved_count)
    const percent_sold = data.total_capacity > 0
      ? Math.round((data.sold_count / data.total_capacity) * 100)
      : 0
    return {
      sold: data.sold_count,
      reserved: data.reserved_count,
      total: data.total_capacity,
      available,
      percent_sold,
    }
  } catch {
    return null
  }
}

async function fetchEventInventoryFromDb(eventId: string): Promise<EventInventory | null> {
  try {
    const supabase = createPublicClient()
    const { data, error } = await supabase
      .from('ticket_tiers')
      .select('sold_count, reserved_count, total_capacity')
      .eq('event_id', eventId)
      .eq('is_active', true)
    if (error || !data) return null
    const total_sold = data.reduce((s, t) => s + t.sold_count, 0)
    const total_reserved = data.reduce((s, t) => s + t.reserved_count, 0)
    const total_capacity = data.reduce((s, t) => s + t.total_capacity, 0)
    const available = Math.max(0, total_capacity - total_sold - total_reserved)
    const percent_sold = total_capacity > 0
      ? Math.round((total_sold / total_capacity) * 100)
      : 0
    return { total_sold, total_reserved, total_capacity, available, percent_sold }
  } catch {
    return null
  }
}

export const getTierInventoryStatic = unstable_cache(
  fetchTierInventoryFromDb,
  ['tier-inventory-static-v1'],
  { revalidate: STATIC_REVALIDATE_SECONDS, tags: [INVENTORY_CACHE_TAG] },
)

export const getEventInventoryStatic = unstable_cache(
  fetchEventInventoryFromDb,
  ['event-inventory-static-v1'],
  { revalidate: STATIC_REVALIDATE_SECONDS, tags: [INVENTORY_CACHE_TAG] },
)
