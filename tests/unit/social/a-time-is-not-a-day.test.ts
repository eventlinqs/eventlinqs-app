import { describe, expect, it } from 'vitest'
import { pastDaysPrinted, printsADayOver } from '@/lib/social/piece-quality'

/*
 * A CLOCK TIME IS NOT A DAY (the PM's 22:50 of 28 November 2026, fix (b); C:\dev\EVIDENCE\EL-28NOV\incident\V2-sat-7.md).
 * The studio's Melbourne weekend piece printed "SAT 7.30pm Michael Charles ..." for that night, Sat 28 Nov at 7.30pm, and
 * the publish gate held it at 07:15 that Saturday: "It prints "SAT 7", a day already over". The weekday regex read the
 * time's 7 as the 7th, and Sat 7 November is a Saturday. Red on main: "SAT 7" was returned.
 */
const SATURDAY_0715 = new Date('2026-11-27T20:15:00.000Z') // Sat 28 Nov 2026, 07:15 in Melbourne

describe('a day already over, and a time on the day it posts', () => {
  it('reads a weekday followed by a clock time as a time', () => {
    expect(pastDaysPrinted(['SAT 7.30pm Michael Charles "Where to Next? 2026 international tour, Bird\'s Basement'], SATURDAY_0715)).toEqual([])
    expect(pastDaysPrinted(['Sun 7:30 Rhys Nicholson'], SATURDAY_0715)).toEqual([])
    expect(pastDaysPrinted(['Sun 8 pm J Cole'], SATURDAY_0715)).toEqual([])
  })

  it('still says a day already over', () => {
    expect(pastDaysPrinted(['📅 Fri 20 Nov, 7pm'], SATURDAY_0715)).toEqual(['[night] It prints "Fri 20", a day already over; draw it again for the day it posts.', '[night] It prints "20 Nov", a day already over; draw it again for the day it posts.'])
    expect(pastDaysPrinted(['Sat 7 Nov'], SATURDAY_0715)).not.toEqual([])
    expect(pastDaysPrinted(['Fri 20. Then home.'], SATURDAY_0715)).not.toEqual([])
    expect(pastDaysPrinted(['Sat 28 and Sun 29 Nov, 9am to 4pm'], SATURDAY_0715)).toEqual([])
  })

  it('knows its own reason among the others', () => {
    const [reason] = pastDaysPrinted(['📅 Fri 20, 7pm'], SATURDAY_0715)
    expect(printsADayOver(reason)).toBe(true)
    expect(printsADayOver('[night] Its words say it is on now, but it opens at 7pm')).toBe(false)
  })
})
