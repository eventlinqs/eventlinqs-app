import { describe, expect, test } from 'vitest'
import {
  describePriceEntry,
  formatHistoryDate,
  priceHistorySummary,
  priceMoveNote,
  priceMoveNotesByTier,
  summarisePriceHistory,
  tierShowsHistory,
  type PriceHistoryRow,
  type TierPriceHistory,
} from '@/lib/pricing/price-history'

/**
 * PRICE HISTORY ON THE EVENT PAGE (Scope v5, 3.3). The rows are written by the
 * database (migration 20260904000002); these tests pin what a buyer is shown
 * from them: matching by tier NAME (an edit re-creates every tier), the order,
 * the direction, the words, and which tiers keep their history to themselves.
 */

const NOW = new Date('2026-09-04T12:00:00.000Z')

function row(over: Partial<PriceHistoryRow> & { price_cents: number; recorded_at: string }): PriceHistoryRow {
  return {
    id: over.id ?? `${over.recorded_at}-${over.price_cents}`,
    ticket_tier_id: over.ticket_tier_id ?? null,
    tier_name: over.tier_name ?? 'General admission',
    price_cents: over.price_cents,
    previous_price_cents: over.previous_price_cents ?? null,
    reason: over.reason ?? 'changed',
    percent_sold: over.percent_sold ?? null,
    currency: over.currency ?? 'AUD',
    recorded_at: over.recorded_at,
  }
}

const GA = {
  id: 'tier-ga',
  name: 'General admission',
  currency: 'AUD',
  is_visible: true,
  is_active: true,
  requires_access_code: false,
  hidden_until: null,
}

const LISTED = row({ price_cents: 3000, reason: 'listed', recorded_at: '2026-09-01T00:00:00.000Z', ticket_tier_id: 'old-id' })
const LOWERED = row({ price_cents: 2800, previous_price_cents: 3000, reason: 'changed', recorded_at: '2026-09-02T00:00:00.000Z' })
const STEPPED = row({ price_cents: 4000, previous_price_cents: 2800, reason: 'step', percent_sold: 50, recorded_at: '2026-09-03T00:00:00.000Z' })

describe('tierShowsHistory: the same tiers whose price the panel shows', () => {
  test('a visible, active, open tier shows', () => {
    expect(tierShowsHistory(GA, NOW)).toBe(true)
  })
  test('hidden, inactive, access-code and not-yet-revealed tiers do not', () => {
    expect(tierShowsHistory({ ...GA, is_visible: false }, NOW)).toBe(false)
    expect(tierShowsHistory({ ...GA, is_active: false }, NOW)).toBe(false)
    expect(tierShowsHistory({ ...GA, requires_access_code: true }, NOW)).toBe(false)
    expect(tierShowsHistory({ ...GA, hidden_until: '2026-09-05T00:00:00.000Z' }, NOW)).toBe(false)
  })
  test('a tier whose reveal time has passed shows', () => {
    expect(tierShowsHistory({ ...GA, hidden_until: '2026-09-03T00:00:00.000Z' }, NOW)).toBe(true)
  })
})

describe('summarisePriceHistory: one timeline per visible tier, matched by name', () => {
  test('rows are matched by name regardless of case and of the tier id they carry', () => {
    const [ga] = summarisePriceHistory([LISTED, LOWERED, STEPPED], [{ ...GA, name: 'GENERAL ADMISSION' }], NOW)
    expect(ga.tierId).toBe('tier-ga')
    expect(ga.tierName).toBe('GENERAL ADMISSION')
    expect(ga.entries.map((e) => e.priceCents)).toEqual([3000, 2800, 4000])
  })

  test('entries are oldest first whatever order the rows arrive in', () => {
    const [ga] = summarisePriceHistory([STEPPED, LISTED, LOWERED], [GA], NOW)
    expect(ga.entries.map((e) => e.recordedAt)).toEqual([LISTED.recorded_at, LOWERED.recorded_at, STEPPED.recorded_at])
  })

  test('direction and previous price follow the rows: listed, down, up', () => {
    const [ga] = summarisePriceHistory([LISTED, LOWERED, STEPPED], [GA], NOW)
    expect(ga.entries.map((e) => e.direction)).toEqual(['listed', 'down', 'up'])
    expect(ga.entries.map((e) => e.previousPriceCents)).toEqual([null, 3000, 2800])
    expect(ga.moved).toBe(true)
  })

  test('a previous price missing from the row is taken from the entry before it', () => {
    const [ga] = summarisePriceHistory([LISTED, { ...LOWERED, previous_price_cents: null }], [GA], NOW)
    expect(ga.entries[1].previousPriceCents).toBe(3000)
    expect(ga.entries[1].direction).toBe('down')
  })

  test('a tier that has only ever been listed has not moved', () => {
    const [ga] = summarisePriceHistory([LISTED], [GA], NOW)
    expect(ga.moved).toBe(false)
    expect(ga.entries).toHaveLength(1)
  })

  test('a tier with no rows is left out rather than shown empty', () => {
    expect(summarisePriceHistory([LISTED], [{ ...GA, id: 'vip', name: 'VIP' }], NOW)).toEqual([])
  })

  test('hidden and access-code tiers keep their history to themselves', () => {
    const vipRow = row({ tier_name: 'VIP', price_cents: 9000, reason: 'listed', recorded_at: '2026-09-01T00:00:00.000Z' })
    const out = summarisePriceHistory([LISTED, vipRow], [GA, { ...GA, id: 'vip', name: 'VIP', requires_access_code: true }], NOW)
    expect(out.map((h) => h.tierName)).toEqual(['General admission'])
  })

  test('the tier order is the organiser order handed in, and a duplicate name is shown once', () => {
    const vipRow = row({ tier_name: 'VIP', price_cents: 9000, reason: 'listed', recorded_at: '2026-09-01T00:00:00.000Z' })
    const out = summarisePriceHistory(
      [LISTED, vipRow],
      [{ ...GA, id: 'vip', name: 'VIP' }, GA, { ...GA, id: 'ga-2', name: 'general admission' }],
      NOW,
    )
    expect(out.map((h) => h.tierId)).toEqual(['vip', 'tier-ga'])
  })

  test('an unknown reason is read as an organiser change rather than dropped', () => {
    const [ga] = summarisePriceHistory([LISTED, { ...LOWERED, reason: 'mystery' }], [GA], NOW)
    expect(ga.entries[1].reason).toBe('changed')
  })
})

