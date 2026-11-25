import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { messagesPerContactLine } from '@/lib/outreach/frequency-report'
import { morningReportEmail } from '@/lib/admin/morning-report-email'
import type { MorningReport } from '@/lib/admin/morning-report'

/*
 * THE 08:00 REPORT COUNTS MESSAGES PER CONTACT PER WEEK (the PM's 00:02 of 26 November 2026, item A; Lawal's 00:01:
 * "better than just bombarding the user with too many emails"): src/lib/outreach/frequency-report.ts, every morning.
 */

describe('messages per contact, the last seven days', () => {
  it('how many contacts, how many once, twice and more, and the businesses written to most, by name', () => {
    const line = messagesPerContactLine([
      { contactId: 'a', business: 'Stage 29 Studios' },
      { contactId: 'a', business: 'Stage 29 Studios' },
      { contactId: 'b', business: 'Bendigo Region' },
      { contactId: 'c', business: 'Festival Indonesia' },
      { contactId: 'c', business: 'Festival Indonesia' },
      { contactId: 'c', business: 'Festival Indonesia' },
      { contactId: 'd', business: null },
    ])
    expect(line).toBe('7 sent to 4 contacts: 2 once, 1 twice, 1 three times or more; most: Festival Indonesia 3, Stage 29 Studios 2.')
  })

  it('every contact once names nobody; a quiet week says so, never a calm zero line', () => {
    expect(messagesPerContactLine([{ contactId: 'a', business: 'A' }])).toBe('1 sent to 1 contact: 1 once, 0 twice, 0 three times or more.')
    expect(messagesPerContactLine([])).toBe('no messages sent in the last 7 days.')
  })
})

describe('in the 08:00 report, every morning', () => {
  const report: MorningReport = { allWell: true, rows: [], unreadable: [] } as unknown as MorningReport
  const when = { dateWords: 'Thursday 26 November', adminUrl: 'https://www.eventlinqs.com.au/admin/today' }

  it('the line in the text and the html when read; nothing added when it is not passed', () => {
    const withIt = morningReportEmail(report, { ...when, perContact: '3 sent to 3 contacts: 3 once, 0 twice, 0 three times or more.' })
    expect(withIt.text).toContain('Messages per contact, last 7 days: 3 sent to 3 contacts: 3 once')
    expect(withIt.html).toContain('<strong>Messages per contact, last 7 days:</strong> 3 sent to 3 contacts')
    expect(morningReportEmail(report, when).text).not.toContain('Messages per contact')
  })

  it('the daily cron reads it every morning, and a failed read is named in the line', () => {
    const route = readFileSync('src/app/api/cron/health-heartbeat/route.ts', 'utf8')
    expect(route).toMatch(/const perContact = await readMessagesPerContact\(db, now\)\.catch\(\(err: unknown\) => `not read: /)
    expect(route).toMatch(/answers, perContact(, floor)? \}\)/)
  })
})
