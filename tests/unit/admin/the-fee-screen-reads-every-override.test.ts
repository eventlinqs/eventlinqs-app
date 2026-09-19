import { describe, expect, test, vi, beforeEach } from 'vitest'

const from = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }))
vi.mock('@/lib/payments/pricing-rules', () => ({ invalidatePricingRule: vi.fn() }))
vi.mock('@/lib/admin/audit', () => ({ recordAuditEvent: vi.fn() }))

const { readActiveOverrides, readAdminPricingMatrix } = await import('@/lib/admin/pricing')

/**
 * THE FEE SCREEN SHOWS EVERY LIVE OVERRIDE, OR SAYS IT COULD NOT.
 *
 * `readActiveOverrides` read `pricing_rules` with an unbounded select.
 * `pricing_rules` is APPEND-ONLY and VERSIONED: every fee change anywhere on
 * the platform adds a row and none is ever removed, so the table grows for ever
 * by design. Supabase stops at 1,000 rows in silence
 * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19;
 * measured here as `Content-Range: 0-999/14364`). 79 rows on TEST today.
 *
 * TRUNCATION HERE IS NOT AN UNDERCOUNT, IT IS AN ABSENCE. The reducer keeps the
 * FIRST row it sees per target, so a target whose rows all fall past the ceiling
 * does not appear at all: a live per-event fee override, one that IS being
 * charged, missing from the only screen that lists what overrides the default.
 *
 * Both reads in the file also discarded `error`, which made a failed read
 * indistinguishable from "no rule configured".
 */

type Row = Record<string, unknown>

function overrideRow(targetId: string, version: number, percentage: number, kind: 'event' | 'organisation' = 'event'): Row {
  return {
    rule_type: 'platform_fee_percentage',
    country_code: 'AU',
    currency: 'AUD',
    organisation_id: kind === 'organisation' ? targetId : null,
    event_id: kind === 'event' ? targetId : null,
    value_type: 'percentage',
    value_percentage: percentage,
    value_cents: null,
    value_integer: null,
    version,
  }
}

/** A database that answers a window and never volunteers that there is more. */
function pricingDb({
  overrides = [] as Row[],
  current = null as Row | null,
  pageCeiling = 1000,
  failOverrides = false,
  failCurrent = false,
}) {
  const orderKeys: string[] = []

  from.mockImplementation(() => ({
    select: () => {
      const chain: Record<string, unknown> = {}
      chain.eq = () => chain
      chain.is = () => chain
      chain.in = () => chain
      chain.lte = () => chain
      chain.or = () => chain
      chain.order = (column: string) => {
        orderKeys.push(column)
        return {
          ...chain,
          limit: () => ({
            maybeSingle: async () =>
              failCurrent
                ? { data: null, error: { message: 'the fee row went away' } }
                : { data: current, error: null },
          }),
          range: async (start: number, end: number) =>
            failOverrides
              ? { data: null, error: { message: 'the overrides went away' } }
              : { data: overrides.slice(start, Math.min(end + 1, start + pageCeiling)), error: null },
          order: (second: string) => {
            orderKeys.push(second)
            return {
              range: async (start: number, end: number) =>
                failOverrides
                  ? { data: null, error: { message: 'the overrides went away' } }
                  : { data: overrides.slice(start, Math.min(end + 1, start + pageCeiling)), error: null },
            }
          },
        }
      }
      return chain
    },
  }))

  return { orderKeys }
}

beforeEach(() => {
  from.mockReset()
})

describe('readActiveOverrides: every live fee override is on the screen', () => {
  test('a handful of overrides list as they always did', async () => {
    pricingDb({ overrides: [overrideRow('event-a', 2, 1.5), overrideRow('event-b', 1, 2.5)] })
    const views = await readActiveOverrides()
    expect(views.map(v => v.targetId).sort()).toEqual(['event-a', 'event-b'])
  })

  test('the highest version per target wins, whatever order the rows arrive in', async () => {
    pricingDb({ overrides: [overrideRow('event-a', 7, 1.1), overrideRow('event-a', 3, 9.9)] })
    const views = await readActiveOverrides()
    expect(views).toHaveLength(1)
    expect(views[0].percentage).toEqual({ value: 1.1, version: 7 })
  })

  /**
   * THE DEFECT. 2,500 override rows against a 1,000-row ceiling: every target
   * past the ceiling simply did not appear, while still being charged.
   */
  test('THE DEFECT: an override past the thousandth row is still on the screen', async () => {
    const overrides = Array.from({ length: 2_500 }, (_unused, index) =>
      overrideRow(`event-${index}`, 1, 1 + (index % 5)),
    )
    pricingDb({ overrides, pageCeiling: 1000 })

    const views = await readActiveOverrides()

    expect(views).toHaveLength(2_500)
    expect(views.some(v => v.targetId === 'event-1000')).toBe(true)
    expect(views.some(v => v.targetId === 'event-2499')).toBe(true)
  })

  test('a server ceiling lower than the page size does not end the read early', async () => {
    const overrides = Array.from({ length: 1_200 }, (_unused, index) => overrideRow(`event-${index}`, 1, 2))
    pricingDb({ overrides, pageCeiling: 250 })
    await expect(readActiveOverrides()).resolves.toHaveLength(1_200)
  })

  /**
   * `version` is not unique across scopes, and ranged paging over a non-unique
   * order is undefined: Postgres may hand one row back in two windows and
   * another in none. `id` is the tie-break that makes the pages consecutive
   * slices of one stable sequence.
   */
  test('the paged read orders by version AND by a unique tie-break', async () => {
    const { orderKeys } = pricingDb({ overrides: [overrideRow('event-a', 1, 2)] })
    await readActiveOverrides()
    expect(orderKeys).toContain('version')
    expect(orderKeys).toContain('id')
  })

  test('a failed page throws rather than reporting a short list of overrides', async () => {
    pricingDb({ overrides: [overrideRow('event-a', 1, 2)], failOverrides: true })
    await expect(readActiveOverrides()).rejects.toThrow(/active fee overrides/i)
  })

  test('both organisation and event overrides are classified and both survive paging', async () => {
    const overrides = [
      ...Array.from({ length: 1_100 }, (_unused, index) => overrideRow(`event-${index}`, 1, 2)),
      overrideRow('org-late', 1, 3, 'organisation'),
    ]
    pricingDb({ overrides, pageCeiling: 1000 })
    const views = await readActiveOverrides()
    const late = views.find(v => v.targetId === 'org-late')
    expect(late?.kind).toBe('organisation')
  })
})

describe('readAdminPricingMatrix: a failed read is not "no fee configured"', () => {
  test('a configured scope reads back its value', async () => {
    pricingDb({ current: { value_type: 'percentage', value_percentage: 3.5, value_cents: null, value_integer: null, version: 3 } })
    const rows = await readAdminPricingMatrix()
    expect(rows[0].platformFeePercentage).toEqual({ value: 3.5, version: 3 })
  })

  test('a scope with no rule yet is null, which is not an error', async () => {
    pricingDb({ current: null })
    const rows = await readAdminPricingMatrix()
    expect(rows[0].platformFeePercentage).toEqual({ value: null, version: null })
  })

  /**
   * Since LB-OVERRIDE0 a null value renders the control on its PLACEHOLDER, so
   * a swallowed error showed the founder a fee screen that looked like a
   * platform with no fee configured at all.
   */
  test('THE DEFECT: a failed read throws instead of looking like an unconfigured platform', async () => {
    pricingDb({ failCurrent: true })
    await expect(readAdminPricingMatrix()).rejects.toThrow(/could not be read/i)
  })
})
