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
  test("Lawal is never in the listing path: the form, the run and the hourly backstop send him nothing (15:48 (2))", () => {
    for (const path of ['src/app/submit-event/actions.ts', 'src/lib/listings/self-listing-run.ts', 'src/app/api/cron/listing-occurrences/route.ts']) {
      const src = read(path)
      expect(src, path).not.toMatch(/founderDestination|tellLawal|alertArrival|alertLateSubmissions|organiser_submission_alert/)
    }
    const run = read('src/lib/listings/self-listing-run.ts')
    expect(run).not.toContain("from '@/lib/email/send'")
  })
})
