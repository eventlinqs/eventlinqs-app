import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { BUSINESS_AREAS } from '@/lib/admin/morning-report-math'
import { melbourneDateWords, morningReportEmail } from '@/lib/admin/morning-report-email'
import { messageTypeDeclaration } from '@/lib/notifications/recipient-matrix'

/*
 * THE 08:00 REPORT, SENT BY VERCEL'S DAILY CRON (the PM's 22:14 of 19 November 2026, item 4). GitHub never started the
 * state report's daily job on its schedule from 6 to 18 November; /api/cron/health-heartbeat runs at 08:00 Melbourne.
 */
const rows = BUSINESS_AREAS.map((area, i) => ({ area, yesterday: `y${i}`, today: `t${i}` }))
const WHEN = { dateWords: 'Friday 20 November', adminUrl: 'https://www.eventlinqs.com.au/admin/today' }

describe('the email', () => {
  test("the seven areas in law 25's order, each yesterday and today", () => {
    const e = morningReportEmail({ rows, allWell: true, unreadable: [], engine: '' }, WHEN)
    const order = BUSINESS_AREAS.map((a) => e.text.indexOf(a))
    expect(order.every((x) => x >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(e.text).toContain('1. Organiser Marketing\n   Yesterday: y0\n   Today: t0')
    expect(e.subject).toBe('EventLinqs 08:00 report, Friday 20 November: all well')
  })

  test('an area whose read failed is named, and the subject asks for his eye', () => {
    const e = morningReportEmail({ rows, allWell: false, unreadable: ['Ticketing & Revenue'], engine: 'NOT READY' }, WHEN)
    expect(e.text).toContain('Not read this morning: Ticketing & Revenue.')
    expect(e.html).toContain('Ticketing &amp; Revenue')
    expect(e.text).toContain('The engine: NOT READY')
    expect(e.subject).toMatch(/needs your eye$/)
  })

  test('no dash of any kind and no exclamation mark in what Lawal reads', () => {
    const e = morningReportEmail({ rows, allWell: true, unreadable: [], engine: '' }, WHEN)
    expect(`${e.subject}\n${e.text}`).not.toMatch(/[–—!]| - /)
  })

  test("the day in Melbourne's words: 21:00 UTC on 19 November is Friday 20 November there", () => {
    expect(melbourneDateWords(new Date('2026-11-19T21:00:00Z'))).toBe('Friday 20 November')
  })
})

describe('the cron sends it', () => {
  test('the heartbeat cron sends it to Lawal as its own declared type', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/cron/health-heartbeat/route.ts'), 'utf8')
    expect(route).toMatch(/sendEmail\(\{ to: founderDestination\(\), \.\.\.email, messageType: 'platform_morning_report', recipientRole: 'platform_owner' \}\)/)
    expect(messageTypeDeclaration('platform_morning_report').roles).toEqual(['platform_owner'])
    const vercel = readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')
    expect(vercel).toMatch(/"path": "\/api\/cron\/health-heartbeat",\s*"schedule": "0 21 \* \* \*"/)
  })
})
