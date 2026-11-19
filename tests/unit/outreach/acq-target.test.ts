import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ACQ_DAILY_TARGET, ACQ_GUIDE_CITIES, shortfallWords } from '@/lib/outreach/acq-target'

/*
 * THE DAY'S SHORTFALL, SAID (Lawal's 09:01 of 20 November 2026, item 5: "if fewer qualify, the shortfall is reported and
 * discovery continues"). On 20 November the pool was seven and the day's queue was empty from 18 November on, and the
 * 08:00 report said only 'No first letters queued for today.'
 */
describe('the 08:00 report says the day against twenty', () => {
  it('holds law 24 and the four guide cities', () => {
    expect(ACQ_DAILY_TARGET).toBe(20)
    expect(ACQ_GUIDE_CITIES).toEqual(['melbourne', 'geelong', 'ballarat', 'bendigo'])
  })
  it('says the shortfall and the pool when the day is short', () => {
    expect(shortfallWords(0, 7, true)).toBe('No first letters queued, 20 short of twenty; the pool holds 7 organisers with a recorded basis not yet written; discovery goes on.')
    expect(shortfallWords(7, 0, true)).toBe('7 first letters ready to go, 13 short of twenty; the pool holds 0 organisers with a recorded basis not yet written; discovery goes on.')
    expect(shortfallWords(1, 1, true)).toBe('1 first letter ready to go, 19 short of twenty; the pool holds 1 organiser with a recorded basis not yet written; discovery goes on.')
  })
  it('never prints a zero for a pool it could not read', () => {
    expect(shortfallWords(0, null, true)).toContain('the pool could not be read')
  })
  it('says the twenty met, and nothing is due on a weekend', () => {
    expect(shortfallWords(20, 3, true)).toBe("20 first letters ready to go, the day's twenty met.")
    expect(shortfallWords(0, 7, false)).toBe('Not a business day: no first letters are due.')
  })
  it('the report reads the pool from production and words the row with it', () => {
    const report = readFileSync('src/lib/admin/morning-report.ts', 'utf8')
    expect(report).toContain('const pool = await readAcqPool(db, now)')
    expect(report).toContain('poolToday: pool, businessDay:')
    const math = readFileSync('src/lib/admin/morning-report-math.ts', 'utf8')
    expect(math).toContain('today: shortfallWords(f.marketing.readyToday, f.marketing.poolToday ?? null, f.marketing.businessDay ?? true)')
  })
})
