import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DIGEST_CRON, SEND_HOURS, sendMoment } from '@/lib/newsletter/send-time'

/*
 * LAW 45 (a): THE WEEK on Wednesday at 07:00 and THE WEEKEND on Friday at 07:00, Melbourne time, whatever the daylight
 * saving offset. Vercel runs crons in UTC only (https://vercel.com/docs/schedules/cron-jobs, read 21 November 2026), so
 * the schedule fires on the hour from 20:00 to 23:00 UTC on Tuesday and Thursday and the route judges Melbourne's clock.
 * Until 21 November 2026 vercel.json read '0 22 * * 3': Wednesday 22:00 UTC, Thursday 09:00 in Melbourne.
 */
const at = (iso: string) => new Date(iso)

describe("the edition is the clock's: Wednesday and Friday from 07:00 in Melbourne", () => {
  it('in daylight saving (UTC+11): 20:00 UTC Tuesday is Wednesday 07:00, THE WEEK; 20:00 UTC Thursday is Friday 07:00, THE WEEKEND', () => {
    expect(sendMoment(at('2026-11-24T20:00:00Z'))).toEqual({ edition: 'week', day: 'Wed', hour: 7 })
    expect(sendMoment(at('2026-11-26T20:00:00Z'))).toEqual({ edition: 'weekend', day: 'Fri', hour: 7 })
  })

  it('out of daylight saving (UTC+10, April): 20:00 UTC Tuesday is 06:00, not yet; 21:00 UTC is 07:00, THE WEEK', () => {
    // Daylight saving ends in Victoria on Sunday 4 April 2027 at 03:00.
    expect(sendMoment(at('2027-04-06T20:00:00Z')).edition).toBeNull()
    expect(sendMoment(at('2027-04-06T20:00:00Z')).hour).toBe(6)
    expect(sendMoment(at('2027-04-06T21:00:00Z'))).toEqual({ edition: 'week', day: 'Wed', hour: 7 })
  })

  it('across the October change: the week before is UTC+10 (21:00 UTC is 07:00), the week after UTC+11 (20:00 UTC is 07:00)', () => {
    // Daylight saving starts in Victoria on Sunday 3 October 2027 at 02:00.
    expect(sendMoment(at('2027-09-28T21:00:00Z'))).toEqual({ edition: 'week', day: 'Wed', hour: 7 })
    expect(sendMoment(at('2027-10-05T20:00:00Z'))).toEqual({ edition: 'week', day: 'Wed', hour: 7 })
  })

  it('no other day and no hour outside the morning sends', () => {
    expect(sendMoment(at('2026-11-25T22:00:00Z')).edition).toBeNull() // Thursday 09:00, the old send time
    expect(sendMoment(at('2026-11-25T00:00:00Z')).edition).toBeNull() // Wednesday 11:00
    expect(sendMoment(at('2026-11-24T19:00:00Z')).edition).toBeNull() // Wednesday 06:00
    expect(sendMoment(at('2026-11-21T20:00:00Z')).edition).toBeNull() // Sunday 07:00
  })

  it('every Wednesday and Friday of a year, in either offset, the first firing of the schedule that may send is 07:00', () => {
    const hours = [20, 21, 22, 23]
    let checked = 0
    for (let d = Date.parse('2026-11-01T00:00:00Z'); d < Date.parse('2027-12-31T00:00:00Z'); d += 86_400_000) {
      const day = new Date(d)
      if (day.getUTCDay() !== 2 && day.getUTCDay() !== 4) continue
      const firings = hours.map((h) => sendMoment(new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h))))
      const first = firings.find((m) => m.edition !== null)
      expect(first?.hour).toBe(SEND_HOURS.first)
      expect(first?.edition).toBe(day.getUTCDay() === 2 ? 'week' : 'weekend')
      checked += 1
    }
    expect(checked).toBeGreaterThan(100)
  })
})

describe("vercel.json fires the digest on the rule's schedule", () => {
  it('one entry for /api/cron/weekly-digest, its schedule DIGEST_CRON, Tuesday and Thursday from 20:00 to 23:00 UTC', () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as { crons: { path: string; schedule: string }[] }
    const digest = vercel.crons.filter((c) => c.path === '/api/cron/weekly-digest')
    expect(digest).toEqual([{ path: '/api/cron/weekly-digest', schedule: DIGEST_CRON }])
    expect(DIGEST_CRON).toBe('0 20-23 * * 2,4')
  })
})
