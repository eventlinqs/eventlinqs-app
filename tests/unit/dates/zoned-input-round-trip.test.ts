/**
 * WHAT AN ORGANISER TYPES IS WHAT A BUYER READS, IN THE EVENT'S OWN ZONE.
 *
 * THE DEFECT THIS PINS, 18 August 2026. An organiser typed 12:00 pm on
 * 1 September and the page rendered 2:00 am. Exactly one Australian eastern
 * offset, in the wrong direction. A second event, 15 October, entered at 7:00 pm,
 * rendered 7:00 pm correctly. The INCONSISTENCY was the finding.
 *
 * The cause was a round trip through `new Date(...)` on a zoneless
 * datetime-local string, which ECMAScript reads as the RUNTIME's local time. The
 * stored UTC instant was sliced straight into the input, and the input was
 * converted back with the BROWSER's offset. A create was accidentally right when
 * the browser zone matched the event zone; every EDIT shifted the event one
 * offset earlier, each time it was saved. The 15 October event was never edited.
 *
 * The two events straddle 4 October 2026, when Australia/Sydney moves from
 * UTC+10 (AEST) to UTC+11 (AEDT), so both sides of that boundary are tested. A
 * fixed-offset implementation passes one half of this file and fails the other.
 */
import { describe, expect, it } from 'vitest'
import {
  formatEventDateTime,
  fromZonedInputValue,
  toZonedInputValue,
} from '@/lib/dates/event-time'

const SYD = 'Australia/Sydney'
const MEL = 'Australia/Melbourne'
const PER = 'Australia/Perth'
const BNE = 'Australia/Brisbane'

describe('the reported times, reproduced exactly', () => {
  it('1 September 12:00 pm stays 12:00 pm and never becomes 2:00 am', () => {
    // AEST side of the boundary, UTC+10.
    const stored = fromZonedInputValue('2026-09-01T12:00', SYD)
    expect(stored).toBe('2026-09-01T02:00:00.000Z')
    expect(toZonedInputValue(stored, SYD)).toBe('2026-09-01T12:00')
    expect(formatEventDateTime(stored, SYD)).toContain('12:00 pm')
  })

  it('15 October 7:00 pm stays 7:00 pm, which already worked and must keep working', () => {
    // AEDT side of the boundary, UTC+11. This is the live production value.
    const stored = fromZonedInputValue('2026-10-15T19:00', SYD)
    expect(stored).toBe('2026-10-15T08:00:00.000Z')
    expect(formatEventDateTime(stored, SYD)).toContain('7:00 pm')
  })

  it('the two reported events use DIFFERENT offsets, which is why one broke alone', () => {
    const sept = new Date(fromZonedInputValue('2026-09-01T12:00', SYD))
    const oct = new Date(fromZonedInputValue('2026-10-15T12:00', SYD))
    // 12:00 local on either side of the transition is a different UTC instant.
    expect(sept.getUTCHours()).toBe(2) // UTC+10
    expect(oct.getUTCHours()).toBe(1) // UTC+11
  })
})

describe('the edit round trip, which is where the shift accumulated', () => {
  /**
   * The precise failure: load an event into the form, save it unchanged, and the
   * time must not move. It used to move one offset EVERY time.
   */
  const cases: Array<[string, string, string]> = [
    ['AEST, before the transition', SYD, '2026-09-01T12:00'],
    ['AEDT, after the transition', SYD, '2026-10-15T19:00'],
    ['the day before the transition', SYD, '2026-10-03T23:30'],
    ['the day after the transition', SYD, '2026-10-05T00:30'],
    ['Melbourne, same offsets as Sydney', MEL, '2026-09-01T12:00'],
    ['Perth, which has no daylight saving at all', PER, '2026-10-15T19:00'],
    ['Brisbane, which also has none', BNE, '2026-10-15T19:00'],
  ]

  for (const [label, zone, typed] of cases) {
    it(`${label}: saving an unchanged form does not move the time`, () => {
      let stored = fromZonedInputValue(typed, zone)
      // Ten consecutive opens and saves. One offset per save is what the defect
      // did, so ten saves under the old code moved the event by ten offsets.
      for (let i = 0; i < 10; i += 1) {
        const shown = toZonedInputValue(stored, zone)
        expect(shown).toBe(typed)
        stored = fromZonedInputValue(shown, zone)
      }
      expect(toZonedInputValue(stored, zone)).toBe(typed)
    })
  }
})

describe('the zone that decides is the EVENT\'s, never the reader\'s', () => {
  it('the same wall clock in different zones is a different instant', () => {
    const syd = fromZonedInputValue('2026-10-15T19:00', SYD)
    const per = fromZonedInputValue('2026-10-15T19:00', PER)
    expect(syd).not.toBe(per)
    // Perth is UTC+8 year round; Sydney is UTC+11 in October. Three hours apart.
    expect(new Date(per).getTime() - new Date(syd).getTime()).toBe(3 * 60 * 60 * 1000)
  })

  it('a Perth event reads 7:00 pm to every reader, in its own zone', () => {
    const stored = fromZonedInputValue('2026-10-15T19:00', PER)
    expect(formatEventDateTime(stored, PER)).toContain('7:00 pm')
    // And the SAME instant is a different wall clock in Sydney, which is the
    // whole reason the event carries a zone.
    expect(formatEventDateTime(stored, SYD)).toContain('10:00 pm')
  })
})

describe('the transition itself, where a fixed offset silently fails', () => {
  it('crosses 4 October 2026 without drift', () => {
    // 2am does not exist on the transition day; the clock jumps 2am to 3am.
    // What must never happen is a silent shift of an ordinary evening either side.
    const before = fromZonedInputValue('2026-10-03T20:00', SYD)
    const after = fromZonedInputValue('2026-10-04T20:00', SYD)
    expect(toZonedInputValue(before, SYD)).toBe('2026-10-03T20:00')
    expect(toZonedInputValue(after, SYD)).toBe('2026-10-04T20:00')
    // Consecutive evenings across the change are 23 hours apart, not 24.
    expect(new Date(after).getTime() - new Date(before).getTime()).toBe(23 * 60 * 60 * 1000)
  })

  it('crosses the April 2027 return to AEST without drift', () => {
    const before = fromZonedInputValue('2027-04-03T20:00', SYD)
    const after = fromZonedInputValue('2027-04-04T20:00', SYD)
    expect(toZonedInputValue(before, SYD)).toBe('2027-04-03T20:00')
    expect(toZonedInputValue(after, SYD)).toBe('2027-04-04T20:00')
    expect(new Date(after).getTime() - new Date(before).getTime()).toBe(25 * 60 * 60 * 1000)
  })
})

describe('malformed input does not take a page down', () => {
  it('returns empty rather than throwing', () => {
    expect(fromZonedInputValue('not a date', SYD)).toBe('')
    expect(toZonedInputValue('not a date', SYD)).toBe('')
  })
})
