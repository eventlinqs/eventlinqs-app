/**
 * Seat layout generation - the pure core of the reserved-seating builder.
 *
 * The organiser composes BLOCKS (row blocks, round or square tables, standing
 * areas). This module turns those blocks into the exact layout JSONB shape
 * `materialize_seats` consumes ({ sections: [{ name, color, tier_name,
 * rows: [{ label, seats: [{ number, type, blocked, x, y }] }] }], areas }),
 * with every seat given absolute canvas coordinates.
 *
 * Pure functions, no I/O: the builder previews with the same maths the server
 * saves, and the unit tests pin the geometry and numbering rules. There is no
 * capacity ceiling anywhere in this module; capacity is whatever the
 * organiser draws.
 */

export type NumberingScheme = 'numeric' | 'alpha'
export type SeatTypeName =
  | 'standard'
  | 'premium'
  | 'accessible'
  | 'companion'
  | 'restricted_view'
  | 'obstructed'

interface BlockBase {
  /** Stable client id for builder editing. */
  id: string
  /** Section this block belongs to (sections may span multiple blocks). */
  section: string
  /** Optional ticket tier bound by NAME at event attach time. */
  tierName?: string
  /** Section colour (first block of a section wins). */
  color?: string
  /** Block origin on the canvas. */
  x: number
  y: number
  /** Rotation around the block origin, degrees clockwise. */
  rotation?: number
}

export interface RowsBlock extends BlockBase {
  kind: 'rows'
  rows: number
  /** Uniform seats per row, or an explicit per-row list (irregular rooms). */
  seatsPerRow: number | number[]
  /** Row labelling: alphabetical (A, B, ... Z, AA, AB) or numeric. */
  rowLabelScheme?: NumberingScheme
  /** Starting row label: a letter for alpha ('A'), a number for numeric (1). */
  rowLabelStart?: string | number
  /** First seat number in each row (default 1). */
  seatStart?: number
  /** Reverse seat numbering direction. */
  reverseSeats?: boolean
  /**
   * Horizontal alignment for uneven rows: 'left' anchors every row to the
   * block origin (historic default); 'centre' centres each shorter row over
   * the block's widest row (the theatre look).
   */
  align?: 'left' | 'centre'
  /** Bow depth in px for curved rows (0 or absent = straight). */
  curveDepth?: number
  /**
   * Back-row bow depth. When set, each row's bow interpolates linearly from
   * `curveDepth` (front row) to `curveBack` (back row), so the room can
   * flatten or deepen towards the rear. Absent = every row uses curveDepth
   * (the historic behaviour, byte-identical for existing charts).
   */
  curveBack?: number
  /** Explicit per-row bow overrides, keyed by row INDEX as a string ("0"). */
  rowCurveOverrides?: Record<string, number>
  /**
   * Automatic bowing toward the focal point: rows become true concentric
   * arcs centred above the block (the stage), seats spaced evenly ALONG
   * each arc so aisles radiate from the focal point the way a real theatre
   * rakes. When on, it wins over the manual bow controls.
   */
  autoBow?: boolean
  /**
   * Distance in px from the block's top row up to the arc centre used by
   * autoBow. Smaller = tighter curve. Default 160.
   */
  focalRise?: number
  /**
   * Horizontal shear in px per row: each row shifts sideways by
   * `skew * rowIndex`, the angled-bank look. Ignored under autoBow
   * (concentric geometry already angles the room).
   */
  skew?: number
  rowSpacing?: number
  seatSpacing?: number
  /**
   * Brick-bond stagger: odd rows shift sideways by this many px, the way a
   * real house offsets rows so heads do not align. Ignored under autoBow.
   */
  stagger?: number
  /**
   * Row label direction: 'down' labels A at the front (historic default);
   * 'up' labels A at the back row.
   */
  rowOrder?: 'down' | 'up'
  /**
   * Seat number direction: 'ltr' numbers from stage left (historic
   * default); 'rtl' numbers from stage right. Wins over the legacy
   * `reverseSeats` flag when present.
   */
  seatOrder?: 'ltr' | 'rtl'
  /** Seat refs ("A-1") marked accessible / companion / blocked, or removed. */
  accessibleSeats?: string[]
  companionSeats?: string[]
  blockedSeats?: string[]
  removedSeats?: string[]
  /** Per-seat label overrides: ref -> display number. */
  labelOverrides?: Record<string, string>
  /** Per-seat notes: ref -> instruction ("Enter via Door G"). */
  notes?: Record<string, string>
}

