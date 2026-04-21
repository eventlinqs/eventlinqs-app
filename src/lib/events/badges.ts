import type { PublicEventRow, PublicEventTier, SocialProofBadge } from './types'

/**
 * Compute the single social-proof badge to render on an event card.
 *
 * Priority (highest to lowest — exactly one badge is ever returned):
 *   1. last_chance      — event starts in < 24 hours
 *   2. few_left         — fewer than 10 tickets remaining across all tiers
 *   3. selling_fast     — more than 70% of inventory sold
 *   4. just_announced   — event was created less than 48 hours ago
 *   5. free             — event has no paid tickets
 *
 * Returns null when none of the conditions apply. Runs server-side only
 * (no "now" pinning beyond Date.now() — callers on ISR pages accept up to
 * the revalidation window of staleness).
 */

type BadgeInput = {
  start_date: string
  created_at: string
  is_free: boolean | null
  ticket_tiers: PublicEventTier[]
}

const HOUR_MS = 60 * 60 * 1000

function sumTiers(tiers: PublicEventTier[]) {
  let sold = 0
  let reserved = 0
  let capacity = 0
  for (const t of tiers) {
    sold += t.sold_count
    reserved += t.reserved_count
    capacity += t.total_capacity
  }
  return { sold, reserved, capacity }
}

export function computeSocialProofBadge(
  event: BadgeInput,
  now: Date = new Date(),
): SocialProofBadge | null {
  const nowMs = now.getTime()

  // 1. last_chance — < 24h to start
  const startMs = new Date(event.start_date).getTime()
  const hoursUntilStart = (startMs - nowMs) / HOUR_MS
  if (hoursUntilStart > 0 && hoursUntilStart < 24) {
    return 'last_chance'
  }

  // 2. few_left — < 10 tickets remaining across all tiers
  const { sold, reserved, capacity } = sumTiers(event.ticket_tiers)
  const remaining = Math.max(0, capacity - sold - reserved)
  if (capacity > 0 && remaining > 0 && remaining < 10) {
    return 'few_left'
  }

  // 3. selling_fast — > 70% sold
  if (capacity > 0 && sold / capacity > 0.7) {
    return 'selling_fast'
  }

  // 4. just_announced — created < 48h ago
  const ageHours = (nowMs - new Date(event.created_at).getTime()) / HOUR_MS
  if (ageHours >= 0 && ageHours < 48) {
    return 'just_announced'
  }

  // 5. free — no paid tickets
  if (event.is_free === true) {
    return 'free'
  }

  return null
}

/**
 * Attach a precomputed badge to a PublicEventRow shape (used by the fetchers
 * before the row crosses the server boundary).
 */
export function withBadge<T extends BadgeInput>(event: T, now?: Date): T & { badge: SocialProofBadge | null } {
  return { ...event, badge: computeSocialProofBadge(event, now) }
}

export const BADGE_LABELS: Record<SocialProofBadge, string> = {
  last_chance: 'Last chance',
  few_left: 'Few left',
  selling_fast: 'Selling fast',
  just_announced: 'Just announced',
  free: 'Free',
}

/**
 * Tailwind token classnames for each badge variant. Uses existing gold / coral
 * / ink palette — no new tokens introduced.
 */
export const BADGE_STYLES: Record<SocialProofBadge, string> = {
  last_chance: 'bg-coral-500 text-white',
  few_left: 'bg-gold-500 text-ink-900',
  selling_fast: 'bg-coral-100 text-coral-600',
  just_announced: 'bg-ink-900 text-white',
  free: 'bg-gold-100 text-gold-600',
}
