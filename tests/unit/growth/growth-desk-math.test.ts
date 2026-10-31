// THE GROWTH DESK'S ARITHMETIC (Law 8; the CONTROLLER's 1 November 2026 03:32 G2), against the real growth/plan.json
// and a scorecard shaped like growth_scorecard_read()'s answer (Geelong 20 of 50, Melbourne 28 of 200: WINDOW 6's
// first run on production, 1 November 03:31).

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { currentPlanYear, planAgainstActual, todaysTasks, type GrowthPlan, type Scorecard } from '@/lib/growth/desk-math'

const plan = JSON.parse(readFileSync(resolve(process.cwd(), 'growth/plan.json'), 'utf8')) as GrowthPlan
const card: Scorecard = {
  read_at: '2026-10-31T16:31:22Z',
  visible_events: 321,
  checked_next_14_days_by_city: { Geelong: 20, Melbourne: 28, Ballarat: 60, Bendigo: 112 },
  photo_rights_recorded: 24,
  claims_verified: 1,
  claims_all: 3,
  venues_claimed: 0,
  frequent_paid_organisers_30d: 2,
  paid_tickets_7d: 10,
  remind_me_active: 5,
  subscribers_confirmed: 4,
  outreach_sent_yesterday: 12,
  outreach_replies_yesterday: 1,
  selling_through_eventlinqs: 0,
}

describe('the plan year and plan against actual', () => {
  test('1 November 2026 falls in the year to October 2027', () => {
    expect(currentPlanYear(plan, '2026-11-01').year_to).toBe('2027-10')
    expect(currentPlanYear(plan, '2027-11-01').year_to).toBe('2028-10')
    expect(currentPlanYear(plan, '2031-01-01').year_to).toBe('2029-10')
  })

  test('each target is shown against its actual, with the run rate named as a run rate', () => {
    const r = planAgainstActual(plan, card, '2026-11-01')
    const [o, tickets, revenue] = r.lines
    expect(o).toMatchObject({ actual: 2, target: 150, percent: 1 })
    expect(tickets).toMatchObject({ actual: 520, target: 144000 })
    expect(tickets.basis).toMatch(/run rate/)
    expect(revenue.actual).toBe(Math.round(520 * plan.model.N_aud_estimate))
    expect(revenue.basis).toMatch(/plan's estimate per ticket/)
  })

  test('the 10x stretch is shown with its gap, never hidden', () => {
    const r = planAgainstActual(plan, card, '2026-11-01')
    expect(r.stretch.target).toBe(38000000)
    expect(r.stretchGap).toBe(38000000 - r.lines[2].actual)
  })
})

describe('closing the ticketing gap (plan version 2)', () => {
  const line = (today: string, c: Scorecard = card) =>
    planAgainstActual(plan, c, today).lines.find((l) => l.label === 'Upcoming events selling through EventLinqs')

  test('the count is shown against the next dated target, each target in turn', () => {
    expect(line('2026-11-01')).toMatchObject({ actual: 0, target: 5, percent: 0 })
    expect(line('2026-11-01')?.basis).toBe('by 15 November 2026, counted daily: published upcoming events with a paid EventLinqs ticket tier')
    expect(line('2026-11-16')).toMatchObject({ target: 20 })
    expect(line('2027-01-31')).toMatchObject({ target: 50 })
    expect(line('2027-03-01')).toMatchObject({ target: 50 })
  })

  test('before the scorecard counts it, the line is left out rather than drawn as a zero', () => {
    const older: Scorecard = { ...card }
    delete older.selling_through_eventlinqs
    expect(line('2026-11-01', older)).toBeUndefined()
  })

  test("today's conversion asks come first, counted from the plan and naming who first", () => {
    const tasks = todaysTasks(plan, card, '2026-11-01')
    const ask = tasks.find((t) => t.kind === 'conversion')
    expect(tasks.findIndex((t) => t.kind === 'conversion')).toBeLessThan(tasks.findIndex((t) => t.kind === 'outreach'))
    expect(ask?.text).toMatch(/^Send 5 conversion asks today, within the 20 outreach messages, to: /)
    for (const who of plan.close_the_ticketing_gap!.who_first) expect(ask?.text).toContain(who)
    expect(ask?.text).toMatch(/Selling through EventLinqs now: 0 of 5 by 15 November 2026\.$/)
  })
})

describe("today's tasks, by rule", () => {
  const tasks = todaysTasks(plan, card)

  test('a city under its 14-day benchmark gets a listings task saying how far short', () => {
    const listings = tasks.filter((t) => t.kind === 'listings').map((t) => t.text)
    expect(listings).toContain('Add listings in Geelong: 20 of 50 checked events in the next 14 days, 30 short.')
    expect(listings).toContain('Add listings in Melbourne: 28 of 200 checked events in the next 14 days, 172 short.')
    expect(listings.some((t) => t.includes('Bendigo'))).toBe(false)
  })

  test('the outreach quota comes from the plan, beside what went yesterday', () => {
    expect(tasks.find((t) => t.kind === 'outreach')?.text).toBe('Send 20 outreach messages today (yesterday: 12 sent).')
  })

  test('replies due and claims to verify are counted, in the singular when one', () => {
    expect(tasks.find((t) => t.kind === 'replies')?.text).toBe('Answer 1 reply that came in yesterday.')
    expect(tasks.find((t) => t.kind === 'claims')?.text).toBe('Verify 2 listing claims.')
  })
})
