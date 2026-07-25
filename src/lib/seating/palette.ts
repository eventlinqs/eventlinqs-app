/**
 * Seating section palette: the single source for the colours a section can
 * wear on any seating surface (organiser builder, buyer map, organiser room
 * view). Pure data, no I/O, importable by client and server alike.
 *
 * The tones are deep, editorial derivations of the brand family so a chart
 * reads as EventLinqs, never a default swatch row. Every tone passes WCAG
 * 4.5:1 with a white numeral (verified 6.8 to 10.8), so a seat number stays
 * legible on the fill on both the builder and the buyer map.
 *
 * The material-design brights that seeded the first charts
 * (#0EA5E9 sky, #E91E63 pink, ...) were assigned BY INDEX, never chosen by an
 * organiser, so they carry no meaning worth preserving. `editorialSectionColor`
 * remaps any of them to the matching editorial tone at DISPLAY time only: the
 * stored `seat_map_sections.color` is never mutated (data and the funds-holding
 * engine are untouched), and a chart adopts the editorial tone permanently on
 * its next save. Any colour that is not a known legacy bright passes through
 * unchanged, so a genuinely chosen colour is always respected.
 */

export const SECTION_COLORS = [
  '#1F5673', // harbour blue
  '#7A1F3D', // garnet
  '#2D5A3D', // forest
  '#9A3E1C', // terracotta
  '#5B2A5E', // aubergine
  '#215E5E', // petrol
  '#8C3B2E', // rust
  '#3A4675', // indigo ink
  '#5C5518', // olive
  '#6E2B4F', // plum
] as const

/** Index-aligned map from each retired material bright to its editorial tone. */
export const LEGACY_COLOR_REMAP: Record<string, string> = {
  '#0ea5e9': SECTION_COLORS[0],
  '#e91e63': SECTION_COLORS[1],
  '#4caf50': SECTION_COLORS[2],
  '#ff9800': SECTION_COLORS[3],
  '#9c27b0': SECTION_COLORS[4],
  '#00bcd4': SECTION_COLORS[5],
  '#f44336': SECTION_COLORS[6],
  '#3f51b5': SECTION_COLORS[7],
  '#8bc34a': SECTION_COLORS[8],
  '#ff5722': SECTION_COLORS[9],
}

/**
 * Display-time colour for a section. Maps a retired material bright to its
 * editorial tone; passes any other value through unchanged. Case-insensitive
 * on the hex so a stored `#0EA5E9` and `#0ea5e9` both resolve.
 */
export function editorialSectionColor(color: string | null | undefined): string {
  if (!color) return SECTION_COLORS[0]
  return LEGACY_COLOR_REMAP[color.toLowerCase()] ?? color
}

/**
 * Colour-vision palette sets. A dichromat's colour space is close to two
 * dimensional (luminance plus one hue axis), so each set carries SIX tones
 * spread wide on the axis that vision can separate, instead of ten near
 * ones: the red-green sets live on blue against gold-bronze, the
 * blue-yellow set on red against teal, with luminance steps carrying what
 * hue cannot. Every tone passes 4.5:1 with a white numeral, and every pair
 * within a set stays at least deltaE 10 apart UNDER the set's own simulated
 * vision (Machado 2009, severity 1.0), as do gold (selected) and stone
 * (unavailable) against every tone. The proof harness is
 * `scripts/verify/seat-contrast.mjs`.
 *
 * The house identity never dims for accessibility: gold selection, navy
 * stage and stone recede are identical in every set; only the section
 * tones adapt around them.
 */
export type SeatPaletteSetId = 'house' | 'protan' | 'deutan' | 'tritan'

export const SEAT_PALETTE_SETS: Record<SeatPaletteSetId, readonly string[]> = {
  house: SECTION_COLORS,
  protan: ['#0E2A44', '#6B5310', '#1F5673', '#4A3D0E', '#45718A', '#8A6D12'],
  deutan: ['#0E2A44', '#705910', '#1F5673', '#4A3D0E', '#45718A', '#8A6D12'],
  tritan: ['#4C1226', '#0B3B38', '#7A1F3D', '#1B5E50', '#9C5147', '#3F7E71'],
}

export const SEAT_PALETTE_SET_META: {
  id: SeatPaletteSetId
  label: string
  hint: string
}[] = [
  { id: 'house', label: 'House', hint: 'The standard editorial tones' },
  { id: 'protan', label: 'Red-green (protan)', hint: 'Blues and bronzes, wide steps' },
  { id: 'deutan', label: 'Red-green (deutan)', hint: 'Blues and bronzes, tuned warmer' },
  { id: 'tritan', label: 'Blue-yellow (tritan)', hint: 'Reds and teals, wide steps' },
]

/** Squared RGB distance: enough to snap an unknown colour to its nearest house tone. */
function rgbDistanceSq(a: string, b: string): number {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16))
  return (pa[0] - pb[0]) ** 2 + (pa[1] - pb[1]) ** 2 + (pa[2] - pb[2]) ** 2
}

/**
 * The set-aware display colour for a section. House passes through the
 * editorial mapping untouched. A colour-vision set first resolves the
 * stored colour to its house tone (legacy brights included), then takes the
 * set tone at the same index modulo the set length; a colour outside the
 * house ramp snaps to its nearest house tone first, so EVERY chart gets a
 * fully separated palette under every set, custom colours included.
 */
export function sectionColorForSet(
  color: string | null | undefined,
  set: SeatPaletteSetId,
): string {
  const base = editorialSectionColor(color)
  if (set === 'house') return base
  const ramp = SEAT_PALETTE_SETS[set]
  let index = SECTION_COLORS.findIndex(t => t.toLowerCase() === base.toLowerCase())
  if (index === -1) {
    let bestDist = Infinity
    SECTION_COLORS.forEach((tone, i) => {
      const d = rgbDistanceSq(tone.toLowerCase(), base.toLowerCase())
      if (d < bestDist) {
        bestDist = d
        index = i
      }
    })
  }
  return ramp[index % ramp.length]
}

/**
 * Seat-STATE colours: the single source every seating surface reads
 * (buyer map, room studio, organiser room view, kit preview). These are
 * identical across every palette set; state is never carried by hue alone
 * (selection carries the bloom and the navy numeral, unavailable recedes,
 * accessible carries the white ring), so no set needs to move them.
 */
export const SEAT_STATE_COLORS = {
  /** Selected seat fill: gold-500. */
  gold: '#D4A017',
  /** Bloom ring and focus rings on dark: gold-400. */
  bloom: '#E8B738',
  /** Stage, structure, selected numeral: ink-900. */
  night: '#0A1628',
  /** Secondary labels and quiet chrome: navy lifted toward white. */
  dusk: '#24344D',
  /** Canvas wash and tint underlays: navy at 6% over white. */
  veil: '#EDF0F4',
  /** Everything unavailable: ink-200, quiet not alarming. */
  stone: '#D9D9D6',
  /** Text on stone: ink-400. */
  stoneText: '#6B7280',
  white: '#FFFFFF',
} as const
