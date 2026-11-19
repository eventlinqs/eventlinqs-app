import type { LessonRead } from './lessons'
import type { TimetableRow } from './timetable-read'

/**
 * THE THREE LINES OF WHAT THE ENGINE LEARNED, FOR THE 08:00 REPORT (Lawal, 20 November 2026, 06:07, through the PM's 06:10,
 * item 3): today's timetable, what was learned yesterday, and what changed today because of it, each from production
 * (ops_phase_runs and ops_lessons), never from a file. A read that failed is said in its line. Pure.
 */
export interface LearnedLines {
  readonly timetable: string
  readonly learned: string
  readonly changed: string
}

export function learnedLines(timetable: { rows: readonly TimetableRow[] } | { unread: string }, learned: { lessons: readonly LessonRead[] } | { unread: string }): LearnedLines {
  const rows = 'rows' in timetable ? timetable.rows : null
  const count = (state: TimetableRow['state']) => (rows ?? []).filter((r) => r.state === state).length
  const earlier = (rows ?? []).filter((r) => r.dayBefore !== null)
  const timetableLine = rows
    ? `${count('done')} of ${rows.length} phases done, ${count('running')} running, ${count('late')} late, ${count('not yet')} not yet due; ${earlier.length} planned earlier because of yesterday.`
    : `not read: ${'unread' in timetable ? timetable.unread : ''}`
  const lessons = 'lessons' in learned ? learned.lessons : null
  const learnedLine = lessons
    ? lessons.length === 0
      ? 'no lesson was recorded yesterday.'
      : `${lessons.length} lesson${lessons.length === 1 ? '' : 's'}: ${lessons.slice(0, 3).map((l) => l.wentWrong).join(' | ')}${lessons.length > 3 ? ` | and ${lessons.length - 3} more on /admin/today` : ''}`
    : `not read: ${'unread' in learned ? learned.unread : ''}`
  const changedLine = rows
    ? earlier.length === 0
      ? 'every phase ran in time yesterday, so none starts earlier today.'
      : earlier.map((r) => r.dayBefore?.nowDoes ?? '').join(' | ')
    : 'not read with the timetable.'
  return { timetable: timetableLine, learned: learnedLine, changed: changedLine }
}