export interface TableBlock extends BlockBase {
  kind: 'table'
  shape: 'round' | 'square'
  /** Table label; doubles as the row_label so seats read "Table 1, Seat 3". */
  label: string
  seats: number
  seatLabelScheme?: NumberingScheme
  seatStart?: number
  radius?: number
  accessibleSeats?: string[]
  companionSeats?: string[]
  blockedSeats?: string[]
  /** Per-seat label overrides: ref -> display number. */
  labelOverrides?: Record<string, string>
  /** Per-seat notes: ref -> instruction. */
  notes?: Record<string, string>
}

/**
 * Standing / general-admission zone, or a scenery annotation. Produces NO
 * reserved seats: a 'zone' renders on the map and sells through its bound GA
 * ticket tier's normal capacity; 'scenery' is a pure room annotation (bar,
 * mixing desk, exit, cloakroom) that sells nothing and orients everyone.
 */
export interface AreaBlock extends BlockBase {
  kind: 'area'
  label: string
  width: number
  height: number
  capacity?: number
  /** 'zone' (default, sells via its GA tier) or 'scenery' (annotation only). */
  style?: 'zone' | 'scenery'
}

/**
 * A vertical or horizontal aisle: a void punched through the seat field.
 * Every seat on the far side of the aisle's line, within its span, shifts
 * outward by the aisle's width, so blocks split visibly and the cascade's
 * gap detection sees a real gap. Produces no seats itself.
 */
export interface AisleBlock extends BlockBase {
  kind: 'aisle'
  orientation: 'vertical' | 'horizontal'
  /** Span along the aisle's own axis. */
  length: number
  /** The gap forced through the field, in px. */
  width: number
}

/** The stage as geometry: one per chart, drawn by the renderer. */
export interface StageBlockDef extends BlockBase {
  kind: 'stage'
  shape: 'proscenium' | 'thrust' | 'round' | 'band'
  width: number
  depth: number
}

/** A designed venue object (bar, food, toilets, stairs...), display-only. */
export interface ObjectBlock extends BlockBase {
  kind: 'object'
  object:
    | 'bar'
    | 'food'
    | 'toilet'
    | 'entrance'
    | 'exit'
    | 'stairs'
    | 'lift'
    | 'balcony'
    | 'box'
    | 'rail'
  width: number
  height: number
  label?: string
}

/** A free text caption on the plan. */
export interface TextBlock extends BlockBase {
  kind: 'text'
  text: string
  size?: number
}

/** A free-floating glyph without the chip. */
export interface IconBlock extends BlockBase {
  kind: 'icon'
  object: ObjectBlock['object']
  size?: number
}

export type SeatBlock =
  | RowsBlock
  | TableBlock
  | AreaBlock
  | AisleBlock
  | StageBlockDef
  | ObjectBlock
  | TextBlock
  | IconBlock

export interface GeneratedSeat {
  number: string
  type: SeatTypeName
  blocked?: boolean
  /** Organiser note materialised onto the seat and shown on the ticket. */
  note?: string
  x: number
  y: number
  /** Builder round-trip: the block-scoped seat reference ("A-3", "Table 1-2"). */
  ref?: string
  /** Builder round-trip: the block that generated this seat. */
  blockId?: string
}

export interface GeneratedRow {
  label: string
  seats: GeneratedSeat[]
}

export interface GeneratedSection {
  name: string
  color: string
  tier_name?: string
  sort_order: number
  rows: GeneratedRow[]
}

export interface GeneratedArea {
  label: string
  section: string
  tier_name?: string
  color: string
  x: number
  y: number
  width: number
  height: number
  capacity?: number
  /** 'zone' (default) or 'scenery' (annotation only, sells nothing). */
  style?: 'zone' | 'scenery'
}

/** A display-only plan object carried to every renderer via the layout. */
export interface GeneratedObject {
  kind: 'object' | 'text' | 'icon'
  object?: ObjectBlock['object']
  text?: string
  x: number
  y: number
  width?: number
  height?: number
  rotation?: number
  label?: string
  size?: number
}

