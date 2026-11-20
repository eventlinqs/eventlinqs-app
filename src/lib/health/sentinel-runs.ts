/**
 * THE VISITOR SENTINEL'S RUNS, KEPT (the PM's 12:35 item 5 of 16 November 2026: every report quotes the sentinel's latest
 * result from /admin/health). The cron writes one row a run (supabase/migrations/20261116150001_health_sentinel_runs.sql);
 * /admin/health reads the newest. Until the table is on the database (Lawal applies the migration) a write is said as not
 * stored and the page says so, never a failure of the run and never an empty 'all clear'.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { HealthResult } from './result'

export const SENTINEL_RUNS_TABLE = 'health_sentinel_runs'

export type SentinelRun = { readonly ranAt: string; readonly dry: boolean; readonly ok: boolean; readonly failing: number; readonly results: readonly HealthResult[] }

/** The table is not on this database yet: Postgres' undefined table, or PostgREST's 'not in the schema cache'. */
export function tableMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' || /could not find the table/i.test(error.message ?? '')
}

/** One row for one run. 'stored', 'not stored yet' (no table), or the database's own words. */
export type SentinelName = 'visitor' | 'platform'

export async function recordSentinelRun(db: SupabaseClient, results: readonly HealthResult[], now: Date, dry: boolean, sentinel: SentinelName = 'visitor'): Promise<string> {
  const failing = results.filter((r) => !r.ok).length
  const { error } = await db.from(SENTINEL_RUNS_TABLE).insert({ sentinel, ran_at: now.toISOString(), dry, ok: failing === 0, failing, results })
  if (!error) return 'stored'
  return tableMissing(error) ? 'not stored yet: the runs table is not on this database (its migration waits)' : `not stored: ${error.message}`
}

/** The newest run, or why there is none to show. */
export async function latestSentinelRun(db: SupabaseClient, sentinel: SentinelName = 'visitor'): Promise<{ run: SentinelRun | null; note: string | null }> {
  const { data, error } = await db.from(SENTINEL_RUNS_TABLE).select('ran_at, dry, ok, failing, results').eq('sentinel', sentinel).order('ran_at', { ascending: false }).limit(1)
  if (error) return { run: null, note: tableMissing(error) ? 'The sentinel’s runs are not kept on this database yet: its migration waits for its founder step.' : `The sentinel’s runs could not be read: ${error.message}` }
  const row = (data ?? [])[0] as { ran_at: string; dry: boolean; ok: boolean; failing: number; results: HealthResult[] } | undefined
  if (!row) return { run: null, note: 'The sentinel has not run since its runs were first kept.' }
  return { run: { ranAt: row.ran_at, dry: row.dry, ok: row.ok, failing: row.failing, results: row.results ?? [] }, note: null }
}
