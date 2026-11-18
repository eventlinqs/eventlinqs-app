import { describe, expect, it } from 'vitest'
import { nightNamedBy } from '@/lib/listings/photo-permission-math'

/*
 * THE NIGHT THE LETTER NAMES OPENS ALREADY CHOSEN (the PM's 13:50 of 18 November 2026, item 1 (d)). The Event Photo
 * Permissions letter's subject is "Helping more people find <night> on <day> <month>"; the page reads it from the
 * letter sent and chooses that night among the organiser's own, so the 14 letters need no change.
 */
const nights = [
  { eventId: 'e-lates', title: 'Working It Out', startDate: '2026-11-30T09:00:00Z', timezone: 'Australia/Melbourne' },
  { eventId: 'e-named', title: 'Working It Out', startDate: '2026-11-23T09:00:00Z', timezone: 'Australia/Melbourne' },
  { eventId: 'e-other', title: 'Holly Hebe', startDate: '2026-11-21T09:00:00Z', timezone: 'Australia/Melbourne' },
]

describe('the night the letter names', () => {
  it('chooses the night with that title on that day, in its own time zone', () => {
    expect(nightNamedBy('Helping more people find Working It Out on 23 November', nights)).toBe('e-named')
    expect(nightNamedBy('Helping more people find Holly Hebe on 21 November', nights)).toBe('e-other')
  })

  it('a night late in the evening is read on its own local day, not UTC', () => {
    const late = [{ eventId: 'e-late', title: 'Late Show', startDate: '2026-11-21T13:30:00Z', timezone: 'Australia/Melbourne' }]
    expect(nightNamedBy('Helping more people find Late Show on 22 November', late)).toBe('e-late')
  })

  it('a title alone chooses only when one night carries it; anything else chooses nothing', () => {
    expect(nightNamedBy('Helping more people find Holly Hebe on 9 December', nights)).toBe('e-other')
    expect(nightNamedBy('Helping more people find Working It Out on 9 December', nights)).toBeNull()
    expect(nightNamedBy('Complimentary EventLinqs listing for Aunty Jacks', nights)).toBeNull()
    expect(nightNamedBy(null, nights)).toBeNull()
  })
})
