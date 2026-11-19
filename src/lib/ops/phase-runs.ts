import type { SupabaseClient } from '@supabase/supabase-js'
import { phaseOf, type PhaseKey, type Ride } from './timetable'

/**
 * EVERY RUN OF A PHASE RECORDS ITSELF (the daily timetable, locked 20 November 2026; migration 20261120010001): its
 * start, end, units of work and result, into ops_phase_runs, so the engine works each phase's start backwards from its
 * cutoff on measured times and no phase is silent. A record that cannot be written is said in the run's log and never
 * fails the run (the work is already done).
 */
export interface PhaseRun {
  readonly phase: PhaseKey
  readonly ride: Ride
  readonly startedAt: Date
  readonly endedAt: Date
  readonly units: number
  readonly result: string
  readonly failed?: boolean
}

/** The row for one run, its result kept to the column's length. Pure. */
export function phaseRunRow(run: PhaseRun): Record<string, unknown> {
  const result = run.result.trim() || 'no result named'
  return {
    phase: run.phase,
    ride: run.ride,
    started_at: run.startedAt.toISOString(),
    ended_at: (run.endedAt < run.startedAt ? run.startedAt : run.endedAt).toISOString(),
    units: Math.max(0, Math.round(run.units)),
    unit: phaseOf(run.phase).unit,
    result: result.length > 2000 ? `${result.slice(0, 1990)} (cut)` : result.length < 2 ? `${result}.` : result,
    failed: run.failed ?? false,
  }
}

export async function recordPhaseRun(db: SupabaseClient, run: PhaseRun): Promise<void> {
  try {
    const { error } = await db.from('ops_phase_runs').insert(phaseRunRow(run))
    if (error) console.error(`[ops/phase-runs] ${run.phase} not recorded: ${error.message}`)
  } catch (err) {
    console.error(`[ops/phase-runs] ${run.phase} not recorded: ${err instanceof Error ? err.message : String(err)}`)
  }
}
