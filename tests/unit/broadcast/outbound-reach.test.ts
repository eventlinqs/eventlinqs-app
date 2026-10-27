// The organiser's outbound week (src/lib/broadcast/outbound-reach.ts; the locked foundation's item 8 and listing rule
// 6: "EventLinqs sent 46 people to your tickets this week: 31 to Humanitix, 15 to Eventbrite"). Pinned: distinct people,
// not rows; seven days only; a person at two sites counted once in all and once at each; the sentence in the founder's
// own shape, and none when nobody was sent.

import { describe, expect, test } from 'vitest'
import { outboundSentence, outboundWeekOf, type OutboundRow } from '@/lib/broadcast/outbound-reach'

const NOW = new Date('2026-10-27T08:00:00Z')
const at = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString()
let n = 0
const row = (provider: string | null, who: string | null, daysAgo: number): OutboundRow => ({ id: `r${(n += 1)}`, provider, visitor_hash: who, occurred_at: at(daysAgo) })

describe('the people sent to their tickets this week', () => {
  test('are distinct people per site and in all, the busiest site first', () => {
    const week = outboundWeekOf(
      [row('humanitix', 'a', 1), row('humanitix', 'a', 2), row('humanitix', 'b', 1), row('humanitix', 'c', 3), row('eventbrite', 'a', 1), row('eventbrite', 'd', 4)],
      NOW,
    )
    expect(week).toEqual({ people: 4, bySite: [{ provider: 'humanitix', people: 3 }, { provider: 'eventbrite', people: 2 }] })
    expect(outboundSentence(week)).toBe('EventLinqs sent 4 people to your tickets this week: 3 to Humanitix, 2 to Eventbrite.')
  })

  test('count only the last seven days', () => {
    expect(outboundWeekOf([row('dice', 'a', 8), row('dice', 'b', 6.9)], NOW)).toEqual({ people: 1, bySite: [{ provider: 'dice', people: 1 }] })
  })

  test('name one site plainly, a site with no platform name as their own site, and say nothing when nobody went', () => {
    expect(outboundSentence(outboundWeekOf([row('humanitix', 'a', 1)], NOW))).toBe('EventLinqs sent 1 person to your tickets on Humanitix this week.')
    expect(outboundSentence(outboundWeekOf([row('organiser_site', 'a', 1), row('humanitix', 'b', 1)], NOW))).toMatch(/1 to their own site/)
    expect(outboundSentence(outboundWeekOf([], NOW))).toBeNull()
  })

  test('count a press with no visitor key as its own person, never merging two', () => {
    expect(outboundWeekOf([row('humanitix', null, 1), row('humanitix', null, 1)], NOW).people).toBe(2)
  })
})
