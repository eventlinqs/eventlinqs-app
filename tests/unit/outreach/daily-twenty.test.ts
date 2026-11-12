import { describe, expect, it } from 'vitest'
import {
  DAILY_TWENTY_GROUPS,
  DAILY_TWENTY_SENDER,
  buildDailyTwenty,
  type DailyCandidate,
} from '@/lib/outreach/daily-twenty'

/*
 * The Growth Engine V3 checklist, item 5 (Lawal's 'A, build it as written', 1 November 2026, 05:12): "A daily queue of
 * 20 reviewed actions: 5 conversion, 5 follow-ups, 5 recurring venues and community organisers, 5 partnerships and
 * reactivation"; "Eligibility checked before any message; ineligible contacts become research or a social first
 * touch"; "Duplicates prevented"; "Sender named on every message (lawal@eventlinqs.com)".
 */

const candidate = (over: Partial<DailyCandidate> & Pick<DailyCandidate, 'organiserId' | 'group'>): DailyCandidate => ({
  organiserName: over.organiserId,
  score: 50,
  why: 'test',
  contact: { channel: 'email', address: `${over.organiserId}@example.com.au`, eligible: true, refusal: null },
  socialHandle: null,
  ...over,
})

const many = (group: DailyCandidate['group'], n: number, prefix = group) =>
  Array.from({ length: n }, (_, i) => candidate({ organiserId: `${prefix}-${i}`, group, score: 100 - i }))

describe('the daily twenty', () => {
  it('is five of each of the four groups, twenty in all, the highest score first', () => {
    const day = buildDailyTwenty([...many('conversion', 8), ...many('follow_up', 8), ...many('recurring', 8), ...many('partnership_reactivation', 8)])
    expect(DAILY_TWENTY_GROUPS.map((g) => g.key)).toEqual(['conversion', 'follow_up', 'recurring', 'partnership_reactivation'])
    for (const g of day.groups) {
      expect(g.actions).toHaveLength(5)
      expect(g.short).toBe(0)
      expect(g.actions.map((a) => a.organiserId)).toEqual([0, 1, 2, 3, 4].map((i) => `${g.key}-${i}`))
    }
    expect(day.groups.flatMap((g) => g.actions)).toHaveLength(20)
  })

  it('never tops up a short group from another, and says how many it is short', () => {
    const day = buildDailyTwenty([...many('conversion', 2), ...many('follow_up', 9)])
    const by = Object.fromEntries(day.groups.map((g) => [g.key, g]))
    expect(by.conversion.actions).toHaveLength(2)
    expect(by.conversion.short).toBe(3)
    expect(by.follow_up.actions).toHaveLength(5)
    expect(by.recurring.short).toBe(5)
  })

  it("fills only the places the four groups leave empty with the next first asks, to twenty (Lawal's 11:11 of 12 November)", () => {
    const day = buildDailyTwenty([...many('conversion', 30), ...many('recurring', 1), ...many('partnership_reactivation', 3)])
    const by = Object.fromEntries(day.groups.map((g) => [g.key, g]))
    expect(by.conversion.actions.map((a) => a.organiserId)).toEqual([0, 1, 2, 3, 4].map((i) => `conversion-${i}`))
    expect(by.first_contact.actions.map((a) => a.organiserId)).toEqual(Array.from({ length: 11 }, (_, i) => `conversion-${i + 5}`))
    expect(by.first_contact.actions.every((a) => a.group === 'first_contact')).toBe(true)
    expect(day.groups.flatMap((g) => g.actions)).toHaveLength(20)
    // A full day has no fifth group at all.
    const full = buildDailyTwenty([...many('conversion', 8), ...many('follow_up', 8), ...many('recurring', 8), ...many('partnership_reactivation', 8)])
    expect(full.groups.map((g) => g.key)).not.toContain('first_contact')
  })

  it('takes one action per organiser a day: a follow up first, then a conversion ask, never both', () => {
    const day = buildDailyTwenty([
      candidate({ organiserId: 'barwon-club', group: 'conversion', score: 99 }),
      candidate({ organiserId: 'barwon-club', group: 'follow_up', score: 10 }),
      candidate({ organiserId: 'barwon-club', group: 'recurring', score: 90 }),
    ])
    const all = day.groups.flatMap((g) => g.actions)
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ organiserId: 'barwon-club', group: 'follow_up' })
    expect(day.duplicatesDropped).toBe(2)
  })

  it('names lawal@eventlinqs.com as the sender of every message', () => {
    const day = buildDailyTwenty(many('conversion', 3))
    expect(DAILY_TWENTY_SENDER).toBe('lawal@eventlinqs.com')
    for (const a of day.groups.flatMap((g) => g.actions)) expect(a.sender).toBe('lawal@eventlinqs.com')
  })

  it('an ineligible contact is never a message: it becomes a social first touch when a public handle exists, else research', () => {
    const day = buildDailyTwenty([
      candidate({ organiserId: 'tagged', group: 'conversion', contact: { channel: 'email', address: 'a@b.com.au', eligible: false, refusal: 'no recorded basis' }, socialHandle: 'taggedvenue' }),
      candidate({ organiserId: 'unknown', group: 'recurring', contact: null }),
      candidate({ organiserId: 'fine', group: 'conversion' }),
    ])
    expect(day.groups.flatMap((g) => g.actions).map((a) => a.organiserId)).toEqual(['fine'])
    expect(day.socialFirstTouches).toEqual([expect.objectContaining({ organiserId: 'tagged', handle: 'taggedvenue', because: 'no recorded basis' })])
    expect(day.research).toEqual([expect.objectContaining({ organiserId: 'unknown', because: 'no contact recorded' })])
  })

  it('is the same queue for the same input, whatever order it arrives in', () => {
    const input = [...many('conversion', 6), ...many('recurring', 6)]
    expect(buildDailyTwenty([...input].reverse())).toEqual(buildDailyTwenty(input))
  })

  // Lawal, 12 November 2026, 09:16 and 11:11: "20 organisers from the CRM, Melbourne first, ranked by the score".
  it('puts Melbourne first, then the other big cities, then the regional cities, then an unknown city; the score orders each', () => {
    const day = buildDailyTwenty([
      candidate({ organiserId: 'geelong-high', group: 'conversion', score: 99, city: 'geelong' }),
      candidate({ organiserId: 'nowhere', group: 'conversion', score: 98, city: null }),
      candidate({ organiserId: 'melbourne-low', group: 'conversion', score: 40, city: 'melbourne' }),
      candidate({ organiserId: 'sydney', group: 'conversion', score: 90, city: 'sydney' }),
      candidate({ organiserId: 'melbourne-high', group: 'conversion', score: 80, city: 'melbourne' }),
    ])
    const conversion = day.groups.find((g) => g.key === 'conversion')
    expect(conversion?.actions.map((a) => a.organiserId)).toEqual(['melbourne-high', 'melbourne-low', 'sydney', 'geelong-high', 'nowhere'])
    expect(conversion?.actions[0].city).toBe('melbourne')
  })
})
