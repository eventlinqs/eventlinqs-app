import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { latestSentinelRun, recordSentinelRun, tableMissing } from '@/lib/health/sentinel-runs'

/*
 * THE VISITOR SENTINEL'S RUNS, KEPT (the PM's 12:35 item 5 of 16 November 2026: every report quotes the sentinel's latest
 * result from /admin/health; Lawal's 12:13: the PM reported green while his inbox held CRITICAL alerts). The sentinel kept
 * nothing, so /admin/health could not show what its last run found.
 */
const results = [
  { id: 'visitor-dead-booking-everywhere', label: 'Nights with every booking link dead', severity: 'critical' as const, ok: true, detail: 'none among 498 nights' },
  { id: 'visitor-held-dead-booking', label: 'Nights held this run', severity: 'critical' as const, ok: false, detail: 'held: 1' },
]

function fakeDb(answer: { data?: unknown; error?: { code?: string; message: string } | null }) {
  const inserted: Record<string, unknown>[] = []
  const chain = {
    insert: (row: Record<string, unknown>) => {
      inserted.push(row)
      return Promise.resolve({ error: answer.error ?? null })
    },
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: answer.data ?? [], error: answer.error ?? null }),
  }
  return { db: { from: () => chain } as never, inserted }
}

describe("the sentinel's runs, kept", () => {
  it('each run is one row: when, dry or not, whether every check passed, how many failed, every result', async () => {
    const { db, inserted } = fakeDb({})
    expect(await recordSentinelRun(db, results, new Date('2026-11-16T06:40:00Z'), false)).toBe('stored')
    expect(inserted).toEqual([{ sentinel: 'visitor', ran_at: '2026-11-16T06:40:00.000Z', dry: false, ok: false, failing: 1, results }])
  })

  it('before its migration is applied, a run says it was not stored, and the page says why, never an all clear', async () => {
    const missing = { code: 'PGRST205', message: "Could not find the table 'public.health_sentinel_runs' in the schema cache" }
    expect(tableMissing(missing)).toBe(true)
    expect(await recordSentinelRun(fakeDb({ error: missing }).db, results, new Date(), false)).toMatch(/^not stored yet/)
    const read = await latestSentinelRun(fakeDb({ error: missing }).db)
    expect(read.run).toBeNull()
    expect(read.note).toMatch(/migration waits/)
  })

  it('the newest run is read as it was kept', async () => {
    const row = { ran_at: '2026-11-16T06:40:00Z', dry: false, ok: false, failing: 1, results }
    expect(await latestSentinelRun(fakeDb({ data: [row] }).db)).toEqual({ run: { ranAt: row.ran_at, dry: false, ok: false, failing: 1, results }, note: null })
  })

  it('the cron keeps every run and /admin/health reads the newest', () => {
    const cron = readFileSync(join(process.cwd(), 'src/app/api/cron/visitor-sentinel/route.ts'), 'utf8')
    expect(cron).toContain('stored = await recordSentinelRun(db, results, new Date(), dry)')
    const page = readFileSync(join(process.cwd(), 'src/app/admin/(authed)/health/page.tsx'), 'utf8')
    expect(page).toContain("const [platform, sentinel] = await Promise.all([latestSentinelRun(db, 'platform'), latestSentinelRun(db)])")
    expect(page).toContain('<ChecksTable results={sentinel.run.results}')
  })
})
