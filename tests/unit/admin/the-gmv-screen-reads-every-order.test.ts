import { describe, expect, test, vi, beforeEach } from 'vitest'

/**
 * THE FOUNDER'S GMV SCREEN READS EVERY ORDER, OR IT SAYS IT COULD NOT.
 *
 * `getAnalyticsDashboard` summed two UNBOUNDED selects. Supabase caps one
 * response at a fixed number of rows, 1,000 by default
 * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19),
 * and the cap is invisible: HTTP 200, `error` null, a full-looking array.
 * Measured against the TEST project on 20 September 2026:
 *
 *     Content-Range: 0-999/14364
 *
 * TEST held 801 AUD orders that day, so the screen was 199 orders from
 * reporting a GMV that stops growing while the platform keeps selling.
 *
 * Two things made it worse than a cap. There was no `order by`, so past the
 * ceiling the figure was the total of an ARBITRARY subset rather than of the
 * oldest or newest thousand. And `const { data } = await ...` discarded
 * `error`, so a failed read rendered `?? []` and the dashboard showed a GMV of
 * ZERO, which is a number a founder would act on and is indistinguishable on
 * that screen from a payments outage.
 */

const from = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }))

const { getAnalyticsDashboard } = await import('@/lib/admin/analytics')

type Row = Record<string, unknown>

/**
 * A database that answers a window and never volunteers that there is more,
 * exactly as PostgREST does. `pageCeiling` is the server's own cap, which the
 * caller cannot see.
 */
function database({
  orders = [] as Row[],
  refunds = [] as Row[],
  organisations = [] as Row[],
  pageCeiling = 1000,
  failOn = null as null | 'orders' | 'refunds' | 'organisations',
}) {
  const ordered = new Set<string>()

  from.mockImplementation((table: string) => ({
    select: () => {
      const rowsFor = table === 'orders' ? orders : table === 'refunds' ? refunds : organisations
      const chain: Record<string, unknown> = {}
      chain.eq = () => chain
      chain.in = () => chain
      chain.limit = async () =>
        failOn === table
          ? { data: null, error: { message: `${table} went away` } }
          : { data: organisations, error: null }
      chain.order = () => {
        ordered.add(table)
        return {
          range: async (start: number, end: number) => {
            if (failOn === table) return { data: null, error: { message: `${table} went away` } }
            return { data: rowsFor.slice(start, Math.min(end + 1, start + pageCeiling)), error: null }
          },
        }
      }
      return chain
    },
  }))

  return { ordered }
}

function paidOrders(count: number, cents = 1000): Row[] {
  return Array.from({ length: count }, (_unused, index) => ({
    total_cents: cents,
    platform_fee_cents: 35,
    status: 'confirmed',
    created_at: '2026-09-01T00:00:00.000Z',
    organisation_id: `org-${index % 3}`,
  }))
}

beforeEach(() => {
  from.mockReset()
})

describe('getAnalyticsDashboard: every order, or an honest failure', () => {
  test('a catalogue inside one page totals as it always did', async () => {
    database({ orders: paidOrders(3, 1000), organisations: [{ id: 'org-0', name: 'A' }] })
    const dash = await getAnalyticsDashboard()
    expect(dash.summary.paidOrders).toBe(3)
    expect(dash.summary.grossGmvCents).toBe(3000)
  })

  /**
   * THE DEFECT. 2,500 paid orders at $10 is a real GMV of $25,000. Against a
   * 1,000-row ceiling the old code reported $10,000 and there was nothing on
   * the screen to say so.
   */
  test('THE DEFECT: GMV past the thousandth order is counted, not silently dropped', async () => {
    database({ orders: paidOrders(2_500, 1000), organisations: [{ id: 'org-0', name: 'A' }] })
    const dash = await getAnalyticsDashboard()
    expect(dash.summary.paidOrders).toBe(2_500)
    expect(dash.summary.grossGmvCents).toBe(2_500_000)
  })

  test('a server ceiling LOWER than the page size does not end the read early', async () => {
    database({ orders: paidOrders(1_200, 500), pageCeiling: 250, organisations: [{ id: 'org-0', name: 'A' }] })
    const dash = await getAnalyticsDashboard()
    expect(dash.summary.paidOrders).toBe(1_200)
  })

  test('refunds past the ceiling are netted too, so net GMV is not overstated', async () => {
    const refunds = Array.from({ length: 1_500 }, () => ({ amount_cents: 100, status: 'completed' }))
    database({ orders: paidOrders(2_000, 1000), refunds, organisations: [{ id: 'org-0', name: 'A' }] })
    const dash = await getAnalyticsDashboard()
    expect(dash.summary.refundedCents).toBe(150_000)
    expect(dash.summary.netGmvCents).toBe(2_000_000 - 150_000)
  })

  /**
   * A ranged read with no total order is not paging: Postgres may hand back one
   * row in two windows and no window at all for another.
   */
  test('both paged reads carry a stable order', async () => {
    const { ordered } = database({ orders: paidOrders(5), refunds: [{ amount_cents: 1, status: 'completed' }] })
    await getAnalyticsDashboard()
    expect(ordered.has('orders')).toBe(true)
    expect(ordered.has('refunds')).toBe(true)
  })

  test('THE SECOND DEFECT: a failed order read throws instead of reporting a GMV of zero', async () => {
    database({ orders: paidOrders(10), failOn: 'orders' })
    await expect(getAnalyticsDashboard()).rejects.toThrow(/admin GMV orders/i)
  })

  test('a failed refund read throws rather than overstating net GMV', async () => {
    database({ orders: paidOrders(10), failOn: 'refunds' })
    await expect(getAnalyticsDashboard()).rejects.toThrow(/admin GMV refunds/i)
  })

  test('a failed organiser-name read throws rather than labelling every leader Unknown', async () => {
    database({ orders: paidOrders(10), failOn: 'organisations' })
    await expect(getAnalyticsDashboard()).rejects.toThrow(/organiser names/i)
  })

  test('the monthly series and the leaderboard are built from the WHOLE catalogue', async () => {
    const orders = [
      ...Array.from({ length: 1_400 }, () => ({
        total_cents: 100,
        platform_fee_cents: 3,
        status: 'confirmed',
        created_at: '2026-08-01T00:00:00.000Z',
        organisation_id: 'org-small',
      })),
      ...Array.from({ length: 1_400 }, () => ({
        total_cents: 900,
        platform_fee_cents: 30,
        status: 'confirmed',
        created_at: '2026-09-01T00:00:00.000Z',
        organisation_id: 'org-big',
      })),
    ]
    database({ orders, organisations: [{ id: 'org-big', name: 'Big' }, { id: 'org-small', name: 'Small' }] })

    const dash = await getAnalyticsDashboard()

    // Both months survive. On the first page alone, September did not exist.
    expect(dash.byMonth.map(m => m.month)).toEqual(['2026-08', '2026-09'])
    expect(dash.byMonth.find(m => m.month === '2026-09')?.gmvCents).toBe(1_260_000)
    // And the leader is the organiser who is only visible past the ceiling.
    expect(dash.topOrganisers[0]?.organisationId).toBe('org-big')
  })
})
