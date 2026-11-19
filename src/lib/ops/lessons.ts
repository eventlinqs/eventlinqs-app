import type { SupabaseClient } from '@supabase/supabase-js'
import { minutesOf, type Phase, type PhaseKey } from './timetable'

/**
 * THE ENGINE LEARNS INSIDE ITSELF (Lawal, 20 November 2026, 06:07, through the PM's 06:10; law 33 (e); migration
 * 20261120070001). Every lesson is a row of ops_lessons on production: when it was learned, its phase, what went wrong,
 * its cause, what the engine now does instead, what holds it and its evidence. A window records the fault it finds the
 * same hour (source 'window'); the engine's own morning check records each phase that was late, failed or silent the day
 * before (source 'engine', lessonFromYesterday below), and the day's plan starts that phase earlier and says why.
 * /admin/today and the 08:00 report read them from here, never from a file.
 */
export type LessonSource = 'learned_log' | 'window' | 'engine'

export interface Lesson {
  readonly learnedAt: Date
  readonly phase: PhaseKey | null
  readonly wentWrong: string
  readonly cause: string | null
  readonly nowDoes: string
  readonly heldBy: string | null
  readonly evidence: string | null
  readonly source: LessonSource
  /** One per lesson, forever: a second write of the same key is the same lesson, kept once. */
  readonly sourceKey: string
}

const clip = (text: string | null, max: number): string | null => {
  const t = (text ?? '').replace(/\s+/g, ' ').trim()
  if (t.length < 3) return null
  return t.length > max ? `${t.slice(0, max - 6)} (cut)` : t
}

/** The row for one lesson, each text kept to its column's bounds. Pure. */
export function lessonRow(l: Lesson): Record<string, unknown> {
  return {
    learned_at: l.learnedAt.toISOString(),
    phase: l.phase,
    went_wrong: clip(l.wentWrong, 2000) ?? 'a fault with no words recorded',
    cause: clip(l.cause, 2000),
    now_does: clip(l.nowDoes, 2000) ?? 'no change recorded',
    held_by: clip(l.heldBy, 1000),
    evidence: clip(l.evidence, 1000),
    source: l.source,
    source_key: l.sourceKey.slice(0, 200),
  }
}

/** Writes one lesson; a lesson already kept under its key is 'known'. A write that fails is said, never thrown. */
export async function recordLesson(db: SupabaseClient, lesson: Lesson): Promise<'recorded' | 'known' | { failed: string }> {
  try {
    const { error } = await db.from('ops_lessons').insert(lessonRow(lesson))
    if (!error) return 'recorded'
    if (error.code === '23505') return 'known'
    return { failed: error.message }
  } catch (err) {
    return { failed: err instanceof Error ? err.message : String(err) }
  }
}

export interface LessonRead {
  readonly learnedAt: string
  readonly phase: string | null
  readonly wentWrong: string
  readonly nowDoes: string
  readonly heldBy: string | null
  readonly source: LessonSource
}

/** The lessons learned in [from, to), newest first; a read that fails says so. */
export async function readLessons(db: SupabaseClient, from: Date, to: Date): Promise<{ lessons: LessonRead[] } | { unread: string }> {
  const { data, error } = await db
    .from('ops_lessons')
    .select('learned_at, phase, went_wrong, now_does, held_by, source')
    .gte('learned_at', from.toISOString())
    .lt('learned_at', to.toISOString())
    .order('learned_at', { ascending: false })
    .limit(200)
  if (error) return { unread: `what the engine learned could not be read: ${error.message}` }
  return {
    lessons: ((data ?? []) as { learned_at: string; phase: string | null; went_wrong: string; now_does: string; held_by: string | null; source: LessonSource }[]).map((r) => ({
      learnedAt: r.learned_at,
      phase: r.phase,
      wentWrong: r.went_wrong,
      nowDoes: r.now_does,
      heldBy: r.held_by,
      source: r.source,
    })),
  }
}

/** Phases that run on business days only: a weekend day without them is not a fault. */
const BUSINESS_DAY_PHASES: readonly PhaseKey[] = ['queue', 'send']

export interface DayBefore {
  /** Minutes the phase starts earlier today because of it (0 when nothing can start earlier). */
  readonly shiftMinutes: number
  readonly wentWrong: string
  readonly cause: string
  readonly nowDoes: string
}

/**
 * A PHASE'S DAY BEFORE, AS A LESSON THE ENGINE ACTS ON (the PM's 06:10, item 2). Late (ended after its cutoff): today it
 * starts earlier by as many minutes as it was late, at least 15. Failed: earlier by 15. Silent (no run though due): no run
 * can start earlier, so it is named until a run records it. On time, or a business-day phase on a weekend: null. Pure.
 */
export function lessonFromYesterday(
  phase: Phase,
  run: { readonly endedMinutes: number; readonly failed: boolean; readonly result: string } | null,
  yesterdayWasWeekend: boolean,
): DayBefore | null {
  if (!run) {
    if (yesterdayWasWeekend && BUSINESS_DAY_PHASES.includes(phase.key as PhaseKey)) return null
    if (phase.key === 'inbox') return null
    return {
      shiftMinutes: 0,
      wentWrong: `${phase.label} recorded no run yesterday (${phase.slot} to ${phase.cutoff}).`,
      cause: 'No run it rides recorded the phase inside its window (ops_phase_runs).',
      nowDoes: `${phase.label} is named on /admin/today and in the morning report until a run records it.`,
    }
  }
  const late = run.endedMinutes - minutesOf(phase.cutoff)
  if (late > 0) {
    const shift = Math.max(15, Math.ceil(late))
    return {
      shiftMinutes: shift,
      wentWrong: `${phase.label} ended ${Math.ceil(late)} minute(s) after its ${phase.cutoff} cutoff yesterday.`,
      cause: 'Its run took longer than the time left before its cutoff (ops_phase_runs, measured).',
      nowDoes: `${phase.label} is planned ${shift} minutes earlier today.`,
    }
  }
  if (run.failed) {
    return {
      shiftMinutes: 15,
      wentWrong: `${phase.label} failed yesterday: ${run.result.replace(/\s+/g, ' ').slice(0, 300)}`,
      cause: 'Its run recorded itself as failed (ops_phase_runs); its own words above.',
      nowDoes: `${phase.label} is planned 15 minutes earlier today, so a failure is found with time to fix it.`,
    }
  }
  return null
}
