/**
 * Section polygons, first class: the convex hull of each section's seats,
 * padded by one seat pitch, labelled in place with the section name and its
 * price range. The painter rounds the corners by stroking the hull with a
 * thick round-joined line in the fill tone before filling.
 */

export interface HullPoint {
  x: number
  y: number
}

/** Andrew monotone chain convex hull, O(n log n). */
export function convexHull(points: HullPoint[]): HullPoint[] {
  if (points.length <= 2) return [...points]
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (o: HullPoint, a: HullPoint, b: HullPoint) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: HullPoint[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop()
    }
    lower.push(p)
  }
  const upper: HullPoint[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop()
    }
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return [...lower, ...upper]
}

export interface SectionPolygon {
  sectionId: string
  name: string
  hull: HullPoint[]
  centroid: HullPoint
  /** One seat pitch: the painter's pad and corner radius. */
  pad: number
  /** Price range across the section's seats, in cents. */
  minPriceCents: number | null
  maxPriceCents: number | null
  /** The hue the polygon wears (the section's dominant tier hue). */
  color: string
}

export function polygonCentroid(hull: HullPoint[]): HullPoint {
  if (hull.length === 0) return { x: 0, y: 0 }
  if (hull.length < 3) {
    return {
      x: hull.reduce((s, p) => s + p.x, 0) / hull.length,
      y: hull.reduce((s, p) => s + p.y, 0) / hull.length,
    }
  }
  // Area-weighted centroid so long thin wedges label at their visual centre.
  let area = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]
    const b = hull[(i + 1) % hull.length]
    const w = a.x * b.y - b.x * a.y
    area += w
    cx += (a.x + b.x) * w
    cy += (a.y + b.y) * w
  }
  if (Math.abs(area) < 1e-6) return polygonCentroid(hull.slice(0, 2))
  area *= 0.5
  return { x: cx / (6 * area), y: cy / (6 * area) }
}

/** A point-in-polygon test for hit-testing polygons at overview zoom. */
export function pointInHull(p: HullPoint, hull: HullPoint[], pad: number): boolean {
  if (hull.length === 0) return false
  if (hull.length <= 2) {
    // Degenerate: within pad of the segment or point.
    const a = hull[0]
    const b = hull[hull.length - 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
    const qx = a.x + t * dx
    const qy = a.y + t * dy
    return Math.hypot(p.x - qx, p.y - qy) <= pad
  }
  let inside = false
  for (let i = 0, j = hull.length - 1; i < hull.length; j = i++) {
    const a = hull[i]
    const b = hull[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}
