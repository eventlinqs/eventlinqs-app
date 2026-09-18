/**
 * THE WIDTH LADDER IS A CLAIM ABOUT THE SLOTS, AND IT GOES STALE IN SILENCE.
 *
 * `images.deviceSizes` and `images.imageSizes` in `next.config.ts` are emitted
 * into the `srcset` of every fixed-width image on a page, so a width nobody can
 * select is paid once per image in the document: 1,404 candidate URLs on the
 * homepage, about 230 bytes each.
 *
 * `scripts/guards/candidate-ladder-has-no-dead-rung.mjs` holds that on the whole
 * tree. These tests hold the ARITHMETIC it holds it with, because the guard's
 * verdict is only as good as the two rules underneath it:
 *
 *   1. the browser picks the smallest candidate at or above slot x DPR
 *   2. next/image will not EMIT a candidate below `deviceSizes[0] * smallestVw`
 *      for any hint carrying a viewport-relative term
 *
 * Rule 2 is read out of `getWidths` in
 * `node_modules/next/dist/shared/lib/get-img-props.js` (Next 16.3.0) rather than
 * remembered, and the fixture below is the shape that branch produces.
 *
 * WHY THE FIXTURES ARE HAND-WRITTEN AND NOT THE REAL FILES. The guard already
 * reads the real files. A test that read them too would agree with the guard
 * about a tree they both looked at, and both would be wrong together the day the
 * parser is. These cases pin the behaviour on inputs chosen to break it.
 */
import { describe, expect, it } from 'vitest'
import {
  CONTRACT_DPR,
  fixedSlots,
  judge,
  ladderFrom,
  parseCellPx,
  parseHints,
  readLadder,
  rungFor,
  smallestVwRatio,
} from '../../../scripts/guards/lib/candidate-ladder.mjs'

/** This repository's ladder, after the dead 16 was removed on 19 September 2026. */
const DEVICE = [640, 750, 828, 1080, 1920, 3840]
const IMAGE = [32, 64, 128, 256, 384]
const LADDER = ladderFrom({ deviceSizes: DEVICE, imageSizes: IMAGE })

describe('ladderFrom', () => {
  it('concatenates and sorts the two lists, the way next/image builds allSizes', () => {
    expect(LADDER).toEqual([32, 64, 128, 256, 384, 640, 750, 828, 1080, 1920, 3840])
  })

  it('does not emit a width twice when the two lists overlap', () => {
    expect(ladderFrom({ deviceSizes: [640, 750], imageSizes: [384, 640] })).toEqual([384, 640, 750])
  })
})

describe('rungFor: the browser picks the smallest candidate that is big enough', () => {
  it.each([
    [24, 32],
    [32, 32],
    [33, 64],
    [240, 256],
    [480, 640],
    [840, 1080],
  ])('a slot needing %i physical pixels is served %i', (need, rung) => {
    expect(rungFor(LADDER, need)).toBe(rung)
  })

  it('falls back to the largest rung when nothing is big enough, which is an under-fetch', () => {
    expect(rungFor(LADDER, 9000)).toBe(3840)
  })
})

describe('readLadder', () => {
  const config = `
  images: {
    deviceSizes: [640, 750, 828, 1080, 1920, 3840],
    imageSizes: [32, 64, 128, 256, 384],
  },`

  it('reads both lists out of the config text', () => {
    expect(readLadder(config)).toEqual({
      deviceSizes: DEVICE,
      imageSizes: IMAGE,
      ladder: LADDER,
    })
  })

  it('refuses a config where a list has been renamed away rather than returning an empty ladder', () => {
    expect(readLadder(config.replace('deviceSizes', 'deviceSizesRenamed'))).toBeNull()
  })

  it('refuses a list that is not all numbers, rather than silently dropping the entry', () => {
    expect(readLadder(config.replace('1920, 3840', '1920, HUGE'))).toBeNull()
  })
})

describe('fixedSlots', () => {
  const cells = new Map([
    ['EVENT_CARD_PX', { base: 240, sm: 280 }],
    ['FLAT_RAIL_PX', { base: 280, sm: 280 }],
  ])
  const hints = new Map([
    ['avatarXs', '24px'],
    ['gridOneTwoThreeFour', '(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 320px'],
  ])

  it('contributes BOTH widths of a cell that steps, because a browser meets both', () => {
    const slots = fixedSlots(cells, new Map())
    expect(slots.map(s => s.px).sort((a, b) => a - b)).toEqual([240, 280, 280])
  })

  it('contributes one width for a cell that does not step, not the same number twice', () => {
    const slots = fixedSlots(new Map([['FLAT_RAIL_PX', { base: 280, sm: 280 }]]), new Map())
    expect(slots).toHaveLength(1)
  })

  it('takes the capped pixel term out of a grid hint, which is the width above the cap', () => {
    const slots = fixedSlots(new Map(), hints)
    expect(slots.map(s => s.px).sort((a, b) => a - b)).toEqual([24, 320])
  })

  it('does NOT read a media-query breakpoint as a slot', () => {
    /* The regression this case exists for: matching `(\d+)px` across the whole
       hint turned `(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 320px`
       into three slots, and the two breakpoints then made rungs look alive that
       nothing renders at. A gate that goes quiet in the permissive direction is
       the only kind that matters. */
    const slots = fixedSlots(
      new Map(),
      new Map([['g', '(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 320px']]),
    )
    expect(slots.map(s => s.px)).toEqual([320])
  })

  it('names where each slot was declared, so a failure points at a line', () => {
    const slots = fixedSlots(cells, hints)
    expect(slots.find(s => s.px === 24)?.where).toBe('MEDIA_SIZES.avatarXs')
    expect(slots.find(s => s.px === 240)?.where).toBe('EVENT_CARD_PX.base')
  })
})

