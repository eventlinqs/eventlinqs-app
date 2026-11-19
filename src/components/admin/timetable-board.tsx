import { plannedStartWords, type TimetableRow } from '@/lib/ops/timetable-read'

/**
 * THE DAY'S TIMETABLE ON /admin/today (the daily timetable, locked 20 November 2026, item 4): each phase in the locked
 * order with its slot and cutoff, its state (done, running, late or not yet), its count and end time, and the start the
 * engine worked back from its cutoff. Server rendered; it writes nothing.
 */
const STATE_WORDS = { done: 'Done', running: 'Running', late: 'Late', 'not yet': 'Not yet' } as const
const STATE_TONE = {
  done: 'text-[var(--admin-ink)]',
  running: 'text-[var(--admin-ink)]',
  // The admin's own fault colour (text-red-800, used across the admin), never a new one.
  late: 'font-semibold text-red-800',
  'not yet': 'text-[var(--admin-muted)]',
} as const

function endWords(iso: string | null): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
}

export function TimetableBoard({ read }: { read: { rows: TimetableRow[] } | { unread: string } }) {
  return (
    <section data-section="timetable" aria-label="Today's timetable" className="mb-8 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-4 sm:p-6">
      <h2 className="font-display text-[11px] uppercase tracking-[0.18em] text-[var(--admin-muted)]">Today&apos;s timetable</h2>
      {'unread' in read ? (
        <p className="mt-3 text-sm text-[var(--admin-ink)]">{read.unread}</p>
      ) : (
        <ol className="mt-3 divide-y divide-[var(--admin-line)]">
          {read.rows.map((r) => (
            <li key={r.phase.key} data-phase={r.phase.key} data-state={r.state} className="grid grid-cols-1 gap-1 py-2 text-sm sm:grid-cols-[7rem_minmax(0,1fr)_7rem] sm:items-baseline sm:gap-3">
              <span className="font-medium text-[var(--admin-ink)]">
                {r.phase.nightBefore ? `${r.phase.slot} (night before)` : r.phase.slot}
              </span>
              <span className="text-[var(--admin-soft)]">
                <span className="font-medium text-[var(--admin-ink)]">{r.phase.label}</span>, done by {r.phase.cutoff}
                {r.units !== null ? `: ${r.units} ${r.units === 1 ? r.phase.unit : `${r.phase.unit}s`}${r.endedAt ? `, ended ${endWords(r.endedAt)}` : ''}` : ''}
                <span className="block text-xs text-[var(--admin-muted)]">Starts by {plannedStartWords(r)} on measured times{r.result ? `. ${r.result}` : ''}</span>
                {r.dayBefore ? (
                  <span className="block text-xs text-[var(--admin-ink)]">
                    Learned yesterday: {r.dayBefore.wentWrong} {r.dayBefore.nowDoes}
                  </span>
                ) : null}
              </span>
              <span className={STATE_TONE[r.state]}>{STATE_WORDS[r.state]}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
