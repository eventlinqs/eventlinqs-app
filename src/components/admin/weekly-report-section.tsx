import { CRM_STAGE_WORDS } from '@/lib/crm/stages'
import { proofWords, type WeeklyReport } from '@/lib/growth/weekly-report-math'

/**
 * THE WEEKLY REPORT ON /admin/growth (order 4, Release 3, item 10; INTERNAL ONLY, admin only, never shown to anyone
 * else). What moved organisers along Lawal's line last week and what proved each move (the acceptance test: which
 * activities produce activated organisers), how far the line converts to date, the tasks past due and every failed job.
 * The ticketing stages and sales are the six numbers above it (src/lib/growth/six-numbers.ts), proved by transactions.
 * A failed read says which read failed, never a zero. Search Console waits on Lawal's step and says so.
 */

const share = (part: number, whole: number) => (whole === 0 ? 'none yet' : `${Math.round((part / whole) * 100)} percent`)

const SECTION = 'mb-8 rounded-xl border border-white/[0.08] bg-[#131A2A] p-6'
const HEAD = 'font-display text-lg font-semibold text-white'
const SUB = 'mt-5 font-display text-sm font-semibold uppercase tracking-[0.12em] text-white/50'
const ROW = 'mt-2 text-sm text-white'
const QUIET = 'mt-2 text-sm text-white/60'

export function WeeklyReportSection({ report }: { report: { ok: true; value: WeeklyReport } | { ok: false; why: string } }) {
  if (!report.ok) {
    return (
      <section data-section="weekly-report" className={SECTION}>
        <h2 className={HEAD}>The weekly report</h2>
        <p data-report-failed className={QUIET}>
          The weekly report could not be read: {report.why}. Nothing below it is affected; it reads again on the next load.
        </p>
      </section>
    )
  }
  const r = report.value
  return (
    <section data-section="weekly-report" className={SECTION}>
      <h2 className={HEAD}>The weekly report</h2>
      <p className="mt-2 max-w-2xl text-sm text-white/60">
        What moved organisers along the line last week and what proved each move, how far the line converts to date, and
        what is late or failed. Sales and activated organisers are the six numbers, counted from transactions.
      </p>

      <h3 className={SUB}>Moved on last week</h3>
      {r.moved.length === 0 ? (
        <p data-moved="none" className={QUIET}>No organiser moved forward along the line last week.</p>
      ) : (
        <ul data-moved className="mt-1">
          {r.moved.map((m) => (
            <li key={m.stage} data-stage={m.stage} className={ROW}>
              <span className="font-semibold">{CRM_STAGE_WORDS[m.stage]}</span>: {m.organisers} {m.organisers === 1 ? 'organiser' : 'organisers'}, proved
              by {m.provedBy.map((p) => `${proofWords(p.by)} (${p.moves})`).join(', ')}
            </li>
          ))}
        </ul>
      )}
      <p data-left-the-line className={QUIET}>
        Left the line last week (opted out, not interested, unresponsive or a removal asked): {r.leftTheLine}.
      </p>

      <h3 className={SUB}>Conversion to date</h3>
      <ul data-conversion className="mt-1">
        {r.conversion.map((s) => (
          <li key={s.from} className={ROW}>
            {CRM_STAGE_WORDS[s.from]} to {CRM_STAGE_WORDS[s.to]}: {s.reachedTo} of {s.reachedFrom} ({share(s.reachedTo, s.reachedFrom)})
          </li>
        ))}
      </ul>

      <h3 className={SUB}>Tasks past due</h3>
      {r.overdueTasks.length === 0 ? (
        <p data-overdue="none" className={QUIET}>None.</p>
      ) : (
        <ul data-overdue className="mt-1">
          {r.overdueTasks.map((t, i) => (
            <li key={`${t.title}-${i}`} className={ROW}>
              {t.title} <span className="text-white/60">(due {t.dueAt})</span>
            </li>
          ))}
        </ul>
      )}

      <h3 className={SUB}>Failed jobs</h3>
      {r.failedJobs.length === 0 ? (
        <p data-failed="none" className={QUIET}>None.</p>
      ) : (
        <ul data-failed className="mt-1">
          {r.failedJobs.map((t, i) => (
            <li key={`${t.title}-${i}`} className={ROW}>
              {t.title}
              {t.failureReason ? <span className="text-white/60">: {t.failureReason}</span> : null}
            </li>
          ))}
        </ul>
      )}

      <h3 className={SUB}>Google Search</h3>
      <p data-search-console="not-connected" className={QUIET}>
        Google&apos;s own search figures wait on Search Console access, one of Lawal&apos;s steps. Organic visits counted by
        the platform itself are in the six numbers.
      </p>
    </section>
  )
}
