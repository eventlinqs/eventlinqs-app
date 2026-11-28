import { describe, expect, it, vi } from 'vitest'
import { allWell, morningRows, type MorningFacts } from '@/lib/admin/morning-report-math'
import { notPublishedNames, type ScheduleRow } from '@/lib/social/published-check'
import { headlineFor, renderStateReport } from '../../../scripts/lib/state-report.mjs'

/*
 * THE DAILY STATE CANNOT READ ALL GREEN WHILE A POST IS HELD, WITHDRAWN OR MISSED, AND IT NAMES THEM (the PM's 22:50 of
 * 28 November 2026, fix (c); C:\dev\EVIDENCE\EL-28NOV\incident\V3-daily-state-headline.md). The 13:58 email of 28
 * November (run 46100563859) led with ALL GREEN beside "4 posts held back with their reasons" and "Today: Nothing needs
 * you.": headlineFor never read the business areas, allWell never read held posts, and the System row counted only
 * automations not recovered. Red on main: notPublishedNames did not exist, the morning was all well, the headline green.
 */
const NOW = new Date('2026-11-28T02:58:00.000Z') // Sat 28 Nov 2026, 13:58 in Melbourne
const held = (platform: string, goAt: string, reason: string): ScheduleRow => ({ label: 'creative, melbourne', platform, goAt, state: 'held', heldReason: reason })
/** The four of 28 November, as production holds them (q1-held.sql.answer.json), the two that went, and one still to go. */
const DAY: ScheduleRow[] = [
  held('facebook', '2026-11-27T20:15:08.115Z', '[night] It prints "SAT 7"'),
  held('instagram', '2026-11-27T20:15:08.115Z', '[night] It prints "SAT 7"'),
  held('instagram', '2026-11-27T20:48:11.908Z', 'does not list it'),
  held('facebook', '2026-11-27T20:48:11.908Z', 'does not list it'),
  { label: 'creative, melbourne', platform: 'facebook', goAt: '2026-11-27T20:59:17.741Z', state: 'published', heldReason: null },
  { label: 'creative, melbourne', platform: 'instagram', goAt: '2026-11-27T20:59:17.741Z', state: 'published', heldReason: null },
  { label: 'week ahead, geelong', platform: 'instagram', goAt: '2026-11-28T08:00:00.000Z', state: 'scheduled', heldReason: null },
]
const FOUR = [
  'creative, melbourne on facebook, due Sat 07:15: held',
  'creative, melbourne on instagram, due Sat 07:15: held',
  'creative, melbourne on instagram, due Sat 07:48: held',
  'creative, melbourne on facebook, due Sat 07:48: held',
]
const QUIET: MorningFacts = {
  marketing: { firstLettersSent: 0, positiveReplies: 0, readyToday: 0 },
  permissions: { requestsSent: 0, photosReceived: 0, photosApproved: 0, requestsDueToday: 0 },
  social: { published: [], scheduledToday: 0, held: 0 },
  listings: { published: 0, ended: 0, onToday: 0 },
  relationships: { repliesReceived: 0, waitingForLawal: 0 },
  ticketing: { ordersConfirmed: 0, feeRevenueCents: 0, activations: 0 },
  system: { failures: [], unreadable: [] },
}
const TWENTY_EIGHTH: MorningFacts = { ...QUIET, social: { published: [], scheduledToday: 0, held: 4, notPublished: FOUR }, system: { failures: [{ title: 'Social posts: plan, draw again, publish', recovered: true }], unreadable: [] } }

