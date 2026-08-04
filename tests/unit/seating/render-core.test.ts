import { describe, expect, it } from 'vitest'
import {
  chairsLegible,
  lodFlags,
  lodState,
  LOD_OVERVIEW_MAX,
  LOD_SEAT_MIN,
  MIN_CHAIR_PX,
} from '@/lib/seating/render/lod'
import { convexHull, pointInHull, polygonCentroid } from '@/lib/seating/render/polygons'
import { defaultStageForBounds, stageGeometry } from '@/lib/seating/render/stage'
import { buildScene, cullSeats, estimatePitch, hitTestSeat, type SceneSeatInput } from '@/lib/seating/render/scene'
import {
  CHAIR_ARM_LEFT_PATH,
  CHAIR_ARM_RIGHT_PATH,
  CHAIR_BACK_PATH,
  CHAIR_PAN_PATH,
  CHAIR_PART_PATHS,
  CHAIR_RECTS,
  GLYPH_BOX,
  OBJECT_GLYPHS,
  roundedRectPath,
} from '@/lib/seating/render/glyphs'
import { sceneToPrintSvg } from '@/lib/seating/render/svg-export'

function seat(partial: Partial<SceneSeatInput> & { id: string; x: number; y: number }): SceneSeatInput {
  return {
    row_label: 'A',
    seat_number: '1',
    seat_type: 'standard',
    status: 'available',
    seat_map_section_id: 'sec-1',
    ticket_tier_id: 'tier-1',
    ...partial,
  }
}

/** A rectangular grid of seats: rows x cols at the default 24 pitch. */
function gridSeats(rows: number, cols: number, pitch = 24): SceneSeatInput[] {
  const out: SceneSeatInput[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push(
        seat({
          id: `s-${r}-${c}`,
          x: 100 + c * pitch,
          y: 100 + r * pitch,
          row_label: String.fromCharCode(65 + r),
          seat_number: String(c + 1),
        }),
      )
    }
  }
  return out
}

describe('lod', () => {
  it('maps scale to the three fixed states', () => {
    expect(lodState(0.1)).toBe('overview')
    expect(lodState(LOD_OVERVIEW_MAX)).toBe('mid')
    expect(lodState(0.5)).toBe('mid')
    expect(lodState(LOD_SEAT_MIN)).toBe('seat')
    expect(lodState(2)).toBe('seat')
  })

  it('overview draws polygons only: zero seats, zero letters', () => {
    const flags = lodFlags(0.2)
    expect(flags.state).toBe('overview')
    expect(flags.seats).toBe(false)
    expect(flags.polygonFill).toBe(true)
    expect(flags.rowLetters).toBe(false)
    expect(flags.rulers).toBe(false)
  })

  it('past overview the plan carries chairs, letters and rulers, at every zoom', () => {
    // The restraint grammar: chairs, row letters both flanks, rulers,
    // stage and aisles, nothing else. Per-seat numerals are OFF the plan.
    for (const scale of [0.35, 0.8, 1.4]) {
      const flags = lodFlags(scale)
      expect(flags.seats).toBe(true)
      expect(flags.rowLetters).toBe(true)
      expect(flags.rulers).toBe(true)
      expect('numerals' in flags).toBe(false)
    }
  })

  it('shows polygons instead of chairs below the legibility floor', () => {
    // The buyer-facing rule: a chair too small to read as furniture is
    // never degraded into an abstract mark, at any viewport width.
    const belowFloor = lodFlags(1.4, MIN_CHAIR_PX - 1)
    expect(belowFloor.seats).toBe(false)
    expect(belowFloor.polygonFill).toBe(true)
    expect(belowFloor.rowLetters).toBe(false)
    expect(belowFloor.rulers).toBe(false)

    const atFloor = lodFlags(1.4, MIN_CHAIR_PX)
    expect(atFloor.seats).toBe(true)
    expect(atFloor.polygonFill).toBe(false)

    expect(chairsLegible(MIN_CHAIR_PX)).toBe(true)
    expect(chairsLegible(MIN_CHAIR_PX - 0.01)).toBe(false)
  })
})

