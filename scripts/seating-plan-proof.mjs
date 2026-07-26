/**
 * Phase 0 static proof for the seating plan rebuild (no renderer changes).
 * Produces exactly two PNGs into docs/design/seating-plan-proof/:
 *
 *   chair-proof.png  - our new chair at 24, 14 and 8px beside the actual
 *                      TryBooking chair cropped from the benchmark capture
 *                      (docs/design/seating-final-2026-07-26/r47/
 *                      trybooking-buyer-01.png) at matching sizes, plus the
 *                      four states (available, sold, selected, held).
 *   room-proof.png   - one 500-seat room at 1440: straight rows, uniform
 *                      pitch, two mirrored blocks, one centre aisle, row
 *                      letters both flanks, one number ruler per block,
 *                      exactly 150 seats (30%) sold solid dark, a centred
 *                      stage trapezoid, nothing else on the plan.
 *
 * Every embedded image is asserted loaded (naturalWidth > 0) before the
 * screenshot; the script aborts rather than ship an empty frame.
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { chromium } from 'playwright'

const BENCH = 'docs/design/seating-final-2026-07-26/r47/trybooking-buyer-01.png'
const OUT = 'docs/design/seating-plan-proof'
fs.mkdirSync(OUT, { recursive: true })

// ── Brand tokens (src/lib/seating/palette.ts SEAT_STATE_COLORS + SECTION_COLORS[0]) ──
const GOLD = '#D4A017'
const NIGHT = '#0A1628'
const DUSK = '#24344D'
const VEIL = '#EDF0F4'
const STONE = '#D9D9D6'
const HARBOUR = '#1F5673'
const WHITE = '#FFFFFF'

// ── The TryBooking chair, cropped from the benchmark legend ────────────────
// Chip boxes measured on the 1182x1002 capture (nearest-neighbour inspected).
const CHIPS = {
  available: { left: 429, top: 444, width: 24, height: 20 },
  sold: { left: 539, top: 444, width: 24, height: 20 },
  selected: { left: 672, top: 445, width: 23, height: 20 },
}

async function cropDataUri(box, targetW) {
  const targetH = Math.round((box.height / box.width) * targetW)
  const buf = await sharp(BENCH)
    .extract(box)
    .resize(targetW, targetH, { kernel: 'lanczos3', fit: 'fill' })
    .png()
    .toBuffer()
  return { uri: `data:image/png;base64,${buf.toString('base64')}`, w: targetW, h: targetH }
}

// ── Our new chair: ONE closed armchair silhouette + internal detail ────────
// viewBox 0 0 24 20. Tall rounded back (x 4.5-19.5), two armrest verticals
// (x 0.75-4.5 and 19.5-23.25, tops y 6.5), seat pan bar (y 14-19.25).
const SILHOUETTE =
  'M7.5 .75 H16.5 Q19.5 .75 19.5 3.75 V6.5 H21.1 Q23.25 6.5 23.25 8.4 ' +
  'V17.6 Q23.25 19.25 21.5 19.25 H2.5 Q.75 19.25 .75 17.6 V8.4 ' +
  'Q.75 6.5 2.9 6.5 H4.5 V3.75 Q4.5 .75 7.5 .75 Z'
const DETAIL = 'M4.5 6.5 V14 M19.5 6.5 V14 M.75 14 H23.25'

function ourChair(px, state) {
  const h = Math.round((20 / 24) * px)
  const sw = px >= 20 ? 1.4 : px >= 12 ? 1.9 : 3 // ~1.1-1.4px rendered at each size
  const detail = px >= 12 // the mark tier (8px) is silhouette only
  let body = ''
  if (state === 'available') {
    body =
      `<path d="${SILHOUETTE}" fill="${WHITE}" stroke="${HARBOUR}" stroke-width="${sw}" stroke-linejoin="round"/>` +
      (detail ? `<path d="${DETAIL}" fill="none" stroke="${HARBOUR}" stroke-width="${sw * 0.85}"/>` : '')
  } else if (state === 'sold') {
    body = `<path d="${SILHOUETTE}" fill="${DUSK}" stroke="${DUSK}" stroke-width="${sw}" stroke-linejoin="round"/>`
  } else if (state === 'selected') {
    body =
      `<path d="${SILHOUETTE}" fill="${GOLD}" stroke="${NIGHT}" stroke-width="${sw}" stroke-linejoin="round"/>` +
      (detail ? `<path d="${DETAIL}" fill="none" stroke="${NIGHT}" stroke-width="${sw * 0.7}" opacity="0.8"/>` : '')
  } else {
    // held: stone body, dashed harbour stroke (the painter's held grammar)
    body =
      `<path d="${SILHOUETTE}" fill="${STONE}" stroke="${HARBOUR}" stroke-width="${sw}" stroke-linejoin="round" stroke-dasharray="2.4 1.7"/>` +
      (detail ? `<path d="${DETAIL}" fill="none" stroke="${HARBOUR}" stroke-width="${sw * 0.7}" opacity="0.65"/>` : '')
  }
  return `<svg width="${px}" height="${h}" viewBox="0 0 24 20" style="display:block">${body}</svg>`
}

// ── chair-proof.png ────────────────────────────────────────────────────────
async function buildChairProof(browser) {
  const bench = {}
  for (const [state, box] of Object.entries(CHIPS)) {
    bench[state] = {
      24: await cropDataUri(box, 24),
      14: await cropDataUri(box, 14),
      8: await cropDataUri(box, 8),
    }
  }
  const img = c => `<img src="${c.uri}" width="${c.w}" height="${c.h}" style="display:block">`
  const cell = (inner, cap) =>
    `<div style="text-align:center;min-width:96px">` +
    `<div style="height:44px;display:flex;align-items:center;justify-content:center">${inner}</div>` +
    `<div style="font:600 11px 'Segoe UI',Arial,sans-serif;color:${DUSK};margin-top:6px">${cap}</div></div>`
  const card = (title, inner) =>
    `<div style="background:${WHITE};border:1px solid ${STONE};border-radius:10px;padding:22px 26px;margin-top:18px;width:fit-content">` +
    `<div style="font:700 12px 'Segoe UI',Arial,sans-serif;letter-spacing:.14em;color:${NIGHT};margin-bottom:14px">${title}</div>` +
    `<div style="display:flex;align-items:flex-start;gap:10px">${inner}</div></div>`
  const gap = `<div style="width:1px;background:${STONE};align-self:stretch;margin:0 14px"></div>`

  const sizes = [24, 14, 8]
    .map(px =>
      cell(ourChair(px, 'available'), `Ours ${px}px`) +
      cell(img(bench.available[px]), `TryBooking ${px}px`) +
      (px !== 8 ? gap : ''),
    )
    .join('')

  const states =
    cell(ourChair(24, 'available'), 'Ours available') +
    cell(ourChair(24, 'sold'), 'Ours sold') +
    cell(ourChair(24, 'selected'), 'Ours selected') +
    cell(ourChair(24, 'held'), 'Ours held') +
    gap +
    cell(img(bench.available[24]), 'TryBooking available') +
    cell(img(bench.sold[24]), 'TryBooking sold') +
    cell(img(bench.selected[24]), 'TryBooking selected') +
    cell('<div style="font:600 11px \'Segoe UI\',Arial,sans-serif;color:#6B7280">none</div>', 'TryBooking held')

  const html =
    `<body style="margin:0;background:${VEIL};padding:26px 30px;width:1180px;box-sizing:border-box">` +
    `<div style="font:700 13px 'Segoe UI',Arial,sans-serif;letter-spacing:.16em;color:${NIGHT}">CHAIR PROOF: OURS BESIDE TRYBOOKING AT MATCHED SIZES</div>` +
    `<div style="font:400 11px 'Segoe UI',Arial,sans-serif;color:#6B7280;margin-top:6px">Benchmark chair cropped from ${BENCH} (legend chips, 1182x1002 capture)</div>` +
    card('SIZES: 24PX, 14PX, 8PX', sizes) +
    card('STATES AT 24PX', states) +
    `</body>`

  const page = await browser.newPage({ viewport: { width: 1240, height: 520 }, deviceScaleFactor: 2 })
  await page.setContent(html, { waitUntil: 'load' })
  const bad = await page.evaluate(() =>
    [...document.images].filter(i => !i.complete || i.naturalWidth === 0).length)
  if (bad) throw new Error(`ABORT: ${bad} benchmark crop(s) failed to load; refusing to ship an empty column`)
  await page.locator('body').screenshot({ path: `${OUT}/chair-proof.png` })
  await page.close()
  console.log('[proof] chair-proof.png written, all benchmark crops verified loaded')
}

// ── room-proof.png ─────────────────────────────────────────────────────────
// 500 seats: two mirrored blocks of 10 columns x 25 rows, one 2-pitch aisle.
const PITCH = 30
const COLS = 22 // 10 + 2 aisle + 10
const ROWS = 25
const CHAIR_W = 24
const CHAIR_H = 20
const FRAME_W = 1440
const FRAME_H = 1000

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function buildRoomProof(browser) {
  const seatCols = [...Array(10).keys(), ...[...Array(10).keys()].map(c => c + 12)]
  const seats = []
  for (let r = 0; r < ROWS; r++) for (const c of seatCols) seats.push({ r, c })
  if (seats.length !== 500) throw new Error(`seat count ${seats.length} !== 500`)

  // Exactly 150 sold (30.0%), front-weighted the way real sales land.
  const rand = mulberry32(20260726)
  const scored = seats.map(s => ({ ...s, k: rand() + (s.r / ROWS) * 1.35 }))
  scored.sort((a, b) => a.k - b.k)
  const sold = new Set(scored.slice(0, 150).map(s => `${s.r}-${s.c}`))

  const fieldW = COLS * PITCH // 660
  const fieldH = ROWS * PITCH // 750
  const stageH = 56
  const stageGap = 30
  const rulerH = 16
  const contentH = stageH + stageGap + rulerH + fieldH // 852
  const ox = (FRAME_W - fieldW) / 2 // 390
  const oyStage = (FRAME_H - contentH) / 2 // 74
  const fieldTop = oyStage + stageH + stageGap + rulerH // 176
  const cx = ox + fieldW / 2 // 720

  const parts = []
  parts.push(`<rect width="${FRAME_W}" height="${FRAME_H}" fill="${WHITE}"/>`)

  // Stage: centred trapezoid on the blocks' true centre, navy, letter-spaced.
  parts.push(
    `<path d="M${cx - 160} ${oyStage} H${cx + 160} L${cx + 125} ${oyStage + stageH} H${cx - 125} Z" fill="${NIGHT}"/>`,
    `<text x="${cx}" y="${oyStage + stageH / 2 + 5}" text-anchor="middle" fill="${WHITE}" ` +
      `font-family="'Segoe UI',Arial,sans-serif" font-size="13" font-weight="600" letter-spacing="7">STAGE</text>`,
  )

  // One number ruler above each block: left 1-10, right 11-20.
  for (let i = 0; i < 20; i++) {
    const c = seatCols[i]
    const x = ox + c * PITCH + PITCH / 2
    parts.push(
      `<text x="${x}" y="${fieldTop - 7}" text-anchor="middle" fill="${DUSK}" ` +
        `font-family="'Segoe UI',Arial,sans-serif" font-size="10" font-weight="600">${i + 1}</text>`,
    )
  }

  // Row letters, both flanks, fixed gutters.
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXY'
  for (let r = 0; r < ROWS; r++) {
    const y = fieldTop + r * PITCH + PITCH / 2 + 4
    for (const gx of [ox - 24, ox + fieldW + 24]) {
      parts.push(
        `<text x="${gx}" y="${y}" text-anchor="middle" fill="${DUSK}" ` +
          `font-family="'Segoe UI',Arial,sans-serif" font-size="11" font-weight="600">${letters[r]}</text>`,
      )
    }
  }

  // The chairs: one reusable symbol stamped 500 times.
  parts.push(
    `<defs>` +
      `<g id="av"><path d="${SILHOUETTE}" fill="${WHITE}" stroke="${HARBOUR}" stroke-width="1.4" stroke-linejoin="round"/>` +
      `<path d="${DETAIL}" fill="none" stroke="${HARBOUR}" stroke-width="1.15"/></g>` +
      `<g id="sd"><path d="${SILHOUETTE}" fill="${DUSK}" stroke="${DUSK}" stroke-width="1.4" stroke-linejoin="round"/></g>` +
      `</defs>`,
  )
  for (const s of seats) {
    const x = ox + s.c * PITCH + (PITCH - CHAIR_W) / 2
    const y = fieldTop + s.r * PITCH + (PITCH - CHAIR_H) / 2
    const id = sold.has(`${s.r}-${s.c}`) ? 'sd' : 'av'
    parts.push(`<use href="#${id}" x="${x}" y="${y}"/>`)
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME_W}" height="${FRAME_H}" viewBox="0 0 ${FRAME_W} ${FRAME_H}">${parts.join('')}</svg>`
  const html = `<body style="margin:0">${svg}</body>`

  const page = await browser.newPage({ viewport: { width: FRAME_W, height: FRAME_H }, deviceScaleFactor: 2 })
  await page.setContent(html, { waitUntil: 'load' })
  await page.screenshot({ path: `${OUT}/room-proof.png` })
  await page.close()
  console.log(`[proof] room-proof.png written: 500 seats, ${sold.size} sold (${((sold.size / 500) * 100).toFixed(1)}%)`)
}

const browser = await chromium.launch()
await buildChairProof(browser)
await buildRoomProof(browser)
await browser.close()
console.log('[proof] done: ' + path.resolve(OUT))
