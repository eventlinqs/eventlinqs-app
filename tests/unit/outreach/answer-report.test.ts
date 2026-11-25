import { describe, expect, it } from 'vitest'
import { answerTimingLine, isReportWeekday } from '@/lib/outreach/answer-report'
import { morningReportEmail } from '@/lib/admin/morning-report-email'

/*
 * HOW FAST WE ANSWERED, WEEKLY (the PM's 15:10 item 5 of 25 November 2026: "A weekly line in the 08:00 report: median
 * and slowest answer time per class, share on target, reply and yes rates"; 15:18 item 3: nothing of this lives only in
 * an order file). Red before: the report carried no answer times at all.
 */
describe("the week's answer timing line", () => {
  it('per class: how many, the median, the slowest and how many on target; then the reply and yes rates', () => {
    const line = answerTimingLine({
      answers: [
        { klass: 'sale', minutes: 52 },
        { klass: 'sale', minutes: 58.4 },
        { klass: 'sale', minutes: 74 },
        { klass: 'letter', minutes: 65 },
        { klass: 'letter', minutes: 131 },
      ],
      letters: 20,
      replies: 4,
      yeses: 2,
    })
    expect(line).toBe(
      'a sale: 3 answered, median 58 min, slowest 74 min, 2 of 3 within 60 min; ' +
        'a reply to our letter: 2 answered, median 98 min, slowest 131 min, 1 of 2 within 120 min; ' +
        'general: none answered. Replies to our letters: 4 to 20 first letters (20%), yes 2 (10%).',
    )
  })
  it('a week with no letters says so, never a rate of nothing', () => {
    expect(answerTimingLine({ answers: [], letters: 0, replies: 0, yeses: 0 })).toBe(
      'a sale: none answered; a reply to our letter: none answered; general: none answered. Replies to our letters: 0 to 0 first letters (none sent), yes 0 (none sent).',
    )
  })
  it('goes on Mondays in Melbourne', () => {
    expect(isReportWeekday(new Date('2026-11-29T21:00:00Z'))).toBe(true) // Monday 30 November, 08:00
    expect(isReportWeekday(new Date('2026-11-25T21:00:00Z'))).toBe(false) // Thursday 26 November, 08:00
  })
  it('the 08:00 report carries it when given, and not otherwise', () => {
    const report = { allWell: true, rows: [], unreadable: [] } as never
    const withIt = morningReportEmail(report, { dateWords: 'Monday 30 November', adminUrl: 'https://www.eventlinqs.com.au/admin/today', answers: 'a sale: none answered' })
    expect(withIt.text).toContain('How fast we answered last week: a sale: none answered')
    expect(withIt.html).toContain('<strong>How fast we answered last week:</strong> a sale: none answered')
    expect(morningReportEmail(report, { dateWords: 'Thursday 26 November', adminUrl: 'https://www.eventlinqs.com.au/admin/today' }).text).not.toContain('How fast we answered')
  })
})
