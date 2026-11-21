import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * THE PUBLISHING RUN, ACCOUNTED FOR AND WATCHED (Lawal's hardening order of 22 November 2026, 09:27, sections 2 E and 4;
 * the PM's 09:32 item 2 (d), (e) and its monitor; migration 20261122094501).
 *
 *   - EVERY RUN WRITES ITS OWN ROW (social_publish_runs): start, end, deployment, what it drew, approved, scheduled,
 *     published, held and failed. An HTTP 200 is not proof that publishing worked; this row is.
 *   - ONE RUN AT A TIME: a run claims the one lease (claim_social_publish_lease) before it schedules or publishes, and
 *     a run that finds it held does nothing, so a repeated cron, a retried invocation and the watchdog never run two
 *     publishing processes.
 *   - THE WATCHDOG (the health sentinel, every five minutes, independent of the social cron): a run missing for more
 *     than 70 minutes, or a piece due more than 30 minutes past its slot while the switch is on, is reported, and the
 *     one publish route is called once, through the same lease. It never publishes itself.
 */

/** No run for longer than this means the hourly scheduler missed (it fires at :40 every hour). */
export const RUN_MISSING_MINUTES = 70
/** A scheduled piece this far past its slot, with the switch on, is overdue. */
export const PIECE_OVERDUE_MINUTES = 30
/** How long a run may hold the lease before it is free again (a run that dies frees it by expiry). */
export const LEASE_SECONDS = 600

export type PublishRun = {
  readonly route: string
  readonly startedAt: Date
  readonly endedAt: Date
  readonly deployment: string | null
  readonly switchOn: boolean
  readonly drawn: number
  readonly approved: number
  readonly scheduled: number
  readonly due: number
  readonly published: number
  readonly held: number
  readonly failed: number
  readonly ok: boolean
  readonly result: string
}

/** The row for one run, counts never negative and the result kept to the column's length. Pure. */
export function publishRunRow(run: PublishRun): Record<string, unknown> {
  const n = (x: number) => Math.max(0, Math.round(Number.isFinite(x) ? x : 0))
  const result = run.result.trim() || 'no result named'
  return {
    route: run.route,
    started_at: run.startedAt.toISOString(),
    ended_at: (run.endedAt < run.startedAt ? run.startedAt : run.endedAt).toISOString(),
    deployment: run.deployment,
    switch_on: run.switchOn,
    drawn: n(run.drawn),
    approved: n(run.approved),
    scheduled: n(run.scheduled),
    due: n(run.due),
    published: n(run.published),
    held: n(run.held),
    failed: n(run.failed),
    ok: run.ok,
    result: result.length > 4000 ? `${result.slice(0, 3990)} (cut)` : result,
  }
}

/** Writes the run's row; a row that cannot be written is said in the log and never fails the run (the work is done). */
export async function recordPublishRun(db: SupabaseClient, run: PublishRun): Promise<string> {
  try {
    const { error } = await db.from('social_publish_runs').insert(publishRunRow(run))
    if (error) {
      console.error(`[social/publish-run] the run was not recorded: ${error.message}`)
      return `not recorded: ${error.message}`
    }
    return 'recorded'
  } catch (fault) {
    const why = fault instanceof Error ? fault.message : String(fault)
    console.error(`[social/publish-run] the run was not recorded: ${why}`)
    return `not recorded: ${why}`
  }
}

/** The deployment this code runs on, as Vercel names it; null outside Vercel. */
export function deploymentOf(env: Record<string, string | undefined> = process.env): string | null {
  const sha = env.VERCEL_GIT_COMMIT_SHA?.trim()
  const id = env.VERCEL_DEPLOYMENT_ID?.trim()
  return sha || id ? [sha ? sha.slice(0, 12) : null, id ?? null].filter(Boolean).join(' ') : null
}

/** Claims the one publishing lease; true only when this run holds it now. A failed claim is never a held lease taken. */
export async function claimPublishLease(db: SupabaseClient, holder: string, seconds = LEASE_SECONDS): Promise<{ readonly held: boolean; readonly why: string | null }> {
  const { data, error } = await db.rpc('claim_social_publish_lease', { p_holder: holder, p_seconds: seconds })
  if (error) return { held: false, why: `the lease could not be claimed: ${error.message}` }
  return data === true ? { held: true, why: null } : { held: false, why: 'another publishing run holds the lease' }
}

/** Frees the lease for its own holder; said, never thrown. */
export async function releasePublishLease(db: SupabaseClient, holder: string): Promise<void> {
  const { error } = await db.rpc('release_social_publish_lease', { p_holder: holder })
  if (error) console.error(`[social/publish-run] the lease could not be released (it expires by itself): ${error.message}`)
}

/**
 * WHAT IS OVERDUE NOW (the watchdog's judgement). A run missing for more than RUN_MISSING_MINUTES (or no run at all), and
 * a scheduled piece more than PIECE_OVERDUE_MINUTES past its slot while the switch is on. Empty when nothing is. Pure.
 */
export function overdueNow(input: { readonly now: Date; readonly lastRunAt: Date | null; readonly switchOn: boolean; readonly oldestDue: Date | null }): string[] {
  const out: string[] = []
  const minutes = (d: Date) => Math.floor((input.now.getTime() - d.getTime()) / 60_000)
  if (input.lastRunAt === null) out.push('no social publish run is recorded')
  else if (minutes(input.lastRunAt) > RUN_MISSING_MINUTES) out.push(`the last social publish run started ${minutes(input.lastRunAt)} minutes ago (more than ${RUN_MISSING_MINUTES})`)
  if (input.switchOn && input.oldestDue !== null && minutes(input.oldestDue) > PIECE_OVERDUE_MINUTES) {
    out.push(`a scheduled piece is ${minutes(input.oldestDue)} minutes past its slot with the switch on (more than ${PIECE_OVERDUE_MINUTES})`)
  }
  return out
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

/**
 * THE WATCHDOG'S ONE PASS: reads the last run, the switch and the oldest due piece; when anything is overdue, calls the
 * one publish route once with the cron's own secret (the route claims the lease, so this can never start a second
 * publishing process), and writes its action as a row of social_publish_runs. A dry pass reports and calls nothing.
 */
export async function socialWatchdog(
  db: SupabaseClient,
  input: { readonly now: Date; readonly origin: string; readonly secret: string | undefined; readonly fetcher?: Fetcher; readonly dry?: boolean },
): Promise<{ readonly overdue: readonly string[]; readonly action: string }> {
  const last = await db.from('social_publish_runs').select('started_at').eq('route', '/api/cron/social-publish').order('started_at', { ascending: false }).limit(1).maybeSingle()
  if (last.error) return { overdue: [`the last run could not be read: ${last.error.message}`], action: 'none: it could not read' }
  const flag = await db.from('feature_flags').select('enabled').eq('flag', 'social_auto_publish').maybeSingle()
  if (flag.error) return { overdue: [`the switch could not be read: ${flag.error.message}`], action: 'none: it could not read' }
  const due = await db.from('social_piece_schedules').select('go_at').eq('state', 'scheduled').lt('go_at', input.now.toISOString()).order('go_at', { ascending: true }).limit(1).maybeSingle()
  if (due.error) return { overdue: [`the due pieces could not be read: ${due.error.message}`], action: 'none: it could not read' }
  const lastRunAt = last.data?.started_at ? new Date(String(last.data.started_at)) : null
  const switchOn = flag.data?.enabled === true
  const oldestDue = due.data?.go_at ? new Date(String(due.data.go_at)) : null
  const overdue = overdueNow({ now: input.now, lastRunAt, switchOn, oldestDue })
  if (overdue.length === 0) return { overdue, action: 'none needed' }
  let action: string
  if (input.dry) action = 'dry: the publish route was not called'
  else if (!input.secret) action = 'not called: no cron secret in this environment'
  else {
    try {
      // The sentinel's own limit is 60 seconds; the route runs on after this call stops waiting.
      const res = await (input.fetcher ?? fetch)(`${input.origin.replace(/\/$/, '')}/api/cron/social-publish`, { headers: { Authorization: `Bearer ${input.secret}` }, cache: 'no-store', signal: AbortSignal.timeout(45_000) })
      action = `the publish route called once: HTTP ${res.status}`
    } catch (fault) {
      action = `the publish route could not be called: ${fault instanceof Error ? fault.message : String(fault)}`
    }
  }
  await recordPublishRun(db, {
    route: '/api/cron/health-sentinel#watchdog',
    startedAt: input.now,
    endedAt: new Date(),
    deployment: deploymentOf(),
    switchOn,
    drawn: 0,
    approved: 0,
    scheduled: 0,
    due: oldestDue ? 1 : 0,
    published: 0,
    held: 0,
    failed: action.startsWith('the publish route called once: HTTP 2') ? 0 : 1,
    ok: action.startsWith('the publish route called once: HTTP 2') || action.startsWith('dry'),
    result: `overdue: ${overdue.join('; ')}; ${action}`,
  })
  return { overdue, action }
}