describe('chair glyph: the approved specification', () => {
  it('carries the exact approved rectangles on the 100 box', () => {
    expect(GLYPH_BOX).toBe(100)
    expect(CHAIR_RECTS.back).toEqual({ x: 18, y: 6, w: 64, h: 30, r: 11 })
    expect(CHAIR_RECTS.armLeft).toEqual({ x: 4, y: 40, w: 15, h: 46, r: 7 })
    expect(CHAIR_RECTS.armRight).toEqual({ x: 81, y: 40, w: 15, h: 46, r: 7 })
    expect(CHAIR_RECTS.pan).toEqual({ x: 22, y: 62, w: 56, h: 24, r: 9 })
  })

  it('is ONE silhouette: four parts, no tier variants', () => {
    expect(CHAIR_PART_PATHS).toHaveLength(4)
    for (const path of CHAIR_PART_PATHS) {
      expect(path).toMatch(/^M[\d.]/)
      expect(path.endsWith('Z')).toBe(true)
    }
    // The paths are derived from the rectangles, so they cannot drift.
    expect(CHAIR_BACK_PATH).toBe(roundedRectPath(CHAIR_RECTS.back))
    expect(CHAIR_PAN_PATH).toBe(roundedRectPath(CHAIR_RECTS.pan))
    expect(CHAIR_ARM_LEFT_PATH).toBe(roundedRectPath(CHAIR_RECTS.armLeft))
    expect(CHAIR_ARM_RIGHT_PATH).toBe(roundedRectPath(CHAIR_RECTS.armRight))
  })

  it('is symmetric about x = 50 by construction', () => {
    const mirror = (r: { x: number; w: number }) => GLYPH_BOX - (r.x + r.w)
    // Each arm mirrors onto the other, exactly.
    expect(mirror(CHAIR_RECTS.armLeft)).toBe(CHAIR_RECTS.armRight.x)
    expect(mirror(CHAIR_RECTS.armRight)).toBe(CHAIR_RECTS.armLeft.x)
    expect(CHAIR_RECTS.armLeft.w).toBe(CHAIR_RECTS.armRight.w)
    expect(CHAIR_RECTS.armLeft.h).toBe(CHAIR_RECTS.armRight.h)
    expect(CHAIR_RECTS.armLeft.y).toBe(CHAIR_RECTS.armRight.y)
    expect(CHAIR_RECTS.armLeft.r).toBe(CHAIR_RECTS.armRight.r)
    // The back and the pan are each centred on the centreline.
    for (const r of [CHAIR_RECTS.back, CHAIR_RECTS.pan]) {
      expect(r.x + r.w / 2).toBe(GLYPH_BOX / 2)
    }
  })

  it('makes the arms the widest part, wider than the back', () => {
    const armSpan = CHAIR_RECTS.armRight.x + CHAIR_RECTS.armRight.w - CHAIR_RECTS.armLeft.x
    const backSpan = CHAIR_RECTS.back.w
    const panSpan = CHAIR_RECTS.pan.w
    expect(armSpan).toBe(92)
    expect(armSpan).toBeGreaterThan(backSpan)
    expect(armSpan).toBeGreaterThan(panSpan)
    // And the arms reach outside the back on BOTH sides, equally.
    expect(CHAIR_RECTS.back.x - CHAIR_RECTS.armLeft.x).toBe(14)
    expect(
      CHAIR_RECTS.armRight.x + CHAIR_RECTS.armRight.w - (CHAIR_RECTS.back.x + CHAIR_RECTS.back.w),
    ).toBe(14)
  })

  it('keeps the middle open: back on top, arms down the sides, pan at the bottom', () => {
    const backBottom = CHAIR_RECTS.back.y + CHAIR_RECTS.back.h
    // Air between the back and everything below it.
    expect(backBottom).toBeLessThan(CHAIR_RECTS.armLeft.y)
    expect(backBottom).toBeLessThan(CHAIR_RECTS.pan.y)
    // The pan sits between the arms, not across them.
    expect(CHAIR_RECTS.pan.x).toBeGreaterThan(CHAIR_RECTS.armLeft.x + CHAIR_RECTS.armLeft.w)
    expect(CHAIR_RECTS.pan.x + CHAIR_RECTS.pan.w).toBeLessThan(CHAIR_RECTS.armRight.x)
    // The arms start above the pan, so the sides read before the seat does.
    expect(CHAIR_RECTS.armLeft.y).toBeLessThan(CHAIR_RECTS.pan.y)
  })

  it('fits inside the box once the scaling stroke is counted', () => {
    const half = 6.5 / 2
    expect(CHAIR_RECTS.armLeft.x - half).toBeGreaterThan(0)
    expect(CHAIR_RECTS.armRight.x + CHAIR_RECTS.armRight.w + half).toBeLessThan(GLYPH_BOX)
    expect(CHAIR_RECTS.back.y - half).toBeGreaterThan(0)
    expect(CHAIR_RECTS.pan.y + CHAIR_RECTS.pan.h + half).toBeLessThan(GLYPH_BOX)
  })

  it('describes every required venue object glyph', () => {
    const required = ['bar', 'food', 'toilet', 'entrance', 'exit', 'stairs', 'lift', 'balcony', 'box', 'rail'] as const
    for (const kind of required) {
      expect(OBJECT_GLYPHS[kind].paths.length).toBeGreaterThan(0)
      expect(OBJECT_GLYPHS[kind].label.length).toBeGreaterThan(1)
    }
  })
})

