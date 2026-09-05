/**
 * PRICE HISTORY, SUMMARISED FOR THE PUBLIC EVENT PAGE (Scope v5, 3.3).
 *
 * The rows come from ticket_price_history, which the database writes and
 * nothing else does (migration 20260904000002). One row per time a tier's
 * effective price became a different number: 'listed' (the first record),
 * 'changed' (the organiser moved it) or 'step' (sales crossed a dynamic
 * pricing threshold). This module turns those rows into what a buyer reads.
 *
 * Pure: no database, no clock of its own (the caller passes `now`), so every
 * rule here is pinned by tests/unit/pricing/price-history.test.ts.
 *
 * MATCHED BY TIER NAME, not tier id. The organiser's edit path re-creates every
 * tier, so the id on an older row may be null (ON DELETE SET NULL) while the
 * name still identifies the same ticket to a person.
 */
import { formatMoney } from '@/lib/money/format'
import { resolveZone, type EventTimeZone } from '@/lib/dates/event-time'

export type PriceHistoryReason = 'listed' | 'changed' | 'step'

/** The row shape as read from ticket_price_history. */
export interface PriceHistoryRow {
  id: string
  ticket_tier_id: string | null
  tier_name: string
  price_cents: number
  previous_price_cents: number | null
  reason: string
  percent_sold: number | null
  currency: string
  recorded_at: string
}

export type PriceDirection = 'listed' | 'up' | 'down' | 'same'

export interface PriceHistoryEntry {
  priceCents: number
  previousPriceCents: number | null
  reason: PriceHistoryReason
  percentSold: number | null
  recordedAt: string
  direction: PriceDirection
}

export interface TierPriceHistory {
  tierId: string
  tierName: string
  currency: string
  entries: PriceHistoryEntry[]
  /** True when the price has ever been a different number from the one it was listed at. */
  moved: boolean
}

/** The fields of a tier this module needs. Structural on purpose: the page's enriched tier fits. */
export interface HistoryTierLike {
  id: string
  name: string | null
  currency: string
  is_visible: boolean
  is_active: boolean
  requires_access_code?: boolean | null
  hidden_until?: string | null
}

/**
 * A tier whose price the visitor may see. Hidden, inactive, not-yet-revealed
 * and access-code tiers keep their history to themselves, exactly as the
 * ticket panel keeps their price.
 */
export function tierShowsHistory(tier: HistoryTierLike, now: Date): boolean {
  if (!tier.is_visible || !tier.is_active) return false
  if (tier.requires_access_code) return false
  if (tier.hidden_until && new Date(tier.hidden_until) > now) return false
  return true
}

function asReason(value: string): PriceHistoryReason {
  return value === 'listed' || value === 'changed' || value === 'step' ? value : 'changed'
}

function directionOf(price: number, previous: number | null, reason: PriceHistoryReason): PriceDirection {
  if (reason === 'listed' || previous === null) return 'listed'
  if (price > previous) return 'up'
  if (price < previous) return 'down'
  return 'same'
}

/**
 * One timeline per visible tier, oldest first, matched by name. A tier with no
 * rows at all (created before the history existed and never backfilled) is left
 * out rather than shown with an empty timeline.
 */
export function summarisePriceHistory(
  rows: PriceHistoryRow[],
  tiers: HistoryTierLike[],
  now: Date = new Date(),
): TierPriceHistory[] {
  const sorted = [...rows].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at) || a.id.localeCompare(b.id))
  const result: TierPriceHistory[] = []
  const seenNames = new Set<string>()
  for (const tier of tiers) {
    if (!tierShowsHistory(tier, now)) continue
    const key = (tier.name ?? '').trim().toLowerCase()
    if (!key || seenNames.has(key)) continue
    seenNames.add(key)
    const own = sorted.filter((r) => r.tier_name.trim().toLowerCase() === key)
    if (own.length === 0) continue
    let previous: number | null = null
    const entries: PriceHistoryEntry[] = own.map((r) => {
      const reason = asReason(r.reason)
      const prior = r.previous_price_cents ?? previous
      const entry: PriceHistoryEntry = {
        priceCents: r.price_cents,
        previousPriceCents: reason === 'listed' ? null : prior,
        reason,
        percentSold: r.percent_sold,
        recordedAt: r.recorded_at,
        direction: directionOf(r.price_cents, reason === 'listed' ? null : prior, reason),
      }
      previous = r.price_cents
      return entry
    })
    result.push({
      tierId: tier.id,
      tierName: tier.name?.trim() || 'Ticket',
      currency: own[own.length - 1]?.currency ?? tier.currency,
      entries,
      moved: entries.some((e) => e.direction === 'up' || e.direction === 'down'),
    })
  }
  return result
}

/** "4 Sep 2026" in the event's own zone. */
export function formatHistoryDate(iso: string, timezone: EventTimeZone): string {
  try {
    return new Intl.DateTimeFormat('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: resolveZone(timezone),
    }).format(new Date(iso))
  } catch {
    // A malformed date must not take the page down; the raw value is shown instead.
    return iso
  }
}

function percentLabel(percent: number | null): string | null {
  if (percent === null || !Number.isFinite(percent)) return null
  return `${Math.round(percent)}% sold`
}

/**
 * The sentence for one entry, without its date. Australian English, no dashes,
 * no exclamation marks, the amount in the same "AUD 30.00" form the ticket panel
 * and the confirmation email use.
 */
export function describePriceEntry(entry: PriceHistoryEntry, currency: string): string {
  const amount = formatMoney(entry.priceCents, currency)
  if (entry.reason === 'listed' || entry.direction === 'listed') return `Listed at ${amount}`
  if (entry.reason === 'step') {
    const at = percentLabel(entry.percentSold)
    const verb = entry.direction === 'down' ? 'Fell to' : 'Rose to'
    return at ? `${verb} ${amount} at ${at}` : `${verb} ${amount}`
  }
  if (entry.direction === 'down') return `Lowered to ${amount}`
  if (entry.direction === 'up') return `Raised to ${amount}`
  return `Set to ${amount}`
}

/**
 * The one-line note under a tier's price in the ticket panel: what it was
 * before the latest move. Null when the price has never moved, so a tier that
 * has always cost the same carries no note at all.
 */
export function priceMoveNote(history: TierPriceHistory | undefined): string | null {
  if (!history || !history.moved) return null
  const latest = history.entries[history.entries.length - 1]
  if (!latest || latest.previousPriceCents === null) return null
  if (latest.direction === 'up') return `Up from ${formatMoney(latest.previousPriceCents, history.currency)}`
  if (latest.direction === 'down') return `Down from ${formatMoney(latest.previousPriceCents, history.currency)}`
  return null
}

/** The notes keyed by tier id, for the ticket panel. */
export function priceMoveNotesByTier(histories: TierPriceHistory[]): Record<string, string> {
  const notes: Record<string, string> = {}
  for (const h of histories) {
    const note = priceMoveNote(h)
    if (note) notes[h.tierId] = note
  }
  return notes
}

/**
 * The line under the block's heading. Counts moves across every shown tier so a
 * buyer knows at a glance whether anything has happened.
 */
export function priceHistorySummary(histories: TierPriceHistory[]): string {
  const moves = histories.reduce(
    (n, h) => n + h.entries.filter((e) => e.direction === 'up' || e.direction === 'down').length,
    0,
  )
  if (moves === 0) return 'No price changes since this event was listed.'
  if (moves === 1) return 'The price has changed once since this event was listed.'
  return `The price has changed ${moves} times since this event was listed.`
}
