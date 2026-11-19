import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { runAllChecks, overallStatus } from '@/lib/health/checks'
import { sendHeartbeat } from '@/lib/health/runner'
import { readMorningReport } from '@/lib/admin/morning-report'
import { melbourneDateWords, morningReportEmail } from '@/lib/admin/morning-report-email'
import { sendEmail } from '@/lib/email/send'
import { founderDestination } from '@/lib/env/destinations'
import { getSiteUrl } from '@/lib/site-url'
import { recordPhaseRun } from '@/lib/ops/phase-runs'
import { readTimetable } from '@/lib/ops/timetable-read'
import { readLessons, recordLesson } from '@/lib/ops/lessons'
import { learnedLines } from '@/lib/ops/learned-lines'
import { melbourneMinutes, type PhaseKey } from '@/lib/ops/timetable'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * DAILY HEARTBEAT (docs/ops/HEALTH-ALERTS.md).
 *
 * One short daily email confirming all systems green (or listing any warnings),
 * so silence is never ambiguous: a MISSING heartbeat itself signals the monitor
 * is down. Cron-authed. `?dry=1` runs the checks without sending the email.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  const dry = request.nextUrl.searchParams.get('dry') === '1'
  const results = await runAllChecks()
  const status = overallStatus(results)

  let sent = false
  if (!dry) {
    try {
      await sendHeartbeat(results)
      sent = true
    } catch (err) {
      console.error('[health-heartbeat] send failed:', err)
    }
  }

  // THE 08:00 REPORT, SENT HERE (the PM's 22:14 of 19 November 2026, item 4; src/lib/admin/morning-report-email.ts):
  // this cron runs daily at 08:00 Melbourne on Vercel's own scheduler, where GitHub's never started the state report's
  // daily job from 6 to 18 November. A failed read or send is named in the answer and the log, never thrown.
  let report: 'sent' | 'dry' | string = 'dry'
  if (!dry) {
    const now = new Date()
    try {
      const read = await readMorningReport(now)
      // THE ENGINE LEARNS INSIDE ITSELF (Lawal's 06:07 of 20 November 2026, through the PM's 06:10): its own morning
      // check records each phase that was late, failed or silent yesterday as a lesson, once (keyed by day and phase),
      // dated to yesterday's end so it reads as yesterday's; then the report carries the timetable, yesterday's lessons
      // and today's changes, all read from production. A lesson that cannot be written is said and never stops the report.
      const db = createAdminClient()
      const timetable = await readTimetable(db, now).catch((err: unknown) => ({ unread: err instanceof Error ? err.message : String(err) }))
      const midnight = now.getTime() - melbourneMinutes(now) * 60_000
      const yesterdayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(new Date(midnight - 12 * 60 * 60_000))
      if ('rows' in timetable) {
        for (const r of timetable.rows) {
          if (!r.dayBefore) continue
          const kept = await recordLesson(db, {
            learnedAt: new Date(midnight - 60_000),
            phase: r.phase.key as PhaseKey,
            wentWrong: r.dayBefore.wentWrong,
            cause: r.dayBefore.cause,
            nowDoes: r.dayBefore.nowDoes,
            heldBy: 'src/lib/ops/lessons.ts lessonFromYesterday, read on /admin/today and in this report',
            evidence: `ops_phase_runs, phase ${r.phase.key}, ${yesterdayKey}`,
            source: 'engine',
            sourceKey: `engine:${yesterdayKey}:${r.phase.key}`,
          })
          if (typeof kept === 'object') console.error(`[health-heartbeat] the lesson for ${r.phase.key} was not recorded: ${kept.failed}`)
        }
      }
      const learned = await readLessons(db, new Date(midnight - 24 * 60 * 60_000), new Date(midnight)).catch((err: unknown) => ({ unread: err instanceof Error ? err.message : String(err) }))
      const email = morningReportEmail(read, { dateWords: melbourneDateWords(now), adminUrl: `${getSiteUrl()}/admin/today`, learned: learnedLines(timetable, learned) })
      await sendEmail({ to: founderDestination(), ...email, messageType: 'platform_morning_report', recipientRole: 'platform_owner' })
      report = 'sent'
    } catch (err) {
      report = `not sent: ${err instanceof Error ? err.message : String(err)}`
      console.error('[health-heartbeat] the 08:00 report was not sent:', err)
    }
    // THE TIMETABLE'S REPORT PHASE, MEASURED (src/lib/ops/phase-runs.ts): seven areas, sent or why not.
    await recordPhaseRun(createAdminClient(), { phase: 'report', ride: 'heartbeat', startedAt: now, endedAt: new Date(), units: 7, result: `the morning report ${report}`, failed: report !== 'sent' })
  }

  return NextResponse.json({ ok: status !== 'critical', status, sent, report, dry, checkedAt: new Date().toISOString(), checks: results })
}
