/**
 * Seat-state contrast proof, every palette set (R37 + the 2026-07-26 round).
 *
 * For EVERY palette set (house editorial, protan, deutan, tritan):
 *  - text pairs at 4.5:1 (numerals under 18px): white numeral on every
 *    section tone, ink-900 on gold (selected), chrome text pairs
 *  - interactive component boundaries at 3:1 (WCAG 1.4.11): every section
 *    tone vs the white plan field, the selected keyline
 *  - non-interactive receded states (sold, held) recorded as designed
 *
 * For every COLOUR-VISION set, additionally, under that set's simulated
 * vision (Machado et al. 2009, severity 1.0):
 *  - pairwise Lab deltaE >= 10 between every pair of section tones
 *  - deltaE >= 15 between every section tone and gold (selected)
 *  - deltaE >= 15 between every section tone and stone (unavailable)
 *
 * Usage: node scripts/verify/seat-contrast.mjs [outFile]
 */

import { writeFileSync } from 'node:fs'

const PALETTE_SETS = {
  house: ['#1F5673', '#7A1F3D', '#2D5A3D', '#9A3E1C', '#5B2A5E', '#215E5E', '#8C3B2E', '#3A4675', '#5C5518', '#6E2B4F'],
  protan: ['#0E2A44', '#6B5310', '#1F5673', '#4A3D0E', '#45718A', '#8A6D12'],
  deutan: ['#0E2A44', '#705910', '#1F5673', '#4A3D0E', '#45718A', '#8A6D12'],
  tritan: ['#4C1226', '#0B3B38', '#7A1F3D', '#1B5E50', '#9C5147', '#3F7E71'],
}

const WHITE = '#FFFFFF'
const INK_900 = '#0A1628'
const INK_400 = '#6B7280'
const INK_200 = '#D9D9D6' // stone: sold/held/blocked
const GOLD_500 = '#D4A017' // selected
const VEIL = '#EDF0F4'

// ── WCAG relative luminance and contrast ──────────────────────────────────
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

// ── CVD simulation (Machado et al. 2009, severity 1.0, linear RGB) ───────
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

// ── The audit ─────────────────────────────────────────────────────────────
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
  rows.push({
    pair: label,
    value: `dE ${d.toFixed(1)}`,
    needed: `dE ${needed}`,
    verdict: d >= needed ? 'PASS' : 'FAIL',
  })
}

for (const [setName, tones] of Object.entries(PALETTE_SETS)) {
  // WCAG pairs, identical bar for every set.
  tones.forEach((hex, i) => {
    check(`[${setName}] available numeral: white on tone ${i + 1} ${hex}`, WHITE, hex, 4.5)
    check(`[${setName}] available seat vs white plan field (tone ${i + 1})`, hex, WHITE, 3)
  })
  check(`[${setName}] selected numeral: ink-900 on gold-500`, INK_900, GOLD_500, 4.5)
  check(`[${setName}] selected seat boundary: ink-900 keyline vs white field`, INK_900, WHITE, 3)
  check(`[${setName}] stage wordmark: white on ink-900`, WHITE, INK_900, 4.5)
  check(`[${setName}] row labels: ink-400 on white`, INK_400, WHITE, 4.5)
  check(`[${setName}] legend text: ink-900 on veil`, INK_900, VEIL, 4.5)
  check(`[${setName}] sold/held numeral: ink-400 on stone (receded by design)`, INK_400, INK_200, null)
  check(`[${setName}] sold/held seat vs white (receded by design)`, INK_200, WHITE, null)

  // Separation proof under the set's own simulated vision.
  if (setName !== 'house') {
    for (let i = 0; i < tones.length; i++) {
      for (let j = i + 1; j < tones.length; j++) {
        checkDelta(
          `[${setName}] simulated separation: tone ${i + 1} vs tone ${j + 1}`,
          tones[i], tones[j], setName, 10,
        )
      }
      checkDelta(`[${setName}] simulated: tone ${i + 1} vs gold (selected)`, tones[i], GOLD_500, setName, 15)
      checkDelta(`[${setName}] simulated: tone ${i + 1} vs stone (unavailable)`, tones[i], INK_200, setName, 15)
    }
  }
}

console.table(rows)
const failures = rows.filter(r => r.verdict === 'FAIL')

const outFile = process.argv[2]
if (outFile) {
  const lines = [
    `Seat-state contrast proof, every palette set. Generated ${new Date().toISOString()}.`,
    `WCAG text pairs 4.5:1, interactive boundaries 3:1 (1.4.11); colour-vision`,
    `separation via Machado 2009 severity-1.0 simulation, Lab deltaE.`,
    '',
    ...rows.map(r => `${r.verdict.padEnd(8)} ${String(r.value).padStart(9)}  (needs ${r.needed})  ${r.pair}`),
    '',
    failures.length === 0
      ? 'RESULT: every required pair passes in every palette set.'
      : `RESULT: ${failures.length} FAILURES`,
  ]
  writeFileSync(outFile, lines.join('\n'))
  console.log(`Written: ${outFile}`)
}

if (failures.length > 0) {
  console.error(`${failures.length} contrast failure(s)`)
  process.exit(1)
}
console.log('All required seat-state pairs pass in every palette set.')
