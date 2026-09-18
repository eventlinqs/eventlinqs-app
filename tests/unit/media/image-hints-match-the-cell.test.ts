/**
 * THE `sizes` HINT IS A PROMISE ABOUT LAYOUT, AND THE BROWSER BELIEVES IT.
 *
 * These tests hold the rules that `scripts/guards/image-hints-match-the-cell.mjs`
 * enforces on the whole tree, at the level the guard cannot reach: the ARITHMETIC
 * of each hint against the slot it describes.
 *
 * The guard proves that a rail hint is DERIVED from its cell. It cannot prove
 * that a GRID hint is wide enough for its grid, because a grid's rendered width
 * comes from the column count, the gaps, the page padding and the container cap,
 * resolved by a browser. So the grid arithmetic is written out here, once, from
 * the measured widths in C:\dev\EVIDENCE\C8B3-HINTS\before-sweep.txt, and the
 * drive (`scripts/verify/image-hint-fidelity-drive.mjs`) checks the same claim in
 * a real browser at nine viewports. Two independent checks of one rule, which is
 * the point: a test that agrees with itself proves nothing.
 *
 * THE ONE RULE UNDER TEST: a hint may be larger than its slot and never smaller.
 * Over-fetching costs bytes. Under-fetching costs sharpness, which the premium
 * bar forbids, so it is the worse of the two and is asserted hardest.
 */
import { describe, expect, it } from 'vitest'
import { MEDIA_SIZES, RAIL_CELL_HINTS, railCellHint } from '@/components/media/sizes'
import {
  CITY_TILE_PX,
  EVENT_CARD_PX,
  FLAT_RAIL_PX,
  SCENE_TILE_PX,
} from '@/lib/ui/rhythm'

/**
 * Resolve a `sizes` string the way a browser does: walk the comma-separated
 * entries in order, take the first whose media condition matches, and return its
 * width in CSS pixels. The last entry has no condition and is the default.
 *
 * This is deliberately a SEPARATE implementation from anything in src/. If the
 * product built the hint and the test parsed it with the same code, the pair
 * would agree about a rule neither of them holds.
 */
function resolveHint(sizes: string, viewport: number): number {
  for (const entry of sizes.split(',').map(s => s.trim())) {
    const m = /^(\((?:max|min)-width:\s*(\d+)px\)\s+)?(.+)$/.exec(entry)
    if (!m) throw new Error(`unparseable sizes entry: ${entry}`)
    const [, condition, boundRaw, value] = m
    if (condition) {
      const bound = Number(boundRaw)
      const isMax = condition.includes('max-width')
      if (isMax ? viewport > bound : viewport < bound) continue
    }
    if (value.endsWith('vw')) return (viewport * Number(value.slice(0, -2))) / 100
    if (value.endsWith('px')) return Number(value.slice(0, -2))
    throw new Error(`unrecognised sizes value: ${value}`)
  }
  throw new Error(`no entry of "${sizes}" applies at ${viewport}`)
}

/** The content width of `max-w-7xl` at a viewport, after the page padding. */
function containerWidth(viewport: number): number {
  const padding = viewport >= 1024 ? 32 : viewport >= 640 ? 24 : 16
  return Math.min(1400, viewport) - padding * 2
}

/** The width one column renders at, given the column count and the gap. */
function columnWidth(viewport: number, columns: number, gap: number): number {
  return (containerWidth(viewport) - gap * (columns - 1)) / columns
}

/** The viewports the drive covers, plus the breakpoint boundaries either side. */
const VIEWPORTS = [320, 360, 390, 430, 639, 640, 767, 768, 1023, 1024, 1279, 1280, 1399, 1400, 1440, 1920]

describe('the hint parser this file checks with', () => {
  it('takes the first matching entry, not the last', () => {
    const s = '(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 430px'
    expect(resolveHint(s, 500)).toBe(500)
    expect(resolveHint(s, 800)).toBe(400)
    expect(resolveHint(s, 1440)).toBe(430)
  })

  it('treats a max-width bound as inclusive and a min-width bound as inclusive', () => {
    expect(resolveHint('(max-width: 767px) 100vw, 10px', 767)).toBe(767)
    expect(resolveHint('(max-width: 767px) 100vw, 10px', 768)).toBe(10)
    expect(resolveHint('(min-width: 640px) 280px, 240px', 640)).toBe(280)
    expect(resolveHint('(min-width: 640px) 280px, 240px', 639)).toBe(240)
  })

  it('refuses a hint it cannot parse rather than returning a plausible number', () => {
    expect(() => resolveHint('(max-width: 767px) 50em, 10px', 400)).toThrow(/unrecognised/)
  })
})

