// THE EVENT COVER FORMAT, and the three decisions that keep it out of the way.
//
// A fourth entry was added to SOCIAL_CARD_FORMATS so the Law 6 typographic
// composition could be rendered at the event cover frame WITHOUT a second
// renderer. That is a cheap change with three ways to go wrong quietly, and
// each of them is pinned here:
//
//   1. It must not appear in the organiser's download set. SOCIAL_CARD_ORDER
//      drives the Launch Kit post pack, so an entry leaking into it would put a
//      fourth tile on a screen nobody designed for four.
//   2. isSocialCardFormat must not accept it. That function guards the public
//      download route, and a cover is not a social post.
//   3. The frame must stay 4:3. The reason is in the spec file: the crops this
//      platform applies to a cover take HEIGHT, so a 4:3 asset loses chrome
//      where a 16:9 asset would lose the first and last letters of the event
//      name.

import { describe, it, expect } from 'vitest'

import {
  SOCIAL_CARD_FORMATS,
  SOCIAL_CARD_ORDER,
  isSocialCardFormat,
} from '@/lib/broadcast/social-card-spec'

describe('the event cover format', () => {
  it('is 4:3, at the same long edge as the tall post', () => {
    const cover = SOCIAL_CARD_FORMATS.cover
    expect(cover.width).toBe(1440)
    expect(cover.height).toBe(1080)
    expect(cover.width / cover.height).toBeCloseTo(4 / 3, 5)
    expect(cover.ratio).toBe('4:3')
  })

  it('is full frame: no photo band and no safe area, so the composition fills it', () => {
    expect(SOCIAL_CARD_FORMATS.cover.photoHeight).toBe(0)
    expect(SOCIAL_CARD_FORMATS.cover.safeTop).toBe(0)
    expect(SOCIAL_CARD_FORMATS.cover.safeBottom).toBe(0)
  })

  it('is NOT in the organiser download set', () => {
    expect(SOCIAL_CARD_ORDER).toEqual(['story', 'square', 'feed'])
    expect(SOCIAL_CARD_ORDER).not.toContain('cover')
  })

  it('is NOT accepted by the public download route guard', () => {
    expect(isSocialCardFormat('cover')).toBe(false)
    // The three that ARE, so this test fails if the guard is loosened wholesale.
    expect(isSocialCardFormat('story')).toBe(true)
    expect(isSocialCardFormat('square')).toBe(true)
    expect(isSocialCardFormat('feed')).toBe(true)
    expect(isSocialCardFormat('poster')).toBe(false)
  })

  it('says in its own justification that it is not a third-party specification', () => {
    // Law 7: every other entry in that file answers a published platform rule
    // and cites it. This one answers our own frame, and has to say so.
    expect(SOCIAL_CARD_FORMATS.cover.justification).toMatch(/this repository/i)
  })
})
