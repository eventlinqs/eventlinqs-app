import { describe, expect, it } from 'vitest'
import { attributionVerdict, ATTRIBUTION_DUE_MS, type PaidOrderRecord } from '@/lib/health/attribution-check'

/*
 * EVERY PAID ORDER RECORDS WHERE ITS BUYER CAME FROM, ENFORCED ON LIVE (Lawal's order, the CONTROLLER's 15:35 of 7 November
 * 2026, (3)): the health sentinel turns red when any paid order older than two hours lacks its marketing_attribution row or
 * its arrival channel (a sale ledger entry, which carries the referrer and campaign the channel rule reads), and names the
 * orders. A younger order is still inside its own writes and is never an alarm.
 */
const NOW = new Date('2026-11-07T05:00:00Z')
const at = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString()
const order = (over: Partial<PaidOrderRecord>): PaidOrderRecord => ({
  id: '11111111-1111-4111-8111-111111111111',
  orderNumber: 'EL-AAAA1111',
  createdAt: at(ATTRIBUTION_DUE_MS + 60_000),
  hasAttribution: true,
  saleEntries: 1,
  ...over,
})

describe('the order attribution check', () => {
  it('is green when every paid order past two hours carries both records', () => {
    const r = attributionVerdict([order({}), order({ orderNumber: 'EL-BBBB2222', saleEntries: 3 })], NOW, 2)
    expect(r.ok).toBe(true)
    expect(r.severity).toBe('critical')
    expect(r.id).toBe('order_attribution')
    expect(r.detail).toContain('2 paid order(s)')
  })
  it('is RED on a paid order past two hours with no attribution row, and names it', () => {
    const r = attributionVerdict([order({ orderNumber: 'EL-NOATTR01', hasAttribution: false })], NOW, 1)
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('EL-NOATTR01')
    expect(r.detail).toContain('no marketing_attribution row')
  })
  it('is RED on a paid order past two hours with no arrival channel, and names it', () => {
    const r = attributionVerdict([order({ orderNumber: 'EL-NOCHAN01', saleEntries: 0 })], NOW, 1)
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('EL-NOCHAN01')
    expect(r.detail).toContain('no arrival channel')
  })
  it('never alarms on an order younger than two hours, whatever it lacks', () => {
    const r = attributionVerdict([order({ createdAt: at(ATTRIBUTION_DUE_MS - 60_000), hasAttribution: false, saleEntries: 0 })], NOW, 1)
    expect(r.ok).toBe(true)
    expect(r.detail).toContain('1 younger than two hours')
  })
  it('names every order at fault, both kinds, not just the first', () => {
    const r = attributionVerdict(
      [order({ orderNumber: 'EL-ONE00001', hasAttribution: false }), order({ orderNumber: 'EL-TWO00002', saleEntries: 0 }), order({})],
      NOW,
      3,
    )
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('EL-ONE00001')
    expect(r.detail).toContain('EL-TWO00002')
    expect(r.detail).toMatch(/2 of 3 paid order/)
  })
  it('a read it could not make is a red, never a quiet green', () => {
    const r = attributionVerdict(null, NOW, 0, 'orders read failed: timeout')
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('could not be read')
  })
})
