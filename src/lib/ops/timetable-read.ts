import type { SupabaseClient } from '@supabase/supabase-js'
import { PHASES, TIMETABLE_ZONE, melbourneMinutes, minutesOf, phaseState, plannedStart, type Phase } from './timetable'
import { lessonFromYesterday, type DayBefore } from './lessons'

/**
 * THE DAY'S TIMETABLE AS IT STANDS (the daily timetable, locked 20 November 2026, item 4: "/admin/today shows the day's
 * timetable, each phase green, running or late, with its count and end time"). Each phase's latest run since Melbourne's
 * midnight from ops_phase_runs, and its planned start worked backwards from its cutoff on the last 14 days' time per unit
 * (src/lib/ops/timetable.ts). A read that fails says so; it never shows a calm board.
 */
export interface TimetableRow {
  readonly phase: Phase
  readonly state: 'done' | 'running' | 'late' | 'failed' | 'missed' | 'not yet'
  readonly units: number | null
  readonly endedAt: string | null
  readonly result: string | null
  readonly plannedStartMinutes: number
  /** Its day before as a lesson the engine acts on (late, failed or silent), and the earlier start it gives today. */
  readonly dayBefore: DayBefore | null
  /** Its latest run that neither failed nor was the watchdog's alarm, at any time in the last 14 days. */
  readonly lastSuccessAt: string | null
  /** Its next run: today at its slot while not yet run, otherwise tomorrow at its slot (the night before for prepare). */
  readonly nextRun: string
}

const DAY = 24 * 60 * 60 * 1000

function hhmm(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function plannedStartWords(row: TimetableRow): string {
  return hhmm(row.plannedStartMinutes)
}

export async function readTimetable(db: SupabaseClient, now: Date): Promise<{ rows: TimetableRow[] } | { unread: string }> {
  const since = new Date(now.getTime() - 14 * DAY).toISOString()
  const { data, error } = await db
    .from('ops_phase_runs')
    .select('phase, ride, started_at, ended_at, units, result, failed')
    .gte('started_at', since)
    .order('started_at', { ascending: false })
    .limit(5000)
  if (error) return { unread: `the timetable could not be read: ${error.message}` }
  const runs = (data ?? []) as { phase: string; ride: string; started_at: string; ended_at: string; units: number; result: string; failed: boolean }[]
  const nowMinutes = melbourneMinutes(now)
  const midnight = now.getTime() - nowMinutes * 60_000
  // Yesterday in Melbourne, for the lessons of the day before (the PM's 06:10 of 20 November 2026, item 2).
  const yesterdayMidnight = midnight - DAY
  const yesterdayWeekday = new Intl.DateTimeFormat('en-AU', { timeZone: TIMETABLE_ZONE, weekday: 'short' }).format(new Date(yesterdayMidnight + 12 * 60 * 60_000))
  const yesterdayWasWeekend = yesterdayWeekday === 'Sat' || yesterdayWeekday === 'Sun'
  const rows = PHASES.map((phase) => {
    const own = runs.filter((r) => r.phase === phase.key)
    // A night-before phase served today from the evening before (21:00 to midnight); every other phase from midnight.
    const from = phase.nightBefore ? midnight - 3 * 60 * 60_000 : midnight
    const to = phase.nightBefore ? midnight : Number.POSITIVE_INFINITY
    const today = own.find((r) => new Date(r.started_at).getTime() >= from && new Date(r.started_at).getTime() < to) ?? null
    const perUnit = own
      .filter((r) => r.units > 0)
      .map((r) => (new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / 1000 / r.units)
    const endedMinutes = today ? melbourneMinutes(new Date(today.ended_at)) : null
    const state = phase.nightBefore
      ? today
        ? (today.failed ? 'failed' : endedMinutes !== null && endedMinutes > minutesOf(phase.cutoff) ? 'late' : 'done')
        : 'late'
      : phaseState(phase, today ? { startedAt: today.started_at, endedAt: today.ended_at, failed: today.failed, ride: today.ride } : null, nowMinutes, endedMinutes)
    // Its run yesterday: the last that started inside its own window (from its slot to its cutoff), since a ride such as
    // the hourly listings run records the phase all day and only the run inside the window serves it.
    const windowStart = yesterdayMidnight + minutesOf(phase.slot) * 60_000
    const windowEnd = yesterdayMidnight + minutesOf(phase.cutoff) * 60_000
    const yesterdayRun = own.find((r) => new Date(r.started_at).getTime() >= windowStart && new Date(r.started_at).getTime() <= windowEnd) ?? null
    const dayBefore = lessonFromYesterday(
      phase,
      yesterdayRun ? { endedMinutes: melbourneMinutes(new Date(yesterdayRun.ended_at)), failed: yesterdayRun.failed, result: yesterdayRun.result } : null,
      yesterdayWasWeekend,
    )
    return {
      phase,
      state,
      units: today?.units ?? null,
      endedAt: today?.ended_at ?? null,
      result: today?.result ?? null,
      plannedStartMinutes: plannedStart(phase, today?.units ?? 0, perUnit) - (dayBefore?.shiftMinutes ?? 0),
      dayBefore,
      lastSuccessAt: own.find((r) => !r.failed && r.ride !== 'watchdog')?.started_at ?? null,
      nextRun: phase.nightBefore
        ? `${phase.slot} tonight`
        : today && today.ride !== 'watchdog'
          ? `${phase.slot} tomorrow`
          : nowMinutes <= minutesOf(phase.slot)
            ? `${phase.slot} today`
            : `${phase.slot} tomorrow`,
    }
  })
  // The locked document's order: the night before first, then the day.
  return { rows }
}
