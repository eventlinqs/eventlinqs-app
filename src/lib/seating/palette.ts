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
