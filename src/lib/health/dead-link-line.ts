import type { SupabaseClient } from '@supabase/supabase-js'
import type { HealthResult } from './runner'
import { latestSentinelRun } from './sentinel-runs'

/**
 * DEAD BOOKING LINKS, SAID TO THE PM, NEVER ALARMED TO LAWAL (the PM's 11:53 of 26 November 2026, item 2: "it alerts only
 * when it cannot decide, and that alert goes to the PM's channel (PROGRESS and the 08:00 report's System line), not to
 * Lawal's inbox as CRITICAL"). The visitor sentinel heals a link its source moved and holds a night still dead in the same
 * run; its dead link results are warnings now (visitor-sentinel-run.ts). This line reads its newest run and says, for the
 * PM: the nights held, the nights it could not decide, the sources switched off; all well when none failed. Pure line.
 */
const DEAD_LINK_IDS = ['visitor-dead-booking-everywhere', 'visitor-held-dead-booking', 'visitor-source-stopped-dead-links', 'visitor-dead-booking:']

export function deadLinkLine(run: { readonly ranAt: string; readonly results: readonly HealthResult[] } | null, note: string | null): string {
  if (!run) return `not read: ${note ?? 'no sentinel run kept'}`
  const mine = run.results.filter((r) => DEAD_LINK_IDS.some((id) => (id.endsWith(':') ? r.id.startsWith(id) : r.id === id)))
  const bad = mine.filter((r) => !r.ok)
  const at = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(run.ranAt)).replace(',', '')
  if (bad.length === 0) return `the visitor sentinel's run of ${at}: no night with a dead booking link left live.`
  return `the visitor sentinel's run of ${at}: ${bad.map((r) => `${r.label}: ${r.detail}`).join('; ')}.`
}

/** The line from production; a read that fails says so. */
export async function readDeadLinkLine(db: SupabaseClient): Promise<string> {
  const { run, note } = await latestSentinelRun(db, 'visitor')
  return deadLinkLine(run, note)
}