describe('railCellHint', () => {
  it('states both numbers for a cell that steps at sm', () => {
    expect(railCellHint({ base: 240, sm: 280 })).toBe('(min-width: 640px) 280px, 240px')
  })

  it('states ONE number for a cell that does not step, rather than the same number twice', () => {
    expect(railCellHint({ base: 280, sm: 280 })).toBe('280px')
  })

  it('produces a hint that resolves to the cell width on both sides of the breakpoint', () => {
    const hint = railCellHint(EVENT_CARD_PX)
    expect(resolveHint(hint, 390)).toBe(EVENT_CARD_PX.base)
    expect(resolveHint(hint, 639)).toBe(EVENT_CARD_PX.base)
    expect(resolveHint(hint, 640)).toBe(EVENT_CARD_PX.sm)
    expect(resolveHint(hint, 1920)).toBe(EVENT_CARD_PX.sm)
  })
})

describe('every rail hint is exactly its cell', () => {
  it.each(RAIL_CELL_HINTS.map(e => [e.key, e.name] as const))(
    'MEDIA_SIZES.%s is derived from %s',
    key => {
      const entry = RAIL_CELL_HINTS.find(e => e.key === key)
      if (!entry) throw new Error(`no RAIL_CELL_HINTS entry for ${key}`)
      expect(MEDIA_SIZES[entry.key]).toBe(railCellHint(entry.px))
    },
  )

  it('never resolves BELOW the cell width at any viewport, which is the blurry failure', () => {
    for (const entry of RAIL_CELL_HINTS) {
      for (const vp of VIEWPORTS) {
        const asked = resolveHint(MEDIA_SIZES[entry.key], vp)
        const renders = vp >= 640 ? entry.px.sm : entry.px.base
        expect(
          asked,
          `${entry.key} at ${vp}: asked for ${asked} where the cell renders ${renders}`,
        ).toBeGreaterThanOrEqual(renders)
      }
    }
  })

  it('covers the two cells whose old shared hint was wrong in opposite directions', () => {
    /* The regression that started this: one hint for a 150/168 tile AND a
       280/340 tile. It over-fetched the first and under-fetched the second. */
    const old = '(min-width: 640px) 288px, 256px'
    expect(resolveHint(old, 1440)).toBeLessThan(CITY_TILE_PX.sm)
    expect(resolveHint(old, 1440)).toBeGreaterThan(SCENE_TILE_PX.sm)

    expect(resolveHint(MEDIA_SIZES.railCityTile, 1440)).toBe(CITY_TILE_PX.sm)
    expect(resolveHint(MEDIA_SIZES.railSceneTile, 1440)).toBe(SCENE_TILE_PX.sm)
  })

  it('gives the flat cell one number, because it has one width', () => {
    expect(MEDIA_SIZES.railFlat).toBe('280px')
    expect(resolveHint(MEDIA_SIZES.railFlat, 390)).toBe(FLAT_RAIL_PX.base)
    expect(resolveHint(MEDIA_SIZES.railFlat, 1920)).toBe(FLAT_RAIL_PX.base)
  })
})

/**
 * Each grid hint against the grid it claims to describe. `ladder` is the column
 * count from each breakpoint upwards, exactly as the Tailwind class reads.
 */
const GRIDS = [
  { hint: MEDIA_SIZES.gridOneTwo, gap: 24, ladder: [[0, 1], [768, 2]] },
  { hint: MEDIA_SIZES.gridOneTwoThree, gap: 24, ladder: [[0, 1], [768, 2], [1024, 3]] },
  { hint: MEDIA_SIZES.gridOneTwoThreeSm, gap: 16, ladder: [[0, 1], [640, 2], [1024, 3]] },
  { hint: MEDIA_SIZES.gridOneThree, gap: 24, ladder: [[0, 1], [768, 3]] },
  { hint: MEDIA_SIZES.gridOneTwoThreeFour, gap: 24, ladder: [[0, 1], [640, 2], [1024, 3], [1280, 4]] },
  { hint: MEDIA_SIZES.gridOneTwoFour, gap: 16, ladder: [[0, 1], [640, 2], [1024, 4]] },
  { hint: MEDIA_SIZES.gridTwoThreeFour, gap: 16, ladder: [[0, 2], [768, 3], [1024, 4]] },
  { hint: MEDIA_SIZES.gridTwoFourFive, gap: 16, ladder: [[0, 2], [768, 4], [1024, 5]] },
  { hint: MEDIA_SIZES.gridTwoThreeFive, gap: 20, ladder: [[0, 2], [640, 3], [1024, 5]] },
  { hint: MEDIA_SIZES.gridTwoThreeSix, gap: 16, ladder: [[0, 2], [640, 3], [1024, 6]] },
] as const

