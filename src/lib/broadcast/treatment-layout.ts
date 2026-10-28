/**
 * THE THREE CREATIVE TREATMENTS, AS MEASURED LAYOUTS (Lawal's approval of 28 October 2026, 19:52: "the final creative
 * approval"; the references are C:\dev\EVIDENCE\CREATIVE-APPROVED-28OCT\photo\p.py and its out folder).
 *
 *   A  authentic event photography: the organiser's own photograph, only through an approved, logged yes (J1 to J4);
 *   B  premium editorial typography: the default when no authorised photograph exists, never a stand-in photo;
 *   C  original graphic art: EventLinqs' own drawn shapes, selective (the organiser campaign, a brand piece with no
 *      licensed photograph). Never a cartoon, never generated (Law 6).
 *
 * Each treatment is laid out natively for each format, never one poster resized (the directive's section 6):
 *   portrait 4:5, designed on 1080 x 1350, the width Instagram keeps (https://help.instagram.com/1631821640426723:
 *   "we size it down to a width of 1080 pixels"), and drawn at 1440 x 1800, the 4:5 size Meta names for the Facebook
 *   feed (https://www.facebook.com/business/help/469767027114079), both as social-card-spec.ts quotes them;
 *   square 1:1 at 1080 x 1080 (https://www.facebook.com/business/help/469767027114079); story 9:16 at 1080 x 1920
 *   with the top and bottom 250 px clear of words and logos (https://www.facebook.com/business/help/201503794673956).
 *
 * PURE. Every word is measured with the face it is drawn in before it is placed, so the drawing never wraps or clips on
 * its own: what this returns is exactly what treatments.tsx draws, and tests/unit/broadcast/treatment-layout.test.ts
 * holds every run to its box, the safe area and its contrast. All numbers are in 1080-wide design units.
 */

export type Treatment = 'photo' | 'type' | 'graphic'
export type TreatmentFormat = 'portrait' | 'square' | 'story'
export type Measure = (text: string, size: number) => number

/** The faces a layout measures with, by the name it draws them under. */
export type Face = 'condensed' | 'compressed' | 'archivo' | 'manrope500' | 'manrope600' | 'manrope700' | 'manrope800'
export type Measurers = Record<Face, Measure>

export const NAVY = '#0A0E1A'
export const GOLD = '#E8B738'
export const INK = '#F6F1E6'

export type Rgb = readonly [number, number, number]

