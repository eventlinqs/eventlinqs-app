import { describe, expect, test } from 'vitest'
import {
  AFTER_YOUR_NIGHT_DUE_DAYS,
  AFTER_YOUR_NIGHT_STALE_DAYS,
  ANYTHING_COMING_UP_DAYS,
  afterYourNightFields,
  afterYourNightRefusal,
  featuredFields,
  kitImages,
  anythingComingUpRefusal,
  type PartnerState,
  withdrawalConfirmationRefusal,
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

/* Message 7, YOU'RE FEATURED (the PM's messages file; the engine plan's part G: "kit sent to the organiser when their
   post goes out"; the PM's 16:28: each once, held on a missing field). */
describe('message 7, you\'re featured', () => {
  const kit = { title: 'Trivia at Bonnibel', cityName: 'Melbourne', wentOutAt: new Date('2026-10-29T08:00:00Z'), caption: 'Trivia at Bonnibel, featured on EventLinqs this week.', link: 'https://www.eventlinqs.com.au/e/abc123' }

  test('the kit fills the message: the night, the city, the day the post went out in Melbourne, the caption, their own link', () => {
    expect(featuredFields({ ...kit, images: { feed: 'https://x/feed.png', story: 'https://x/story.png' } })).toEqual({
      night: 'Trivia at Bonnibel',
      city: 'Melbourne',
      day: 'Thursday',
      caption: 'Trivia at Bonnibel, featured on EventLinqs this week.',
      'tracked link': 'https://www.eventlinqs.com.au/e/abc123',
      'feed image': 'https://x/feed.png',
      'story version': 'https://x/story.png',
    })
  })

  test('the day is Melbourne\'s: late on Wednesday in UTC is Thursday morning there', () => {
    expect(featuredFields({ ...kit, wentOutAt: new Date('2026-10-28T22:30:00Z'), images: null }).day).toBe('Thursday')
  })

  test('with no public image address the image fields stay empty, so the message is held for Lawal', () => {
    const f = featuredFields({ ...kit, images: null })
    expect([f['feed image'], f['story version']]).toEqual([null, null])
  })
})

describe('message 7 with window 3\'s public kit route (/kit/<piece>/<n>)', () => {
  const kit = { title: 'Trivia at Bonnibel', cityName: 'Melbourne', wentOutAt: new Date('2026-10-29T08:00:00Z'), caption: 'c', link: 'https://www.eventlinqs.com.au/e/abc123' }

  test('a partner kit is a story, so its story fills and the feed image stays empty: held on that one field, never a story passed off as a feed post', () => {
    const f = featuredFields({ ...kit, images: kitImages('https://www.eventlinqs.com.au/', 'piece-1') })
    expect(f['story version']).toBe('https://www.eventlinqs.com.au/kit/piece-1/1')
    expect(f['feed image']).toBeNull()
  })
})

/* Message 10, WITHDRAWAL CONFIRMED (the PM's messages file; the project manager's 21:42: "message 10 on the removal
   path"). Its words promise two facts, so it is drafted only when both are true. */
describe('message 10, withdrawal confirmed', () => {
  test('due when no unposted piece and no listing cover still shows a withdrawn image', () => {
    expect(withdrawalConfirmationRefusal({ unpostedShowing: 0, coversShowing: 0 })).toBeNull()
  })
  test('not while an unposted piece still shows one ("your images are off every post that has not gone out yet")', () => {
    expect(withdrawalConfirmationRefusal({ unpostedShowing: 2, coversShowing: 0 })).toMatch(/2 unposted piece/)
  })
  test('not while a listing cover still shows one ("your listing now uses our standard design")', () => {
    expect(withdrawalConfirmationRefusal({ unpostedShowing: 0, coversShowing: 1 })).toMatch(/1 listing cover/)
  })
})
