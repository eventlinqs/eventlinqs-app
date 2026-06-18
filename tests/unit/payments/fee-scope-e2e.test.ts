import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * FEE SYSTEM END-TO-END PROOF (Unit 4 of the fee-system mission).
 *
 * One in-memory pricing_rules table (the single source of truth) drives ALL
 * THREE consumers through the SAME resolver:
 *   - charge   : PaymentCalculator.calculate -> platform_fee_cents
 *   - payout   : computeApplicationFeeCents / computeOrganiserShareCents
 *   - display  : getLivePublicFee (public client) / getPricingRule
 *
 * It proves the three scopes (event > organiser > region) resolve identically
 * across charge, payout, and display to the cent, and that changing the
 * platform fee moves a normal event while an override event holds its own fee
 * (no collisions, no stale reads).
 */

vi.mock('server-only', () => ({}))
vi.mock('@/lib/redis/client', () => ({ getRedisClient: vi.fn(() => null) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/public-client', () => ({ createPublicClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { createPublicClient } from '@/lib/supabase/public-client'
import { PaymentCalculator } from '@/lib/payments/payment-calculator'
import {
  computeApplicationFeeCents,
  computeOrganiserShareCents,
  computeReserveCents,
} from '@/lib/payments/application-fee'
import { getLivePublicFee } from '@/lib/pricing/live-fee'

// --- In-memory pricing_rules table + minimal Supabase query fake -------------

interface Row {
  rule_type: string
  country_code: string
  currency: string
  organisation_id: string | null
  event_id: string | null
  value_type: 'percentage' | 'fixed' | 'integer'
  value_percentage: string | null
  value_cents: string | null
  value_integer: number | null
  version: number
  effective_from: string
  effective_until: string | null
}

function row(
  rule_type: string,
  value: number,
  valueType: 'percentage' | 'fixed' | 'integer',
  opts: { country?: string; currency?: string; org?: string | null; event?: string | null; version?: number } = {},
): Row {
  return {
    rule_type,
    country_code: opts.country ?? 'AU',
    currency: opts.currency ?? 'AUD',
    organisation_id: opts.org ?? null,
    event_id: opts.event ?? null,
    value_type: valueType,
    value_percentage: valueType === 'percentage' ? value.toFixed(4) : null,
    value_cents: valueType === 'fixed' ? String(value) : null,
    value_integer: valueType === 'integer' ? value : null,
    version: opts.version ?? 1,
    effective_from: '2026-01-01T00:00:00.000Z',
    effective_until: null,
  }
}

// A fake Supabase client reading from a shared rows array. Supports exactly the
// chain the resolver uses: select -> eq/is -> lte/or (effective window, treated
// as always-active here since all rows are active) -> order(version) -> limit ->
// maybeSingle. Both the admin and public clients read the same array (one source).
function makeFakeClient(rows: Row[]) {
  function select() {
    const preds: Array<(r: Row) => boolean> = []
    let desc = false
    const builder: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        preds.push((r) => (r as unknown as Record<string, unknown>)[col] === val)
        return builder
      },
      is(col: string, val: unknown) {
        preds.push((r) => (r as unknown as Record<string, unknown>)[col] === val)
        return builder
      },
      lte() {
        return builder
      },
      or() {
        return builder
      },
      order(_col: string, opts?: { ascending?: boolean }) {
        desc = opts?.ascending === false
        return builder
      },
      limit() {
        return builder
      },
      async maybeSingle() {
        let res = rows.filter((r) => preds.every((p) => p(r)))
        res = [...res].sort((a, b) => (desc ? b.version - a.version : a.version - b.version))
        return { data: res[0] ?? null, error: null }
      },
    }
    return builder
  }
  return { from: (table: string) => {
    if (table !== 'pricing_rules') throw new Error(`unexpected table ${table}`)
    return { select }
  } }
}

// --- Shared dataset: the single source of truth ------------------------------

const ORG_OVERRIDE = 'org_enterprise'
const EVENT_OVERRIDE = 'event_special'
const PLAIN_ORG = 'org_plain'
const PLAIN_EVENT = 'event_plain'

let rows: Row[]

function seed(): Row[] {
  return [
    // Region defaults (AU / AUD) - the launch default: 2% + AUD 0.50.
    row('platform_fee_percentage', 2.0, 'percentage'),
    row('platform_fee_fixed', 50, 'fixed'),
    row('processing_fee_percentage', 2.9, 'percentage'),
    row('processing_fee_fixed_cents', 30, 'fixed'),
    row('processing_fee_pass_through', 1, 'integer'),
    row('reserve_percentage', 20, 'percentage'),
    // Composition mode is a GLOBAL/AUD wildcard in the live seed.
    row('application_fee_composition_mode', 1, 'integer', { country: 'GLOBAL' }),
    // Per-organiser override: 1% + AUD 0.00.
    row('platform_fee_percentage', 1.0, 'percentage', { org: ORG_OVERRIDE }),
    row('platform_fee_fixed', 0, 'fixed', { org: ORG_OVERRIDE }),
    // Per-event override (highest precedence): 5% + AUD 1.00.
    row('platform_fee_percentage', 5.0, 'percentage', { event: EVENT_OVERRIDE }),
    row('platform_fee_fixed', 100, 'fixed', { event: EVENT_OVERRIDE }),
  ]
}

beforeEach(() => {
  rows = seed()
  const fake = makeFakeClient(rows)
  vi.mocked(createAdminClient).mockReturnValue(fake as never)
  vi.mocked(createPublicClient).mockReturnValue(fake as never)
})
afterEach(() => vi.clearAllMocks())

const TICKET = [{ tier_id: 't1', tier_name: 'GA', quantity: 1, unit_price_cents: 10_000 }]

async function chargeAndPayout(orgId: string | null, eventId: string | null) {
  const calc = new PaymentCalculator()
  const fees = await calc.calculate(TICKET, [], 'AUD', 'pass_to_buyer', 0, orgId, eventId)
  const appFee = await computeApplicationFeeCents(fees, 'AU', 'AUD', orgId, eventId)
  const organiserShare = await computeOrganiserShareCents(fees, 'AU', 'AUD', orgId, eventId)
  const reserve = await computeReserveCents(organiserShare, 'AU', 'AUD', orgId, eventId)
  return { fees, appFee, organiserShare, reserve }
}

describe('fee system: displayed == charged == payout, per scope, to the cent', () => {
  test('REGION default (2% + AUD 0.50) on a plain event', async () => {
    const { fees, appFee, organiserShare, reserve } = await chargeAndPayout(PLAIN_ORG, PLAIN_EVENT)
    // platform_fee = 10000 * 2% + 50 = 250
    expect(fees.platform_fee_cents).toBe(250)
    expect(fees.payment_processing_fee_cents).toBe(320) // 10000 * 2.9% + 30
    expect(fees.total_cents).toBe(10_570) // 10000 + 250 + 320
    expect(appFee).toBe(570) // platform + processing (mode 1)
    expect(organiserShare).toBe(10_000) // total - appFee
    expect(reserve).toBe(2_000) // 20% of organiser share

    const display = await getLivePublicFee()
    expect(display.percent).toBe(2)
    expect(display.fixedCents).toBe(50)
    expect(display.label).toBe('2% + AUD 0.50')
    // Displayed platform fee == charged platform fee, to the cent.
    expect(Math.round((10_000 * display.percent) / 100) + display.fixedCents).toBe(fees.platform_fee_cents)
  })

  test('ORGANISER override (1% + AUD 0.00) wins over region', async () => {
    const { fees, appFee, organiserShare, reserve } = await chargeAndPayout(ORG_OVERRIDE, PLAIN_EVENT)
    expect(fees.platform_fee_cents).toBe(100) // 10000 * 1% + 0
    expect(fees.total_cents).toBe(10_420) // 10000 + 100 + 320
    expect(appFee).toBe(420)
    expect(organiserShare).toBe(10_000)
    expect(reserve).toBe(2_000)

    const display = await getLivePublicFee({ organisationId: ORG_OVERRIDE })
    expect(display.label).toBe('1% + AUD 0.00')
    expect(Math.round((10_000 * display.percent) / 100) + display.fixedCents).toBe(fees.platform_fee_cents)
  })

  test('EVENT override (5% + AUD 1.00) wins over org and region', async () => {
    // Even for an organiser that has its own override, the event override wins.
    const { fees, appFee, organiserShare, reserve } = await chargeAndPayout(ORG_OVERRIDE, EVENT_OVERRIDE)
    expect(fees.platform_fee_cents).toBe(600) // 10000 * 5% + 100
    expect(fees.total_cents).toBe(10_920) // 10000 + 600 + 320
    expect(appFee).toBe(920)
    expect(organiserShare).toBe(10_000)
    expect(reserve).toBe(2_000)

    const display = await getLivePublicFee({ eventId: EVENT_OVERRIDE })
    expect(display.label).toBe('5% + AUD 1.00')
    expect(Math.round((10_000 * display.percent) / 100) + display.fixedCents).toBe(fees.platform_fee_cents)
  })
})

describe('fee system: changing the platform fee moves a normal event, not an override', () => {
  test('raising the AU region fee to 3% moves the plain event but the event override holds', async () => {
    // Founder edits the region default: append a higher version row (append-only
    // versioning, exactly as writePricingField does).
    rows.push(row('platform_fee_percentage', 3.0, 'percentage', { version: 2 }))

    const plain = await chargeAndPayout(PLAIN_ORG, PLAIN_EVENT)
    expect(plain.fees.platform_fee_cents).toBe(350) // moved: 10000 * 3% + 50

    const overridden = await chargeAndPayout(ORG_OVERRIDE, EVENT_OVERRIDE)
    expect(overridden.fees.platform_fee_cents).toBe(600) // held: event override unaffected

    const orgOnly = await chargeAndPayout(ORG_OVERRIDE, PLAIN_EVENT)
    expect(orgOnly.fees.platform_fee_cents).toBe(100) // held: org override unaffected

    // Display follows the same source with no stale read.
    expect((await getLivePublicFee()).label).toBe('3% + AUD 0.50')
    expect((await getLivePublicFee({ eventId: EVENT_OVERRIDE })).label).toBe('5% + AUD 1.00')
  })
})
