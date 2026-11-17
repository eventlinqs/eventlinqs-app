import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isLate, isLive, NOT_LIVE_FILTER, priceWords, SUBMISSION_LIVE_WITHIN_MINUTES, type WatchedSubmission } from '../../../src/lib/listings/submission-watch-rule'

/**
 * NO SUBMISSION IS EVER MISSED, AND NONE GOES THROUGH LAWAL (the PM's ruling of 8 November 2026, 15:00, as Lawal's
 * rulings of 15:48 (2) and (6) changed it): what is not live an hour after it arrived is shown on /admin/today and counted
 * in the daily state email, the read of production; nothing in the listing path is sent to Lawal.
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n')
const NOW = new Date('2026-11-08T05:00:00Z')
const sub = (over: Partial<WatchedSubmission> = {}): WatchedSubmission => ({
  created_at: '2026-11-08T03:30:00Z',
  status: 'waiting',
  published_event_id: null,
  ...over,
})

describe('live and late', () => {
  test('live is self-listed and published, or accepted and joined to its event', () => {
    expect(isLive(sub({ status: 'published' }))).toBe(true)
    expect(isLive(sub({ status: 'accepted', published_event_id: 'a6778756-b6f0-4997-8f1a-8d6c2aaa0bbe' }))).toBe(true)
    expect(isLive(sub({ status: 'accepted' }))).toBe(false)
    expect(isLive(sub({ status: 'waiting' }))).toBe(false)
    expect(isLive(sub({ status: 'held' }))).toBe(false)
  })
  test('late is neither live nor refused an hour after it arrived', () => {
    expect(SUBMISSION_LIVE_WITHIN_MINUTES).toBe(60)
    expect(isLate(sub(), NOW)).toBe(true)
    expect(isLate(sub({ status: 'held' }), NOW)).toBe(true)
    expect(isLate(sub({ status: 'accepted' }), NOW)).toBe(true)
    expect(isLate(sub({ created_at: '2026-11-08T04:30:00Z' }), NOW)).toBe(false)
    expect(isLate(sub({ status: 'refused' }), NOW)).toBe(false)
    expect(isLate(sub({ status: 'published' }), NOW)).toBe(false)
  })
  test('the database filter names the same three not-live states the rule does', () => {
    expect(NOT_LIVE_FILTER).toBe('status.in.(waiting,held),and(status.eq.accepted,published_event_id.is.null)')
  })
  test('the price is in one set of words', () => {
    expect(priceWords('free', null)).toBe('Free')
    expect(priceWords('paid', 2600)).toBe('From A$26')
    expect(priceWords('paid', 6550)).toBe('From A$65.50')
    expect(priceWords('paid', null)).toBe('Paid (no price given)')
  })
})

describe('where it is shown, and where it is never sent', () => {
  test('/admin/today leads with them', async () => {
    const { SOURCE_KEYS, SECTION_TITLES } = await import('../../../src/lib/admin/today-math')
    expect(SOURCE_KEYS[0]).toBe('submissions')
    expect(SECTION_TITLES.submissions).toBe('Organiser events not live after an hour')
    const today = read('src/lib/admin/today.ts')
    expect(today).toContain("{ key: 'submissions', section: 'submissions', name: 'Organiser events not live after an hour', read: submissions }")
    expect(today).toContain('.or(NOT_LIVE_FILTER)')
  })
  test('the daily state email reads production for them and cannot read ALL GREEN while one sits', async () => {
    const route = read('src/app/api/ops/state/route.ts')
    expect(route).toContain('submissionsNotLive: notLive.count ?? 0')
    const { headlineFor } = (await import('../../../scripts/lib/state-report.mjs')) as { headlineFor: (s: unknown) => { word: string; urgent: boolean } }
    expect(headlineFor({ business: { submissionsNotLive: 0 } }).word).toBe('ALL GREEN')
    const one = headlineFor({ business: { submissionsNotLive: 1 } })
    expect(one.word).toBe('AN ORGANISER EVENT IS NOT LIVE')
    expect(one.urgent).toBe(true)
  })
  // The PM's 12:25 item 3 of 16 November 2026: a source switched off for dead booking links (the sentinel's law 19 (d)
  // stop) is said in Lawal's daily email in one line, and nothing is said when none was.
  test('the daily state says in one line which sources were switched off for dead booking links', async () => {
    const route = read('src/app/api/ops/state/route.ts')
    expect(route).toContain("ilike('stopped_because', `%${SOURCE_STOP_WORDS}%`)")
    const { sectionsFor } = (await import('../../../scripts/lib/state-report.mjs')) as { sectionsFor: (s: unknown) => { title: string; lines: string[] }[] }
    const platform = (stopped: string[]) => sectionsFor({ business: { submissionsNotLive: 0, sourcesStoppedDeadLinks24h: stopped } }).find((s) => s.title === 'The platform')?.lines ?? []
    expect(platform(['The JazzLab']).filter((l) => l.includes('switched off'))).toEqual([
      '1 source switched off in the last 24 hours for dead booking links on two nights in a week: The JazzLab (law 19 (d); a person re-opens it on /admin/collected).',
    ])
    expect(platform([]).some((l) => l.includes('switched off'))).toBe(false)
  })

  // The PM's 13:40 item 1 of 16 November 2026: the libraries' nights publish through the capture rule; count the nights
  // the rule published in the daily state on their own line, by source, so a flood is seen.
  test('the daily state counts the nights the rule published in the last day, by source, on its own line', async () => {
    const route = read('src/app/api/ops/state/route.ts')
    expect(route).toContain(".eq('decided_by', 'partner_rule')")
    const { sectionsFor } = (await import('../../../scripts/lib/state-report.mjs')) as { sectionsFor: (s: unknown) => { title: string; lines: string[] }[] }
    const lines = (byRule: { name: string; n: number }[]) => sectionsFor({ business: { submissionsNotLive: 0, rulePublishedBySource24h: byRule } }).find((s) => s.title === 'The platform')?.lines ?? []
    expect(lines([{ name: 'Geelong Regional Libraries', n: 20 }, { name: 'Federation Square', n: 3 }]).filter((l) => l.startsWith('Nights published by the rule'))).toEqual([
      'Nights published by the rule in the last 24 hours: 23 (Geelong Regional Libraries 20, Federation Square 3).',
    ])
    expect(lines([]).filter((l) => l.startsWith('Nights published by the rule'))).toEqual(['Nights published by the rule in the last 24 hours: none.'])
  })

  test("Lawal is never in the listing path: the form, the run and the hourly backstop send him nothing (15:48 (2))", () => {
    for (const path of ['src/app/submit-event/actions.ts', 'src/lib/listings/self-listing-run.ts', 'src/app/api/cron/listing-occurrences/route.ts']) {
      const src = read(path)
      expect(src, path).not.toMatch(/founderDestination|tellLawal|alertArrival|alertLateSubmissions|organiser_submission_alert/)
    }
    const run = read('src/lib/listings/self-listing-run.ts')
    expect(run).not.toContain("from '@/lib/email/send'")
  })
})
