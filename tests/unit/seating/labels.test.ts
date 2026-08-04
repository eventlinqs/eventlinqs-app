import { describe, expect, it } from 'vitest'
import { assertLabelCollisions, placeLabels, seatObstacles, objectObstacles, stageObstacles } from '@/lib/seating/render/labels'
import { lodFlags } from '@/lib/seating/render/lod'
import { buildScene, type SceneSeatInput } from '@/lib/seating/render/scene'

const measure = (text: string, px: number) => text.length * px * 0.62

function grid(rows: number, cols: number, section = 'sec-1'): SceneSeatInput[] {
  const out: SceneSeatInput[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({
        id: `${section}-${r}-${c}`,
        x: 100 + c * 24,
        y: 100 + r * 24,
        row_label: String.fromCharCode(65 + r),
        seat_number: String(c + 1),
        seat_type: 'standard',
        status: 'available',
        seat_map_section_id: section,
        ticket_tier_id: null,
      })
    }
  }
  return out
}

function place(scale: number, width = 1440, height = 900) {
  const scene = buildScene({
    seats: grid(8, 12),
    sections: [{ id: 'sec-1', name: 'Stalls', color: '#1F5673' }],
    objects: [
      { kind: 'object', object: 'bar', x: 60, y: 320, width: 120, height: 36, label: 'Long bar' },
    ],
    priceForSeat: () => 8900,
  })
  const camera = { scale, tx: 40, ty: 40 }
  const flags = lodFlags(scale)
  const labels = placeLabels({
    scene,
    camera,
    width,
    height,
    flags,
    chairPx: scene.chairW * scale,
    formatPrice: c => `AUD ${(c / 100).toFixed(2)}`,
    measure,
  })
  const seats = flags.seats ? seatObstacles(scene, camera, width, height, scene.chairW * scale) : []
  return { labels, seats, objects: objectObstacles(scene, camera), scene, camera }
}

describe('the label placement engine (task 2)', () => {
  it('places zero-collision labels at all three LOD scales', () => {
    for (const scale of [0.24, 0.5, 1.1]) {
      const { labels, seats, objects } = place(scale)
      const counts = assertLabelCollisions(labels, seats, objects)
      expect(counts.labelSeat).toBe(0)
      expect(counts.labelLabel).toBe(0)
      expect(counts.labelObject).toBe(0)
      // Past overview the plan always carries letters and rulers. At
      // overview this small fixture's polygon cannot host its name, and
      // the restraint law DROPS a name that does not fit inside: zero
      // labels is the correct output there, never a leader to the margin.
      if (scale > 0.3) expect(counts.labels).toBeGreaterThan(0)
    }
  })

  it('drops row letters rather than piling them up', () => {
    // At a tiny scale the rows are 3px apart: letters must thin out, and
    // the kept ones must never overlap vertically per gutter.
    const { labels } = place(0.32)
    const letters = labels.filter(l => l.kind === 'rowLetter')
    const leftGutter = letters.filter(l => l.cx < 200).sort((a, b) => a.y - b.y)
    for (let i = 1; i < leftGutter.length; i++) {
      expect(leftGutter[i].y).toBeGreaterThanOrEqual(leftGutter[i - 1].y + leftGutter[i - 1].h)
    }
  })

  it('keeps the overview section label inside a room-sized polygon', () => {
    const scene = buildScene({
      seats: grid(20, 30),
      sections: [{ id: 'sec-1', name: 'Stalls', color: '#1F5673' }],
      priceForSeat: () => 8900,
    })
    const camera = { scale: 0.26, tx: 40, ty: 40 }
    const labels = placeLabels({
      scene,
      camera,
      width: 1440,
      height: 900,
      flags: lodFlags(0.26),
      chairPx: scene.chairW * 0.26,
      formatPrice: c => `AUD ${(c / 100).toFixed(2)}`,
      measure,
    })
    const section = labels.find(l => l.kind === 'section')
    expect(section).toBeDefined()
    expect(section!.sublabel).toContain('AUD 89.00')
  })

  it('section names exist at overview only, always placed, never with a leader', () => {
    // SUPERSEDES the old assertion that a tiny polygon DROPS its name. A
    // cabaret room is a dozen small polygons, and dropping their names left a
    // buyer looking at anonymous blobs. Every polygon is now named at
    // overview: it is placed inside its own outline when it fits and centred
    // on the polygon when it cannot. What has NOT changed: no leader line
    // exists anywhere, and past overview no section name is placed at all.
    const seats = grid(2, 2, 'tiny')
    const scene = buildScene({
      seats,
      sections: [{ id: 'tiny', name: 'Royal Circle Boxes', color: '#7A1F3D' }],
    })
    const placeAt = (scale: number) =>
      placeLabels({
        scene,
        camera: { scale, tx: 40, ty: 40 },
        width: 1440,
        height: 900,
        flags: lodFlags(scale),
        chairPx: scene.chairW * scale,
        formatPrice: c => `AUD ${(c / 100).toFixed(2)}`,
        measure,
      })
    for (const scale of [0.5, 1.1]) {
      expect(placeAt(scale).filter(l => l.kind === 'section')).toHaveLength(0)
    }
    const overview = placeAt(0.26)
    const named = overview.find(l => l.kind === 'section')
    expect(named).toBeDefined()
    expect(named!.text).toBe('ROYAL CIRCLE BOXES')
    expect(overview.some(l => 'leader' in l && (l as Record<string, unknown>).leader)).toBe(false)
  })

  it('free captions place for the builder only, never the buyer plan', () => {
    const scene = buildScene({
      seats: grid(8, 12),
      sections: [{ id: 'sec-1', name: 'Stalls', color: '#1F5673' }],
      objects: [{ kind: 'text', text: 'Cloakroom', x: 60, y: 340, size: 12 }],
    })
    const placeWith = (builderInk: boolean) =>
      placeLabels({
        scene,
        camera: { scale: 0.6, tx: 40, ty: 40 },
        width: 1440,
        height: 900,
        flags: lodFlags(0.6),
        chairPx: scene.chairW * 0.6,
        formatPrice: c => `AUD ${(c / 100).toFixed(2)}`,
        measure,
        builderInk,
      })
    expect(placeWith(false).filter(l => l.kind === 'caption')).toHaveLength(0)
    expect(placeWith(true).filter(l => l.kind === 'caption')).toHaveLength(1)
  })
})

