import { describe, expect, it } from 'vitest'
import { scheduleMoments, type CadenceRule } from '@/lib/social/cadence'

/*
 * B5: approved pieces schedule themselves at the cadence's moments (the release checklist B5; the project manager's
 * 20:17 of 28 October 2026). Each format keeps its own gap from the last thing that went and from each other; never
 * before its approval; a rule with learned bands waits for a band to open.
 */

const rule = (over: Partial<CadenceRule> = {}): CadenceRule => ({ version: 1, gapHours: 20, slots: [], basis: 'starting', learnedFrom: 0, floorPosts: 6, settleHours: 72, setAt: new Date('2026-10-01T00:00:00Z'), ...over })
const NOW = new Date('2026-10-28T10:00:00Z')

describe('the moments approved pieces go', () => {
  it('the first goes now when nothing went within the gap, each next one a gap later, per format', () => {
    const at = scheduleMoments(
      [
        { id: 'a', format: 'feed', approvedAt: NOW },
        { id: 'b', format: 'feed', approvedAt: NOW },
        { id: 's', format: 'story', approvedAt: NOW },
      ],
      { feed: rule(), story: rule({ gapHours: 2 }) },
      { feed: null, story: null },
      NOW,
    )
    expect(at.get('a')?.toISOString()).toBe(NOW.toISOString())
    expect(at.get('b')?.toISOString()).toBe(new Date(NOW.getTime() + 20 * 3_600_000).toISOString())
    expect(at.get('s')?.toISOString()).toBe(NOW.toISOString())
  })
  it('keeps the gap from the last thing that went', () => {
    const last = new Date(NOW.getTime() - 5 * 3_600_000)
    const at = scheduleMoments([{ id: 'a', format: 'feed', approvedAt: NOW }], { feed: rule(), story: rule() }, { feed: last, story: null }, NOW)
    expect(at.get('a')?.toISOString()).toBe(new Date(last.getTime() + 20 * 3_600_000).toISOString())
  })
  it('never before its approval', () => {
    const later = new Date(NOW.getTime() + 3 * 3_600_000)
    const at = scheduleMoments([{ id: 'a', format: 'story', approvedAt: later }], { feed: rule(), story: rule() }, { feed: null, story: null }, NOW)
    expect(at.get('a')!.getTime()).toBeGreaterThanOrEqual(later.getTime())
  })
  it('waits for a learned band to open', () => {
    // Band at hour 18 of Monday (Melbourne): 6 pm Monday. NOW is Wednesday 9 pm in Melbourne, so the next is Monday 6 pm.
    const at = scheduleMoments([{ id: 'a', format: 'feed', approvedAt: NOW }], { feed: rule({ slots: [18], basis: 'learned' }), story: rule() }, { feed: null, story: null }, NOW)
    expect(at.get('a')?.toISOString()).toBe('2026-11-02T07:00:00.000Z')
  })
})