/** The stage geometry carried to every renderer via the layout. */
export interface GeneratedStage {
  shape: StageBlockDef['shape']
  x: number
  y: number
  width: number
  depth: number
  rotation?: number
}

export interface GeneratedLayout {
  version: 2
  /** The editable source of truth: re-open the builder from these. */
  blocks: SeatBlock[]
  /** The materialisable shape consumed by materialize_seats. */
  sections: GeneratedSection[]
  /** Display-only GA zones. */
  areas: GeneratedArea[]
  /** The stage as geometry, when the organiser placed one. */
  stage?: GeneratedStage
  /** Designed venue objects, text and icons. */
  objects?: GeneratedObject[]
  totalSeats: number
}

const DEFAULT_ROW_SPACING = 26
const DEFAULT_SEAT_SPACING = 24
const DEFAULT_SECTION_COLOR = '#D4A017' // gold-500 token value

/** Excel-style alphabetical label: 0 -> A, 25 -> Z, 26 -> AA. */
export function alphaLabel(index: number): string {
  let n = index
  let out = ''
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out
}

/** Inverse start offset for an alpha start label like 'C' or 'AA'. */
function alphaOffset(start: string): number {
  let n = 0
  for (const ch of start.toUpperCase()) {
    const c = ch.charCodeAt(0) - 64
    if (c < 1 || c > 26) return 0
    n = n * 26 + c
  }
  return n - 1
}

function rotate(px: number, py: number, ox: number, oy: number, deg: number): { x: number; y: number } {
  if (!deg) return { x: px, y: py }
  const rad = (deg * Math.PI) / 180
  const dx = px - ox
  const dy = py - oy
  return {
    x: ox + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: oy + dx * Math.sin(rad) + dy * Math.cos(rad),
  }
}

