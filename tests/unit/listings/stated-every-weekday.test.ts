import { describe, expect, it } from 'vitest'
import { statedEveryWeekday } from '@/lib/listings/stated-words'

/*
 * THE CONTROLLER's 17:05 BAR, Gallery Tots (geelonggallery.org.au/events/gallery-tots/, read 7 November 2026 through the
 * polite reader, C:\dev\EVIDENCE\ENGINE-P0\readers-62\gallery-tots.txt): under its title, 'Every Friday, 9.30 to 10.15am',
 * then 'No sessions from Friday 18 December 2026 to Friday 22 January 2027'. A person reads every Friday at 9.30 am, outside
 * the break. Every reader the sweep had missed it: the am is written once, after the range's end.
 */
const ZONE = 'Australia/Melbourne'
const TOTS = `<main><h1>Gallery Tots</h1><p>Every Friday, 9.30 to 10.15am</p>
<p>No sessions from Friday 18 December 2026 to Friday 22 January 2027</p>
<p>Introduce your little one to the wonderful world of art through stories, conversation and creative play.</p></main>`

describe('every weekday under its title', () => {
  it('reads Friday 20 November at 9.30 am (the range\'s am is the start\'s too)', () => {
    expect(statedEveryWeekday(TOTS, 'Gallery Tots', '2026-11-19T22:30:00Z', ZONE)).toBe('weekly')
  })
  it('a Friday inside the stated break is a wrong fact, never a pass', () => {
    // Friday 8 January 2027, 9.30 am
    expect(statedEveryWeekday(TOTS, 'Gallery Tots', '2027-01-07T22:30:00Z', ZONE)).toBe('in_break')
  })
  it('the range\'s end is never the start, and another weekday is not stated', () => {
    expect(statedEveryWeekday(TOTS, 'Gallery Tots', '2026-11-19T23:15:00Z', ZONE)).toBe(null)
    // Thursday 19 November, 9.30 am
    expect(statedEveryWeekday(TOTS, 'Gallery Tots', '2026-11-18T22:30:00Z', ZONE)).toBe(null)
  })
  it('says nothing for a title the page does not head', () => {
    expect(statedEveryWeekday(TOTS, 'Gallery Late', '2026-11-19T22:30:00Z', ZONE)).toBe(null)
  })
})