describe('the stage is ink: no label may sit on it', () => {
  // The mobile mid-zoom regression: ruler marks anchor one pitch above their
  // block's front row, and on a room whose front row sits close under the
  // apron that anchor lands on the stage. Seats and objects were obstacles;
  // the stage was not, so the numerals were drawn straight onto its outline.
  function sceneWithTightStage() {
    return buildScene({
      seats: grid(6, 10),
      sections: [{ id: 'sec-1', name: 'Stalls', color: '#1F5673' }],
      // A proscenium whose apron sits directly above the front row (y 100),
      // so the ruler's y - pitch anchor (y 76) is inside the stage box.
      stage: { shape: 'proscenium', x: 100, y: 40, width: 240, depth: 50 },
      priceForSeat: () => 8900,
    })
  }

  it('reports a stage obstacle box covering the drawn extent', () => {
    const scene = sceneWithTightStage()
    const boxes = stageObstacles(scene, { scale: 1, tx: 0, ty: 0 })
    expect(boxes).toHaveLength(1)
    expect(boxes[0].w).toBeGreaterThan(0)
    expect(boxes[0].h).toBeGreaterThan(0)
  })

  it('guards the default stage too: an unspecified stage still blocks labels', () => {
    // buildScene resolves defaultStageForBounds when the organiser drew no
    // stage, so scene.stage is present on every chart. The obstacle must
    // follow that default, not only an explicit one.
    const scene = buildScene({
      seats: grid(3, 4),
      sections: [{ id: 'sec-1', name: 'Stalls', color: '#1F5673' }],
      stage: null,
      priceForSeat: () => 8900,
    })
    expect(scene.stage).not.toBeNull()
    const boxes = stageObstacles(scene, { scale: 1, tx: 0, ty: 0 })
    expect(boxes).toHaveLength(1)
    expect(boxes[0].w).toBeGreaterThan(0)
  })

  it('places no label inside the stage box at any zoom past overview', () => {
    const scene = sceneWithTightStage()
    for (const scale of [0.4, 0.6, 0.9, 1.3]) {
      const camera = { scale, tx: 40, ty: 40 }
      const labels = placeLabels({
        scene,
        camera,
        width: 1440,
        height: 900,
        flags: lodFlags(scale),
        chairPx: scene.chairW * scale,
        formatPrice: (c: number) => `$${(c / 100).toFixed(0)}`,
        measure,
      })
      const stage = stageObstacles(scene, camera)[0]
      for (const label of labels) {
        const hits =
          label.x < stage.x + stage.w &&
          label.x + label.w > stage.x &&
          label.y < stage.y + stage.h &&
          label.y + label.h > stage.y
        expect(hits, `"${label.text}" (${label.kind}) sits on the stage at scale ${scale}`).toBe(false)
      }
    }
  })
})
