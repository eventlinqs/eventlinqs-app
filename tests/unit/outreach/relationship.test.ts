import { describe, expect, test } from 'vitest'
import { ANYTHING_COMING_UP_DAYS, anythingComingUpRefusal, type PartnerState } from '@/lib/outreach/planner'

/* Message 9, ANYTHING COMING UP (the PM's messages file: "partner, nothing listed in the next 30 days"; the engine plan's
   FULL AUTOMATION: it sends on its trigger without Lawal). Window 6, 29 October 2026. */
const now = new Date('2026-10-29T06:00:00Z')
const day = 86_400_000
const partner = (over: Partial<PartnerState> = {}): PartnerState => ({
  organiserId: 'o1',
  contactId: 'c1',
  venueIds: ['v1'],
  upcomingNights: 0,
  lastAskedAt: null,
  ...over,
})

describe('message 9, anything coming up', () => {
  test('due: a partner who runs a venue, has nothing listed in the next 30 days, never asked', () => {
    expect(anythingComingUpRefusal(partner(), now)).toBeNull()
  })

  test('not while a night is listed in the next 30 days', () => {
    expect(anythingComingUpRefusal(partner({ upcomingNights: 1 }), now)).toMatch(/1 night listed/)
  })

  test('not twice within 30 days, and again after', () => {
    expect(anythingComingUpRefusal(partner({ lastAskedAt: new Date(now.getTime() - 29 * day) }), now)).toMatch(/asked on/)
    expect(anythingComingUpRefusal(partner({ lastAskedAt: new Date(now.getTime() - ANYTHING_COMING_UP_DAYS * day) }), now)).toBeNull()
  })

  test('not for a partner with no venue: the message names one', () => {
    expect(anythingComingUpRefusal(partner({ venueIds: [] }), now)).toMatch(/no venue/)
  })

  test('the window is the plan\'s 30 days', () => {
    expect(ANYTHING_COMING_UP_DAYS).toBe(30)
  })
})
