import { describe, expect, it } from 'vitest'
import { bestSocialGrant, pickSpotlight, type SpotlightNight } from '@/lib/social/spotlight-math'
import { threePostsView } from '@/lib/social/three-posts'
import type { PieceRow, PostRow } from '@/lib/social/store'

/*
 * THIS WEEK'S THREE POSTS (Lawal, 12 November 2026, 11:11, items 3 and 4): Melbourne's weekend guide and tonight and
 * tomorrow pieces, and one organiser spotlight picked by rule, never by hand: Melbourne, the organiser's own account,
 * public, not sold out, within a fortnight; a night whose own photographs are cleared for social use first, then the
 * bigger night, then the soonest.
 */
const NOW = new Date('2026-11-12T02:00:00Z')
const night = (over: Partial<SpotlightNight>): SpotlightNight => ({
  eventId: 'e',
  title: 'A night',
  slug: 'a-night',
  startDate: '2026-11-20T09:00:00Z',
  endDate: '2026-11-20T13:00:00Z',
  city: 'Melbourne',
  ownAccount: true,
  soldOut: false,
  socialGrant: null,
  tier: 2,
  ...over,
})

describe('the organiser spotlight, by rule', () => {
  it('takes only a Melbourne night the organiser listed themselves, not sold out, inside the fortnight', () => {
    const out = pickSpotlight(
      [
        night({ eventId: 'geelong', city: 'Geelong', tier: 1 }),
        night({ eventId: 'platform', ownAccount: false, tier: 1 }),
        night({ eventId: 'gone', soldOut: true, tier: 1 }),
        night({ eventId: 'far', startDate: '2026-12-20T09:00:00Z', endDate: '2026-12-20T13:00:00Z', tier: 1 }),
        night({ eventId: 'ended', startDate: '2026-11-01T09:00:00Z', endDate: '2026-11-01T13:00:00Z', tier: 1 }),
        night({ eventId: 'ok', tier: 3 }),
      ],
      NOW,
    )
    expect(out?.eventId).toBe('ok')
  })
  it('puts a night whose photographs are cleared for social use first, one waiting for a yes next, then tier, then date', () => {
    const nights = [
      night({ eventId: 'big-no-grant', tier: 1, startDate: '2026-11-13T09:00:00Z' }),
      night({ eventId: 'waiting', socialGrant: 'pending', tier: 3 }),
      night({ eventId: 'cleared', socialGrant: 'approved', tier: 3, startDate: '2026-11-24T09:00:00Z', endDate: '2026-11-24T13:00:00Z' }),
    ]
    expect(pickSpotlight(nights, NOW)?.eventId).toBe('cleared')
    expect(pickSpotlight(nights.filter((n) => n.eventId !== 'cleared'), NOW)?.eventId).toBe('waiting')
    expect(pickSpotlight([night({ eventId: 'late', tier: 2, startDate: '2026-11-21T09:00:00Z', endDate: '2026-11-21T13:00:00Z' }), night({ eventId: 'soon', tier: 2, startDate: '2026-11-14T09:00:00Z', endDate: '2026-11-14T13:00:00Z' })], NOW)?.eventId).toBe('soon')
  })
  it('none qualifying means no spotlight, never a stand in', () => {
    expect(pickSpotlight([night({ ownAccount: false })], NOW)).toBeNull()
    expect(pickSpotlight([], NOW)).toBeNull()
  })
})

describe('a grant that covers social use', () => {
  it('a grant for the site alone is not one; a withdrawn one is not one; approved beats waiting', () => {
    expect(bestSocialGrant([{ scope: 'site', approvalStatus: 'approved', withdrawn: false }])).toBeNull()
    expect(bestSocialGrant([{ scope: 'both', approvalStatus: 'approved', withdrawn: true }])).toBeNull()
    expect(bestSocialGrant([{ scope: 'both', approvalStatus: 'pending', withdrawn: false }])).toBe('pending')
    expect(bestSocialGrant([{ scope: 'social', approvalStatus: 'pending', withdrawn: false }, { scope: 'both', approvalStatus: 'approved', withdrawn: false }])).toBe('approved')
    expect(bestSocialGrant([])).toBeNull()
  })
})

describe('the three posts side by side', () => {
  const piece = (id: string, kind: PieceRow['kind'], city: string, state: PieceRow['state']) => ({ id, kind, city, state, postUrl: null }) as unknown as PieceRow
  const post = (id: string, eventId: string, format: 'feed' | 'story') =>
    ({ id, eventId, platform: 'instagram', format, draft: { id: 'd', version: 1, caption: 'words', writtenBy: 'kit' }, approvedAt: null, postedAt: null, postUrl: null }) as unknown as PostRow
  it("takes Melbourne's weekend and tonight pieces and the spotlight's feed post, each linked to the studio", () => {
    const v = threePostsView(
      { weekStart: '2026-11-09', pieces: [piece('g', 'weekend_carousel', 'geelong', 'drafted'), piece('w', 'weekend_carousel', 'melbourne', 'drafted'), piece('t', 'tonight_tomorrow', 'melbourne', 'approved')] },
      [post('s1', 'e', 'story'), post('f1', 'e', 'feed'), post('x', 'other', 'feed')],
      night({}),
    )
    expect(v.weekend).toEqual({ id: 'w', state: 'drafted', postUrl: null, href: '/admin/social#piece-w' })
    expect(v.tonight?.state).toBe('approved')
    expect(v.spotlight?.post).toMatchObject({ id: 'f1', href: '/admin/social#post-f1', wordsBy: 'kit' })
  })
  it('says what is missing rather than inventing it', () => {
    const v = threePostsView(null, [], null)
    expect(v).toEqual({ weekStart: null, weekend: null, tonight: null, spotlight: null })
    expect(threePostsView(null, [], night({})).spotlight?.post).toBeNull()
  })
})
