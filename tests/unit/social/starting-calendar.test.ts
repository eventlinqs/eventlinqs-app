import { describe, expect, it } from 'vitest'
import { scheduleMoments, STARTING_CALENDAR, withStartingCalendar, type CadenceRule } from '@/lib/social/cadence'

/*
 * THE STARTING CALENDAR (Lawal's 14:07 of 15 November 2026: the week's calendar from the research, as defaults the daily
 * review tunes; the PM's 09:10 of 16 November 2026: the week's plan must fit the week). Until our own posts teach the
 * hours, a starting rule with no slots opens the researched bands; a learned rule, or a rule with its own slots, is
 * never touched.
 */
const starting = (over: Partial<CadenceRule> = {}): CadenceRule => ({ version: 1, gapHours: 12, slots: [], basis: 'starting', learnedFrom: 0, floorPosts: 12, settleHours: 48, setAt: new Date('2026-10-27T00:00:00Z'), ...over })
// Wednesday 28 October 2026, 9 pm in Melbourne (daylight saving, UTC+11).
const NOW = new Date('2026-10-28T10:00:00Z')

describe('the starting calendar', () => {
  it('is feed every day at 9 am and 9 pm, exactly the 12 hour floor apart, and stories every day from 6 pm', () => {
    expect(STARTING_CALENDAR.feed).toEqual([9, 21, 33, 45, 57, 69, 81, 93, 105, 117, 129, 141, 153, 165])
    expect(STARTING_CALENDAR.story).toEqual([18, 42, 66, 90, 114, 138, 162])
  })

  it('carries the thirteen feed pieces a four city week draws: fourteen feed bands and seven story bands a week', () => {
    expect(STARTING_CALENDAR.feed.length).toBeGreaterThanOrEqual(13)
    for (let i = 1; i < STARTING_CALENDAR.feed.length; i += 1) expect(STARTING_CALENDAR.feed[i] - STARTING_CALENDAR.feed[i - 1]).toBe(12)
  })

  it('fills a starting rule that has no slots, and nothing else', () => {
    expect(withStartingCalendar(starting(), 'feed').slots).toEqual(STARTING_CALENDAR.feed)
    expect(withStartingCalendar(starting({ slots: [42] }), 'feed').slots).toEqual([42])
    expect(withStartingCalendar(starting({ basis: 'learned', slots: [] }), 'story').slots).toEqual([])
  })

  it('a feed post approved on Wednesday at 9 pm goes in that band; the next one on Thursday at 9 am; a story on Thursday from 6 pm', () => {
    const rules = { feed: withStartingCalendar(starting(), 'feed'), story: withStartingCalendar(starting({ gapHours: 2 }), 'story') }
    const at = scheduleMoments(
      [
        { id: 'f', format: 'feed', approvedAt: NOW },
        { id: 'g', format: 'feed', approvedAt: NOW },
        { id: 's', format: 'story', approvedAt: NOW },
      ],
      rules,
      { feed: null, story: null },
      NOW,
    )
    expect(at.get('f')?.toISOString()).toBe(NOW.toISOString())
    expect(at.get('g')?.toISOString()).toBe('2026-10-28T22:00:00.000Z')
    expect(at.get('s')?.toISOString()).toBe('2026-10-29T07:00:00.000Z')
  })
})