function seatType(ref: string, block: { accessibleSeats?: string[]; companionSeats?: string[] }): SeatTypeName {
  if (block.accessibleSeats?.includes(ref)) return 'accessible'
  if (block.companionSeats?.includes(ref)) return 'companion'
  return 'standard'
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * The bow depth for one row: an explicit per-row override wins; otherwise
 * the front-to-back interpolation (curveDepth to curveBack); a block with
 * neither keeps the historic single-depth behaviour byte for byte.
 */
function rowBowDepth(block: RowsBlock, rowIndex: number): number {
  const override = block.rowCurveOverrides?.[String(rowIndex)]
  if (typeof override === 'number' && Number.isFinite(override)) {
    return Math.max(0, override)
  }
  const front = block.curveDepth ?? 0
  const back = block.curveBack ?? front
  if (block.rows <= 1) return front
  const t = rowIndex / (block.rows - 1)
  return front + (back - front) * t
}

function generateRowsBlock(block: RowsBlock): GeneratedRow[] {
  const rows: GeneratedRow[] = []
  const rowSpacing = block.rowSpacing ?? DEFAULT_ROW_SPACING
  const seatSpacing = block.seatSpacing ?? DEFAULT_SEAT_SPACING
  const scheme = block.rowLabelScheme ?? 'alpha'
  const startOffset =
    scheme === 'alpha'
      ? alphaOffset(String(block.rowLabelStart ?? 'A'))
      : Number(block.rowLabelStart ?? 1)

  // Centre alignment: shorter rows centre over the block's widest row.
  const maxCount = Array.isArray(block.seatsPerRow)
    ? Math.max(0, ...block.seatsPerRow)
    : block.seatsPerRow

  // Auto-bow: the arc centre sits focalRise above the front row, on the
  // block's horizontal centre; every row is a true circle around it.
  const focalRise = Math.max(40, block.focalRise ?? 160)
  const focalX = block.x + (Math.max(1, maxCount) - 1) * seatSpacing * 0.5
  const focalY = block.y - focalRise

  // Directionality: 'up' labels row A at the back; 'rtl' numbers from
  // stage right. `seatOrder` wins over the legacy reverseSeats flag.
  const reverse = block.seatOrder ? block.seatOrder === 'rtl' : (block.reverseSeats ?? false)

  for (let r = 0; r < block.rows; r++) {
    const labelIdx = block.rowOrder === 'up' ? block.rows - 1 - r : r
    const label =
      scheme === 'alpha' ? alphaLabel(startOffset + labelIdx) : String(startOffset + labelIdx)
    const count = Array.isArray(block.seatsPerRow)
      ? (block.seatsPerRow[r] ?? 0)
      : block.seatsPerRow
    if (count <= 0) continue

    const centreShift =
      block.align === 'centre' ? ((maxCount - count) / 2) * seatSpacing : 0

    const seats: GeneratedSeat[] = []
    for (let i = 0; i < count; i++) {
      const seatIdx = reverse ? count - 1 - i : i
      const seatNo = (block.seatStart ?? 1) + seatIdx
      const ref = `${label}-${seatNo}`
      if (block.removedSeats?.includes(ref)) continue

      let rawX: number
      let rawY: number
      if (block.autoBow) {
        // Concentric geometry: this row's radius from the shared arc
        // centre, seats spread evenly ALONG the arc (constant arc length,
        // so aisles radiate and back rows flatten naturally: the way a
        // real room rakes toward its stage).
        const radius = focalRise + r * rowSpacing
        const step = seatSpacing / radius // radians whose arc length = seatSpacing
        const theta = (i - (count - 1) / 2) * step
        rawX = focalX + radius * Math.sin(theta)
        rawY = focalY + radius * Math.cos(theta)
      } else {
        // Manual curve: a symmetric bow, deepest mid-row (t = 0.5), with
        // per-row depth from the overrides or the front-to-back pair, an
        // optional per-row horizontal shear (skew), and the brick-bond
        // stagger on odd rows.
        const t = count === 1 ? 0.5 : i / (count - 1)
        const bow = rowBowDepth(block, r) * Math.sin(Math.PI * t)
        rawX =
          block.x +
          centreShift +
          i * seatSpacing +
          r * (block.skew ?? 0) +
          (r % 2) * (block.stagger ?? 0)
        rawY = block.y + r * rowSpacing - bow
      }
      const { x, y } = rotate(rawX, rawY, block.x, block.y, block.rotation ?? 0)

      seats.push({
        number: block.labelOverrides?.[ref] ?? String(seatNo),
        type: seatType(ref, block),
        ...(block.blockedSeats?.includes(ref) ? { blocked: true } : {}),
        ...(block.notes?.[ref] ? { note: block.notes[ref] } : {}),
        x: round2(x),
        y: round2(y),
        ref,
        blockId: block.id,
      })
    }
    if (seats.length > 0) rows.push({ label, seats })
  }
  return rows
}

function generateTableBlock(block: TableBlock): GeneratedRow {
  const n = Math.max(1, block.seats)
  const radius = block.radius ?? Math.max(34, 10 + n * 4)
  const seats: GeneratedSeat[] = []

  for (let i = 0; i < n; i++) {
    const seatNo = (block.seatStart ?? 1) + i
    const numberLabel =
      (block.seatLabelScheme ?? 'numeric') === 'alpha' ? alphaLabel(seatNo - 1) : String(seatNo)
    const ref = `${block.label}-${numberLabel}`

    let rawX: number
    let rawY: number
    if (block.shape === 'round') {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n
      rawX = block.x + radius * Math.cos(angle)
      rawY = block.y + radius * Math.sin(angle)
    } else {
      // Square table: distribute clockwise around the perimeter.
      const perSide = Math.ceil(n / 4)
      const side = Math.floor(i / perSide)
      const idxOnSide = i % perSide
      const step = (radius * 2) / (perSide + 1)
      const offset = -radius + step * (idxOnSide + 1)
      if (side === 0) { rawX = block.x + offset; rawY = block.y - radius }
      else if (side === 1) { rawX = block.x + radius; rawY = block.y + offset }
      else if (side === 2) { rawX = block.x - offset; rawY = block.y + radius }
      else { rawX = block.x - radius; rawY = block.y - offset }
    }
    const { x, y } = rotate(rawX, rawY, block.x, block.y, block.rotation ?? 0)

    seats.push({
      number: block.labelOverrides?.[ref] ?? numberLabel,
      type: seatType(ref, block),
      ...(block.blockedSeats?.includes(ref) ? { blocked: true } : {}),
      ...(block.notes?.[ref] ? { note: block.notes[ref] } : {}),
      x: round2(x),
      y: round2(y),
      ref,
      blockId: block.id,
    })
  }
  return { label: block.label, seats }
}

export interface LayoutIssue {
  blockId: string
  message: string
}

/** Duplicate seat identities within a section are build-time errors. */
export function validateLayout(layout: GeneratedLayout): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  for (const section of layout.sections) {
    const seen = new Set<string>()
    for (const row of section.rows) {
      for (const seat of row.seats) {
        const key = `${row.label}|${seat.number}`
        if (seen.has(key)) {
          issues.push({
            blockId: section.name,
            message: `Duplicate seat in section "${section.name}": row ${row.label} seat ${seat.number}`,
          })
        }
        seen.add(key)
      }
    }
  }
  return issues
}

