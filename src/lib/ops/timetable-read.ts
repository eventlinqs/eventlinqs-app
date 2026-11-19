import type { SupabaseClient } from '@supabase/supabase-js'
import { PHASES, melbourneMinutes, minutesOf, phaseState, plannedStart, type Phase } from './timetable'

/**
 * THE DAY'S TIMETABLE AS IT STANDS (the daily timetable, locked 20 November 2026, item 4: "/admin/today shows the day's
 * timetable, each phase green, running or late, with its count and end time"). Each phase's latest run since Melbourne's
 * midnight from ops_phase_runs, and its planned start worked backwards from its cutoff on the last 14 days' time per unit
 * (src/lib/ops/timetable.ts). A read that fails says so; it never shows a calm board.
 */
export interface TimetableRow {
  readonly phase: Phase
  readonly state: 'done' | 'running' | 'late' | 'not yet'
  readonly units: number | null
  readonly endedAt: string | null
  readonly result: string | null
  readonly plannedStartMinutes: number
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
    .select('phase, started_at, ended_at, units, result')
    .gte('started_at', since)
    .order('started_at', { ascending: false })
    .limit(5000)
  if (error) return { unread: `the timetable could not be read: ${error.message}` }
  const runs = (data ?? []) as { phase: string; started_at: string; ended_at: string; units: number; result: string }[]
  const nowMinutes = melbourneMinutes(now)
  const midnight = now.getTime() - nowMinutes * 60_000
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
        ? (endedMinutes !== null && endedMinutes > minutesOf(phase.cutoff) ? 'late' : 'done')
        : 'late'
      : phaseState(phase, today ? { startedAt: today.started_at, endedAt: today.ended_at } : null, nowMinutes, endedMinutes)
    return {
      phase,
      state,
      units: today?.units ?? null,
      endedAt: today?.ended_at ?? null,
      result: today?.result ?? null,
      plannedStartMinutes: plannedStart(phase, today?.units ?? 0, perUnit),
    }
  })
  // The locked document's order: the night before first, then the day.
  return { rows }
}
