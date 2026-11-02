// THE DESK's CITY SECTIONS (C:\dev\DESIGN\CITY-FIRST-1NOV\ENGINE-FINAL-DIRECTIVE-1NOV.md s8; C:\dev\GROWTH\
// GROWTH-SYSTEM-DIRECTIVE-1NOV.md s6, s7): coverage against monitored sources only, never a completeness claim; the
// misses by reason; the weekly channel rows with sales from paid orders; the experiments with their decisions.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { CoverageDeskSection } from '@/components/admin/coverage-desk'
import type { CityCoverage, CoverageDesk } from '@/lib/growth/coverage-desk'

const coverage = (over: Partial<CityCoverage> = {}): CityCoverage => ({
  city: 'geelong',
  sources: { known: 21, healthy: 3, failing: 1, not_yet_read: 17, stopped: 0 },
  upcoming_in_city: 0, upcoming_nearby: 0, upcoming_by_label: 42, labelled_here_not_yet_placed: 40,
  labelled_here_but_placed_elsewhere: [{ event: 'trivia-night-aireys', venue: 'Aireys Pub', relation: 'outside' }],
  candidates_discovered: 0, unique_discovered: 0, listed: 0, missing: 0, pending_review: 0, coverage_percent: null,
  horizons: [], duplicates: 0, stale: 2, expired_or_cancelled: 1, with_authorised_image: 3, with_external_ticketing: 10,
  selling_through_eventlinqs: 0, by_category: { 'Music and concerts': 12, 'needs a category': 2 },
  ...over,
})
const desk = (over: Partial<CityCoverage> = {}, experiments: CoverageDesk['experiments'] = []): CoverageDesk => ({
  cities: [{ slug: 'geelong', name: 'Geelong', regionName: 'Geelong and the Bellarine', coverage: coverage(over),
    misses: [{ week: '2026-10-26', misses: 8, fixed: 1, by_reason: { source_not_registered: 6, no_adapter: 2 } }],
    channels: [{ week: '2026-10-26', by_channel: { social: { visitors: 30, event_page_views: 40, checkouts_started: 1, paid_sales: 0, tickets: 0 } },
      new_visitors: 25, returning_visitors: 5, paid_orders: 0, gross_ticket_cents: 0, fee_revenue_cents: 0, newsletter_confirmations_all_cities: 0 }] }],
  experiments,
})
const html = (d: CoverageDesk) => renderToStaticMarkup(createElement(CoverageDeskSection, { desk: d }))

describe('the city sections of the growth desk', () => {
  test('with no monitored events, coverage says so instead of a percent', () => {
    const out = html(desk())
    expect(out).toContain('No monitored events yet')
    expect(out).not.toMatch(/0(\.0)?%/)
  })

  test('a percent is shown only against monitored sources, and named as such', () => {
    const out = html(desk({ unique_discovered: 200, listed: 50, missing: 150, coverage_percent: 25 }))
    expect(out).toContain('25% of the events our monitored sources list')
  })

  test('events labelled here but placed elsewhere are named, not hidden', () => {
    expect(html(desk())).toContain('Aireys Pub')
  })

  test('misses by reason in words, and the weekly channel rows', () => {
    const out = html(desk())
    expect(out).toContain('Source not registered')
    expect(out).toContain('returning')
  })

  test('experiments: none recorded is said plainly; a decision shows with its result', () => {
    expect(html(desk())).toContain('No experiments recorded yet')
    const out = html(desk({}, [{ id: 'e1', title: 'Weekly Geelong guide', city_slug: 'geelong', channel: 'weekly_guide',
      hypothesis: 'A weekly guide brings returning visitors', primary_metric: 'returning visitors a week', budget_cents: 0,
      starts_on: '2026-11-02', ends_on: '2026-11-30', baseline: 5, result: 9, decision: 'improve' }]))
    expect(out).toContain('Weekly Geelong guide')
    expect(out).toContain('improve')
  })

  test('no dash or exclamation mark in the words drawn', () => {
    expect(html(desk())).not.toMatch(/[\u2013\u2014!]/)
  })
})
