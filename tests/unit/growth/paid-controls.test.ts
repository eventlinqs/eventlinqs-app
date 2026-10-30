import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { APPROVAL_PROBLEMS, START_REFUSALS, approvalProblems, paidFigure, spendAfter, startRefusal, type PaidPlan } from '@/lib/growth/paid-controls-math'

/**
 * PAID CAMPAIGN CONTROLS, BUILT AND OFF (D7x of Lawal's DemandOS directive of 30 October 2026, section 7: "Require:
 * verified destination, approved creative, working attribution, defined budget, campaign objective, spending limits,
 * appropriate permissions, performance monitoring. Do not automatically spend advertising money without explicit founder
 * authorisation."). The database decides; these pin the pure mirror to the migration's own words.
 */
const dir = 'supabase/migrations'
const migration = (() => {
  const name = readdirSync(dir).find((f) => f.endsWith('_paid_campaign_controls.sql'))
  return name ? readFileSync(join(dir, name), 'utf8') : ''
})()

const whole: PaidPlan = {
  destinationUrl: 'https://www.eventlinqs.com.au/city/geelong',
  creativeApproved: true,
  hasAttributionLink: true,
  budgetCents: 10_000,
  dailyLimitCents: 2_000,
  objective: 'verified_purchase',
  permissionNote: 'Organiser agreed by email on 30 October.',
}

describe('approving a plan', () => {
  test('a whole plan has no problems', () => {
    expect(approvalProblems(whole)).toEqual([])
  })
  test.each([
    ['destination', { destinationUrl: 'http://example.com' }],
    ['destination', { destinationUrl: null }],
    ['creative', { creativeApproved: false }],
    ['attribution', { hasAttributionLink: false }],
    ['limit', { dailyLimitCents: 0 }],
    ['limit', { dailyLimitCents: 20_000 }],
    ['objective', { objective: null }],
    ['permission', { permissionNote: '  ' }],
  ] as const)('%s is required', (key, over) => {
    expect(approvalProblems({ ...whole, ...over })).toEqual([APPROVAL_PROBLEMS[key]])
  })
})

test('no budget fails the budget and the limit it must sit within', () => {
  expect(approvalProblems({ ...whole, budgetCents: 0 })).toEqual([APPROVAL_PROBLEMS.budget, APPROVAL_PROBLEMS.limit])
})

describe('starting a plan', () => {
  const ok = { enabled: true, status: 'approved', monthlyCapCents: 50_000, spentThisMonthCents: 0, budgetCents: 10_000 }
  test('off refuses, whatever else is true', () => {
    expect(startRefusal({ ...ok, enabled: false })).toBe(START_REFUSALS.off)
  })
  test('only an approved plan starts', () => {
    expect(startRefusal({ ...ok, status: 'draft' })).toBe(START_REFUSALS.notApproved)
  })
  test('a budget that could pass the month cap refuses', () => {
    expect(startRefusal({ ...ok, spentThisMonthCents: 45_000 })).toBe(START_REFUSALS.monthCap)
  })
  test('otherwise it may start, and starting spends nothing by itself', () => {
    expect(startRefusal(ok)).toBeNull()
  })
})

describe('recording what was spent', () => {
  test('stays live under the budget', () => {
    expect(spendAfter({ budgetCents: 10_000, spentCents: 4_000 }, 2_000)).toEqual({ spentCents: 6_000, pause: false })
  })
  test('reaching the budget pauses it', () => {
    expect(spendAfter({ budgetCents: 10_000, spentCents: 8_000 }, 2_000)).toEqual({ spentCents: 10_000, pause: true })
  })
})

describe('the migration says the same, and starts off', () => {
  test('it exists and starts off with a zero cap', () => {
    expect(migration).toMatch(/enabled boolean not null default false/)
    expect(migration).toMatch(/monthly_cap_cents bigint not null default 0/)
  })
  test.each(Object.entries({ ...APPROVAL_PROBLEMS, ...START_REFUSALS }))('%s is the database\'s own sentence', (_k, sentence) => {
    expect(migration).toContain(`'${sentence.replace(/'/g, "''")}'`)
  })
  test('nobody but the functions changes a plan once written', () => {
    expect(migration).toContain('grant select, insert on table public.paid_campaigns to service_role;')
    expect(migration).not.toMatch(/grant [^;]*update[^;]*public\.paid_campaigns/i)
    expect(migration).toContain('grant select on table public.paid_campaign_spend to service_role;')
  })
})

describe('the counter on /admin/today', () => {
  test('off reads as off, and spend is real money only', () => {
    expect(paidFigure({ enabled: false, live: 0, paused: 0, spentThisMonthCents: 0, monthlyCapCents: 0 })).toMatchObject({
      value: 0, cadence: 'weekly', kind: 'measure', asksForAPerson: false, display: 'OFF until Lawal says; 0 live; A$0.00 spent this month of a A$0.00 cap',
    })
  })
  test('a plan paused at its budget asks for a person', () => {
    expect(paidFigure({ enabled: true, live: 1, paused: 2, spentThisMonthCents: 12_345, monthlyCapCents: 50_000 })).toMatchObject({
      value: 2, kind: 'failed', asksForAPerson: true, display: 'ON; 1 live; 2 paused; A$123.45 spent this month of a A$500.00 cap',
    })
  })
  test('unread is not counted', () => {
    expect(paidFigure(null, 'could not be read: x')).toMatchObject({ value: null, note: 'could not be read: x' })
  })
})
