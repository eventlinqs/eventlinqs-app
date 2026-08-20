/**
 * THE REPORTED DEFECT, 18 August 2026: a GEELONG venue rendered
 * "Timezone: Australia/Sydney".
 *
 * Same offset today, wrong label, and outright wrong the day a Perth or Brisbane
 * organiser signs up. The cause was that the form seeded the event's zone from
 * the BROWSER, and Windows carries one setting for the whole eastern seaboard
 * which resolves to Australia/Sydney. The browser was being asked where the
 * EVENT is, and it only knows where the ORGANISER is.
 */
import { describe, expect, it } from 'vitest'
import { AUSTRALIAN_ZONES, timezoneForVenue } from '@/lib/dates/venue-timezone'
import { formatEventDateTime, fromZonedInputValue } from '@/lib/dates/event-time'

describe('the reported case', () => {
  it('a Geelong venue is Melbourne, not Sydney', () => {
    expect(timezoneForVenue({ city: 'Geelong', state: 'VIC' })).toBe('Australia/Melbourne')
    expect(timezoneForVenue({ city: 'Geelong', state: null })).toBe('Australia/Melbourne')
  })

  it('the live production row would now resolve correctly', () => {
    // The exact venue fields read off production for the blocked event.
    expect(timezoneForVenue({ city: 'Geelong', state: 'VIC' })).not.toBe('Australia/Sydney')
  })
})

describe('every state and territory', () => {
  const cases: Array<[string, string]> = [
    ['NSW', 'Australia/Sydney'],
    ['ACT', 'Australia/Sydney'],
    ['VIC', 'Australia/Melbourne'],
    ['QLD', 'Australia/Brisbane'],
    ['SA', 'Australia/Adelaide'],
    ['WA', 'Australia/Perth'],
    ['TAS', 'Australia/Hobart'],
    ['NT', 'Australia/Darwin'],
  ]

  for (const [state, zone] of cases) {
    it(`${state} resolves to ${zone}`, () => {
      expect(timezoneForVenue({ state })).toBe(zone)
      expect(timezoneForVenue({ state: state.toLowerCase() })).toBe(zone)
    })
  }

  it('accepts a full state name, because humans type Victoria not VIC', () => {
    expect(timezoneForVenue({ state: 'Victoria' })).toBe('Australia/Melbourne')
    expect(timezoneForVenue({ state: 'Western Australia' })).toBe('Australia/Perth')
    expect(timezoneForVenue({ state: 'queensland' })).toBe('Australia/Brisbane')
  })
})

describe('it refuses to guess', () => {
  it('returns null when the venue does not determine a zone', () => {
    expect(timezoneForVenue({})).toBeNull()
    expect(timezoneForVenue({ city: 'Nowhere In Particular', state: '' })).toBeNull()
    expect(timezoneForVenue({ state: 'ZZ' })).toBeNull()
  })

  it('never silently answers Sydney, which is the defect it replaces', () => {
    // A defaulting resolver would have made the Geelong bug unfixable, because
    // every unknown address would keep producing the wrong confident answer.
    expect(timezoneForVenue({ city: 'Unknown Town' })).toBeNull()
  })
})

describe('the zones actually differ, so the label carries meaning', () => {
  it('a Perth and a Sydney event at the same wall clock are different instants', () => {
    const perth = fromZonedInputValue('2026-10-15T19:00', timezoneForVenue({ state: 'WA' })!)
    const sydney = fromZonedInputValue('2026-10-15T19:00', timezoneForVenue({ state: 'NSW' })!)
    expect(perth).not.toBe(sydney)
  })

  it('Brisbane and Sydney diverge once daylight saving starts, which is the real trap', () => {
    // In September they share an offset; in October they do not. A Brisbane event
    // stored as Sydney is an hour wrong for half the year and correct for the
    // other half, which is exactly how it survives review.
    const sept = fromZonedInputValue('2026-09-01T19:00', 'Australia/Brisbane')
    const septSyd = fromZonedInputValue('2026-09-01T19:00', 'Australia/Sydney')
    expect(sept).toBe(septSyd)

    const oct = fromZonedInputValue('2026-10-15T19:00', 'Australia/Brisbane')
    const octSyd = fromZonedInputValue('2026-10-15T19:00', 'Australia/Sydney')
    expect(oct).not.toBe(octSyd)
    expect(new Date(oct).getTime() - new Date(octSyd).getTime()).toBe(60 * 60 * 1000)
  })

  it('a Brisbane event reads 7:00 pm in Brisbane even in October', () => {
    const stored = fromZonedInputValue('2026-10-15T19:00', 'Australia/Brisbane')
    expect(formatEventDateTime(stored, 'Australia/Brisbane')).toContain('7:00 pm')
    // Mislabelled as Sydney it would read 8:00 pm, and the buyer arrives an hour late.
    expect(formatEventDateTime(stored, 'Australia/Sydney')).toContain('8:00 pm')
  })
})

describe('the exported zone list', () => {
  it('covers all eight states and territories with no duplicates', () => {
    expect(AUSTRALIAN_ZONES).toEqual([
      'Australia/Adelaide',
      'Australia/Brisbane',
      'Australia/Darwin',
      'Australia/Hobart',
      'Australia/Melbourne',
      'Australia/Perth',
      'Australia/Sydney',
    ])
  })

  it('every listed zone is one Intl actually accepts', () => {
    for (const zone of AUSTRALIAN_ZONES) {
      expect(() => new Intl.DateTimeFormat('en-AU', { timeZone: zone }).format(new Date())).not.toThrow()
    }
  })
})
