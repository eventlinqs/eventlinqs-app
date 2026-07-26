import { describe, expect, it } from 'vitest'
import { assertLabelCollisions, placeLabels, seatObstacles, objectObstacles } from '@/lib/seating/render/labels'
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
      expect(counts.labels).toBeGreaterThan(0)
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
    expect(section!.leader).toBeUndefined()
    expect(section!.sublabel).toContain('AUD 89.00')
  })

  it('moves a label to the margin with a leader when the interior is full', () => {
    // A tiny 2x2 section cannot host its name at seat zoom: the label
    // must leave the seats and carry a leader line.
    const seats = grid(2, 2, 'tiny')
    const scene = buildScene({
      seats,
      sections: [{ id: 'tiny', name: 'Royal Circle Boxes', color: '#7A1F3D' }],
    })
    const camera = { scale: 0.5, tx: 40, ty: 40 }
    const labels = placeLabels({
      scene,
      camera,
      width: 1440,
      height: 900,
      flags: lodFlags(0.5),
      chairPx: scene.chairW * 0.5,
      formatPrice: c => `AUD ${(c / 100).toFixed(2)}`,
      measure,
    })
    const section = labels.find(l => l.kind === 'section')
    expect(section).toBeDefined()
    expect(section!.leader).toBeDefined()
    const counts = assertLabelCollisions(
      labels,
      seatObstacles(scene, camera, 1440, 900, scene.chairW * 0.5),
      [],
    )
    expect(counts.labelSeat).toBe(0)
  })
})