describe('smallestVwRatio: the floor below which next/image emits nothing', () => {
  it('finds the smallest viewport-relative term across the whole table', () => {
    const hints = new Map([
      ['a', '(max-width: 639px) 100vw, 320px'],
      ['b', '(max-width: 1399px) 21vw, 255px'],
    ])
    expect(smallestVwRatio(hints)).toBeCloseTo(0.21)
  })

  it('is null when no hint carries one at all, which would mean every image ships the whole ladder', () => {
    expect(smallestVwRatio(new Map([['a', '280px']]))).toBeNull()
  })

  it('does not read a number that merely precedes vw inside another word', () => {
    /* next/image's own regex requires the start of the string or whitespace
       before the digits, so `max-width: 639px` is not a 39vw term. */
    expect(smallestVwRatio(new Map([['a', '(max-width: 639px) 50vw, 320px']]))).toBeCloseTo(0.5)
  })
})

describe('judge', () => {
  const cellPx = parseCellPx(
    "export const EVENT_CARD_PX = { cell: EVENT_CARD_CELL, base: 240, sm: 280 } as const satisfies RailCell",
  )

  /*
   * The slot classes this platform actually declares, at one of each: an avatar
   * ladder at the bottom, a list thumbnail, a stepping rail cell, and a grid
   * hint carrying the smallest vw term in the table. A fixture missing the
   * avatars would report the bottom four rungs dead, which is a statement about
   * the fixture and not about the ladder.
   */
  const REAL_SHAPE = new Map([
    ['avatarXs', '24px'],
    ['avatarSm', '32px'],
    ['avatarMd', '48px'],
    ['listThumb', '56px'],
    ['gridTwoFourFive', '(max-width: 767px) 50vw, (max-width: 1399px) 21vw, 255px'],
  ])

  function verdictWith(hints: Map<string, string>, ladder = LADDER) {
    return judge({ ladder, deviceSizes: DEVICE, cellPx, hints })
  }

  it('calls a rung dead when no slot selects it AND no vw hint can emit it', () => {
    const v = verdictWith(
      REAL_SHAPE,
      ladderFrom({ deviceSizes: DEVICE, imageSizes: [16, ...IMAGE] }),
    )
    expect(v.dead).toEqual([16])
  })

  it('calls nothing dead once the rung below the floor is removed', () => {
    expect(verdictWith(REAL_SHAPE).dead).toEqual([])
  })

  it('does NOT call a rung dead merely because no fixed slot selects it, when a vw hint could emit it', () => {
    /* 828 is above the emission floor, so a viewport-relative slot could ask
       for it at some viewport this module deliberately does not model. */
    const v = verdictWith(REAL_SHAPE)
    expect(v.selectedBy.get(828)).toBeNull()
    expect(v.dead).not.toContain(828)
  })

  it('names the slot that selects each live rung, so a removal can be argued with', () => {
    const v = verdictWith(REAL_SHAPE)
    expect(v.selectedBy.get(32)).toMatchObject({ px: 24, dpr: 1, where: 'MEDIA_SIZES.avatarXs' })
    expect(v.selectedBy.get(64)).toMatchObject({ px: 24, dpr: CONTRACT_DPR })
    expect(v.selectedBy.get(128)).toMatchObject({ px: 48, dpr: CONTRACT_DPR })
  })

  it('reports a slot the ladder cannot cover at the contract ratio', () => {
    const hints = new Map(REAL_SHAPE)
    hints.set('hero', '(max-width: 768px) 75vw, 2400px')
    expect(verdictWith(hints).uncovered.map(s => s.px)).toEqual([2400])
  })

  it('covers a slot that needs exactly the top rung, rather than failing on the boundary', () => {
    const hints = new Map(REAL_SHAPE)
    hints.set('hero', '(max-width: 768px) 75vw, 1920px')
    expect(verdictWith(hints).uncovered).toEqual([])
  })
})

describe('parseHints', () => {
  it('stops at the end of the MEDIA_SIZES literal so a later object cannot leak in', () => {
    const source = [
      "export const MEDIA_SIZES = {",
      "  fullBleed: '(max-width: 768px) 75vw, 1920px',",
      "} as const",
      "export const SOMETHING_ELSE = {",
      "  notAHint: '99px',",
      "} as const",
    ].join('\n')
    const hints = parseHints(source)
    expect([...(hints?.keys() ?? [])]).toEqual(['fullBleed'])
  })

  it('reads a hint whose literal wrapped onto its own line', () => {
    const source = [
      "export const MEDIA_SIZES = {",
      "  gridOneTwoThreeFour:",
      "    '(max-width: 639px) 100vw, 320px',",
      "} as const",
    ].join('\n')
    expect(parseHints(source)?.get('gridOneTwoThreeFour')).toBe('(max-width: 639px) 100vw, 320px')
  })

  it('returns null when the literal is not there at all, rather than an empty table', () => {
    expect(parseHints('export const NOT_IT = {}')).toBeNull()
  })
})