describe('polygons', () => {
  it('hulls a grid to its four corners', () => {
    const pts = gridSeats(5, 8).map(s => ({ x: s.x, y: s.y }))
    const hull = convexHull(pts)
    expect(hull.length).toBe(4)
    expect(hull).toContainEqual({ x: 100, y: 100 })
    expect(hull).toContainEqual({ x: 100 + 7 * 24, y: 100 + 4 * 24 })
  })

  it('centres the label inside the hull', () => {
    const pts = gridSeats(5, 8).map(s => ({ x: s.x, y: s.y }))
    const hull = convexHull(pts)
    const c = polygonCentroid(hull)
    expect(c.x).toBeCloseTo(100 + (7 * 24) / 2, 0)
    expect(c.y).toBeCloseTo(100 + (4 * 24) / 2, 0)
    expect(pointInHull(c, hull, 0)).toBe(true)
    expect(pointInHull({ x: 0, y: 0 }, hull, 0)).toBe(false)
  })
})

describe('stage geometry', () => {
  it('proscenium recedes upstage and bulges its apron into the house', () => {
    const g = stageGeometry({ shape: 'proscenium', x: 0, y: 0, width: 100, depth: 40 })
    const backWidth = g.outline[1].x - g.outline[0].x
    const frontWidth = g.outline[2].x - g.outline[3].x
    expect(backWidth).toBeCloseTo(72, 5)
    expect(frontWidth).toBeCloseTo(100, 5)
    const apronPeak = Math.max(...g.apron.map(p => p.y))
    expect(apronPeak).toBeGreaterThan(40)
    expect(g.focal.y).toBeGreaterThan(40)
  })

  it('thrust projects a tongue past its band', () => {
    const g = stageGeometry({ shape: 'thrust', x: 0, y: 0, width: 100, depth: 60 })
    const deepest = Math.max(...g.outline.map(p => p.y))
    expect(deepest).toBeCloseTo(60, 1)
    const tongueXs = g.outline.filter(p => p.y > 31).map(p => p.x)
    expect(Math.max(...tongueXs) - Math.min(...tongueXs)).toBeLessThan(60)
  })

  it('in the round is an ellipse whose focal point is its centre', () => {
    const g = stageGeometry({ shape: 'round', x: 10, y: 10, width: 80, depth: 60 })
    expect(g.ellipse).toBeDefined()
    expect(g.focal).toEqual({ x: 50, y: 40 })
  })

  it('flat-floor band keeps only a front line as its apron', () => {
    const g = stageGeometry({ shape: 'band', x: 0, y: 0, width: 200, depth: 50 })
    expect(g.apron.length).toBe(2)
    expect(g.apron[0].y).toBe(g.apron[1].y)
  })

  it('gives legacy charts a default proscenium with no migration', () => {
    const spec = defaultStageForBounds({ minX: 0, minY: 100, maxX: 400, maxY: 500 })
    expect(spec.shape).toBe('proscenium')
    expect(spec.y + spec.depth).toBeLessThan(100)
    expect(spec.width).toBeCloseTo(240, 5)
  })
})