describe('the posts that did not publish, named', () => {
  it('names every post held, withdrawn or past its slot unpublished, and nothing that went or is still to come', () => {
    expect(notPublishedNames(DAY, NOW)).toEqual(FOUR)
    const missed: ScheduleRow = { label: 'tonight, melbourne', platform: 'facebook', goAt: '2026-11-28T01:00:00.000Z', state: 'scheduled', heldReason: null }
    const withdrawn: ScheduleRow = { label: 'tonight, geelong', platform: 'facebook', goAt: '2026-11-28T09:00:00.000Z', state: 'expired', heldReason: 'Withdrawn, never published' }
    expect(notPublishedNames([missed, withdrawn], NOW)).toEqual(['tonight, melbourne on facebook, due Sat 12:00: scheduled', 'tonight, geelong on facebook, due Sat 20:00: expired'])
  })

  it('the morning is not all well, the Social row names them, and the System row never says nothing needs you', () => {
    expect(allWell(TWENTY_EIGHTH)).toBe(false)
    const rows = morningRows(TWENTY_EIGHTH)
    expect(rows.find((r) => r.area === 'Social Media Marketing')?.today).toContain(`Not published: ${FOUR.join('; ')}.`)
    expect(rows.find((r) => r.area === 'System Operations')?.today).toBe('4 posts not published; Social Media Marketing names each.')
    expect(allWell(QUIET)).toBe(true)
  })

  it('the daily email never reads ALL GREEN while one is named, and says how many', () => {
    const areas = { rows: morningRows(TWENTY_EIGHTH), allWell: allWell(TWENTY_EIGHTH), unreadable: [], engine: '/admin/engine', postsNotPublished: FOUR }
    const state = { generatedAt: NOW.toISOString(), business: { areas }, main: { conclusion: 'success', shortSha: '156bf0d8' } }
    expect(headlineFor(state).word).toBe('4 POSTS NOT PUBLISHED')
    const rendered = renderStateReport(state)
    expect(rendered.subject).not.toContain('ALL GREEN')
    expect(rendered.text).toContain(FOUR[0])
    expect(headlineFor({ ...state, business: { areas: { ...areas, postsNotPublished: [] } } }).word).toBe('ALL GREEN')
  })
})

/* readMorningReport over an in-memory client: today's and yesterday's schedules reach the report. */
type Row = Record<string, unknown>
const tables: Record<string, Row[]> = {
  social_piece_schedules: [
    ...DAY.map((r, i) => ({ id: `s${i}`, piece_id: r.label.startsWith('creative') ? 'c6bdc9da-e262-4695-9a50-8027e5972dc6' : 'a0000000-0000-4000-8000-000000000009', platform: r.platform, go_at: r.goAt, state: r.state, held_reason: r.heldReason, published_at: r.state === 'published' ? r.goAt : null })),
  ],
  social_pieces: [
    { id: 'c6bdc9da-e262-4695-9a50-8027e5972dc6', kind: 'creative', city: 'melbourne', partner_name: null },
    { id: 'a0000000-0000-4000-8000-000000000009', kind: 'week_ahead', city: 'geelong', partner_name: null },
  ],
}
function chain(table: string) {
  const tests: ((r: Row) => boolean)[] = []
  let head = false
  const at = (v: unknown) => Date.parse(String(v))
  const q: Record<string, unknown> = {
    select: (_c?: string, o?: { head?: boolean }) => ((head = o?.head === true), q),
    eq: (k: string, v: unknown) => (tests.push((r) => String(r[k]) === String(v)), q),
    neq: (k: string, v: unknown) => (tests.push((r) => String(r[k]) !== String(v)), q),
    is: (k: string, v: unknown) => (tests.push((r) => (r[k] ?? null) === v), q),
    in: (k: string, vs: unknown[]) => (tests.push((r) => vs.map(String).includes(String(r[k]))), q),
    gte: (k: string, v: unknown) => (tests.push((r) => at(r[k]) >= at(v)), q),
    gt: (k: string, v: unknown) => (tests.push((r) => at(r[k]) > at(v)), q),
    lt: (k: string, v: unknown) => (tests.push((r) => at(r[k]) < at(v)), q),
    lte: (k: string, v: unknown) => (tests.push((r) => at(r[k]) <= at(v)), q),
    not: () => q,
    or: () => q,
    ilike: () => q,
    order: () => q,
    limit: () => q,
    range: () => q,
    maybeSingle: () => q,
    then: (ok: (v: unknown) => unknown, no: (e: unknown) => unknown) =>
      Promise.resolve()
        .then(() => {
          const rows = (tables[table] ?? []).filter((r) => tests.every((t) => t(r)))
          return head ? { data: null, count: rows.length, error: null } : { data: rows, count: rows.length, error: null }
        })
        .then(ok, no),
  }
  return q
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => chain(t), rpc: async () => ({ data: null, error: null }) }) }))
vi.mock('@/lib/admin/engine', () => ({ readEngine: async () => [] }))
vi.mock('@/lib/outreach/acq-pool', () => ({ readAcqPool: async () => 0 }))
vi.mock('@/lib/outreach/page-checks', () => ({ readPageChecks: async () => [] }))

describe('the 08:00 report reads them from the schedules', () => {
  it('names the four of 28 November and is not all well', async () => {
    const { readMorningReport } = await import('@/lib/admin/morning-report')
    const report = await readMorningReport(NOW)
    expect(report.unreadable).toEqual([])
    expect(report.postsNotPublished).toEqual(FOUR)
    expect(report.allWell).toBe(false)
  })
})
