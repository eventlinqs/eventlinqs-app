import { describe, expect, it } from 'vitest'
import { scheduleMoments, STARTING_CALENDAR, withStartingCalendar, type CadenceRule } from '@/lib/social/cadence'

/*
 * THE STARTING CALENDAR (Lawal's 14:07 of 15 November 2026: the week's calendar from the research, as defaults the daily
 * review tunes). Until our own posts teach the hours, a starting rule with no slots opens the researched bands; a learned
 * rule, or a rule with its own slots, is never touched.
 */
const starting = (over: Partial<CadenceRule> = {}): CadenceRule => ({ version: 1, gapHours: 12, slots: [], basis: 'starting', learnedFrom: 0, floorPosts: 12, settleHours: 48, setAt: new Date('2026-10-27T00:00:00Z'), ...over })
// Wednesday 28 October 2026, 9 pm in Melbourne (daylight saving, UTC+11).
const NOW = new Date('2026-10-28T10:00:00Z')

describe('the starting calendar', () => {
  it('is the researched week: feed Monday 6 pm, Wednesday noon, Thursday 9 am, Sunday 6 pm; stories Friday and Saturday 6 pm', () => {
    expect(STARTING_CALENDAR).toEqual({ feed: [18, 60, 81, 162], story: [114, 138] })
  })

  it('fills a starting rule that has no slots, and nothing else', () => {
    expect(withStartingCalendar(starting(), 'feed').slots).toEqual([18, 60, 81, 162])
    expect(withStartingCalendar(starting({ slots: [42] }), 'feed').slots).toEqual([42])
    expect(withStartingCalendar(starting({ basis: 'learned', slots: [] }), 'story').slots).toEqual([])
  })

  it('a feed post approved on Wednesday night goes on Thursday from 9 am; a story on Friday from 6 pm', () => {
    const rules = { feed: withStartingCalendar(starting(), 'feed'), story: withStartingCalendar(starting({ gapHours: 2 }), 'story') }
    const at = scheduleMoments(
      [
        { id: 'f', format: 'feed', approvedAt: NOW },
        { id: 's', format: 'story', approvedAt: NOW },
      ],
      rules,
      { feed: null, story: null },
      NOW,
    )
    expect(at.get('f')?.toISOString()).toBe('2026-10-28T22:00:00.000Z')
    expect(at.get('s')?.toISOString()).toBe('2026-10-30T07:00:00.000Z')
  })
})