describe('describePriceEntry: the words a buyer reads', () => {
  const [ga] = summarisePriceHistory([LISTED, LOWERED, STEPPED], [GA], NOW)

  test('listed, lowered, rose at a percent', () => {
    expect(describePriceEntry(ga.entries[0], 'AUD')).toBe('Listed at AUD 30.00')
    expect(describePriceEntry(ga.entries[1], 'AUD')).toBe('Lowered to AUD 28.00')
    expect(describePriceEntry(ga.entries[2], 'AUD')).toBe('Rose to AUD 40.00 at 50% sold')
  })

  test('raised, and a step down', () => {
    const raised = row({ price_cents: 3500, previous_price_cents: 3000, reason: 'changed', recorded_at: '2026-09-02T00:00:00.000Z' })
    const fell = row({ price_cents: 3000, previous_price_cents: 3500, reason: 'step', percent_sold: 24.5, recorded_at: '2026-09-03T00:00:00.000Z' })
    const [h] = summarisePriceHistory([LISTED, raised, fell], [GA], NOW)
    expect(describePriceEntry(h.entries[1], 'AUD')).toBe('Raised to AUD 35.00')
    expect(describePriceEntry(h.entries[2], 'AUD')).toBe('Fell to AUD 30.00 at 25% sold')
  })

  test('a step with no percent recorded still reads', () => {
    const [h] = summarisePriceHistory([LISTED, { ...STEPPED, percent_sold: null }], [GA], NOW)
    expect(describePriceEntry(h.entries[1], 'AUD')).toBe('Rose to AUD 40.00')
  })

  test('no dashes and no exclamation marks in any sentence', () => {
    for (const e of ga.entries) {
      const s = describePriceEntry(e, 'AUD')
      expect(s).not.toMatch(/[–—!]/)
      expect(s).not.toMatch(/ - /)
    }
  })
})

describe('formatHistoryDate: the event zone, day month year', () => {
  test('a Melbourne event dates its moves in Melbourne', () => {
    // 4 September 2026 at 00:30 in Melbourne is still 3 September in UTC.
    expect(formatHistoryDate('2026-09-03T14:30:00.000Z', 'Australia/Melbourne')).toBe('4 Sept 2026')
  })
  test('no zone falls back to the platform zone rather than the machine', () => {
    expect(formatHistoryDate('2026-09-03T14:30:00.000Z', null)).toBe('4 Sept 2026')
  })
  test('a malformed date renders as itself instead of throwing', () => {
    expect(formatHistoryDate('not-a-date', 'Australia/Melbourne')).toBe('not-a-date')
  })
})

describe('priceMoveNote: the line under the price', () => {
  test('the latest move, in words, with what it moved from', () => {
    const [ga] = summarisePriceHistory([LISTED, LOWERED, STEPPED], [GA], NOW)
    expect(priceMoveNote(ga)).toBe('Up from AUD 28.00')
    const [down] = summarisePriceHistory([LISTED, LOWERED], [GA], NOW)
    expect(priceMoveNote(down)).toBe('Down from AUD 30.00')
  })
  test('nothing for a price that has never moved, or for no history', () => {
    const [ga] = summarisePriceHistory([LISTED], [GA], NOW)
    expect(priceMoveNote(ga)).toBeNull()
    expect(priceMoveNote(undefined)).toBeNull()
  })
  test('keyed by tier id, only for tiers that moved', () => {
    const vipRow = row({ tier_name: 'VIP', price_cents: 9000, reason: 'listed', recorded_at: '2026-09-01T00:00:00.000Z' })
    const histories = summarisePriceHistory([LISTED, LOWERED, vipRow], [GA, { ...GA, id: 'vip', name: 'VIP' }], NOW)
    expect(priceMoveNotesByTier(histories)).toEqual({ 'tier-ga': 'Down from AUD 30.00' })
  })
})

describe('priceHistorySummary: the line under the heading', () => {
  const none: TierPriceHistory[] = summarisePriceHistory([LISTED], [GA], NOW)
  const one = summarisePriceHistory([LISTED, LOWERED], [GA], NOW)
  const two = summarisePriceHistory([LISTED, LOWERED, STEPPED], [GA], NOW)
  test('none, once, N times', () => {
    expect(priceHistorySummary(none)).toBe('No price changes since this event was listed.')
    expect(priceHistorySummary(one)).toBe('The price has changed once since this event was listed.')
    expect(priceHistorySummary(two)).toBe('The price has changed 2 times since this event was listed.')
  })
})
