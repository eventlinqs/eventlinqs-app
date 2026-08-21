import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/*
 * THE "AUD NaN" CLASS.
 *
 * Found on production on 21 August 2026 by an organiser refunding a real order:
 * the revenue card read "AUD NaN" for platform fees, processing fees and net
 * revenue, while gross sales rendered correctly.
 *
 * The cause was not the arithmetic. The orders query selected nine columns and
 * the result was cast `as (Order & ...)[]`, where Order is the FULL row. The cast
 * asserted columns the query never fetched, so `o.platform_fee_cents` compiled,
 * arrived undefined, and `0 + undefined` is NaN. Gross was right because
 * total_cents was one of the nine.
 *
 * The compiler now catches that shape, because the row type is derived from the
 * same tuple the select is built from. These tests hold the two halves together
 * from the outside as well, since a future edit could reintroduce a wide cast
 * without touching the type.
 */

const ORDERS_PAGE = 'src/app/(dashboard)/dashboard/events/[id]/orders/page.tsx'
const DETAIL_PAGE = 'src/app/(dashboard)/dashboard/events/[id]/orders/[orderId]/page.tsx'

/*
 * Comments are stripped before matching. The first version of the "no wide cast"
 * assertion failed against a file that no longer contains the cast, because the
 * COMMENT explaining the old defect quotes it verbatim. A check that reads prose
 * as though it were code is the same mistake in miniature as the one being
 * guarded against.
 */
const codeOf = (path: string) =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')

describe('the orders page fetches every money column it sums', () => {
  const src = codeOf(ORDERS_PAGE)

  it('selects the fee columns the revenue card reduces over', () => {
    for (const col of ['total_cents', 'platform_fee_cents', 'processing_fee_cents']) {
      expect(src).toContain(`'${col}'`)
    }
  })

  it('every money field it reduces over is in the select tuple', () => {
    const tuple = src.slice(src.indexOf('ORDER_SUMMARY_COLUMNS'), src.indexOf('] as const'))
    const summed = [...src.matchAll(/reduce\(\(s, o\) => s \+ o\.(\w+)/g)].map((m) => m[1])
    expect(summed.length).toBeGreaterThan(0)
    for (const field of summed) expect(tuple).toContain(`'${field}'`)
  })

  it('does not cast the narrow row back to the full Order type', () => {
    // `as (Order & ...)` is the exact shape that hid the defect.
    expect(src).not.toMatch(/as\s*\(\s*Order\s*&/)
  })

  it('does not spread the fetched row into the client component payload', () => {
    // A spread ships whatever was selected into the RSC payload, which is how the
    // fee breakdown would reach the browser as a side effect of this fix.
    const map = src.slice(src.indexOf('const displayOrders'), src.indexOf('// Stats.'))
    expect(map).not.toContain('...o,')
  })
})

describe('order revenue is net of refunds, in proportion', () => {
  const src = codeOf(DETAIL_PAGE)

  it('subtracts refunds from the revenue figure', () => {
    expect(src).toContain('refundedAgainstOrder')
    expect(src).toContain('retainedCents')
  })

  /*
   * The formula mirrors reconcile_refund, which reverses the fee in proportion:
   *   v_app_fee := round((platform + processing) * refund_amount / total)
   * Subtracting the whole refund from (total - fees) instead produced
   * "Your Revenue AUD -6.20" on a fully refunded order.
   */
  const revenue = (total: number, platform: number, processing: number, refunded: number) => {
    const retained = Math.max(0, total - refunded)
    const fees = total === 0 ? 0 : Math.round((platform + processing) * (retained / total))
    return retained - fees
  }

  it('a full refund nets the organiser to zero, not to a negative', () => {
    expect(revenue(10620, 300, 320, 10620)).toBe(0)
  })

  it('no refund is unchanged from the old figure', () => {
    expect(revenue(10620, 300, 320, 0)).toBe(10620 - 300 - 320)
  })

  it('a half refund retains half the face value', () => {
    expect(revenue(10620, 300, 320, 5310)).toBe(5000)
  })

  it('a zero-total order cannot divide by zero', () => {
    expect(revenue(0, 0, 0, 0)).toBe(0)
  })
})

describe('the refund outcome is separate from the empty state', () => {
  const src = codeOf(DETAIL_PAGE)

  it('renders the outcome whenever a refund exists', () => {
    expect(src).toContain('refundRows.length > 0')
    expect(src).toContain('RefundOutcome')
  })

  it('gates the refund control on REFUNDABLE tickets, not on any tickets', () => {
    // `refundData.tickets.length > 0` was the old condition, and it is what put
    // the dialog's "no refundable tickets" empty state in front of an organiser
    // who had just refunded successfully.
    expect(src).toContain('refundableTickets.length > 0')
    expect(src).not.toContain('refundData.tickets.length > 0')
  })

  it('badges a refunded order as refunded rather than confirmed', () => {
    expect(src).toContain('Refund in progress')
    expect(src).toContain('partially_refunded')
  })
})
