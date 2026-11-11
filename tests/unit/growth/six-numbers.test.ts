import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sixNumbersFor } from '../../../src/lib/growth/six-numbers'
import type { OrderRow, Rows, Week } from '../../../src/lib/growth/weekly-math'

/**
 * The six numbers of /admin/today (the PM's order 3 of 11 November 2026, addition 13): counted from the growth page's
 * own rows, each real or estimated with its source, and the revenue truth held (a free order is not a paid order, a
 * pending order is not sold, contribution is what was kept).
 */

const week: Week = { from: '2026-11-02T13:00:00.000Z', to: '2026-11-09T13:00:00.000Z', monday: '2026-11-03' } as Week
const inWeek = '2026-11-05T09:00:00.000Z'
const before = '2026-10-20T09:00:00.000Z'

function order(over: Partial<OrderRow>): OrderRow {
  return { totalCents: 3600, platformFeeCents: 300, status: 'confirmed', createdAt: inWeek, organisationId: 'org-a', eventId: 'e1',
    retainedCents: 300, processingCents: 90, refundedCents: 0, ticketCount: 2, ...over }
}

function rows(over: Partial<Rows> = {}): Rows {
  return { listings: [], visits: [], demand: [], saves: [], subscribers: [], orders: [], refunds: [], ...over }
}

const get = (r: Rows, key: string) => sixNumbersFor(r, week).find((f) => f.key === key)!

describe('the six numbers', () => {
  test('six, in the order the PM named, each real or estimated with a source', () => {
    const six = sixNumbersFor(rows(), week)
    expect(six.map((f) => f.key)).toEqual(['activated', 'repeat', 'tickets', 'contribution', 'organic', 'returning'])
    for (const f of six) {
      expect(['real', 'estimated']).toContain(f.basis)
      expect(f.source.length).toBeGreaterThan(20)
    }
    expect(get(rows(), 'contribution').basis).toBe('estimated')
  })

  test('an organiser is activated in the week of its first paid order ever, and only then', () => {
    const r = rows({ orders: [order({ organisationId: 'org-a' }), order({ organisationId: 'org-b', createdAt: before }), order({ organisationId: 'org-b' })] })
    expect(get(r, 'activated').value).toBe(1)
  })

  test('a free registration and a pending order are not paid orders', () => {
    const r = rows({ orders: [order({ organisationId: 'org-free', totalCents: 0 }), order({ organisationId: 'org-wait', status: 'pending' })] })
    expect(get(r, 'activated').value).toBe(0)
    expect(get(r, 'tickets').value).toBe(0)
  })

  test('a repeat paid organiser sells for an event this week, having sold for a different event before', () => {
    const r = rows({ orders: [
      order({ organisationId: 'org-b', eventId: 'e1', createdAt: before }), order({ organisationId: 'org-b', eventId: 'e2' }),
      order({ organisationId: 'org-c', eventId: 'e9', createdAt: before }), order({ organisationId: 'org-c', eventId: 'e9' }),
    ] })
    expect(get(r, 'repeat').value).toBe(1)
  })

  test('paid tickets add up the week\'s paid orders, and an unknown count is named, never taken as zero', () => {
    const r = rows({ orders: [order({ ticketCount: 2 }), order({ ticketCount: 3, organisationId: 'org-z' }), order({ ticketCount: undefined, organisationId: 'org-y' })] })
    const t = get(r, 'tickets')
    expect(t.value).toBe(5)
    expect(t.source).toMatch(/1 order\(s\) with no ticket count read/)
  })

  test('contribution is the fee kept less Stripe\'s estimate and the fee given back, shown as money', () => {
    const r = rows({ orders: [order({ retainedCents: 300, processingCents: 90 }), order({ organisationId: 'org-r', totalCents: 1000, retainedCents: 100, processingCents: 30, refundedCents: 500, status: 'partially_refunded' })] })
    const c = get(r, 'contribution')
    expect(c.value).toBe(300 - 90 + (100 - 30 - 50))
    expect(c.display).toBe('A$2.30')
    expect(c.source).toMatch(/no marketing spend is recorded/)
  })

  test('organic search visits are the week\'s event page views first reached from a search engine', () => {
    const r = rows({ visits: [
      { visitor: 'v1', eventId: 'e1', at: inWeek, channel: 'organic-search' },
      { visitor: 'v2', eventId: 'e1', at: inWeek, channel: 'organic-social' },
      { visitor: 'v3', eventId: 'e1', at: before, channel: 'organic-search' },
    ] })
    expect(get(r, 'organic').value).toBe(1)
  })

  test('returning visitors and new subscribers are shown apart', () => {
    const r = rows({
      visits: [{ visitor: 'v1', eventId: 'e1', at: before, channel: 'direct' as never }, { visitor: 'v1', eventId: 'e2', at: inWeek, channel: 'direct' as never }],
      subscribers: [{ confirmedAt: inWeek }],
    })
    const f = get(r, 'returning')
    expect(f.display).toBe('1 returning, 1 subscribed')
    expect(f.value).toBe(2)
  })
})

describe('where they are shown', () => {
  test('/admin/today shows the six from the growth rows, and names a failed read instead of showing 0', () => {
    const page = readFileSync(join(__dirname, '..', '..', '..', 'src', 'app', 'admin', '(authed)', 'today', 'page.tsx'), 'utf8').replace(/\r\n/g, '\n')
    expect(page).toContain('readGrowthWeek(now)')
    expect(page).toContain('data-section="six-numbers"')
    expect(page).toContain('growth.g.six.last.map')
    expect(page).toContain('No figure is shown as 0.')
  })

  test('the orders read counts each order\'s tickets', () => {
    const weekly = readFileSync(join(__dirname, '..', '..', '..', 'src', 'lib', 'growth', 'weekly.ts'), 'utf8')
    expect(weekly).toContain('refunds(amount_cents, status), tickets(count)')
  })
})