function columnsAt(ladder: readonly (readonly [number, number])[], viewport: number): number {
  let cols = ladder[0][1]
  for (const [from, n] of ladder) if (viewport >= from) cols = n
  return cols
}

describe('every grid hint is wide enough for its grid at every viewport', () => {
  it.each(GRIDS.map(g => [g.hint, g] as const))('%s', (_hint, grid) => {
    for (const vp of VIEWPORTS) {
      const asked = resolveHint(grid.hint, vp)
      const renders = columnWidth(vp, columnsAt(grid.ladder, vp), grid.gap)
      expect(
        asked,
        `at ${vp}: asked for ${Math.round(asked)} where a column renders ${Math.round(renders)}`,
      ).toBeGreaterThanOrEqual(renders)
    }
  })

  it('does not over-ask by more than half again, or the fix is just a different waste', () => {
    for (const grid of GRIDS) {
      for (const vp of VIEWPORTS) {
        const asked = resolveHint(grid.hint, vp)
        const renders = columnWidth(vp, columnsAt(grid.ladder, vp), grid.gap)
        expect(
          asked / renders,
          `${grid.hint} at ${vp}: asked ${Math.round(asked)} for a ${Math.round(renders)} column`,
        ).toBeLessThanOrEqual(1.5)
      }
    }
  })

  it('FAILS the same arithmetic when given the hint this item replaced', () => {
    /*
     * The sensitivity check, kept in the suite rather than run once by hand: if
     * the assertions above cannot fail, they prove nothing. This is the literal
     * `card` hint every grid on the platform shared until 18 September 2026,
     * measured against the ladder eight templates actually render.
     */
    const old = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw'
    const ladder = [[0, 1], [768, 2], [1024, 3]] as const

    /* It UNDER-fetches between 640 and 767, where it claims two columns and the
       grid is still one. That is the blurry half of the defect. */
    const underfetched = [660, 700, 767].map(vp => ({
      vp,
      asked: resolveHint(old, vp),
      renders: columnWidth(vp, columnsAt(ladder, vp), 24),
    }))
    for (const row of underfetched) {
      expect(row.asked, `at ${row.vp}`).toBeLessThan(row.renders)
    }

    /* And it OVER-fetches past the container cap, where a vw term keeps growing
       and the column does not. That is the wasteful half. */
    expect(resolveHint(old, 1920) / columnWidth(1920, 3, 24)).toBeGreaterThan(1.4)

    /* The replacement is right in both directions at the same viewports. */
    for (const vp of [660, 700, 767, 1920]) {
      const asked = resolveHint(MEDIA_SIZES.gridOneTwoThree, vp)
      const renders = columnWidth(vp, columnsAt(ladder, vp), 24)
      expect(asked, `replacement at ${vp}`).toBeGreaterThanOrEqual(renders)
      expect(asked / renders, `replacement at ${vp}`).toBeLessThanOrEqual(1.5)
    }
  })

  it('ends every grid hint in a fixed pixel term, because the container stops growing', () => {
    /* The defect this replaces: a trailing `33vw` kept growing past max-w-7xl,
       so a 1920px desktop asked for 634px for a 278px slot. */
    for (const grid of GRIDS) {
      const last = grid.hint.split(',').at(-1)?.trim()
      expect(last, grid.hint).toMatch(/^\d+px$/)
    }
  })
})

describe('the container arithmetic these assertions rest on', () => {
  it('caps at max-w-7xl minus the large-screen padding', () => {
    expect(containerWidth(1920)).toBe(1336)
    expect(containerWidth(1440)).toBe(1336)
    expect(containerWidth(1280)).toBe(1216)
  })

  it('agrees with what the browser measured on /events at 1440', () => {
    /* before-sweep.txt: the /events grid rendered a 314px slot at 1440, and the
       card has a 1px border each side, so the column is 316. */
    expect(Math.round(columnWidth(1440, 4, 24))).toBe(316)
  })

  it('agrees with what the browser measured on /cities at 1440', () => {
    /* before-sweep.txt: 322px slot, 324px column, gap-4. */
    expect(Math.round(columnWidth(1440, 4, 16))).toBe(322)
  })
})
