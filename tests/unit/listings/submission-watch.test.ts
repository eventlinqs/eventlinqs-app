import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  arrivalEmail,
  isLate,
  isLive,
  lateAndNotYetTold,
  lateEmail,
  NOT_LIVE_FILTER,
  priceWords,
  SUBMISSION_LIVE_WITHIN_MINUTES,
  type WatchedSubmission,
} from '../../../src/lib/listings/submission-watch-rule'

/**
 * NO SUBMISSION IS EVER MISSED AGAIN (the PM's ruling of 8 November 2026, 15:00): the arrival alert (1), the hour's
 * backstop and the top of /admin/today (4), and the daily read of production in the state email (5). The rules on cases,
 * then where each is wired.
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n')
const NOW = new Date('2026-11-08T05:00:00Z')
const sub = (over: Partial<WatchedSubmission> = {}): WatchedSubmission => ({
  id: '52d2f81d-04e4-4d98-a675-716d441ad890',
  created_at: '2026-11-08T03:30:00Z',
  status: 'waiting',
  title: 'Kyivska Perepichka: Ukrainian Theatre in Melbourne',
  name: 'Iryna Karanets',
  role: 'organiser',
  starts_at: '2026-12-05T07:30:00Z',
  city_slug: 'melbourne',
  entry: 'paid',
  price_from_cents: 8000,
  photo_path: 'bfd3be94.jpg',
  published_event_id: null,
  held_because: null,
  check_result: null,
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
  test('a late one is raised once', () => {
    expect(lateAndNotYetTold(sub(), NOW)).toBe(true)
    expect(lateAndNotYetTold(sub({ check_result: { late_alert_at: '2026-11-08T04:10:00Z' } }), NOW)).toBe(false)
  })
  test("the database filter names the same three not-live states the rule does", () => {
    expect(NOT_LIVE_FILTER).toBe('status.in.(waiting,held),and(status.eq.accepted,published_event_id.is.null)')
  })
})

describe('the two alerts to Lawal', () => {
  test('the arrival alert carries the event, its date, city, organiser, price, photo yes or no, and one link', () => {
    const m = arrivalEmail(sub(), { name: 'Melbourne', timezone: 'Australia/Melbourne' }, 'https://www.eventlinqs.com.au/admin/submissions')
    expect(m.subject).toBe('New organiser event sent in: Kyivska Perepichka: Ukrainian Theatre in Melbourne')
    expect(m.text).toContain('When: Saturday 5 December')
    expect(m.text).toContain('6:30')
    expect(m.text).toContain('City: Melbourne')
    expect(m.text).toContain('Organiser: Iryna Karanets (I organise it)')
    expect(m.text).toContain('Price: From A$80')
    expect(m.text).toContain('Photo: yes')
    expect(m.text.match(/https:\/\/\S+/g)).toEqual(['https://www.eventlinqs.com.au/admin/submissions'])
    expect(arrivalEmail(sub({ photo_path: null }), { name: 'Melbourne', timezone: 'Australia/Melbourne' }, 'x').text).toContain('Photo: no')
  })
  test('the late alert says how long, and why it is not live', () => {
    expect(lateEmail(sub(), 'L', NOW).text).toContain('90 minutes ago')
    expect(lateEmail(sub(), 'L', NOW).text).toContain('still waiting for its checks')
    expect(lateEmail(sub({ status: 'held', held_because: 'Its booking page could not be read.' }), 'L', NOW).text).toContain('held: Its booking page could not be read.')
    expect(lateEmail(sub({ status: 'accepted' }), 'L', NOW).text).toContain('accepted, and not joined to a live event')
    expect(lateEmail(sub(), 'L', NOW).subject).toBe('Not live after an hour: Kyivska Perepichka: Ukrainian Theatre in Melbourne')
  })
  test('the price is in one set of words', () => {
    expect(priceWords('free', null)).toBe('Free')
    expect(priceWords('paid', 2600)).toBe('From A$26')
    expect(priceWords('paid', 6550)).toBe('From A$65.50')
    expect(priceWords('paid', null)).toBe('Paid (no price given)')
  })
})

describe('where each is wired', () => {
  test('(1) the form tells Lawal the moment a submission is recorded, before its checks run', () => {
    const action = read('src/app/submit-event/actions.ts')
    const recorded = action.indexOf('const done = await recordSubmission(')
    const told = action.indexOf('await alertArrival(done.id)')
    const checked = action.indexOf('outcome = await selfListSubmission(done.id)')
    expect(recorded).toBeGreaterThan(-1)
    expect(told).toBeGreaterThan(recorded)
    expect(checked).toBeGreaterThan(told)
  })
  test("(4) the hourly run raises the late ones even when its own budget ran out", () => {
    const cron = read('src/app/api/cron/listing-occurrences/route.ts')
    const budget = cron.indexOf('if (!result.stoppedEarly')
    const late = cron.indexOf('late = await alertLateSubmissions(new Date())')
    expect(late).toBeGreaterThan(-1)
    // Outside the budget's own block: after it closes, before the answer.
    expect(late).toBeGreaterThan(cron.indexOf('\n    }\n', budget))
  })
  test('(4) /admin/today leads with them', async () => {
    const { SOURCE_KEYS, SECTION_TITLES } = await import('../../../src/lib/admin/today-math')
    expect(SOURCE_KEYS[0]).toBe('submissions')
    expect(SECTION_TITLES.submissions).toBe('Organiser events not live after an hour')
    const today = read('src/lib/admin/today.ts')
    expect(today).toContain("{ key: 'submissions', section: 'submissions', name: 'Organiser events not live after an hour', read: submissions }")
    expect(today).toContain('.or(NOT_LIVE_FILTER)')
  })
  test('(5) the daily state email reads production for them and cannot read ALL GREEN while one sits', async () => {
    const route = read('src/app/api/ops/state/route.ts')
    expect(route).toContain('submissionsNotLive: notLive.count ?? 0')
    const { headlineFor } = (await import('../../../scripts/lib/state-report.mjs')) as { headlineFor: (s: unknown) => { word: string; urgent: boolean } }
    expect(headlineFor({ business: { submissionsNotLive: 0 } }).word).toBe('ALL GREEN')
    const one = headlineFor({ business: { submissionsNotLive: 1 } })
    expect(one.word).toBe('AN ORGANISER EVENT IS NOT LIVE')
    expect(one.urgent).toBe(true)
  })
})
