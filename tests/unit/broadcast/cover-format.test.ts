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
//   3. The frame must stay 4:5, which is the TALLEST frame this platform crops
//      a cover to. Authoring there means every other crop removes height, which
//      costs the eyebrow and the lockup, rather than width, which would clip the
//      first and last letters of the event NAME.
//
//      This assertion exists because the first version was 4:3, derived from
//      event-card.tsx alone, and the organiser form's own "Card crop (4:5)"
//      preview showed the event name clipped on both sides. The number is
//      pinned here so the inventory has to be re-counted before it moves again.

import { describe, it, expect } from 'vitest'

import {
  SOCIAL_CARD_FORMATS,
  SOCIAL_CARD_ORDER,
  isSocialCardFormat,
} from '@/lib/broadcast/social-card-spec'

describe('the event cover format', () => {
  it('is 4:5, the tallest frame the platform crops a cover to', () => {
    const cover = SOCIAL_CARD_FORMATS.cover
    expect(cover.width).toBe(1440)
    expect(cover.height).toBe(1800)
    expect(cover.width / cover.height).toBeCloseTo(4 / 5, 5)
    expect(cover.ratio).toBe('4:5')
  })

  it('is at least as TALL as every frame the platform crops it to', () => {
    // The property that matters, stated as arithmetic rather than as a number:
    // no crop may ever be narrower than the authored frame, or it takes width.
    const cover = SOCIAL_CARD_FORMATS.cover
    const coverRatio = cover.width / cover.height
    const frames = [16 / 9, 16 / 10, 3 / 2, 4 / 3, 5 / 4, 1, 4 / 5]
    for (const frame of frames) {
      expect(coverRatio).toBeLessThanOrEqual(frame + 1e-9)
    }
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
