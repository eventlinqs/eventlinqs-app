// THE ENGINE LEARNS INSIDE ITSELF (Lawal, 20 November 2026, 06:07, through the PM's 06:10): every lesson a row of
// ops_lessons; a phase late, failed or silent the day before starts earlier today and says why; /admin/today and the 08:00
// report read the timetable, yesterday's lessons and today's changes from production (src/lib/ops/lessons.ts,
// src/lib/ops/learned-lines.ts, src/lib/admin/morning-report-email.ts).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { lessonFromYesterday, lessonRow, type LessonRead } from '@/lib/ops/lessons'
import { learnedLines } from '@/lib/ops/learned-lines'
import { phaseOf } from '@/lib/ops/timetable'
import { morningReportEmail } from '@/lib/admin/morning-report-email'
import type { TimetableRow } from '@/lib/ops/timetable-read'

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

describe("a phase's day before, as a lesson the engine acts on", () => {
  it('late: planned earlier today by as many minutes as it was late, at least fifteen, and said so', () => {
    const late = lessonFromYesterday(phaseOf('verify'), { endedMinutes: minutes('05:02'), failed: false, result: 'ok' }, false)
    expect(late?.shiftMinutes).toBe(22)
    expect(late?.wentWrong).toBe('Verify ended 22 minute(s) after its 04:40 cutoff yesterday.')
    expect(late?.nowDoes).toBe('Verify is planned 22 minutes earlier today.')
    expect(lessonFromYesterday(phaseOf('verify'), { endedMinutes: minutes('04:45'), failed: false, result: 'ok' }, false)?.shiftMinutes).toBe(15)
  })

  it('failed: planned fifteen minutes earlier, its own words kept as what went wrong', () => {
    const failed = lessonFromYesterday(phaseOf('collect'), { endedMinutes: minutes('03:12'), failed: true, result: '1171 nights, 0 made, 8 failed' }, false)
    expect(failed?.shiftMinutes).toBe(15)
    expect(failed?.wentWrong).toBe('Collect failed yesterday: 1171 nights, 0 made, 8 failed')
    expect(failed?.cause).toContain('recorded itself as failed')
  })

  it('silent: no run can start earlier, so it is named until a run records it; never for the inbox, nor a business-day phase at a weekend', () => {
    const silent = lessonFromYesterday(phaseOf('verify'), null, false)
    expect(silent?.shiftMinutes).toBe(0)
    expect(silent?.wentWrong).toBe('Verify recorded no run yesterday (04:20 to 04:40).')
    expect(lessonFromYesterday(phaseOf('inbox'), null, false)).toBeNull()
    expect(lessonFromYesterday(phaseOf('send'), null, true)).toBeNull()
    expect(lessonFromYesterday(phaseOf('send'), null, false)).not.toBeNull()
  })

  it('on time: no lesson and no change', () => {
    expect(lessonFromYesterday(phaseOf('verify'), { endedMinutes: minutes('04:31'), failed: false, result: 'ok' }, false)).toBeNull()
  })
})

describe('the lesson row', () => {
  it('keeps every text inside its column, and an empty cause as none', () => {
    const row = lessonRow({
      learnedAt: new Date('2026-11-19T12:59:00Z'),
      phase: 'verify',
      wentWrong: 'x'.repeat(2500),
      cause: '  ',
      nowDoes: 'Verify is planned 15 minutes earlier today.',
      heldBy: null,
      evidence: 'ops_phase_runs',
      source: 'engine',
      sourceKey: 'engine:2026-11-19:verify',
    })
    expect(String(row.went_wrong).length).toBeLessThanOrEqual(2000)
    expect(row.cause).toBeNull()
    expect(row.source_key).toBe('engine:2026-11-19:verify')
  })
})

const row = (key: string, state: TimetableRow['state'], dayBefore: TimetableRow['dayBefore'] = null): TimetableRow =>
  ({ phase: phaseOf(key), state, units: null, endedAt: null, result: null, plannedStartMinutes: 0, dayBefore }) as TimetableRow
const lesson = (wentWrong: string): LessonRead => ({ learnedAt: '2026-11-19T12:00:00Z', phase: null, wentWrong, nowDoes: 'now', heldBy: null, source: 'learned_log' })

describe('the three lines of the 08:00 report, from production', () => {
  it("says the timetable, yesterday's lessons and what changed today", () => {
    const lines = learnedLines(
      { rows: [row('collect', 'done'), row('verify', 'late', { shiftMinutes: 20, wentWrong: 'Verify ended 20 minute(s) late.', cause: 'c', nowDoes: 'Verify is planned 20 minutes earlier today.' }), row('live', 'not yet')] },
      { lessons: [lesson('The founder sentence went out in a letter.'), lesson('A credit line was printed under a photograph.')] },
    )
    expect(lines.timetable).toBe('1 of 3 phases done, 0 running, 1 late, 1 not yet due; 1 planned earlier because of yesterday.')
    expect(lines.learned).toBe('2 lessons: The founder sentence went out in a letter. | A credit line was printed under a photograph.')
    expect(lines.changed).toBe('Verify is planned 20 minutes earlier today.')
  })

  it('a read that failed is said in its line, never a calm one', () => {
    const lines = learnedLines({ unread: 'the timetable could not be read: x' }, { unread: 'what the engine learned could not be read: y' })
    expect(lines.timetable).toContain('not read')
    expect(lines.learned).toContain('not read')
  })

  it('the report email carries the three lines in its text and its html', () => {
    const email = morningReportEmail(
      { rows: [], allWell: true, unreadable: [], engine: '' },
      { dateWords: 'Saturday 21 November', adminUrl: 'https://www.eventlinqs.com.au/admin/today', learned: { timetable: 'T line', learned: 'L line', changed: 'C line' } },
    )
    for (const part of [email.text, email.html]) {
      expect(part).toContain('T line')
      expect(part).toContain('L line')
      expect(part).toContain('C line')
    }
  })

  it("the morning run records yesterday's engine lessons once each, before it sends the report", () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/cron/health-heartbeat/route.ts'), 'utf8')
    expect(route).toContain('sourceKey: `engine:${yesterdayKey}:${r.phase.key}`')
    expect(route.indexOf('recordLesson(')).toBeLessThan(route.indexOf('morningReportEmail('))
    expect(route).toContain('learned: learnedLines(timetable, learned)')
  })

  it("the report's own phase row carries the provider's id of the sent report (T10), so production's record proves it", () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/cron/health-heartbeat/route.ts'), 'utf8')
    expect(route).toMatch(/const sentReport = await sendEmail\(\{ to: founderDestination\(\), \.\.\.email, messageType: 'platform_morning_report'/)
    expect(route).toContain('reportId = sentReport.id')
    expect(route.indexOf('reportId = sentReport.id')).toBeLessThan(route.indexOf("report = 'sent'"))
    expect(route).toContain("result: `the morning report ${report}${reportId ? `, Resend id ${reportId}` : ''}`")
  })
})
