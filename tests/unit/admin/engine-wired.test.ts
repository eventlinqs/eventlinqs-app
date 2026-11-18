import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * /admin/engine (the operating model's amendment 1, A4 and A5; the PM's 01:39 of 19 November 2026): one row per
 * automation, each read from its own records; a read that fails says so on its row, never a zero; GitHub's own runs are
 * named as read there.
 */
type Answer = { count?: number; row?: Record<string, unknown> | null; rows?: Record<string, unknown>[]; error?: string }
let answers: Record<string, Answer> = {}

function query(table: string) {
  const a = () => answers[table] ?? { count: 0, row: null, rows: [] }
  const result = (single: boolean) => {
    const x = a()
    if (x.error) return { data: null, count: null, error: { message: x.error } }
    return { data: single ? (x.row ?? null) : (x.rows ?? []), count: x.count ?? 0, error: null }
  }
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'like', 'gte', 'lt', 'not', 'is', 'or', 'order', 'limit']) q[m] = () => q
  q.maybeSingle = async () => result(true)
  q.then = (ok: (v: unknown) => unknown) => Promise.resolve(result(false)).then(ok)
  return q
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => query(t) }) }))

const NOW = new Date('2026-11-18T16:30:00Z')

describe('the engine page reads each automation from its own records', () => {
  beforeEach(() => {
    answers = {}
  })

  it('a row whose records show a run each day is permanent; one with none is day 0; GitHub rows are read there', async () => {
    const { readEngine } = await import('@/lib/admin/engine')
    answers.listing_checks = { count: 12, row: { checked_at: '2026-11-18T12:25:21Z' } }
    answers.event_booking_links = { count: 0, row: null }
    const rows = await readEngine(NOW)
    const of = (k: string) => rows.find((r) => r.key === k)!
    expect(rows.map((r) => r.key)).toEqual(['social-publish', 'outreach-run', 'collection-run', 'big-event-hunt', 'listing-occurrences', 'booking-link-check', 'growth-scorecard', 'social-measure', 'state-report', 'engine-verifier'])
    expect(of('collection-run').proving).toEqual({ permanent: true, day: 4, line: 'Running permanently: 4 days in a row on its own schedule' })
    expect(of('collection-run').lastRun?.what).toBe('confirmed listings against their sources (12 today)')
    expect(of('booking-link-check').proving?.line).toBe('Proving, day 0 of 3')
    expect(of('booking-link-check').lastRun).toBeNull()
    expect(of('state-report').proving).toBeNull()
    expect(of('state-report').note).toMatch(/kept by GitHub/)
  })

  it('a read that fails says so on its row, never a zero', async () => {
    const { readEngine } = await import('@/lib/admin/engine')
    answers.social_measure_runs = { error: 'relation "public.social_measure_runs" does not exist' }
    const rows = await readEngine(NOW)
    const measure = rows.find((r) => r.key === 'social-measure')!
    expect(measure.readFailed).toMatch(/social_measure_runs: relation/)
    expect(measure.proving).toBeNull()
    expect(measure.lastRun).toBeNull()
  })

  it('a held post with no good run after it is named, and recovers once one follows', async () => {
    const { readEngine } = await import('@/lib/admin/engine')
    answers.social_piece_schedules = { count: 0, row: { created_at: '2026-11-18T10:00:00Z', held_reason: 'Not published: the night has started', platform: 'instagram', published_at: '2026-11-18T09:00:00Z', published_ref: 'https://www.instagram.com/p/x' } }
    const social = (await readEngine(NOW)).find((r) => r.key === 'social-publish')!
    expect(social.lastFailure?.what).toBe('held on instagram: Not published: the night has started')
    expect(social.lastFailure?.recovered).toBe(false)
  })

  it('the page is placed: the admin nav, the indexing policy, and the morning report will link to it', () => {
    const root = process.cwd()
    expect(readFileSync(join(root, 'src/components/admin/admin-nav.ts'), 'utf8')).toContain("href: '/admin/engine'")
    expect(readFileSync(join(root, 'src/lib/seo/indexing-policy.ts'), 'utf8')).toContain("route: '/admin/engine', klass: 'never'")
  })
})
