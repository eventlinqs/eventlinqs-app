import { describe, expect, it } from 'vitest'
import { statedDailyInRange } from '@/lib/listings/stated-words'

/*
 * THE CONTROLLER's 17:05 BAR, the Geelong caravan show (caravanshow.com.au/shows/geelong-leisurefest/, read 7 November 2026
 * through the polite reader, C:\dev\EVIDENCE\ENGINE-P0\readers-62\caravanshow.txt): '20th November - 22nd November 2026:',
 * '9am - 4pm - Fri - Sun'. Ours: Friday, Saturday and Sunday at 9 am. The ends of the range read by date; the middle day,
 * Saturday 21, is named only by the range, which a person reads in one look.
 */
const ZONE = 'Australia/Melbourne'
const SHOW = `<main><p>20 - 22 November, 2026</p><p>20th November - 22nd November 2026:</p><p>9am - 4pm - Fri - Sun</p>
<p>Friday 20th - Sunday 22nd November 2026 | Geelong Showgrounds</p></main>`

describe('a daily time over a stated range of dates', () => {
  it('reads the middle day, Saturday 21 November at 9 am', () => {
    expect(statedDailyInRange(SHOW, '2026-11-20T22:00:00Z', ZONE)).toBe(true)
  })
  it('reads every day of the range, and never a day outside it', () => {
    expect(statedDailyInRange(SHOW, '2026-11-19T22:00:00Z', ZONE)).toBe(true)
    expect(statedDailyInRange(SHOW, '2026-11-21T22:00:00Z', ZONE)).toBe(true)
    expect(statedDailyInRange(SHOW, '2026-11-22T22:00:00Z', ZONE)).toBe(false)
  })
  it('the closing time is never the start, and a weekday outside the stated days is never read', () => {
    expect(statedDailyInRange(SHOW, '2026-11-21T05:00:00Z', ZONE)).toBe(false)
    const weekdays = SHOW.replace('9am - 4pm - Fri - Sun', '9am - 4pm - Fri - Sat')
    expect(statedDailyInRange(weekdays, '2026-11-21T22:00:00Z', ZONE)).toBe(false)
  })
})