describe('scene graph', () => {
  it('estimates the room pitch from neighbour distances', () => {
    expect(estimatePitch(gridSeats(6, 10))).toBeCloseTo(24, 5)
    expect(estimatePitch(gridSeats(4, 6, 30))).toBeCloseTo(30, 5)
  })

  it('builds polygons with price ranges from resolved seat prices', () => {
    const seats = gridSeats(4, 6)
    const scene = buildScene({
      seats,
      sections: [{ id: 'sec-1', name: 'Stalls', color: '#1F5673' }],
      priceForSeat: s => (s.row_label === 'A' ? 12900 : 8900),
      colorForSeat: () => '#7A1F3D',
    })
    expect(scene.polygons.length).toBe(1)
    expect(scene.polygons[0].name).toBe('Stalls')
    expect(scene.polygons[0].minPriceCents).toBe(8900)
    expect(scene.polygons[0].maxPriceCents).toBe(12900)
    expect(scene.polygons[0].color).toBe('#7A1F3D')
  })

  it('hulls a split section per spatial cluster, never one band across the house', () => {
    // Two box blocks flanking the room, one section: two polygons.
    const west = gridSeats(2, 3)
    const east = gridSeats(2, 3).map(s => ({ ...s, id: `e-${s.id}`, x: s.x + 900 }))
    const scene = buildScene({
      seats: [...west, ...east],
      sections: [{ id: 'sec-1', name: 'Boxes', color: '#8C3B2E' }],
    })
    expect(scene.polygons.length).toBe(2)
    expect(scene.polygons.every(p => p.name === 'Boxes')).toBe(true)
    const spans = scene.polygons.map(p => Math.max(...p.hull.map(h => h.x)) - Math.min(...p.hull.map(h => h.x)))
    expect(Math.max(...spans)).toBeLessThan(200)
  })

  it('anchors row letters one pitch outside both flanks', () => {
    const scene = buildScene({
      seats: gridSeats(2, 5),
      sections: [{ id: 'sec-1', name: 'Stalls', color: '#1F5673' }],
    })
    const rowA = scene.rowLabels.find(r => r.label === 'A')
    expect(rowA).toBeDefined()
    expect(rowA!.left.x).toBeCloseTo(100 - 24, 5)
    expect(rowA!.right.x).toBeCloseTo(100 + 4 * 24 + 24, 5)
  })

  it('rules the front row seat numbers one pitch above the section', () => {
    const scene = buildScene({
      seats: gridSeats(3, 4),
      sections: [{ id: 'sec-1', name: 'Stalls', color: '#1F5673' }],
    })
    expect(scene.rulers.length).toBe(4)
    expect(scene.rulers.every(m => m.y === 100 - 24)).toBe(true)
    expect(scene.rulers.map(m => m.text)).toEqual(['1', '2', '3', '4'])
  })

  it('a tall narrow block still earns its ruler; a rotated gallery does not', () => {
    // The gate is the FRONT ROW's orientation, never the block's aspect:
    // a three-block theatre's outer blocks are taller than wide yet their
    // rows run horizontally (the correction-2 regression).
    const tall = gridSeats(20, 6)
    const tallScene = buildScene({
      seats: tall,
      sections: [{ id: 'sec-1', name: 'Stalls', color: '#1F5673' }],
    })
    expect(tallScene.rulers.length).toBe(6)
    // A rotated gallery: each row is a VERTICAL line of seats.
    const gallery: SceneSeatInput[] = []
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 8; c++) {
        gallery.push(
          seat({
            id: `g-${r}-${c}`,
            x: 100 + r * 24,
            y: 100 + c * 24,
            row_label: String.fromCharCode(87 + r),
            seat_number: String(c + 1),
          }),
        )
      }
    }
    const galleryScene = buildScene({
      seats: gallery,
      sections: [{ id: 'sec-1', name: 'West Gallery', color: '#7A1F3D' }],
    })
    expect(galleryScene.rulers.length).toBe(0)
  })

  it('blocks split at real aisle gaps, whatever the count', () => {
    const west = gridSeats(15, 8)
    const centre = gridSeats(15, 10).map(s => ({ ...s, id: `c-${s.id}`, x: s.x + 8 * 24 + 60 }))
    const east = gridSeats(15, 8).map(s => ({ ...s, id: `e-${s.id}`, x: s.x + 18 * 24 + 120 }))
    const scene = buildScene({
      seats: [...west, ...centre, ...east],
      sections: [{ id: 'sec-1', name: 'Stalls', color: '#1F5673' }],
    })
    expect(scene.blocks.length).toBe(3)
    // One ruler per block: every block's front row is numbered.
    expect(scene.rulers.length).toBe(8 + 10 + 8)
    // Row lines merge across the blocks: one letter anchor pair per row.
    expect(scene.rowLabels.filter(r => r.label === 'A').length).toBe(1)
  })

  it('synthesises a default stage above the front row', () => {
    const scene = buildScene({
      seats: gridSeats(3, 4),
      sections: [{ id: 'sec-1', name: 'Stalls', color: '#1F5673' }],
    })
    expect(scene.stage).not.toBeNull()
    expect(Math.max(...scene.stage!.apron.map(p => p.y))).toBeLessThan(100)
  })

  it('culls to the viewport and hit-tests the nearest chair', () => {
    const scene = buildScene({
      seats: gridSeats(10, 20),
      sections: [{ id: 'sec-1', name: 'Stalls', color: '#1F5673' }],
    })
    const visible = cullSeats(scene, { minX: 90, minY: 90, maxX: 160, maxY: 160 })
    expect(visible.length).toBeGreaterThan(0)
    expect(visible.length).toBeLessThan(scene.seats.length)

    const hit = hitTestSeat(scene, 101, 99, 12)
    expect(hit).not.toBeNull()
    expect(scene.seats[hit!].id).toBe('s-0-0')
    expect(hitTestSeat(scene, -500, -500, 12)).toBeNull()
  })
})

describe('printed plan', () => {
  it('emits a full-LOD sheet with stage, chairs and flank letters', () => {
    const scene = buildScene({
      seats: gridSeats(2, 3),
      sections: [{ id: 'sec-1', name: 'Stalls', color: '#1F5673' }],
      colorForSeat: () => '#1F5673',
    })
    const svg = sceneToPrintSvg(scene, 'Play House')
    expect(svg).toContain('<svg')
    expect(svg).toContain('PLAY HOUSE')
    expect(svg).toContain('STAGE')
    expect(svg).toContain('STALLS')
    // One back and one pan per chair.
    expect(svg.split(CHAIR_BACK_PATH).length - 1).toBe(6)
    expect(svg.split(CHAIR_PAN_PATH).length - 1).toBe(6)
    expect(svg).not.toContain('undefined')
  })
})
