import { describe, expect, it } from 'vitest'
import { buildDailyTwenty, NO_NIGHT_TO_NAME, withoutANightToName, type DailyCandidate } from '@/lib/outreach/daily-twenty'

/*
 * A PLACE IN THE TWENTY IS A LETTER THAT CAN BE WRITTEN (12 November 2026): every first message in Lawal's format names
 * the organiser's next night on EventLinqs, so a conversion organiser with none listed leaves the twenty, with the reason,
 * for research or a social first touch, and the next organiser with a night takes the place.
 */
const candidate = (id: string, score: number, nightless = false, socialHandle: string | null = null): DailyCandidate => {
  const contact = { channel: 'email', address: `${id}@example.com.au`, eligible: true, refusal: null }
  return {
    organiserId: id,
    organiserName: id,
    group: 'conversion',
    score,
    city: 'melbourne',
    why: 'test',
    contact: nightless ? withoutANightToName(contact) : contact,
    socialHandle,
  }
}

describe('the twenty counts only organisers whose letter can be written', () => {
  it('a contact with no night to name is not written to, and says why', () => {
    expect(withoutANightToName({ channel: 'email', address: 'a@b.com.au', eligible: true, refusal: null })).toEqual({
      channel: 'email',
      address: 'a@b.com.au',
      eligible: false,
      refusal: NO_NIGHT_TO_NAME,
    })
    expect(withoutANightToName(null)).toBeNull()
  })

  it('nightless organisers, however high their score, leave the places to those with a night', () => {
    const top = Array.from({ length: 20 }, (_, i) => candidate(`nightless-${i}`, 100 - i, true))
    const below = [candidate('murphys', 40), candidate('where-you-meet', 39), candidate('fbbg', 38)]
    const day = buildDailyTwenty([...top, ...below])
    const placed = day.groups.flatMap((g) => g.actions.map((a) => a.organiserId))
    expect(placed).toEqual(['murphys', 'where-you-meet', 'fbbg'])
    expect(day.research).toHaveLength(20)
    expect(day.research.every((r) => r.because === NO_NIGHT_TO_NAME)).toBe(true)
  })

  it('one with an Instagram handle becomes a social first touch with the same reason', () => {
    const day = buildDailyTwenty([candidate('venue', 90, true, '@venue')])
    expect(day.socialFirstTouches).toEqual([{ organiserId: 'venue', organiserName: 'venue', handle: '@venue', because: NO_NIGHT_TO_NAME }])
  })
})
