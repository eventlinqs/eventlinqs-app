/**
 * R37 proof: WCAG contrast for every seat state on the seating surfaces.
 * Text pairs need 4.5:1 (numerals are under 18px); interactive component
 * boundaries need 3:1 (WCAG 1.4.11). Non-interactive receded states (sold,
 * held) are exempt from 1.4.11 and reported for the record.
 * Usage: node scripts/verify/seat-contrast.mjs
 */

const SECTION_COLORS = {
  'harbour blue': '#1F5673',
  garnet: '#7A1F3D',
  forest: '#2D5A3D',
  terracotta: '#9A3E1C',
  aubergine: '#5B2A5E',
  petrol: '#215E5E',
  rust: '#8C3B2E',
  'indigo ink': '#3A4675',
  olive: '#5C5518',
  plum: '#6E2B4F',
}

const WHITE = '#FFFFFF'
const INK_900 = '#0A1628'
const INK_400 = '#6B7280'
const INK_200 = '#D9D9D6'
const GOLD_500 = '#D4A017'

function lum(hex) {
  const c = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map(i => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function ratio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const rows = []
const check = (label, fg, bg, needed) => {
  const r = ratio(fg, bg)
  rows.push({
    pair: label,
    ratio: r.toFixed(2),
    needed: needed === null ? 'exempt' : `${needed}:1`,
    verdict: needed === null ? 'RECORDED' : r >= needed ? 'PASS' : 'FAIL',
  })
}

for (const [name, hex] of Object.entries(SECTION_COLORS)) {
  check(`available numeral: white on ${name} ${hex}`, WHITE, hex, 4.5)
}
for (const [name, hex] of Object.entries(SECTION_COLORS)) {
  check(`available seat vs white plan field (${name})`, hex, WHITE, 3)
}
check('selected numeral: ink-900 on gold-500', INK_900, GOLD_500, 4.5)
// The selected seat's 1.4.11 boundary is its 2px ink-900 keyline (plus the
// navy elevation shadow), not the gold fill: the keyline is what separates
// the component from the field.
check('selected seat boundary: ink-900 keyline vs white field', INK_900, WHITE, 3)
check('selected seat fill context: gold-500 vs white (supplementary, keyline carries 1.4.11)', GOLD_500, WHITE, null)
check('stage wordmark: white on ink-900', WHITE, INK_900, 4.5)
check('row labels: ink-400 on white', INK_400, WHITE, 4.5)
check('legend text: ink-900 on veil #EDF0F4', INK_900, '#EDF0F4', 4.5)
check('sold/held numeral: ink-400 on ink-200 (non-interactive, receded by design)', INK_400, INK_200, null)
check('sold/held seat vs white (non-interactive, receded by design)', INK_200, WHITE, null)

console.table(rows)
const failures = rows.filter(r => r.verdict === 'FAIL')
if (failures.length > 0) {
  console.error(`${failures.length} contrast failure(s)`)
  process.exit(1)
}
console.log('All required seat-state contrast pairs pass WCAG.')
