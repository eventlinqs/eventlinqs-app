import { describe, expect, test } from 'vitest'
import {
  AFTER_YOUR_NIGHT_DUE_DAYS,
  AFTER_YOUR_NIGHT_STALE_DAYS,
  ANYTHING_COMING_UP_DAYS,
  afterYourNightFields,
  afterYourNightRefusal,
  anythingComingUpRefusal,
  type PartnerState,
} from '@/lib/outreach/planner'

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

/* Message 8, AFTER YOUR NIGHT (the PM's messages file: "2 days after; counted figures only ... clicks never called
   sales"; the PM's 16:28: each once, held on a missing field). Its figures are window 5's organiser_night_reports. */

const ended = new Date('2026-10-25T12:00:00Z')
const figures = { viewers: 42, pressesOut: { people: 9, bySite: [] }, ownLink: { arrivals: 3 } }

describe('message 8, after your night', () => {
  test('due two days after the night ended, and not before', () => {
    expect(afterYourNightRefusal(ended, new Date(ended.getTime() + 2 * day))).toBeNull()
    expect(afterYourNightRefusal(ended, new Date(ended.getTime() + 2 * day - 60_000))).toMatch(/two days/)
  })

  test('a report a week old or more is not sent late', () => {
    expect(afterYourNightRefusal(ended, new Date(ended.getTime() + AFTER_YOUR_NIGHT_STALE_DAYS * day))).toMatch(/late/)
    expect([AFTER_YOUR_NIGHT_DUE_DAYS, AFTER_YOUR_NIGHT_STALE_DAYS]).toEqual([2, 7])
  })

  test('the counted figures fill the message: views, people sent on, own-link arrivals', () => {
    expect(afterYourNightFields(figures, 'Trivia at Bonnibel')).toEqual({ night: 'Trivia at Bonnibel', gig: 'night', views: '42', clicks: '9', 'share clicks': '3' })
  })

  test('no own link is a missing field, so the message is held, never a false zero', () => {
    expect(afterYourNightFields({ ...figures, ownLink: null }, 'Trivia at Bonnibel')['share clicks']).toBeNull()
  })

  test('figures that are not the shape window 5 writes fill nothing', () => {
    expect(afterYourNightFields({}, 'Trivia at Bonnibel')).toMatchObject({ views: null, clicks: null, 'share clicks': null })
  })
})
