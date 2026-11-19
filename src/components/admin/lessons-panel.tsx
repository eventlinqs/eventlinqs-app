import type { LessonRead } from '@/lib/ops/lessons'
import type { TimetableRow } from '@/lib/ops/timetable-read'

/**
 * WHAT THE ENGINE LEARNED, BESIDE THE DAY'S TIMETABLE (Lawal, 20 November 2026, 06:07, through the PM's 06:10, item 3):
 * yesterday's lessons from ops_lessons on production, and what changed today because of them (each phase planned earlier
 * for its day before, and what each lesson now has the engine do). Server rendered; it writes nothing. A read that fails
 * says so; it never shows a calm panel.
 */
export function LessonsPanel({
  learned,
  timetable,
}: {
  learned: { lessons: LessonRead[] } | { unread: string }
  timetable: { rows: TimetableRow[] } | { unread: string }
}) {
  const changedToday = 'rows' in timetable ? timetable.rows.filter((r) => r.dayBefore !== null) : []
  return (
    <section data-section="lessons" aria-label="What the engine learned" className="mb-8 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-4 sm:p-6">
      <h2 className="font-display text-[11px] uppercase tracking-[0.18em] text-[var(--admin-muted)]">What the engine learned yesterday</h2>
      {'unread' in learned ? (
        <p className="mt-3 text-sm text-[var(--admin-ink)]">{learned.unread}</p>
      ) : learned.lessons.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--admin-soft)]">No lesson was recorded yesterday.</p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--admin-line)]">
          {learned.lessons.map((l) => (
            <li key={`${l.learnedAt}-${l.wentWrong.slice(0, 40)}`} data-source={l.source} className="py-2 text-sm">
              <span className="block font-medium text-[var(--admin-ink)]">{l.wentWrong}</span>
              <span className="block text-[var(--admin-soft)]">Now: {l.nowDoes}</span>
              {l.heldBy ? <span className="block text-xs text-[var(--admin-muted)]">Held by {l.heldBy}</span> : null}
            </li>
          ))}
        </ul>
      )}
      <h2 className="mt-6 font-display text-[11px] uppercase tracking-[0.18em] text-[var(--admin-muted)]">What changed today because of it</h2>
      {'unread' in timetable ? (
        <p className="mt-3 text-sm text-[var(--admin-ink)]">{timetable.unread}</p>
      ) : changedToday.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--admin-soft)]">Every phase ran in time yesterday, so none starts earlier today.</p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--admin-line)]">
          {changedToday.map((r) => (
            <li key={r.phase.key} data-phase={r.phase.key} className="py-2 text-sm text-[var(--admin-ink)]">
              {r.dayBefore?.nowDoes}
              <span className="block text-xs text-[var(--admin-muted)]">Because {r.dayBefore?.wentWrong}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
