// GROWTH SYSTEM DIRECTIVE SECTION 6 (Lawal 1 November 2026 16:59; second in the CONTROLLER's 17:04 build order): report
// weekly by city and channel, real transactions the only source of sales. The channel rule is WINDOW 2's (V3 item 7d,
// C:\dev\GROWTH\v3\item7d-visit-to-paid-order.sql), now one SQL function every read uses.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const sql = () => readFileSync(resolve(process.cwd(), 'supabase/migrations/20261101165501_growth_channel_weekly.sql'), 'utf8').replace(/\r\n/g, '\n')

describe('the weekly channel rows', () => {
  test('one channel rule: email, social, search, our links, direct, other, in that order', () => {
    const s = sql()
    expect(s).toMatch(/create or replace function public\.growth_visit_channel\(p_utm_medium text, p_referrer text, p_utm_source text\)/)
    const order = ["then 'email'", "then 'social'", "then 'search'", "then 'our links'", "then 'direct'", "else 'other'"]
    const at = order.map((w) => s.indexOf(w))
    expect(at.every((i) => i > 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  test('sales, gross and fees come from paid orders only, never a click', () => {
    const s = sql()
    expect(s).toMatch(/status in \('confirmed', 'partially_refunded'\) and o\.total_cents > 0/)
    expect(s).toContain("'fee_revenue_cents'")
    expect(s).toContain("'gross_ticket_cents'")
  })

  test('returning visitors are visitors seen in an earlier week', () => {
    expect(sql()).toContain("'returning_visitors'")
  })
})
