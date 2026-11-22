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
 *     than 25 minutes, or a piece due more than 20 minutes past its slot while the switch is on, is reported, and the
 *     one publish route is called once, through the same lease. It never publishes itself. Since the PM's 17:20 the
 *     route runs every ten minutes; if the watchdog finds two runs overlapping, or a piece with two posting rows on one
 *     network, it turns HOURLY_FLAG on and only the hour's own run publishes until a person turns it off.
 */

/** No run for longer than this means the scheduler missed two runs (it fires every ten minutes; the PM's 17:20). */
export const RUN_MISSING_MINUTES = 25
/** A scheduled piece this far past its slot, with the switch on, is overdue (two runs missed). */
export const PIECE_OVERDUE_MINUTES = 20
/** The reversal: while on, only the hour's own run publishes, as the hourly cron did (the PM's 17:20). */
export const HOURLY_FLAG = 'social_publish_hourly'

/**
 * THE HOUR'S OWN RUN (the PM's 17:20 of 22 November 2026: the route runs every ten minutes, so a piece is published at
 * the first run at or after its slot, not up to 59 minutes late). The work that belongs to an hour (the pre-flight, the
 * week drawn again, the standing policy's approvals, the week's plan and the timetable's phase row) runs only in the run
 * at 40 to 49 minutes past, the one the hourly cron always was; scheduling, publishing and reading posts back run in
 * every run. Pure.
 */
export function isHourRun(now: Date): boolean {
  return melbourneMinuteOfHour(now) >= 40 && melbourneMinuteOfHour(now) < 50
}

function melbourneMinuteOfHour(now: Date): number {
  return Number(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', minute: '2-digit' }).format(now))
}

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

/**
 * THE REVERSAL'S EVIDENCE (the PM's 17:20 of 22 November 2026): two publishing runs that both held the lease and overlap
 * in time, or one piece with two posting rows on one network. Either means running every ten minutes is not safe, and
 * the watchdog turns HOURLY_FLAG on. A run that found the lease held ('skipped: ...') did nothing and never counts. Pure.
 */
export function reversalReasons(
  runs: readonly { readonly started_at: string; readonly ended_at: string | null; readonly result: string | null }[],
  postings: readonly { readonly piece_id: string; readonly platform: string }[],
): string[] {
  const out: string[] = []
  const working = runs
    .filter((r) => !String(r.result ?? '').startsWith('skipped:') && r.ended_at)
    .map((r) => ({ start: Date.parse(r.started_at), end: Date.parse(String(r.ended_at)), at: r.started_at }))
    .sort((a, b) => a.start - b.start)
  for (let i = 1; i < working.length; i++) {
    if (working[i].start < working[i - 1].end) out.push(`two publishing runs overlapped (started ${working[i - 1].at} and ${working[i].at})`)
  }
  const seen = new Map<string, number>()
  for (const p of postings) seen.set(`${p.piece_id} ${p.platform}`, (seen.get(`${p.piece_id} ${p.platform}`) ?? 0) + 1)
  for (const [key, n] of seen) if (n > 1) out.push(`a piece has ${n} posting rows on one network (${key})`)
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
): Promise<{ readonly overdue: readonly string[]; readonly action: string; readonly reversal?: string }> {
  const last = await db.from('social_publish_runs').select('started_at').eq('route', '/api/cron/social-publish').order('started_at', { ascending: false }).limit(1).maybeSingle()
  if (last.error) return { overdue: [`the last run could not be read: ${last.error.message}`], action: 'none: it could not read' }
  const flag = await db.from('feature_flags').select('enabled').eq('flag', 'social_auto_publish').maybeSingle()
  if (flag.error) return { overdue: [`the switch could not be read: ${flag.error.message}`], action: 'none: it could not read' }
  const due = await db.from('social_piece_schedules').select('go_at').eq('state', 'scheduled').lt('go_at', input.now.toISOString()).order('go_at', { ascending: true }).limit(1).maybeSingle()
  if (due.error) return { overdue: [`the due pieces could not be read: ${due.error.message}`], action: 'none: it could not read' }
  const lastRunAt = last.data?.started_at ? new Date(String(last.data.started_at)) : null
  const switchOn = flag.data?.enabled === true
  const oldestDue = due.data?.go_at ? new Date(String(due.data.go_at)) : null
  // THE REVERSAL, CHECKED BY THE WATCHDOG ITSELF (the PM's 17:20): the last day's publishing runs and posting rows.
  // Its own guard: a failed read is said in the row and never stops the overdue check below.
  let reversal = ''
  try {
    const since = new Date(input.now.getTime() - 24 * 3_600_000).toISOString()
    const runs = await db.from('social_publish_runs').select('started_at, ended_at, result').eq('route', '/api/cron/social-publish').gte('started_at', since).limit(500)
    const posts = await db.from('social_piece_postings').select('piece_id, platform').gte('posted_at', since).limit(1000)
    if (runs.error || posts.error) throw new Error((runs.error ?? posts.error)!.message)
    const reasons = reversalReasons((runs.data ?? []) as never, (posts.data ?? []) as never)
    if (reasons.length > 0) {
      const on = input.dry ? { error: null } : await db.from('feature_flags').update({ enabled: true, updated_at: input.now.toISOString() }).eq('flag', HOURLY_FLAG)
      reversal = on.error
        ? `reversal needed but ${HOURLY_FLAG} could not be turned on: ${on.error.message}; ${reasons.join('; ')}`
        : `${HOURLY_FLAG} turned on${input.dry ? ' (dry: not written)' : ''}: ${reasons.join('; ')}`
      console.error(`[social/publish-run] ${reversal}`)
    }
  } catch (fault) {
    reversal = `the reversal check could not read: ${fault instanceof Error ? fault.message : String(fault)}`
  }
  const overdue = overdueNow({ now: input.now, lastRunAt, switchOn, oldestDue })
  if (overdue.length === 0 && !reversal) return { overdue, action: 'none needed' }
  let action: string
  if (overdue.length === 0) action = 'the publish route was not called: nothing is overdue'
  else if (input.dry) action = 'dry: the publish route was not called'
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
    failed: (overdue.length > 0 && !action.startsWith('the publish route called once: HTTP 2')) || reversal ? 1 : 0,
    ok: (overdue.length === 0 || action.startsWith('the publish route called once: HTTP 2') || action.startsWith('dry')) && !reversal,
    result: `overdue: ${overdue.join('; ') || 'none'}; ${action}${reversal ? `; ${reversal}` : ''}`,
  })
  return { overdue, action, ...(reversal ? { reversal } : {}) }
}
