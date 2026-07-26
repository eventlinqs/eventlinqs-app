import { describe, expect, it } from 'vitest'
import {
  glyphTier,
  lodFlags,
  lodState,
  LOD_OVERVIEW_MAX,
  LOD_SEAT_MIN,
  NUMERAL_MIN,
  ROW_LETTER_MIN,
} from '@/lib/seating/render/lod'
import { convexHull, pointInHull, polygonCentroid } from '@/lib/seating/render/polygons'
import { defaultStageForBounds, stageGeometry } from '@/lib/seating/render/stage'
import { buildScene, cullSeats, estimatePitch, hitTestSeat, type SceneSeatInput } from '@/lib/seating/render/scene'
import { CHAIR_BACK_PATH, CHAIR_MARK_PATH, CHAIR_MID_PATH, CHAIR_PAN_PATH, OBJECT_GLYPHS } from '@/lib/seating/render/glyphs'
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

  it('overview draws polygons only: zero seats, zero numerals', () => {
    const flags = lodFlags(0.2)
    expect(flags.state).toBe('overview')
    expect(flags.seats).toBe(false)
    expect(flags.polygonFill).toBe(true)
    expect(flags.numerals).toBe(false)
    expect(flags.rowLetters).toBe(false)
  })

  it('mid draws chairs and flank letters but never numerals', () => {
    const early = lodFlags(0.35)
    expect(early.seats).toBe(true)
    expect(early.rowLetters).toBe(false)
    const late = lodFlags(ROW_LETTER_MIN)
    expect(late.rowLetters).toBe(true)
    expect(late.numerals).toBe(false)
  })

  it('seat state carries numerals from the numeral threshold', () => {
    expect(lodFlags(0.8).numerals).toBe(false)
    expect(lodFlags(NUMERAL_MIN).numerals).toBe(true)
    expect(lodFlags(NUMERAL_MIN).rowLetters).toBe(true)
  })

  it('glyph tier degrades full to mid to mark by chair pixels', () => {
    expect(glyphTier(20)).toBe('full')
    expect(glyphTier(14)).toBe('full')
    expect(glyphTier(10)).toBe('mid')
    expect(glyphTier(6)).toBe('mid')
    expect(glyphTier(5)).toBe('mark')
  })
})

describe('chair glyph', () => {
  it('ships one silhouette in three sizes as real paths', () => {
    for (const path of [CHAIR_BACK_PATH, CHAIR_PAN_PATH, CHAIR_MID_PATH, CHAIR_MARK_PATH]) {
      expect(path).toMatch(/^M[\d.]/)
      expect(path.endsWith('Z')).toBe(true)
    }
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
