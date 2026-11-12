// THE GROWTH DESK ON /admin/growth (Law 8; the CONTROLLER's 1 November 2026 03:32 G2): today's tasks, plan against
// actual with the 10x stretch's gap, the open cities against their benchmarks, the weekly trend; read from one place.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { GrowthDeskSection, weeklyRows } from '@/components/admin/growth-desk'
import { planAgainstActual, todaysTasks, type GrowthPlan, type Scorecard } from '@/lib/growth/desk-math'
import type { GrowthDesk, TrendRow } from '@/lib/growth/desk'

const plan = JSON.parse(readFileSync(resolve(process.cwd(), 'growth/plan.json'), 'utf8')) as GrowthPlan
const card: Scorecard = {
  read_at: '2026-10-31T16:31:22Z', visible_events: 321,
  checked_next_14_days_by_city: { Geelong: 20, Melbourne: 28, Ballarat: 60, Bendigo: 112 },
  photo_rights_recorded: 24, claims_verified: 1, claims_all: 3, venues_claimed: 0, frequent_paid_organisers_30d: 2,
  paid_tickets_7d: 10, remind_me_active: 5, subscribers_confirmed: 4, outreach_sent_yesterday: 12, outreach_replies_yesterday: 1,
  selling_through_eventlinqs: 0,
}
const desk = (trend: TrendRow[] = []): GrowthDesk => ({
  plan, card, today: '2026-11-01', progress: planAgainstActual(plan, card, '2026-11-01'), tasks: todaysTasks(plan, card, '2026-11-01'), trend,
})
const html = (d: GrowthDesk) => renderToStaticMarkup(createElement(GrowthDeskSection, { desk: d }))

describe('the growth desk', () => {
  test("shows today's tasks, the plan against actual, and the stretch's gap", () => {
    const out = html(desk())
    expect(out).toContain('Today, 1 November 2026')
    expect(out).toContain('Add listings in Melbourne: 28 of 200 checked events in the next 14 days, 172 short.')
    expect(out).toContain('Send 20 outreach messages today (yesterday: 12 sent).')
    expect(out).toContain('Plan against actual, the year to October 2027')
    expect(out).toContain('10x stretch')
    expect(out).toContain('Upcoming events selling through EventLinqs')
    expect(out).toContain('Focus market: Melbourne first, then the other big Australian cities, then the regional cities.')
    expect(out).toMatch(/Send 5 conversion asks today, within the 20 outreach messages/)
    expect(out).toMatch(/The 10x stretch is A\$[\d,]+ a year short on today&#x27;s run rate\./)
  })

  test('each open city against its benchmark, and a city at it says so', () => {
    const out = html(desk())
    expect(out).toContain('20 of 50, 30 short')
    expect(out).toContain('112 of 50, at the benchmark')
  })

  test('with no daily read kept yet, the trend says so instead of drawing zeros', () => {
    expect(html(desk())).toContain('No daily read is kept yet.')
  })

  test('the trend shows one row a week, the newest last', () => {
    const days = Array.from({ length: 15 }, (_, i) => ({ day: `2026-11-${String(i + 1).padStart(2, '0')}`, plan_version: 1, numbers: card }))
    expect(weeklyRows(days).map((r) => r.day)).toEqual(['2026-11-01', '2026-11-08', '2026-11-15'])
  })

  test('the page draws the desk from the one read the founder email also uses', () => {
    const page = readFileSync(resolve(process.cwd(), 'src/app/admin/(authed)/growth/page.tsx'), 'utf8')
    expect(page).toMatch(/readGrowthDesk\(\)/)
    expect(page).toMatch(/<GrowthDeskSection desk=\{desk\} \/>/)
  })
})
