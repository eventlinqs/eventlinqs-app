import { describe, expect, test } from 'vitest'
import { POST_KINDS, postKindOf } from '@/lib/social/post-kind'

/*
 * THE POST KIND, EXPLICIT (the PM's 01:02 item 2 of 25 November 2026; the playbook's sections 3a and 4): every piece
 * carries its kind in the playbook's words, the goal that kind is for and the measure it is judged by.
 */
const KINDS = ['week_ahead', 'discovery_reel', 'weekend_carousel', 'venue_spotlight', 'organiser_campaign', 'partner_kit', 'brand_campaign', 'daily_poster', 'tonight_tomorrow', 'category_spotlight', 'coming_up', 'free_week', 'tonight', 'creative'] as const

describe('every piece has its post kind, its goal and its measure', () => {
  test('each kind the engine draws, on the feed', () => {
    const got = Object.fromEntries(KINDS.map((k) => [k, postKindOf({ kind: k, format: 'feed' }).kind]))
    expect(got).toMatchObject({ week_ahead: 'city', weekend_carousel: 'city', coming_up: 'event', daily_poster: 'event', organiser_campaign: 'organiser', venue_spotlight: 'organiser', discovery_reel: 'reel' })
    for (const k of KINDS) expect(['city', 'event', 'organiser', 'reel', 'story']).toContain(got[k])
  })
  test('a story is a story, whatever it shows', () => {
    for (const k of KINDS) expect(postKindOf({ kind: k, format: 'story' }).kind).toBe('story')
  })
  test("each kind's goal and measure, the feed's judged by the 72 hour bar, each short enough for a piece's outcome", () => {
    for (const p of Object.values(POST_KINDS)) {
      expect(p.goal.length).toBeGreaterThan(10)
      expect(p.measure.length).toBeLessThanOrEqual(200)
    }
    for (const k of ['city', 'event', 'organiser', 'reel'] as const) expect(POST_KINDS[k].measure).toContain('within 72 hours')
  })
})

test("the playbook holds the carousel's rule and the post kind's (the PM's 01:12 item 4: each rule a playbook rule)", async () => {
  const { PLAYBOOK } = await import('@/lib/social/playbook')
  const ids = PLAYBOOK.map((r) => r.id)
  expect(ids).toEqual(expect.arrayContaining(['city-carousel-weekly', 'post-kind-explicit']))
})
