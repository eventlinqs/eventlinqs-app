import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { runAskedDryRuns } from '@/lib/social/store'

/*
 * CAR T, T5 AND CAR U, U5 (the PM's 02:05 and 02:12 of 28 November 2026: the test piece through scheduling preparation
 * in a dry mode up to the Blotato call, a test approval never Lawal's, the schedule prepared and not sent, every stage's
 * row read back). Red on main, where the only road to a prepared schedule was a real approval and a real schedule row the
 * publisher would post: now a row asked into social_dry_runs is taken through every stage on the social run and its
 * result kept on that row alone.
 */
const read = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
const NOW = new Date('2026-11-28T08:00:00Z')

function fakeDb(runs: Record<string, unknown>[]) {
  const writes: { table: string; values: Record<string, unknown>; eqs: [string, unknown][] }[] = []
  const db = {
    from(table: string) {
      const q: Record<string, unknown> = {}
      Object.assign(q, { select: () => q, eq: () => q, order: () => q })
      q.limit = async () => ({ data: table === 'social_dry_runs' ? runs : [], error: null })
      q.maybeSingle = async () => ({ data: null, error: null })
      q.update = (values: Record<string, unknown>) => {
        const eqs: [string, unknown][] = []
        const chain = { eq: (c: string, v: unknown) => (eqs.push([c, v]), eqs.length === 2 ? Promise.resolve({ error: null }) : chain) }
        writes.push({ table, values, eqs })
        return chain
      }
      return q
    },
  }
  return { db: db as never, writes }
}

describe('each asked dry run, taken and kept on its own row', () => {
  it('runs every asked row and keeps its result on it, done, a failing stage named, nothing written anywhere else', async () => {
    const { db, writes } = fakeDb([{ id: 'dry-1', piece_id: '3548bd91-0000-4000-8000-000000000000', go_at: '2026-12-01T01:30:00Z' }])
    const lines = await runAskedDryRuns(db, NOW, { siteOrigin: 'https://www.eventlinqs.com.au' })
    expect(writes.map((w) => w.table)).toEqual(['social_dry_runs'])
    expect(writes[0].eqs).toEqual([['id', 'dry-1'], ['state', 'asked']])
    expect(writes[0].values).toMatchObject({ state: 'done', stages: [{ stage: 'render', ok: false, detail: 'no piece 3548bd91-0000-4000-8000-000000000000' }], error: 'render: no piece 3548bd91-0000-4000-8000-000000000000' })
    expect(lines).toEqual(['dry-1 (3548bd91-0000-4000-8000-000000000000): held at render'])
  })
})

describe('the dry run writes nothing but its own row', () => {
  const store = read('src/lib/social/store.ts')
  const dry = store.slice(store.indexOf('export async function dryRunPiece'), store.indexOf('export async function runAskedDryRuns'))
  it('runs the checks with keep false, so the intake record is never written, and calls no publisher, approval or schedule write', () => {
    expect(dry.split('keep: false').length - 1).toBe(2)
    expect(dry).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|publisher|approvePiece/)
    expect(store).toContain("  const kept = opts.keep === false ? null : await keepIntakeCheck(db, r.id, { stage: 'publish', faults, state: state === 'passed' ? 'handed_off' : state, now })\n")
    expect(store).toContain('platform: opts.platform, keep: opts.keep })))\n')
  })
  it('its record: never Lawal\'s, asked until done, service role only; and the social run takes it', () => {
    const sql = read('supabase/migrations/20261128070001_the_dry_run_of_a_piece.sql')
    expect(sql).toContain("asked_by text not null check (length(trim(asked_by)) >= 2 and asked_by !~* 'lawal'),")
    expect(sql).toContain("check ((state = 'asked') = (done_at is null))")
    expect(sql).toContain('revoke all on public.social_dry_runs from anon, authenticated, service_role;\ngrant select, insert, update on public.social_dry_runs to service_role;')
    expect(read('src/app/api/cron/social-publish/route.ts')).toContain('for (const line of await runAskedDryRuns(db, now, { siteOrigin: getSiteUrl() })) console.log(`[cron/social-publish] dry run: ${line}`)')
  })
})
