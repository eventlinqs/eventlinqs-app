import type { MorningReport } from './morning-report'
import type { LearnedLines } from '@/lib/ops/learned-lines'

/**
 * THE 08:00 REPORT AS AN EMAIL, SENT BY VERCEL'S OWN DAILY CRON (the PM's 22:14 of 19 November 2026, item 4; the
 * mandate's section 14; law 25's names). Read on GitHub at 23:55 that night: the state report's 'the daily state' job,
 * which carried this report, ran on its 20:50 UTC schedule not once from 6 to 18 November ('the daily state=skipped' on
 * every evening run, each started by the hourly stall schedule), because GitHub's scheduler is best effort. Vercel's
 * cron /api/cron/health-heartbeat runs daily at 21:00 UTC, 08:00 in Melbourne, and already emails Lawal; this is the
 * report it sends beside the heartbeat, from the same production reads as /api/ops/state (./morning-report.ts).
 * Each of the seven areas, in law 25's order and names, says what happened yesterday and what stands today; an area
 * whose read failed says so and never prints a calm zero. Pure.
 */
export function morningReportEmail(
  report: MorningReport,
  when: {
    readonly dateWords: string
    readonly adminUrl: string
    readonly learned?: LearnedLines
    /** Mondays: how fast we answered last week, by class (src/lib/outreach/answer-report.ts; the PM's 15:10 item 5). */
    readonly answers?: string
    /** Every morning: messages per contact in the last seven days (src/lib/outreach/frequency-report.ts; the PM's 00:02 of 26 November 2026, item A). */
    readonly perContact?: string
    /** Every morning: yesterday's first letters against law 38's floor, and the cause when under it (src/lib/outreach/first-letter-floor.ts). */
    readonly floor?: string
  },
): { subject: string; text: string; html: string } {
  const headline = report.allWell ? 'every area working, nothing waiting for you' : 'what needs your eye is first in each area below'
  // Each check's saved copy and Stop, on the admin's own origin (adminUrl is the report's own page, /admin/today).
  const checkUrl = (id: string) => `${new URL('/admin/page-checks', when.adminUrl).toString()}?view=${id}#copy`
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const text = [
    `Good morning Lawal,`,
    '',
    `EventLinqs, ${when.dateWords}: ${headline}.`,
    '',
    ...report.rows.flatMap((r, i) => [`${i + 1}. ${r.area}`, `   Yesterday: ${r.yesterday}`, `   Today: ${r.today}`, '']),
    ...(report.unreadable.length > 0 ? [`Not read this morning: ${report.unreadable.join(', ')}.`, ''] : []),
    ...(report.engine ? [`The engine: ${report.engine}`, ''] : []),
    // LAW 43: every organiser page the engine checked, each with its saved copy and its Stop.
    ...((report.pageChecks ?? []).length > 0
      ? [
          `Pages the engine checked before a first letter (open one to see the saved copy, or stop it):`,
          ...(report.pageChecks ?? []).map((c) => `   ${c.organiser || 'An organiser'}: ${c.pageUrl}${c.stopped ? ' (stopped)' : ''} ${checkUrl(c.id)}`),
          '',
        ]
      : []),
    // What the engine learned, from production (Lawal's 06:07 of 20 November 2026): the timetable, yesterday's lessons, today's changes.
    ...(when.learned ? [`Today's timetable: ${when.learned.timetable}`, `Learned yesterday: ${when.learned.learned}`, `Changed today because of it: ${when.learned.changed}`, ''] : []),
    ...(when.answers ? [`How fast we answered last week: ${when.answers}`, ''] : []),
    ...(when.floor ? [`First letters: ${when.floor}`, ''] : []),
    ...(when.perContact ? [`Messages per contact, last 7 days: ${when.perContact}`, ''] : []),
    `Everything above is read from production at the time of sending. The admin: ${when.adminUrl}`,
  ].join('\n')
  const rowsHtml = report.rows
    .map(
      (r, i) =>
        `<tr><td style="vertical-align:top;padding:8px 6px;font-weight:600">${i + 1}. ${escape(r.area)}</td>` +
        `<td style="vertical-align:top;padding:8px 6px"><strong>Yesterday:</strong> ${escape(r.yesterday)}<br/><strong>Today:</strong> ${escape(r.today)}</td></tr>`,
    )
    .join('')
  const html =
    `<div style="max-width:100%;overflow-wrap:break-word">` +
    `<p>Good morning Lawal,</p>` +
    `<p><strong>EventLinqs, ${escape(when.dateWords)}:</strong> ${escape(headline)}.</p>` +
    `<table cellpadding="0" style="width:100%;max-width:100%;table-layout:fixed;border-collapse:collapse">${rowsHtml}</table>` +
    (report.unreadable.length > 0 ? `<p>Not read this morning: ${escape(report.unreadable.join(', '))}.</p>` : '') +
    (report.engine ? `<p>The engine: ${escape(report.engine)}</p>` : '') +
    ((report.pageChecks ?? []).length > 0
      ? `<p><strong>Pages the engine checked before a first letter</strong> (open one to see the saved copy, or stop it):</p><ul>` +
        (report.pageChecks ?? [])
          .map((c) => `<li>${escape(c.organiser || 'An organiser')}: ${escape(c.pageUrl)}${c.stopped ? ' (stopped)' : ''} <a href="${checkUrl(c.id)}">Saved copy and Stop</a></li>`)
          .join('') +
        `</ul>`
      : '') +
    (when.learned
      ? `<p><strong>Today's timetable:</strong> ${escape(when.learned.timetable)}<br/><strong>Learned yesterday:</strong> ${escape(when.learned.learned)}<br/><strong>Changed today because of it:</strong> ${escape(when.learned.changed)}</p>`
      : '') +
    (when.answers ? `<p><strong>How fast we answered last week:</strong> ${escape(when.answers)}</p>` : '') +
    (when.floor ? `<p><strong>First letters:</strong> ${escape(when.floor)}</p>` : '') +
    (when.perContact ? `<p><strong>Messages per contact, last 7 days:</strong> ${escape(when.perContact)}</p>` : '') +
    `<p style="color:#666">Everything above is read from production at the time of sending. <a href="${when.adminUrl}">The admin</a></p>` +
    `</div>`
  return { subject: `EventLinqs 08:00 report, ${when.dateWords}: ${report.allWell ? 'all well' : 'needs your eye'}`, text, html }
}

/** The day in words in Melbourne, as Lawal reads it: 'Friday 20 November'. Pure. */
export function melbourneDateWords(now: Date): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'long', day: 'numeric', month: 'long' }).format(now).replace(',', '')
}