export function rgbOf(hex: string): Rgb {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

export function hexOf([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

/** a over b at alpha. */
export function mix(a: Rgb, b: Rgb, alpha: number): Rgb {
  return [a[0] * alpha + b[0] * (1 - alpha), a[1] * alpha + b[1] * (1 - alpha), a[2] * alpha + b[2] * (1 - alpha)]
}

/** WCAG 2 contrast ratio (https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio). */
export function contrast(a: Rgb, b: Rgb): number {
  const lum = (c: Rgb) => {
    const [r, g, bl] = c.map((v) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * The type-led grounds: the approved Ceberano reference's own stops for a concert, and for the other compositions the
 * same three-stop fall to navy taken from the accent the slots already carry (campaign-slides.tsx), so no colour is
 * invented here.
 */
export type Ground = { glow: string; mid: string; deep: string }
const CONCERT_GROUND: Ground = { glow: '#B4532A', mid: '#5A1830', deep: '#160A1E' }

export function groundFor(accent: string, composition: string): Ground {
  if (composition === 'concert') return CONCERT_GROUND
  const a = rgbOf(accent)
  const n = rgbOf(NAVY)
  return { glow: hexOf(mix(a, n, 0.62)), mid: hexOf(mix(a, n, 0.3)), deep: hexOf(mix(a, n, 0.1)) }
}

/** One run of words: its lines, already broken, in the face and size it is drawn in, inside its box. */
export type Run = {
  role: string
  lines: string[]
  face: Face
  size: number
  lineHeight: number
  letterSpacing: number
  color: string
  /** The darkest-case colour under the words, for the contrast check (the lightest a photograph could show there). */
  ground: string
  x: number
  y: number
  w: number
  /** Drawn as one row with others: a right-aligned run, as the credit. */
  align?: 'left' | 'right'
}

export type Block = { role: 'pill' | 'bar' | 'rule' | 'divider'; x: number; y: number; w: number; h: number; color: string }

export type Art = { kind: 'disc' | 'ring'; cx: number; cy: number; r: number; stroke: number; color: string }

export type Layout = {
  treatment: Treatment
  format: TreatmentFormat
  w: number
  h: number
  safeTop: number
  safeBottom: number
  /** Where the photograph sits, cropped to this box (treatment A). */
  photo: { x: number; y: number; w: number; h: number; url: string; focal?: { x: number; y: number } } | null
  /** Treatment A: the fall to navy; the words sit only where it is at least `solid` opaque. */
  scrim: { solidFrom: number; topShade: number } | null
  ground: Ground | null
  /** A flat ground instead (the closing slide's gold). */
  background?: string
  art: Art[]
  blocks: Block[]
  runs: Run[]
}

/** What a night's slide says, from the planner's words alone (src/lib/social/campaign.ts). */
export type NightWords = {
  title: string
  /** "Live at Costa Hall", "At Fed Square". */
  eyebrow: string
  /** "Sat 31 Oct" or "Fri 20 to Sun 22 Nov". */
  date: string
  /** "7pm", "From 11am". */
  time: string
  /** The entry line the five states allow (section E): a stated price, "Free, no ticket needed", or nothing. */
  entry: string | null
  /** The section E action: "Get tickets", "View tickets at Geelong Arts Centre", "View event details". */
  action: string
  /** The label beside the action: a domain or "Link in bio"; never drawn as if it were a link. */
  label: string
  city: string
  /** The first sentence of the summary (type-led only). */
  line: string | null
  photo: string | null
  credit: string | null
  accent: string
  composition: string
}

export type BrandWords = { headline: string; line: string; action: string; label: string; photo: string | null; credit: string | null }

export type OfferWords = { eyebrow: string; headline: string; points: string[]; url: string }

type Geometry = {
  w: number
  h: number
  pad: number
  safeTop: number
  safeBottom: number
  /** The mast's top. */
  mastY: number
  /** The photograph's box height (A). */
  photoH: number
  /** The first y at which the scrim is solid enough for words (A). */
  solidFrom: number
  titleMax: { photo: number; type: number }
  titleMin: number
  titleLines: { photo: number; type: number }
  /** The type-led title starts no higher than this. */
  typeTop: number
  showLine: boolean
  /** A story keeps this much clear above its bottom safe line for the link sticker the founder places in the app. */
  stickerZone: number
}

export const GEOMETRY: Record<TreatmentFormat, Geometry> = {
  portrait: {
    w: 1080, h: 1350, pad: 60, safeTop: 0, safeBottom: 0, mastY: 56, photoH: 920, solidFrom: 720,
    titleMax: { photo: 132, type: 278 }, titleMin: 64, titleLines: { photo: 3, type: 3 }, typeTop: 250, showLine: true, stickerZone: 0,
  },
  square: {
    w: 1080, h: 1080, pad: 56, safeTop: 0, safeBottom: 0, mastY: 52, photoH: 600, solidFrom: 470,
    titleMax: { photo: 104, type: 200 }, titleMin: 56, titleLines: { photo: 2, type: 2 }, typeTop: 190, showLine: false, stickerZone: 0,
  },
  story: {
    w: 1080, h: 1920, pad: 64, safeTop: 250, safeBottom: 250, mastY: 262, photoH: 1260, solidFrom: 1010,
    titleMax: { photo: 150, type: 300 }, titleMin: 72, titleLines: { photo: 3, type: 4 }, typeTop: 420, showLine: true, stickerZone: 190,
  },
}

/** The scrim's own stops (A), as the AMCF reference draws them, scaled to the photograph's box. */
export function scrimStops(g: Geometry): { at: number; alpha: number }[] {
  const box = g.photoH
  const s = (y: number) => Math.round((y / g.h) * 1000) / 10
  // The shade under the mast holds 3:1 for its large type over the lightest photograph (white), which the AMCF
  // reference's 0.55 at the very top did not; it then falls away before the subject.
  return [
    { at: 0, alpha: 0.7 },
    { at: s(g.mastY + 60), alpha: 0.6 },
    { at: s(g.mastY + 60 + box * 0.14), alpha: 0 },
    { at: s(box * 0.4), alpha: 0 },
    { at: s(g.solidFrom - 60), alpha: 0.78 },
    { at: s(g.solidFrom), alpha: 0.9 },
    { at: s(Math.min(g.h, box + 40)), alpha: 1 },
  ]
}

/** The lightest the ground under a word can be at y on treatment A: navy at the scrim's alpha over a white photograph. */
function photoGroundAt(g: Geometry, y: number): string {
  if (y >= g.photoH) return NAVY
  const stops = scrimStops(g).map((st) => ({ y: (st.at / 100) * g.h, alpha: st.alpha }))
  let alpha = stops[stops.length - 1].alpha
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]
    const b = stops[i + 1]
    if (y >= a.y && y <= b.y) {
      alpha = b.y === a.y ? b.alpha : a.alpha + ((y - a.y) / (b.y - a.y)) * (b.alpha - a.alpha)
      break
    }
  }
  return hexOf(mix(rgbOf(NAVY), [255, 255, 255], alpha))
}

export class FitError extends Error {}

/**
 * Greedy word breaks at a size: the lines, or null when a single word is wider than the box at this size. Words are
 * never split or hyphenated, and nothing is cut: a title is a fact.
 */
export function breakLines(text: string, measure: Measure, size: number, width: number, spacing: number): string[] | null {
  const words = text.replace(/\s+/g, ' ').trim().split(' ')
  const widthOf = (s: string) => measure(s, size) + spacing * size * Math.max(0, s.length - 1)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if (widthOf(word) > width) return null
    const next = line ? `${line} ${word}` : word
    if (widthOf(next) <= width) line = next
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

/**
 * The leading at which one line's descenders clear the next line's ascenders. Measured from the title faces' own
 * glyphs with fontkit (29 October 2026): Archivo Compressed Black's ink runs from 737 above the baseline (b, d, l) to
 * 210 below it (g, j, p, q, y) per 1000 units, 0.947 em together; Archivo Condensed Heavy 736 and 206, 0.942 em. The
 * titles were set at 0.86 to 0.9, so "Biggest" over "Treat" and "Lounge" over "Music" drew one into the other.
 */
export const INK_CLEAR_LEADING = 1

/** The leading a set of lines is drawn at: the tight one asked for, unless a line above another holds a descender. */
export function leadingFor(lines: readonly string[], asked: number): number {
  return lines.slice(0, -1).some((l) => /[gjpqyQJ,;]/.test(l)) ? Math.max(asked, INK_CLEAR_LEADING) : asked
}

/**
 * The largest size from max down to min (by 2) at which the words take at most maxLines lines and fit `height`, with
 * the leading those lines are drawn at (leadingFor).
 */
export function fit(
  text: string,
  measure: Measure,
  o: { max: number; min: number; width: number; maxLines: number; lineHeight: number; spacing: number; height?: number },
): { size: number; lines: string[]; lineHeight: number } {
  for (let size = o.max; size >= o.min; size -= 2) {
    const lines = breakLines(text, measure, size, o.width, o.spacing)
    if (!lines || lines.length > o.maxLines) continue
    const lineHeight = leadingFor(lines, o.lineHeight)
    if (o.height !== undefined && lines.length * size * lineHeight > o.height) continue
    return { size, lines, lineHeight }
  }
  throw new FitError(`"${text}" does not fit ${o.maxLines} line(s) of ${o.width} at ${o.min}px or more`)
}

const widthIn = (g: Geometry) => g.w - 2 * g.pad

function mast(g: Geometry, city: string | null, m: Measurers, ground: string, dark = true): Run[] {
  const color = dark ? INK : NAVY
  const runs: Run[] = [
    { role: 'wordmark', lines: ['EVENTLINQS'], face: 'archivo', size: 30, lineHeight: 1, letterSpacing: 0.07, color, ground, x: g.pad, y: g.mastY, w: 320 },
  ]
  if (city) {
    const size = 26
    const w = Math.min(420, Math.ceil(m.manrope700(city, size)) + 4)
    runs.push({ role: 'city', lines: [city], face: 'manrope700', size, lineHeight: 1.15, letterSpacing: 0, color, ground, x: g.w - g.pad - w, y: g.mastY + 2, w, align: 'right' })
  }
  return runs
}

/** The bottom row: the action in a gold pill (A) or a light bar with the label beside it (B), and the photo credit. */
function bottomRow(g: Geometry, t: Treatment, w: NightWords | BrandWords, m: Measurers): { runs: Run[]; blocks: Block[]; top: number } {
  const bottom = g.h - g.safeBottom - (g.safeBottom > 0 ? 0 : 52) - g.stickerZone
  const runs: Run[] = []
  const blocks: Block[] = []
  if (t === 'photo') {
    const size = 28
    const credit = w.credit ? `Photo: ${w.credit}` : null
    const creditW = credit ? Math.ceil(m.manrope600(credit, 20)) + 4 : 0
    const labelW = Math.ceil(m.manrope800(w.label, 26)) + 4
    const room = widthIn(g) - Math.max(creditW, labelW) - 40 - 52
    const action = fit(w.action, m.manrope800, { max: size, min: 22, width: room, maxLines: 1, lineHeight: 1.2, spacing: 0 })
    const pillW = Math.ceil(m.manrope800(action.lines[0], action.size)) + 52
    const pillH = Math.round(action.size * 1.2) + 28
    const top = bottom - pillH
    blocks.push({ role: 'pill', x: g.pad, y: top, w: pillW, h: pillH, color: GOLD })
    runs.push({ role: 'action', lines: action.lines, face: 'manrope800', size: action.size, lineHeight: 1.2, letterSpacing: 0, color: NAVY, ground: GOLD, x: g.pad + 26, y: top + 14, w: pillW - 52 })
    const rightW = Math.max(creditW, labelW)
    const rx = g.w - g.pad - rightW
    runs.push({ role: 'label', lines: [w.label], face: 'manrope800', size: 26, lineHeight: 1.2, letterSpacing: 0, color: INK, ground: NAVY, x: rx, y: credit ? top - 4 : top + (pillH - 31) / 2, w: rightW, align: 'right' })
    if (credit) runs.push({ role: 'credit', lines: [credit], face: 'manrope600', size: 20, lineHeight: 1.2, letterSpacing: 0, color: '#B9B6AE', ground: NAVY, x: rx, y: top + 34, w: rightW, align: 'right' })
    return { runs, blocks, top }
  }
  // B and C: a light bar, the action left, the label right (the Ceberano reference). A long provider's name takes a
  // second line and the bar grows to hold it, rather than shrinking past reading size.
  const labelW = Math.ceil(m.archivo(w.label, 28)) + 4
  const room = widthIn(g) - 64 - labelW - 28
  let action: { size: number; lines: string[] }
  try {
    action = fit(w.action, m.manrope800, { max: 32, min: 24, width: room, maxLines: 1, lineHeight: 1.2, spacing: 0 })
  } catch (error) {
    if (!(error instanceof FitError)) throw error
    action = fit(w.action, m.manrope800, { max: 30, min: 24, width: room, maxLines: 2, lineHeight: 1.2, spacing: 0 })
  }
  const barH = Math.max(96, Math.ceil(action.lines.length * action.size * 1.2) + 44)
  const top = bottom - barH
  blocks.push({ role: 'bar', x: g.pad, y: top, w: widthIn(g), h: barH, color: INK })
  const ay = top + (barH - action.lines.length * action.size * 1.2) / 2
  runs.push({ role: 'action', lines: action.lines, face: 'manrope800', size: action.size, lineHeight: 1.2, letterSpacing: 0, color: NAVY, ground: INK, x: g.pad + 32, y: ay, w: room })
  runs.push({ role: 'label', lines: [w.label], face: 'archivo', size: 28, lineHeight: 1.2, letterSpacing: 0, color: NAVY, ground: INK, x: g.w - g.pad - 32 - labelW, y: top + (barH - 34) / 2, w: labelW, align: 'right' })
  return { runs, blocks, top }
}

/** Two labelled columns, When and Entry: each value fitted to its column, at most two lines. */
function details(g: Geometry, w: NightWords, m: Measurers, bottomY: number, groundAt: (y: number) => string): { runs: Run[]; blocks: Block[]; top: number } {
  const colGap = 40
  const cols: { label: string; value: string; second: string | null }[] = [{ label: 'When', value: w.date, second: w.time || null }]
  if (w.entry) cols.push({ label: 'Entry', value: w.entry, second: null })
  const colW = cols.length === 1 ? widthIn(g) : (widthIn(g) - colGap) / 2
  const fitted = cols.map((c) => ({ c, v: fit(c.value, m.manrope800, { max: 34, min: 24, width: colW, maxLines: 2, lineHeight: 1.2, spacing: 0 }) }))
  const valueH = Math.max(...fitted.map((f) => f.v.lines.length * f.v.size * 1.2 + (f.c.second ? 36 : 0)))
  const h = 24 + 24 * 1.2 + 6 + valueH
  const top = bottomY - h
  const runs: Run[] = []
  fitted.forEach(({ c, v }, i) => {
    const x = g.pad + i * (colW + colGap)
    const y0 = top + 24
    runs.push({ role: `detail-label-${i}`, lines: [c.label], face: 'manrope600', size: 24, lineHeight: 1.2, letterSpacing: 0, color: '#C9C4BA', ground: groundAt(y0), x, y: y0, w: colW })
    const vy = y0 + 24 * 1.2 + 6
    runs.push({ role: `detail-value-${i}`, lines: v.lines, face: 'manrope800', size: v.size, lineHeight: 1.2, letterSpacing: 0, color: INK, ground: groundAt(vy), x, y: vy, w: colW })
    if (c.second) {
      const sy = vy + v.lines.length * v.size * 1.2 + 4
      runs.push({ role: `detail-second-${i}`, lines: [c.second], face: 'manrope600', size: 26, lineHeight: 1.2, letterSpacing: 0, color: '#DCD7CC', ground: groundAt(sy), x, y: sy, w: colW })
    }
  })
  return { runs, blocks: [{ role: 'divider', x: g.pad, y: top, w: widthIn(g), h: 2, color: 'rgba(246,241,230,0.24)' }], top }
}

function eyebrow(g: Geometry, text: string, m: Measurers, y: number, ground: string): { runs: Run[]; blocks: Block[] } {
  const room = widthIn(g) - 74
  const f = fit(text, m.manrope800, { max: 28, min: 22, width: room, maxLines: 1, lineHeight: 1.2, spacing: 0 })
  return {
    runs: [{ role: 'eyebrow', lines: f.lines, face: 'manrope800', size: f.size, lineHeight: 1.2, letterSpacing: 0, color: GOLD, ground, x: g.pad + 74, y, w: room }],
    blocks: [{ role: 'rule', x: g.pad, y: y + (f.size * 1.2) / 2 - 1.5, w: 56, h: 3, color: GOLD }],
  }
}

/** A night, as treatment A (its approved photograph) or B (editorial type). */
export function layoutNight(format: TreatmentFormat, w: NightWords, m: Measurers): Layout {
  const g = GEOMETRY[format]
  const t: Treatment = w.photo ? 'photo' : 'type'
  const ground = t === 'type' ? groundFor(w.accent, w.composition) : null
  const groundAt = (y: number) => (t === 'photo' ? photoGroundAt(g, y) : typeGroundAt(ground as Ground, g, y))
  const row = bottomRow(g, t, w, m)
  const runs: Run[] = [...mast(g, w.city, m, t === 'photo' ? photoGroundAt(g, g.mastY + 30) : (ground as Ground).deep)]
  const blocks: Block[] = [...row.blocks]
  const det = details(g, w, m, row.top - 40, groundAt)
  runs.push(...row.runs, ...det.runs)
  blocks.push(...det.blocks)

  const titleBottom = det.top - (t === 'photo' ? 34 : 56)
  const face: Face = t === 'photo' ? 'condensed' : 'compressed'
  const lineHeight = t === 'photo' ? 0.9 : 0.86
  const spacing = t === 'photo' ? -0.005 : -0.02
  const eyebrowH = 28 * 1.2 + 22
  let lineRun: Run | null = null
  let lineH = 0
  if (t === 'type' && g.showLine && w.line) {
    const lf = fit(w.line, m.archivo, { max: 40, min: 28, width: widthIn(g), maxLines: 2, lineHeight: 1.2, spacing: 0 })
    lineH = lf.lines.length * lf.size * 1.2 + 34
    lineRun = { role: 'line', lines: lf.lines, face: 'archivo', size: lf.size, lineHeight: 1.2, letterSpacing: 0, color: INK, ground: '', x: g.pad, y: 0, w: widthIn(g) }
  }
  const topLimit = t === 'photo' ? g.solidFrom - 80 : g.typeTop
  const title = fit(w.title, m[face], {
    max: g.titleMax[t === 'photo' ? 'photo' : 'type'],
    min: g.titleMin,
    width: widthIn(g),
    maxLines: g.titleLines[t === 'photo' ? 'photo' : 'type'],
    lineHeight,
    spacing,
    height: titleBottom - lineH - topLimit - eyebrowH,
  })
  const titleH = title.lines.length * title.size * title.lineHeight
  // A type-led title stands from the top of its space, as the reference sets it; a photo-led one sits on its details.
  const titleY = t === 'photo' ? titleBottom - lineH - titleH : topLimit + eyebrowH
  const eb = eyebrow(g, w.eyebrow, m, titleY - eyebrowH, groundAt(titleY - eyebrowH))
  runs.push(...eb.runs)
  blocks.push(...eb.blocks)
  runs.push({ role: 'title', lines: title.lines, face, size: title.size, lineHeight: title.lineHeight, letterSpacing: spacing, color: INK, ground: groundAt(titleY), x: g.pad, y: titleY, w: widthIn(g) })
  if (lineRun) {
    const ly = t === 'photo' ? titleBottom - lineH + 34 : titleY + titleH + 34
    runs.push({ ...lineRun, y: ly, ground: groundAt(ly) })
  }
  return {
    treatment: t,
    format,
    w: g.w,
    h: g.h,
    safeTop: g.safeTop,
    safeBottom: g.safeBottom,
    photo: t === 'photo' ? { x: 0, y: 0, w: g.w, h: g.photoH, url: w.photo as string } : null,
    scrim: t === 'photo' ? { solidFrom: g.solidFrom, topShade: 0.55 } : null,
    ground,
    art: [],
    blocks,
    runs,
  }
}

/** The lightest point of the type-led ground at y: the glow sits bottom right, so it is lightest at the foot. */
function typeGroundAt(ground: Ground, g: Geometry, y: number): string {
  const glow = rgbOf(ground.glow)
  const mid = rgbOf(ground.mid)
  const deep = rgbOf(ground.deep)
  const f = y / g.h
  if (f < 0.55) return hexOf(mix(mid, deep, Math.max(0, (f - 0.2) / 0.35)))
  return hexOf(mix(glow, mid, Math.min(1, (f - 0.55) / 0.45)))
}

/** Treatment C's own drawn art: a gold disc and rings set off the corner, EventLinqs' mark of a place lit up. */
function graphicArt(g: Geometry): Art[] {
  const cx = g.w - 40
  const cy = g.safeTop + (g.h - g.safeTop - g.safeBottom) * 0.34
  return [
    { kind: 'disc', cx, cy, r: 170, stroke: 0, color: GOLD },
    { kind: 'ring', cx, cy, r: 260, stroke: 3, color: 'rgba(232,183,56,0.55)' },
    { kind: 'ring', cx, cy, r: 350, stroke: 2, color: 'rgba(232,183,56,0.32)' },
    { kind: 'ring', cx, cy, r: 440, stroke: 2, color: 'rgba(232,183,56,0.18)' },
  ]
}

/**
 * A brand piece naming no night (the "Say yes to this weekend" reference): treatment A only with a photograph licensed
 * for EventLinqs' own promotion, else treatment C. Never a night's details, so no photograph is mistaken for one.
 */
export function layoutBrand(format: TreatmentFormat, w: BrandWords, m: Measurers): Layout {
  const g = GEOMETRY[format]
  const t: Treatment = w.photo ? 'photo' : 'graphic'
  const groundAt = (y: number) => (t === 'photo' ? photoGroundAt(g, y) : NAVY)
  const row = bottomRow(g, t, w, m)
  const runs: Run[] = [...mast(g, null, m, groundAt(g.mastY + 30)), ...row.runs]
  const blocks: Block[] = [...row.blocks]
  const lf = fit(w.line, m.manrope600, { max: 32, min: 24, width: widthIn(g), maxLines: 3, lineHeight: 1.35, spacing: 0 })
  const lineH = lf.lines.length * lf.size * 1.35
  const lineY = row.top - 56 - lineH
  const topLimit = t === 'photo' ? g.solidFrom - 80 : g.typeTop
  const head = fit(w.headline, m.condensed, { max: format === 'square' ? 120 : 150, min: g.titleMin, width: widthIn(g), maxLines: 3, lineHeight: 0.88, spacing: -0.01, height: lineY - 24 - topLimit })
  const headH = head.lines.length * head.size * head.lineHeight
  const headY = lineY - 24 - headH
  runs.push({ role: 'title', lines: head.lines, face: 'condensed', size: head.size, lineHeight: head.lineHeight, letterSpacing: -0.01, color: INK, ground: groundAt(headY), x: g.pad, y: headY, w: widthIn(g) })
  runs.push({ role: 'line', lines: lf.lines, face: 'manrope600', size: lf.size, lineHeight: 1.35, letterSpacing: 0, color: INK, ground: groundAt(lineY), x: g.pad, y: lineY, w: widthIn(g) })
  return {
    treatment: t,
    format,
    w: g.w,
    h: g.h,
    safeTop: g.safeTop,
    safeBottom: g.safeBottom,
    photo: t === 'photo' ? { x: 0, y: 0, w: g.w, h: g.photoH, url: w.photo as string } : null,
    scrim: t === 'photo' ? { solidFrom: g.solidFrom, topShade: 0.6 } : null,
    ground: null,
    art: t === 'graphic' ? graphicArt(g) : [],
    blocks,
    runs,
  }
}

/** A one-line run fitted down to `min`, else two lines: the words a row or a label carries. */
function rowRun(role: string, text: string, face: Face, m: Measurers, o: { x: number; y: number; w: number; max: number; min: number; color: string; ground: string; lineHeight?: number; lines?: number }): Run {
  const lineHeight = o.lineHeight ?? 1.25
  let f: { size: number; lines: string[] }
  try {
    f = fit(text, m[face], { max: o.max, min: o.min, width: o.w, maxLines: 1, lineHeight, spacing: 0 })
  } catch (error) {
    if (!(error instanceof FitError)) throw error
    f = fit(text, m[face], { max: o.max, min: o.min, width: o.w, maxLines: o.lines ?? 2, lineHeight, spacing: 0 })
  }
  return { role, lines: f.lines, face, size: f.size, lineHeight, letterSpacing: 0, color: o.color, ground: o.ground, x: o.x, y: o.y, w: o.w }
}

const runHeight = (r: Run) => r.lines.length * r.size * r.lineHeight

/** The mast with a count ("1/7") or a label at the right instead of the city. */
function mastWithLabel(g: Geometry, label: string | null, m: Measurers, ground: string, dark = true): Run[] {
  const runs = mast(g, null, m, ground, dark)
  if (label) {
    const size = 26
    const w = Math.ceil(m.manrope700(label, size)) + 4
    runs.push({ role: 'count', lines: [label], face: 'manrope700', size, lineHeight: 1.15, letterSpacing: 0, color: dark ? INK : NAVY, ground, x: g.w - g.pad - w, y: g.mastY + 2, w, align: 'right' })
  }
  return runs
}

export type CoverWords = { chip: string; headline: string; line: string; contents: string[]; label: string | null }

/**
 * A set's contents cover (the week ahead, the weekend guide, the Reel's first frame), in editorial type: the chip, the
 * headline, the split line and one row a night, the day in gold and the title fitted to its row.
 */
export function layoutCover(format: TreatmentFormat, w: CoverWords, m: Measurers): Layout {
  const g = GEOMETRY[format]
  // Flat navy: the gold day labels fell under 3:1 on a gold-tinted glow (the QA's own finding, 28 October).
  const runs: Run[] = [...mastWithLabel(g, w.label, m, NAVY)]
  const blocks: Block[] = []
  const bottom = g.h - g.safeBottom - (g.safeBottom > 0 ? 0 : 60) - g.stickerZone
  const dayW = 96
  const rowSize = format === 'square' ? 26 : 30
  let y = bottom
  const rows: Run[][] = []
  for (const [i, c] of [...w.contents].entries()) {
    const [day, ...rest] = c.split(' ')
    const title = rowRun(`content-${i}`, rest.join(' '), 'manrope700', m, { x: g.pad + dayW, y: 0, w: widthIn(g) - dayW, max: rowSize, min: 22, color: INK, ground: NAVY })
    rows.push([{ role: `content-day-${i}`, lines: [day], face: 'manrope800', size: title.size, lineHeight: 1.25, letterSpacing: 0, color: GOLD, ground: NAVY, x: g.pad, y: 0, w: dayW - 12 }, title])
  }
  const placed: Run[][] = []
  for (const row of [...rows].reverse()) {
    const h = runHeight(row[1]) + 10
    y -= h
    placed.unshift(row.map((r) => ({ ...r, y })))
  }
  runs.push(...placed.flat())
  const line = rowRun('line', w.line, 'manrope600', m, { x: g.pad, y: 0, w: widthIn(g), max: format === 'square' ? 28 : 32, min: 22, color: INK, ground: NAVY })
  y -= 26 + runHeight(line)
  runs.push({ ...line, y })
  const head = fit(w.headline, m.condensed, { max: format === 'square' ? 104 : format === 'story' ? 140 : 128, min: g.titleMin, width: widthIn(g), maxLines: 3, lineHeight: 0.9, spacing: -0.005, height: y - 24 - (g.typeTop + 70) })
  const headH = head.lines.length * head.size * head.lineHeight
  y -= 24 + headH
  runs.push({ role: 'title', lines: head.lines, face: 'condensed', size: head.size, lineHeight: head.lineHeight, letterSpacing: -0.005, color: INK, ground: NAVY, x: g.pad, y, w: widthIn(g) })
  const chipText = w.chip.toUpperCase()
  const chip = fit(chipText, m.manrope800, { max: 24, min: 20, width: widthIn(g) - 48, maxLines: 1, lineHeight: 1.2, spacing: 0 })
  const chipW = Math.ceil(m.manrope800(chip.lines[0], chip.size)) + 44
  const chipH = Math.round(chip.size * 1.2) + 20
  y -= 28 + chipH
  blocks.push({ role: 'pill', x: g.pad, y, w: chipW, h: chipH, color: GOLD })
  runs.push({ role: 'chip', lines: chip.lines, face: 'manrope800', size: chip.size, lineHeight: 1.2, letterSpacing: 0, color: NAVY, ground: GOLD, x: g.pad + 22, y: y + 10, w: chipW - 44 })
  return { treatment: 'type', format, w: g.w, h: g.h, safeTop: g.safeTop, safeBottom: g.safeBottom, photo: null, scrim: null, ground: null, art: [], blocks, runs }
}

export type ProgrammeWords = { heading: string; address: string; rows: { day: string; title: string; meta: string }[]; label: string | null }

/** The venue spotlight's programme: the week's nights at one place, a row each. */
export function layoutProgramme(format: TreatmentFormat, w: ProgrammeWords, m: Measurers): Layout {
  const g = GEOMETRY[format]
  const ground = groundFor('#F3A43B', 'venue_spotlight')
  const accent = '#F3A43B'
  const runs: Run[] = [...mastWithLabel(g, w.label, m, ground.deep)]
  const blocks: Block[] = []
  let y = g.typeTop - (format === 'square' ? 70 : 40)
  const head = rowRun('heading', w.heading.toUpperCase(), 'manrope800', m, { x: g.pad, y, w: widthIn(g), max: 28, min: 22, color: accent, ground: NAVY })
  runs.push(head)
  y += runHeight(head) + 18
  const dayW = format === 'square' ? 150 : 180
  const titleMax = format === 'square' ? 40 : 48
  for (const [i, r] of w.rows.entries()) {
    blocks.push({ role: 'divider', x: g.pad, y, w: widthIn(g), h: 2, color: 'rgba(246,241,230,0.22)' })
    y += 22
    const day = rowRun(`row-day-${i}`, r.day, 'condensed', m, { x: g.pad, y, w: dayW - 20, max: format === 'square' ? 56 : 68, min: 40, color: accent, ground: NAVY, lineHeight: 1, lines: 1 })
    const title = rowRun(`row-title-${i}`, r.title, 'condensed', m, { x: g.pad + dayW, y, w: widthIn(g) - dayW, max: titleMax, min: 30, color: INK, ground: NAVY, lineHeight: 1 })
    const meta = rowRun(`row-meta-${i}`, r.meta, 'manrope600', m, { x: g.pad + dayW, y: y + runHeight(title) + 8, w: widthIn(g) - dayW, max: 28, min: 22, color: '#DCD7CC', ground: NAVY, lines: 1 })
    runs.push(day, title, meta)
    y = Math.max(y + runHeight(day), meta.y + runHeight(meta)) + 22
  }
  const address = rowRun('address', w.address, 'manrope700', m, { x: g.pad, y: y + 16, w: widthIn(g), max: 30, min: 22, color: INK, ground: NAVY })
  runs.push(address)
  const limit = g.h - g.safeBottom - (g.safeBottom > 0 ? 0 : 50) - g.stickerZone
  if (address.y + runHeight(address) > limit) throw new FitError(`the programme's ${w.rows.length} rows do not fit the ${format}`)
  return { treatment: 'type', format, w: g.w, h: g.h, safeTop: g.safeTop, safeBottom: g.safeBottom, photo: null, scrim: null, ground, art: [], blocks, runs: onGround(runs, ground, g) }
}

export type EndWords = { headline: string; line: string; url: string; foot: string | null; label: string | null }

/** The closing slide: gold, the one next step, the page it sends people to. */
export function layoutEnd(format: TreatmentFormat, w: EndWords, m: Measurers): Layout {
  const g = GEOMETRY[format]
  const runs: Run[] = [...mastWithLabel(g, w.label, m, GOLD, false)]
  const bottom = g.h - g.safeBottom - (g.safeBottom > 0 ? 0 : 60) - g.stickerZone
  let y = bottom
  if (w.foot) {
    const foot = rowRun('foot', w.foot, 'manrope600', m, { x: g.pad, y: 0, w: widthIn(g), max: 28, min: 22, color: NAVY, ground: GOLD })
    y -= runHeight(foot)
    runs.push({ ...foot, y })
    y -= 18
  }
  const url = rowRun('url', w.url, 'archivo', m, { x: g.pad, y: 0, w: widthIn(g), max: 40, min: 24, color: NAVY, ground: GOLD, lines: 1 })
  y -= runHeight(url)
  runs.push({ ...url, y })
  const line = rowRun('line', w.line, 'manrope700', m, { x: g.pad, y: 0, w: widthIn(g), max: 34, min: 24, color: NAVY, ground: GOLD, lines: 3 })
  y -= 22 + runHeight(line)
  runs.push({ ...line, y })
  const head = fit(w.headline, m.condensed, { max: format === 'square' ? 112 : 140, min: g.titleMin, width: widthIn(g), maxLines: 3, lineHeight: 0.9, spacing: -0.005, height: y - 26 - g.typeTop })
  y -= 26 + head.lines.length * head.size * head.lineHeight
  runs.push({ role: 'title', lines: head.lines, face: 'condensed', size: head.size, lineHeight: head.lineHeight, letterSpacing: -0.005, color: NAVY, ground: GOLD, x: g.pad, y, w: widthIn(g) })
  return { treatment: 'graphic', format, w: g.w, h: g.h, safeTop: g.safeTop, safeBottom: g.safeBottom, photo: null, scrim: null, ground: null, background: GOLD, art: [], blocks: [], runs }
}

/** Each run's ground read where it sits on a type-led ground (the chip keeps its own gold). */
function onGround(runs: Run[], ground: Ground, g: Geometry): Run[] {
  return runs.map((r) => (r.ground === GOLD ? r : { ...r, ground: typeGroundAt(ground, g, r.y + runHeight(r)) }))
}

/** The organiser campaign (treatment C): its eyebrow, headline, numbered points and the page it sends people to. */
export function layoutOffer(format: TreatmentFormat, w: OfferWords, m: Measurers): Layout {
  const g = GEOMETRY[format]
  const runs: Run[] = [...mast(g, null, m, NAVY)]
  const blocks: Block[] = []
  const bottom = g.h - g.safeBottom - (g.safeBottom > 0 ? 0 : 60) - g.stickerZone
  const urlF = fit(w.url, m.archivo, { max: 34, min: 24, width: widthIn(g), maxLines: 1, lineHeight: 1.2, spacing: 0 })
  const urlY = bottom - urlF.size * 1.2
  runs.push({ role: 'url', lines: urlF.lines, face: 'archivo', size: urlF.size, lineHeight: 1.2, letterSpacing: 0, color: GOLD, ground: NAVY, x: g.pad, y: urlY, w: widthIn(g) })
  let y = urlY - 44
  const pointSize = format === 'square' ? 28 : 32
  const pts = [...w.points].reverse().map((p, ri) => {
    const i = w.points.length - 1 - ri
    const f = fit(p, m.manrope600, { max: pointSize, min: 24, width: widthIn(g) - 64, maxLines: 2, lineHeight: 1.3, spacing: 0 })
    const h = f.lines.length * f.size * 1.3
    y -= h
    const at = y
    y -= 18
    return { i, f, at }
  })
  for (const { i, f, at } of pts) {
    runs.push({ role: `point-n-${i}`, lines: [String(i + 1)], face: 'condensed', size: f.size + 6, lineHeight: 1.1, letterSpacing: 0, color: GOLD, ground: NAVY, x: g.pad, y: at - 2, w: 44 })
    runs.push({ role: `point-${i}`, lines: f.lines, face: 'manrope600', size: f.size, lineHeight: 1.3, letterSpacing: 0, color: INK, ground: NAVY, x: g.pad + 64, y: at, w: widthIn(g) - 64 })
  }
  const headBottom = y - 26
  const head = fit(w.headline, m.condensed, { max: format === 'square' ? 104 : 132, min: g.titleMin, width: widthIn(g), maxLines: 3, lineHeight: 0.9, spacing: -0.005, height: headBottom - g.typeTop - 56 })
  const headY = headBottom - head.lines.length * head.size * head.lineHeight
  runs.push({ role: 'title', lines: head.lines, face: 'condensed', size: head.size, lineHeight: head.lineHeight, letterSpacing: -0.005, color: INK, ground: NAVY, x: g.pad, y: headY, w: widthIn(g) })
  const eb = eyebrow(g, w.eyebrow, m, headY - 56, NAVY)
  runs.push(...eb.runs)
  blocks.push(...eb.blocks)
  return { treatment: 'graphic', format, w: g.w, h: g.h, safeTop: g.safeTop, safeBottom: g.safeBottom, photo: null, scrim: null, ground: null, art: graphicArt(g), blocks, runs }
}

/** Every reason a layout fails the directive's visual QA (section 7), in plain words; empty when it passes. */
export function layoutFaults(l: Layout, m: Measurers): string[] {
  const faults: string[] = []
  const g = GEOMETRY[l.format]
  for (const r of l.runs) {
    r.lines.forEach((line) => {
      const width = m[r.face](line, r.size) + r.letterSpacing * r.size * Math.max(0, line.length - 1)
      if (width > r.w + 0.5) faults.push(`${r.role}: "${line}" is ${Math.round(width)} wide in a ${Math.round(r.w)} box`)
    })
    const bottom = r.y + r.lines.length * r.size * r.lineHeight
    if (r.x < g.pad - 0.5 || r.x + r.w > l.w - g.pad + 0.5) faults.push(`${r.role}: outside the side margins`)
    if (r.y < l.safeTop || bottom > l.h - l.safeBottom) faults.push(`${r.role}: outside the safe area (${Math.round(r.y)} to ${Math.round(bottom)})`)
    const large = r.size >= 24 && (r.face !== 'manrope500' || r.size >= 32)
    const need = large ? 3 : 4.5
    const ratio = contrast(rgbOf(r.color), rgbOf(r.ground || NAVY))
    if (ratio < need) faults.push(`${r.role}: contrast ${ratio.toFixed(2)} on its ground, under ${need}`)
    if (r.size < 20) faults.push(`${r.role}: ${r.size}px is too small to read at phone size`)
  }
  // No two runs in one column overlap.
  const boxes = l.runs.map((r) => ({ r, top: r.y, bottom: r.y + r.lines.length * r.size * r.lineHeight, left: r.x, right: r.x + r.w }))
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      const across = a.left < b.right - 1 && b.left < a.right - 1
      const down = a.top < b.bottom - 1 && b.top < a.bottom - 1
      if (across && down && !(a.r.role.startsWith('point-n') || b.r.role.startsWith('point-n'))) faults.push(`${a.r.role} overlaps ${b.r.role}`)
    }
  }
  return faults
}
