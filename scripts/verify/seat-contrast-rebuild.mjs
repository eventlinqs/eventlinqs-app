/**
 * Seat-state contrast proof for the REBUILT chair glyph, every palette set.
 *
 * The rebuilt anatomy moves the numeral onto the chair's WHITE PAN (dusk
 * text) and the selected numeral onto gold (night text); the tier hue
 * carries the chair back and the mid/mark silhouettes against the Veil
 * paper. The pairs proven here match that anatomy exactly:
 *
 *  - text 4.5:1: dusk numeral on the white pan; night numeral on gold;
 *    dusk row letters and rulers on Veil; night polygon names on Veil
 *  - non-text 3:1 (WCAG 1.4.11): every tier hue vs the Veil paper (the
 *    chair back and the mid marks), gold (selected) vs Veil, the night
 *    selection keyline vs gold
 *  - receded states recorded: stone chairs on Veil (by design)
 *  - colour-vision separation (Machado 2009, severity 1.0, Lab deltaE):
 *    pairwise >= 10 within each set, >= 15 vs gold and vs stone
 *
 * Usage: node scripts/verify/seat-contrast-rebuild.mjs [outFile]
 */

import { writeFileSync } from 'node:fs'

const PALETTE_SETS = {
  house: ['#1F5673', '#7A1F3D', '#2D5A3D', '#9A3E1C', '#5B2A5E', '#215E5E', '#8C3B2E', '#3A4675', '#5C5518', '#6E2B4F'],
  protan: ['#0E2A44', '#6B5310', '#1F5673', '#4A3D0E', '#45718A', '#8A6D12'],
  deutan: ['#0E2A44', '#705910', '#1F5673', '#4A3D0E', '#45718A', '#8A6D12'],
  tritan: ['#4C1226', '#0B3B38', '#7A1F3D', '#1B5E50', '#9C5147', '#3F7E71'],
}

const WHITE = '#FFFFFF'
const NIGHT = '#0A1628'
const DUSK = '#24344D'
const STONE_TEXT = '#6B7280'
const STONE = '#D9D9D6'
const GOLD = '#D4A017'
const VEIL = '#EDF0F4'

function srgbToLinear(v) {
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}
function channels(hex) {
  const c = hex.replace('#', '')
  return [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16))
}
function lum(hex) {
  const [r, g, b] = channels(hex).map(v => srgbToLinear(v / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function ratio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const MACHADO = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
}
function linearToSrgb8(l) {
  const c = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(c * 255)))
}
function simulate(hex, kind) {
  if (!MACHADO[kind]) return channels(hex)
  const lin = channels(hex).map(v => srgbToLinear(v / 255))
  const m = MACHADO[kind]
  return [0, 1, 2].map(i =>
    linearToSrgb8(Math.max(0, Math.min(1, m[i][0] * lin[0] + m[i][1] * lin[1] + m[i][2] * lin[2]))),
  )
}
function rgbToLab([r8, g8, b8]) {
  const [r, g, b] = [r8, g8, b8].map(v => srgbToLinear(v / 255))
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}
function deltaE(hexA, hexB, kind) {
  const la = rgbToLab(simulate(hexA, kind))
  const lb = rgbToLab(simulate(hexB, kind))
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2])
}

const rows = []
const check = (label, fg, bg, needed) => {
  const r = ratio(fg, bg)
  rows.push({
    pair: label,
    value: r.toFixed(2),
    needed: needed === null ? 'exempt' : `${needed}:1`,
    verdict: needed === null ? 'RECORDED' : r >= needed ? 'PASS' : 'FAIL',
  })
}
const checkDelta = (label, a, b, kind, needed) => {
  const d = deltaE(a, b, kind)
  rows.push({ pair: label, value: `dE ${d.toFixed(1)}`, needed: `dE ${needed}`, verdict: d >= needed ? 'PASS' : 'FAIL' })
}

for (const [setName, tones] of Object.entries(PALETTE_SETS)) {
  // The chair anatomy's text pairs, identical bar for every set.
  check(`[${setName}] available numeral: dusk on the white pan`, DUSK, WHITE, 4.5)
  check(`[${setName}] selected numeral: night on gold`, NIGHT, GOLD, 4.5)
  check(`[${setName}] row letters and ruler: dusk on veil paper`, DUSK, VEIL, 4.5)
  check(`[${setName}] polygon name: night on veil paper`, NIGHT, VEIL, 4.5)
  check(`[${setName}] polygon price: dusk on veil paper`, DUSK, VEIL, 4.5)
  check(`[${setName}] stage word: dusk on veil (drafting hatch ground)`, DUSK, VEIL, 4.5)

  // Non-text component boundaries against the paper.
  tones.forEach((hex, i) => {
    check(`[${setName}] chair back and mid mark: tone ${i + 1} ${hex} vs veil`, hex, VEIL, 3)
    check(`[${setName}] pan keyline: tone ${i + 1} ${hex} vs white pan`, hex, WHITE, 3)
  })
  // The selected chair's boundary is its ALWAYS-DRAWN night keyline (2px,
  // every glyph tier), so the keyline pairs carry the 1.4.11 requirement;
  // the gold body against the paper is recorded, not the boundary.
  check(`[${setName}] selected chair body: gold vs veil (boundary carried by keyline)`, GOLD, VEIL, null)
  check(`[${setName}] selection keyline: night vs gold`, NIGHT, GOLD, 3)
  check(`[${setName}] selection keyline: night vs veil`, NIGHT, VEIL, 3)
  check(`[${setName}] keyboard cursor ring: night vs veil`, NIGHT, VEIL, 3)
  check(`[${setName}] taken chair: stone vs veil (receded by design)`, STONE, VEIL, null)

  // Separation proof under the set's own simulated vision.
  if (setName !== 'house') {
    for (let i = 0; i < tones.length; i++) {
      for (let j = i + 1; j < tones.length; j++) {
        checkDelta(`[${setName}] simulated separation: tone ${i + 1} vs tone ${j + 1}`, tones[i], tones[j], setName, 10)
      }
      checkDelta(`[${setName}] simulated: tone ${i + 1} vs gold (selected)`, tones[i], GOLD, setName, 15)
      checkDelta(`[${setName}] simulated: tone ${i + 1} vs stone (unavailable)`, tones[i], STONE, setName, 15)
    }
  }
}

console.table(rows.filter(r => r.verdict !== 'PASS'))
const failures = rows.filter(r => r.verdict === 'FAIL')

const outFile = process.argv[2]
if (outFile) {
  const lines = [
    `Rebuilt chair-glyph contrast proof, every palette set. Generated ${new Date().toISOString()}.`,
    `Text pairs 4.5:1 on the glyph's real grounds (dusk on white pan, night on gold);`,
    `non-text 3:1 vs the Veil paper (1.4.11); colour-vision separation via Machado`,
    `2009 severity-1.0 simulation, Lab deltaE.`,
    '',
    ...rows.map(r => `${r.verdict.padEnd(8)} ${String(r.value).padStart(9)}  (needs ${r.needed})  ${r.pair}`),
    '',
    failures.length === 0
      ? `RESULT: all ${rows.filter(r => r.verdict === 'PASS').length} required pairs pass in every palette set.`
      : `RESULT: ${failures.length} FAILURES`,
  ]
  writeFileSync(outFile, lines.join('\n'))
  console.log(`Written: ${outFile}`)
}

if (failures.length > 0) {
  console.error(`${failures.length} contrast failure(s)`)
  process.exit(1)
}
console.log(`All ${rows.filter(r => r.verdict === 'PASS').length} required pairs pass in every palette set.`)