/**
 * Punch the aisles through the generated seats: every seat past a vertical
 * aisle's line (within its span) shifts right by the aisle width; every
 * seat below a horizontal aisle's line shifts down. The cascade's
 * self-calibrating gap detection then reads the void as a real aisle.
 */
function applyAisles(sections: GeneratedSection[], aisles: AisleBlock[]): void {
  for (const aisle of aisles) {
    for (const section of sections) {
      for (const row of section.rows) {
        for (const seat of row.seats) {
          if (aisle.orientation === 'vertical') {
            if (seat.x > aisle.x && seat.y >= aisle.y && seat.y <= aisle.y + aisle.length) {
              seat.x = Math.round((seat.x + aisle.width) * 100) / 100
            }
          } else {
            if (seat.y > aisle.y && seat.x >= aisle.x && seat.x <= aisle.x + aisle.length) {
              seat.y = Math.round((seat.y + aisle.width) * 100) / 100
            }
          }
        }
      }
    }
  }
}

export function generateLayout(blocks: SeatBlock[]): GeneratedLayout {
  const sectionMap = new Map<string, GeneratedSection>()
  const areas: GeneratedArea[] = []
  const aisles: AisleBlock[] = []
  const objects: GeneratedObject[] = []
  let stage: GeneratedStage | undefined
  let sortOrder = 0
  let totalSeats = 0

  for (const block of blocks) {
    if (block.kind === 'aisle') {
      aisles.push(block)
      continue
    }
    if (block.kind === 'stage') {
      stage = {
        shape: block.shape,
        x: block.x,
        y: block.y,
        width: block.width,
        depth: block.depth,
        ...(block.rotation ? { rotation: block.rotation } : {}),
      }
      continue
    }
    if (block.kind === 'object' || block.kind === 'text' || block.kind === 'icon') {
      objects.push({
        kind: block.kind,
        x: block.x,
        y: block.y,
        ...(block.kind !== 'text' ? { object: block.object } : {}),
        ...(block.kind === 'text' ? { text: block.text, size: block.size } : {}),
        ...(block.kind === 'icon' ? { size: block.size } : {}),
        ...(block.kind === 'object'
          ? { width: block.width, height: block.height, label: block.label }
          : {}),
        ...(block.rotation ? { rotation: block.rotation } : {}),
      })
      continue
    }
    if (block.kind === 'area') {
      areas.push({
        label: block.label,
        section: block.section,
        ...(block.tierName ? { tier_name: block.tierName } : {}),
        color: block.color ?? DEFAULT_SECTION_COLOR,
        x: block.x,
        y: block.y,
        width: block.width,
        height: block.height,
        ...(block.capacity != null ? { capacity: block.capacity } : {}),
        ...(block.style === 'scenery' ? { style: 'scenery' as const } : {}),
      })
      continue
    }

    let section = sectionMap.get(block.section)
    if (!section) {
      section = {
        name: block.section,
        color: block.color ?? DEFAULT_SECTION_COLOR,
        ...(block.tierName ? { tier_name: block.tierName } : {}),
        sort_order: sortOrder++,
        rows: [],
      }
      sectionMap.set(block.section, section)
    } else if (block.tierName && !section.tier_name) {
      section.tier_name = block.tierName
    }

    const rows = block.kind === 'rows' ? generateRowsBlock(block) : [generateTableBlock(block)]
    for (const row of rows) {
      totalSeats += row.seats.length
      const existing = section.rows.find(r => r.label === row.label)
      if (existing) existing.seats.push(...row.seats)
      else section.rows.push(row)
    }
  }

  const sections = [...sectionMap.values()]
  applyAisles(sections, aisles)

  return {
    version: 2,
    blocks,
    sections,
    areas,
    ...(stage ? { stage } : {}),
    ...(objects.length > 0 ? { objects } : {}),
    totalSeats,
  }
}
