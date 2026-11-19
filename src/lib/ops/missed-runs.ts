import type { SupabaseClient } from '@supabase/supabase-js'
import { PHASES, melbourneMinutes, minutesOf, type Phase, type PhaseKey } from './timetable'

/**
 * THE MISSED-RUN ALARM (Lawal's specification of 20 November 2026, 09:01, item 4, through the PM's 09:05: "every daily
 * workflow has its schedule, last success, next run, and a MISSED-RUN alarm read from ops_phase_runs ... no new cron").
 *
 * A phase whose cutoff has passed by GRACE_MINUTES with no run of its own today is missed. The grace is an hour because
 * every ride a phase has runs at least hourly (the social run at 40 past each hour, the outreach run every quarter hour,
 * the listings run at 10 past), so an hour past the cutoff with no row means the ride never ran for it: missed, where a
 * row after the cutoff is only late (the board says late). The outreach run, which already
 * runs every quarter hour, writes one row for it (ride 'watchdog', failed, its words saying so), once a day per phase, so
 * /admin/today shows it MISSED and the 08:00 report carries it; a real run afterwards supersedes it on the board as late.
 * Nothing new is scheduled, nothing is retried here: the alarm only says, by a row anyone can read.
 */
export const GRACE_MINUTES = 60
export const WATCHDOG_RIDE = 'watchdog'

export interface DayRun {
  readonly phase: string
  readonly ride: string
  readonly startedAt: string
}

/** Melbourne's midnight for an instant, as epoch milliseconds. Pure. */
export function melbourneMidnight(now: Date): number {
  return now.getTime() - melbourneMinutes(now) * 60_000 - now.getUTCSeconds() * 1000 - now.getUTCMilliseconds()
}

/**
 * Which phases are missed now: past their cutoff by GRACE_MINUTES, with no run in their own window, and no alarm written
 * for them yet today. A day phase's window is today from midnight; a night-before phase's (prepare, 22:00 to 23:30) is
 * last evening from 21:00 to midnight, and its deadline (its cutoff and the grace) falls after midnight, so it is judged
 * the morning after. Pure.
 */
export function missedPhases(runs: readonly DayRun[], now: Date, phases: readonly Phase[] = PHASES): Phase[] {
  const nowMinutes = melbourneMinutes(now)
  const midnight = melbourneMidnight(now)
  const at = (r: DayRun) => new Date(r.startedAt).getTime()
  return phases.filter((p) => {
    const due = minutesOf(p.cutoff) + GRACE_MINUTES
    const alarmedToday = runs.some((r) => r.phase === p.key && r.ride === WATCHDOG_RIDE && at(r) >= midnight)
    if (alarmedToday) return false
    if (p.nightBefore) {
      if (nowMinutes < Math.max(0, due - 1440)) return false
      const from = midnight - 3 * 60 * 60_000
      return !runs.some((r) => r.phase === p.key && at(r) >= from && at(r) < midnight)
    }
    if (nowMinutes < due) return false
    return !runs.some((r) => r.phase === p.key && at(r) >= midnight)
  })
}

/** The alarm's words for a missed phase. Pure. */
export function missedWords(p: Phase): string {
  return `MISSED: no run of ${p.label} between ${p.slot} and ${p.cutoff} Melbourne${p.nightBefore ? ' (the night before)' : ''}; the board and the 08:00 report carry it until a run is recorded`
}

/**
 * Reads today's rows and writes one alarm row for each phase missed now. Returns the phases it wrote; a read or write
 * that fails is named in the answer and never throws, so the run that calls it goes on.
 */
export async function recordMissedRuns(db: SupabaseClient, now: Date): Promise<{ readonly missed: PhaseKey[] } | { readonly unread: string }> {
  const from = new Date(melbourneMidnight(now) - 3 * 60 * 60_000).toISOString()
  const { data, error } = await db.from('ops_phase_runs').select('phase, ride, started_at').gte('started_at', from).limit(5000)
  if (error) return { unread: `the day's runs could not be read: ${error.message}` }
  const runs = ((data ?? []) as { phase: string; ride: string; started_at: string }[]).map((r) => ({ phase: r.phase, ride: r.ride, startedAt: r.started_at }))
  const missed = missedPhases(runs, now)
  const written: PhaseKey[] = []
  for (const p of missed) {
    const { error: we } = await db.from('ops_phase_runs').insert({
      phase: p.key,
      ride: WATCHDOG_RIDE,
      started_at: now.toISOString(),
      ended_at: now.toISOString(),
      units: 0,
      unit: 'run',
      result: missedWords(p),
      failed: true,
    })
    if (we) return { unread: `the alarm for ${p.key} could not be written: ${we.message}` }
    written.push(p.key)
  }
  return { missed: written }
}
