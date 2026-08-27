/**
 * The FINAL BUILD proof pack (TEST only), into docs/design/seating-final-build/:
 *   - Four room shapes plus the four-tier room at 1440 and 390.
 *   - The three LOD states on the three-block theatre at 1440 and 390.
 *   - The chair at 24, 14 and 8px beside the cropped TryBooking benchmark,
 *     all four states, from the REAL glyph paths (no duplicated geometry).
 *   - DRAWN-FRAME collision assertions on every configuration.
 *   - The deliberate-failure demonstration: a probe label stamped over the
 *     stage text, the assertion catching it, the probe removed, the
 *     assertion passing: proof the gate CAN fail.
 *
 * Run: node --experimental-strip-types scripts/seating-final-proofs.mjs <baseUrl> [steps]
 *   steps: comma list of chair,rooms,lods,assert,probe (default all)
 */
import fs from 'node:fs'
import sharp from 'sharp'
import { chromium, devices } from 'playwright'
import { CHAIR_PART_PATHS, CHAIR_STROKE, GLYPH_BOX } from '../src/lib/seating/render/glyphs.ts'
import { SEAT_STATE_COLORS } from '../src/lib/seating/palette.ts'

const BASE = process.argv[2]
if (!BASE) throw new Error('usage: node --experimental-strip-types scripts/seating-final-proofs.mjs <baseUrl> [steps]')
const STEPS = new Set((process.argv[3] ?? 'chair,rooms,lods,assert,probe').split(','))
const OUT = 'docs/design/seating-final-build'
fs.mkdirSync(OUT, { recursive: true })

const PROD_REF = 'gndnldyfudbytbboxesk'
const envFile = fs.readFileSync('.env.test', 'utf8')
if (envFile.includes(PROD_REF)) throw new Error('SAFETY STOP: .env.test points at PRODUCTION')

const ROOMS = [
  { key: 'theatre', slug: 'final-proof-three-block-theatre' },
  { key: 'two-block', slug: 'final-proof-two-block-house' },
  { key: 'cabaret', slug: 'final-proof-cabaret-floor' },
  { key: 'mixed', slug: 'final-proof-grandstand-and-lawn' },
  { key: 'four-tier', slug: 'final-proof-four-tier-house' },
]
const THEATRE = ROOMS[0].slug

const SHEET = '[data-testid="seat-sheet"]'
const CONTAINER = `${SHEET} > div`
const CANVAS = `${SHEET} canvas`
const DESKTOP = { viewport: { width: 1440, height: 940 } }
const MOBILE = { ...devices['iPhone 13'] }
const C = SEAT_STATE_COLORS
const HARBOUR = '#1F5673'
const BENCH = 'docs/design/seating-final-2026-07-26/r47/trybooking-buyer-01.png'
// A partial run (a single step) must NEVER erase the record of the steps it
// did not run: the results file is loaded first and only the steps that
// actually execute are overwritten. Without this, `... chair` silently
// deleted the room, LOD, assertion and probe evidence from the last full run.
const RESULTS = `${OUT}/seating-final-proofs.json`
const previous = fs.existsSync(RESULTS) ? JSON.parse(fs.readFileSync(RESULTS, 'utf8')) : { steps: {} }
const proofs = { base: BASE, ranSteps: [...STEPS], steps: { ...(previous.steps ?? {}) } }

async function openSeats(page, slug) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto(`${BASE}/events/${slug}`, { waitUntil: 'load', timeout: 120000 })
      await page.waitForSelector(`${SHEET} canvas`, { timeout: 60000 })
      await page.waitForTimeout(1200)
      // The first-run guide card floats OVER the sheet until dismissed:
      // dismiss it the way a real user would, so the captures show the
      // plan and the canvas-region pixel scans read the canvas alone.
      const close = page.getByRole('button', { name: 'Close this guide and do not show it again' })
      if (await close.count()) {
        await close.first().evaluate(el => el.click())
        await page.waitForTimeout(400)
      }
      return
    } catch (e) {
      if (attempt === 1) throw e
      console.log(`[final] openSeats retry for ${slug}: ${e.message.split('\n')[0]}`)
    }
  }
}

async function _shotEl(page, selector, name) {
  await page.waitForTimeout(400)
  const el = page.locator(selector).first()
  await el.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await el.screenshot({ path: `${OUT}/${name}.png` })
  console.log(`[final] shot ${name}`)
}

/**
 * The plan itself: the canvas element's OWN bitmap via toDataURL, so a
 * sheet taller than the viewport never stitches the sticky header or any
 * other page furniture into the evidence. The context shots (viewport
 * screenshots) carry the page chrome honestly, separately.
 */
async function shotCanvas(page, name) {
  await page.waitForTimeout(300)
  const b64 = await page
    .locator(CANVAS)
    .first()
    .evaluate(c => c.toDataURL('image/png').split(',')[1])
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(b64, 'base64'))
  console.log(`[final] plan ${name}`)
}

async function getLod(page) {
  return page.locator(CONTAINER).first().getAttribute('data-lod')
}

/**
 * Programmatic press: at 390 the page's fixed chrome (bottom nav, ticket
 * bar, guidance toasts) can sit over the zoom cluster at some scroll
 * offsets, which trips Playwright's strict hit test. The harness tests
 * the RENDERER, so it presses the real button element directly.
 */
async function pressButton(page, name) {
  await page.getByRole('button', { name }).first().evaluate(el => el.click())
}

async function driveToLod(page, target, dir) {
  const name = dir === 'in' ? 'Zoom in' : 'Zoom out'
  for (let i = 0; i < 14; i++) {
    if ((await getLod(page)) === target) return true
    await pressButton(page, name)
    await page.waitForTimeout(420)
  }
  return (await getLod(page)) === target
}

/**
 * Contextual hints arm on the buyer's own actions (zooming, tapping) and
 * float OVER the sheet until dismissed. Spend them the way a real user
 * would, so captures show the plan and the canvas-region pixel scans read
 * the canvas alone. One dismissal spends a hint for the whole context.
 */
async function dismissHints(page) {
  for (let i = 0; i < 4; i++) {
    const hint = page.getByRole('button', { name: 'Dismiss this hint' }).first()
    if ((await hint.count()) === 0) return
    await hint.evaluate(el => el.click()).catch(() => {})
    await page.waitForTimeout(250)
  }
}

// ── The drawn-frame recorder: every fillText/strokeText the frame draws ─────
const INIT = () => {
  window.__frameN = 0
  const tick = () => { window.__frameN++; requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
  const runs = (window.__drawnTextRuns = [])
  for (const name of ['fillText', 'strokeText']) {
    const orig = CanvasRenderingContext2D.prototype[name]
    CanvasRenderingContext2D.prototype[name] = function (text, x, y, ...rest) {
      if (window.__suppressText) return
      try {
        const m = this.measureText(String(text))
        const t = this.getTransform()
        const x0 = x - (m.actualBoundingBoxLeft ?? 0)
        const x1 = x + (m.actualBoundingBoxRight ?? 0)
        const y0 = y - (m.actualBoundingBoxAscent ?? 0)
        const y1 = y + (m.actualBoundingBoxDescent ?? 0)
        const px = (wx, wy) => ({ x: t.a * wx + t.c * wy + t.e, y: t.b * wx + t.d * wy + t.f })
        const p0 = px(x0, y0)
        const p1 = px(x1, y1)
        runs.push({
          text: String(text),
          frame: window.__frameN,
          x: Math.min(p0.x, p1.x),
          y: Math.min(p0.y, p1.y),
          w: Math.abs(p1.x - p0.x),
          h: Math.abs(p1.y - p0.y),
          cw: this.canvas?.width ?? 0,
          ch: this.canvas?.height ?? 0,
        })
        if (runs.length > 20000) runs.splice(0, runs.length - 20000)
      } catch (error) {
        console.warn('[scripts/seating-final-proofs:174]', error instanceof Error ? error.message : error)
    }
      return orig.call(this, text, x, y, ...rest)
    }
  }
}

const nudge = async page => {
  const zin = page.getByRole('button', { name: 'Zoom in' }).first()
  if (await zin.isEnabled()) {
    await pressButton(page, 'Zoom in')
    await page.waitForTimeout(350)
    await pressButton(page, 'Zoom out')
  } else {
    await pressButton(page, 'Zoom out')
    await page.waitForTimeout(350)
    await pressButton(page, 'Zoom in')
  }
  await page.waitForTimeout(550)
}
const shrink = (r, m) => ({ x: r.x + m, y: r.y + m, w: r.w - 2 * m, h: r.h - 2 * m })
const hit = (a, b) =>
  a.w > 0 && a.h > 0 && b.w > 0 && b.h > 0 &&
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
const overlapArea = (a, b) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))

async function assertDrawnFrame(page) {
  // Arm and spend any zoom-triggered hint BEFORE the measured frames.
  await nudge(page)
  await dismissHints(page)
  await page.evaluate(() => { (window.__drawnTextRuns ?? []).length = 0 })
  await nudge(page)
  const main = await page.locator(CANVAS).first().evaluate(c => ({ w: c.width, h: c.height }))
  const all = await page.evaluate(() => window.__drawnTextRuns ?? [])
  const last = Math.max(0, ...all.map(r => r.frame))
  const runs = all.filter(r => r.frame === last && r.cw === main.w && r.ch === main.h)

  let textText = 0
  const pairs = []
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const a = shrink(runs[i], 1)
      const b = shrink(runs[j], 1)
      if (!hit(a, b)) continue
      const area = overlapArea(runs[i], runs[j])
      const minArea = Math.min(runs[i].w * runs[i].h, runs[j].w * runs[j].h)
      if (runs[i].text === runs[j].text && area > 0.8 * minArea) continue
      if (runs[i].text.length === 1 && runs[j].text.length === 1 && area < 0.3 * minArea) continue
      textText++
      if (pairs.length < 12) pairs.push(`"${runs[i].text}" x "${runs[j].text}"`)
    }
  }

  await page.evaluate(() => { window.__suppressText = true })
  await nudge(page)
  // The canvas's OWN bitmap: the drawn frame with nothing over it.
  const shotB64 = await page
    .locator(CANVAS)
    .first()
    .evaluate(c => c.toDataURL('image/png').split(',')[1])
  const shot = Buffer.from(shotB64, 'base64')
  await page.evaluate(() => { window.__suppressText = false })
  await nudge(page)
  const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true })
  const sx = info.width / main.w
  const sy = info.height / main.h
  let textInk = 0
  const inkHits = []
  for (const r of runs) {
    const b = shrink({ x: r.x * sx, y: r.y * sy, w: r.w * sx, h: r.h * sy }, 1)
    const x0 = Math.max(0, Math.floor(b.x))
    const y0 = Math.max(0, Math.floor(b.y))
    const x1 = Math.min(info.width, Math.ceil(b.x + b.w))
    const y1 = Math.min(info.height, Math.ceil(b.y + b.h))
    if (x1 - x0 < 3 || y1 - y0 < 3) continue
    let n = 0
    let sum = 0
    let sum2 = 0
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const k = (yy * info.width + xx) * info.channels
        const l = 0.299 * data[k] + 0.587 * data[k + 1] + 0.114 * data[k + 2]
        n++; sum += l; sum2 += l * l
      }
    }
    const sd = Math.sqrt(Math.max(0, sum2 / n - (sum / n) ** 2))
    if (sd > 16) {
      textInk++
      if (inkHits.length < 12) inkHits.push(`"${r.text}" sd ${sd.toFixed(1)}`)
    }
  }

  const clipped = runs.filter(r => r.x < -1 || r.y < -1 || r.x + r.w > main.w + 1 || r.y + r.h > main.h + 1).length
  const model = await page.locator(CONTAINER).first().evaluate(el => {
    const d = el.__seatLabels
    if (!d) return null
    const rect = { w: el.clientWidth, h: el.clientHeight }
    const inside = (b, m) => b.x >= m && b.y >= m && b.x + b.w <= rect.w - m && b.y + b.h <= rect.h - m
    return {
      counts: d.counts,
      seats: d.seatBoxes.length,
      seatsClipped: d.seatBoxes.filter(b => !inside(b, 0)).length,
    }
  })
  return { runs: runs.length, textText, textInk, clipped, pairs, inkHits, model }
}

const browser = await chromium.launch()

// ── The chair beside the benchmark, from the REAL paths ─────────────────────
if (STEPS.has('chair')) {
  const CHIPS = {
    available: { left: 429, top: 444, width: 24, height: 20 },
    sold: { left: 539, top: 444, width: 24, height: 20 },
    selected: { left: 672, top: 445, width: 23, height: 20 },
  }
  const crop = async (box, targetW) => {
    const targetH = Math.round((box.height / box.width) * targetW)
    const buf = await sharp(BENCH).extract(box).resize(targetW, targetH, { kernel: 'lanczos3', fit: 'fill' }).png().toBuffer()
    return { uri: `data:image/png;base64,${buf.toString('base64')}`, w: targetW, h: targetH }
  }
  // ONE glyph, uniformly scaled, its stroke scaling with it: exactly what
  // draw.ts does, so the evidence cannot disagree with the renderer.
  const chairBody = state => {
    const parts = CHAIR_PART_PATHS
    if (state === 'sold') return parts.map(d => `<path d="${d}" fill="${C.dusk}"/>`).join('')
    if (state === 'selected') {
      return (
        parts.map(d => `<path d="${d}" fill="${C.gold}"/>`).join('') +
        parts.map(d => `<path d="${d}" fill="none" stroke="${C.night}" stroke-width="${CHAIR_STROKE * 1.15}" stroke-linejoin="round"/>`).join('')
      )
    }
    if (state === 'held') {
      return (
        parts.map(d => `<path d="${d}" fill="${C.stone}"/>`).join('') +
        parts.map(d => `<path d="${d}" fill="none" stroke="${HARBOUR}" stroke-width="${CHAIR_STROKE}" stroke-dasharray="${CHAIR_STROKE * 2.2} ${CHAIR_STROKE * 1.8}" stroke-linejoin="round"/>`).join('')
      )
    }
    return parts
      .map(d => `<path d="${d}" fill="${C.white}" stroke="${HARBOUR}" stroke-width="${CHAIR_STROKE}" stroke-linejoin="round"/>`)
      .join('')
  }
  const chair = (px, state) =>
    `<svg width="${px}" height="${px}" viewBox="0 0 ${GLYPH_BOX} ${GLYPH_BOX}" style="display:block">${chairBody(state)}</svg>`
  const img = c => `<img src="${c.uri}" width="${c.w}" height="${c.h}" style="display:block">`
  const cell = (inner, cap) =>
    `<div style="text-align:center;min-width:92px"><div style="height:44px;display:flex;align-items:center;justify-content:center">${inner}</div>` +
    `<div style="font:600 11px 'Segoe UI',Arial,sans-serif;color:${C.dusk};margin-top:6px">${cap}</div></div>`
  const gap = `<div style="width:1px;background:${C.stone};align-self:stretch;margin:0 14px"></div>`
  const card = (title, inner) =>
    `<div style="background:${C.white};border:1px solid ${C.stone};border-radius:10px;padding:22px 26px;margin-top:18px;width:fit-content">` +
    `<div style="font:700 12px 'Segoe UI',Arial,sans-serif;letter-spacing:.14em;color:${C.night};margin-bottom:14px">${title}</div>` +
    `<div style="display:flex;align-items:flex-start;gap:10px">${inner}</div></div>`

  // ── The symmetry check: rasterise the glyph, flip it, compare ───────────
  // The chair regressed twice by losing mirror symmetry, so this is measured
  // from the SAME path strings the renderer uses, not asserted. It is filled
  // solid at 600px, flopped about the image centre (which is the glyph's own
  // centreline x = 50 in the 0..100 viewBox) and differenced pixel by pixel.
  // Each part is checked on its own as well as the assembled silhouette, so
  // a break can be located, not just detected.
  const SYM_PX = 600
  const SYM_TARGETS = {
    silhouette: CHAIR_PART_PATHS,
    back: [CHAIR_PART_PATHS[0]],
    arms: [CHAIR_PART_PATHS[1], CHAIR_PART_PATHS[2]],
    pan: [CHAIR_PART_PATHS[3]],
  }
  const symmetry = {}
  for (const [name, paths] of Object.entries(SYM_TARGETS)) {
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${SYM_PX}" height="${SYM_PX}" viewBox="0 0 ${GLYPH_BOX} ${GLYPH_BOX}">` +
        paths.map(d => `<path d="${d}" fill="#000"/>`).join('') +
        `</svg>`,
    )
    const base = sharp(svg).greyscale()
    const [a, b] = await Promise.all([
      base.clone().raw().toBuffer(),
      base.clone().flop().raw().toBuffer(),
    ])
    let maxDiff = 0
    let offPixels = 0
    for (let i = 0; i < a.length; i++) {
      const d = Math.abs(a[i] - b[i])
      if (d > maxDiff) maxDiff = d
      if (d > 2) offPixels++
    }
    symmetry[name] = { maxDiff, offPixels, match: offPixels === 0 }
    console.log(
      `[final] symmetry ${name}: ${offPixels === 0 ? 'MATCH' : 'MISMATCH'} ` +
        `(pixels off ${offPixels}, max channel delta ${maxDiff})`,
    )
  }
  proofs.steps.chairSymmetry = symmetry
  if (Object.values(symmetry).some(s => !s.match)) {
    throw new Error('ABORT: chair glyph is not mirror-symmetrical about its centreline')
  }

  const SIZES = [48, 24, 14, 8]
  const bench = {}
  for (const [state, box] of Object.entries(CHIPS)) {
    bench[state] = {}
    for (const px of SIZES) bench[state][px] = await crop(box, px)
  }
  const sizes = SIZES
    .map((px, i) => cell(chair(px, 'available'), `Ours ${px}px`) + cell(img(bench.available[px]), `TryBooking ${px}px`) + (i < SIZES.length - 1 ? gap : ''))
    .join('')
  const states =
    cell(chair(24, 'available'), 'Ours available') + cell(chair(24, 'sold'), 'Ours sold') +
    cell(chair(24, 'selected'), 'Ours selected') + cell(chair(24, 'held'), 'Ours held') + gap +
    cell(img(bench.available[24]), 'TryBooking available') + cell(img(bench.sold[24]), 'TryBooking sold') +
    cell(img(bench.selected[24]), 'TryBooking selected') +
    cell(`<div style="font:600 11px 'Segoe UI',Arial,sans-serif;color:${C.stoneText}">none</div>`, 'TryBooking held')
  // The symmetry row: each tier at 64px beside its own mirrored copy, with
  // the measured verdict underneath, so the founder can see the test as well
  // as read it.
  const mirrorCell = (paths, label, result) => {
    const svg = flip =>
      `<svg width="64" height="64" viewBox="0 0 ${GLYPH_BOX} ${GLYPH_BOX}" style="display:block">` +
      `<g${flip ? ` transform="translate(${GLYPH_BOX} 0) scale(-1 1)"` : ''}>` +
      paths.map(d => `<path d="${d}" fill="none" stroke="${HARBOUR}" stroke-width="${CHAIR_STROKE}" stroke-linejoin="round"/>`).join('') +
      `</g></svg>`
    return (
      `<div style="text-align:center;min-width:170px">` +
      `<div style="display:flex;align-items:center;justify-content:center;gap:10px">${svg(false)}${svg(true)}</div>` +
      `<div style="font:600 11px 'Segoe UI',Arial,sans-serif;color:${C.dusk};margin-top:8px">${label}</div>` +
      `<div style="font:700 11px 'Segoe UI',Arial,sans-serif;color:${result.match ? '#0F6B3D' : '#DC2626'};margin-top:3px">` +
      `${result.match ? 'MIRRORED HALVES MATCH' : 'MISMATCH'}</div>` +
      `<div style="font:400 10px 'Segoe UI',Arial,sans-serif;color:${C.stoneText};margin-top:2px">` +
      `${result.offPixels} pixels off at ${SYM_PX}px</div></div>`
    )
  }
  const symmetryRow =
    mirrorCell(SYM_TARGETS.silhouette, 'The silhouette, drawn then mirrored', symmetry.silhouette) + gap +
    mirrorCell(SYM_TARGETS.back, 'Back alone', symmetry.back) + gap +
    mirrorCell(SYM_TARGETS.arms, 'Arms alone', symmetry.arms) + gap +
    mirrorCell(SYM_TARGETS.pan, 'Pan alone', symmetry.pan)

  // ── THREE REAL ROWS AT 24PX, roughly 30 per cent sold ───────────────────
  // The glyph judged in context rather than in isolation: a real row rhythm
  // at the renderer's own chair-to-pitch ratio (CHAIR_PITCH_RATIO 0.75), so
  // the gaps between chairs are the gaps a buyer actually sees.
  const ROW_COUNT = 3
  const COLS = 14
  const CHAIR_PX = 24
  const PITCH = Math.round(CHAIR_PX / 0.75) // the renderer's chair:pitch ratio
  // A fixed, reproducible sold pattern at ~30 per cent (13 of 42 = 31.0%).
  const SOLD = new Set([2, 3, 9, 13, 16, 17, 21, 27, 30, 31, 34, 38, 41])
  let rowsSvg = ''
  for (let r = 0; r < ROW_COUNT; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c
      const state = SOLD.has(i) ? 'sold' : 'available'
      const x = c * PITCH
      const y = r * PITCH
      const k = CHAIR_PX / GLYPH_BOX
      rowsSvg +=
        `<g transform="translate(${x} ${y}) scale(${k.toFixed(4)})">${chairBody(state)}</g>`
    }
  }
  const rowsW = (COLS - 1) * PITCH + CHAIR_PX
  const rowsH = (ROW_COUNT - 1) * PITCH + CHAIR_PX
  const soldPct = Math.round((SOLD.size / (ROW_COUNT * COLS)) * 100)
  const rowsBlock =
    `<div>` +
    `<svg width="${rowsW}" height="${rowsH}" viewBox="0 0 ${rowsW} ${rowsH}" style="display:block">${rowsSvg}</svg>` +
    `<div style="font:600 11px 'Segoe UI',Arial,sans-serif;color:${C.dusk};margin-top:12px">` +
    `${ROW_COUNT} rows x ${COLS} seats at ${CHAIR_PX}px on a ${PITCH}px pitch, ${SOLD.size} sold (${soldPct} per cent)</div></div>`

  const html =
    `<body style="margin:0;background:${C.veil};padding:26px 30px;width:1200px;box-sizing:border-box">` +
    `<div style="font:700 13px 'Segoe UI',Arial,sans-serif;letter-spacing:.16em;color:${C.night}">CHAIR FINAL: ONE GLYPH, UNIFORMLY SCALED, BESIDE TRYBOOKING</div>` +
    `<div style="font:400 11px 'Segoe UI',Arial,sans-serif;color:${C.stoneText};margin-top:6px">Paths imported from src/lib/seating/render/glyphs.ts (100-box, stroke ${CHAIR_STROKE} scaling with the glyph); benchmark cropped from ${BENCH}</div>` +
    card('ONE SILHOUETTE AT 48, 24, 14 AND 8PX', sizes) +
    card('STATES AT 24PX', states) +
    card('IN CONTEXT: THREE REAL ROWS AT 24PX', rowsBlock) +
    card('SYMMETRY CHECK: DRAWN AGAINST ITS OWN MIRROR', symmetryRow) + '</body>'
  const page = await browser.newPage({ viewport: { width: 1240, height: 1120 }, deviceScaleFactor: 2 })
  await page.setContent(html, { waitUntil: 'load' })
  const bad = await page.evaluate(() => [...document.images].filter(i => !i.complete || i.naturalWidth === 0).length)
  if (bad) throw new Error(`ABORT: ${bad} benchmark crop(s) failed to load`)
  await page.locator('body').screenshot({ path: `${OUT}/chair-final.png` })
  await page.close()
  console.log('[final] chair-final.png written, benchmark crops verified loaded')
  proofs.steps.chair = { written: true }
}

// ── Room captures: every shape at 1440 and 390, at fit ─────────────────────
if (STEPS.has('rooms')) {
  for (const [vp, ctxOpts] of [['1440', DESKTOP], ['390', MOBILE]]) {
    const ctx = await browser.newContext(ctxOpts)
    const page = await ctx.newPage()
    for (const room of ROOMS) {
      await openSeats(page, room.slug)
      await pressButton(page, 'Zoom to fit')
      await page.waitForTimeout(600)
      await dismissHints(page)
      await shotCanvas(page, `room-${room.key}-${vp}`)
    }
    await ctx.close()
  }
  // The context shots: full viewport screenshots with the page chrome
  // shown honestly (header, key plan, zoom cluster), one per viewport.
  const mctx = await browser.newContext(MOBILE)
  const mpage = await mctx.newPage()
  await openSeats(mpage, THEATRE)
  await mpage.locator(SHEET).first().scrollIntoViewIfNeeded()
  await mpage.waitForTimeout(500)
  await mpage.screenshot({ path: `${OUT}/mobile-390-context.png` })
  await mctx.close()
  const dctx = await browser.newContext(DESKTOP)
  const dpage = await dctx.newPage()
  await openSeats(dpage, THEATRE)
  await dpage.locator(SHEET).first().scrollIntoViewIfNeeded()
  await dpage.waitForTimeout(500)
  await dpage.screenshot({ path: `${OUT}/desktop-1440-context.png` })
  await dctx.close()
  console.log('[final] room captures done')
  proofs.steps.rooms = { rooms: ROOMS.length, viewports: 2 }
}

// ── The three LOD states on the theatre ─────────────────────────────────────
if (STEPS.has('lods')) {
  for (const [vp, ctxOpts] of [['1440', DESKTOP], ['390', MOBILE]]) {
    const ctx = await browser.newContext(ctxOpts)
    const page = await ctx.newPage()
    await openSeats(page, THEATRE)
    for (const [state, dir] of [['overview', 'out'], ['mid', 'in'], ['seat', 'in']]) {
      const ok = await driveToLod(page, state, dir)
      console.log(`[final] theatre ${vp} lod ${state}: ${ok ? 'reached' : 'NOT VERIFIED'}`)
      await dismissHints(page)
      await shotCanvas(page, `theatre-lod-${state}-${vp}`)
    }
    await ctx.close()
  }
  proofs.steps.lods = { done: true }
}

// ── Drawn-frame assertions: every room, both viewports, plus theatre LODs ──
if (STEPS.has('assert')) {
  const results = []
  for (const [vp, ctxOpts] of [['1440', DESKTOP], ['390', MOBILE]]) {
    const ctx = await browser.newContext(ctxOpts)
    await ctx.addInitScript(INIT)
    const page = await ctx.newPage()
    for (const room of ROOMS) {
      await openSeats(page, room.slug)
      await pressButton(page, 'Zoom to fit')
      await page.waitForTimeout(600)
      results.push({ room: room.key, viewport: vp, lod: 'fit', ...(await assertDrawnFrame(page)) })
    }
    await openSeats(page, THEATRE)
    for (const [state, dir] of [['overview', 'out'], ['mid', 'in'], ['seat', 'in']]) {
      await driveToLod(page, state, dir)
      await page.waitForTimeout(400)
      results.push({ room: 'theatre', viewport: vp, lod: state, ...(await assertDrawnFrame(page)) })
    }
    await ctx.close()
  }
  fs.writeFileSync(`${OUT}/assertions.json`, JSON.stringify(results, null, 2))
  const bad = results.filter(r => r.textText || r.textInk || r.clipped || (r.lod === 'fit' && r.model?.seatsClipped))
  console.log(`[final] drawn-frame assertions: ${results.length} configurations, ${bad.length} failures`)
  for (const r of bad) {
    console.log(`[final]   FAIL ${r.room} ${r.viewport} ${r.lod}: textText=${r.textText} textInk=${r.textInk} clipped=${r.clipped} seatsClipped=${r.model?.seatsClipped ?? 0}`)
    for (const p of r.pairs) console.log(`[final]     pair ${p}`)
    for (const h of r.inkHits) console.log(`[final]     ink ${h}`)
  }
  proofs.steps.assertions = { configurations: results.length, failures: bad.length }
}

// ── The deliberate-failure demonstration ────────────────────────────────────
if (STEPS.has('probe')) {
  const ctx = await browser.newContext(DESKTOP)
  await ctx.addInitScript(INIT)
  const page = await ctx.newPage()
  await openSeats(page, THEATRE)
  await pressButton(page, 'Zoom to fit')
  await page.waitForTimeout(600)

  const clean1 = await assertDrawnFrame(page)
  // Find the drawn STAGE text and stamp the probe straight over it.
  await page.evaluate(() => { (window.__drawnTextRuns ?? []).length = 0 })
  await nudge(page)
  const stage = await page.evaluate(() => {
    const runs = window.__drawnTextRuns ?? []
    const last = Math.max(0, ...runs.map(r => r.frame))
    return runs.find(r => r.frame === last && r.text === 'STAGE') ?? null
  })
  if (!stage) throw new Error('NOT VERIFIED: no STAGE text run found to collide with')
  const dpr = await page.evaluate(() => window.devicePixelRatio || 1)
  await page.locator(CONTAINER).first().evaluate((el, args) => {
    el.__seatDebug?.setProbe({ text: 'PROBE', x: args.x, y: args.y })
  }, { x: (stage.x + stage.w / 2) / dpr, y: (stage.y + stage.h / 2) / dpr })
  await page.waitForTimeout(400)
  const withProbe = await assertDrawnFrame(page)
  await shotCanvas(page, 'probe-collision-1440')
  await page.locator(CONTAINER).first().evaluate(el => el.__seatDebug?.setProbe(null))
  await page.waitForTimeout(400)
  const clean2 = await assertDrawnFrame(page)
  await ctx.close()

  const demo = {
    cleanBefore: { textText: clean1.textText, textInk: clean1.textInk, verdict: clean1.textText || clean1.textInk ? 'FAIL' : 'PASS' },
    withProbe: {
      textText: withProbe.textText,
      textInk: withProbe.textInk,
      pairs: withProbe.pairs,
      verdict: withProbe.textText > 0 ? 'FAIL (correct: the probe collides)' : 'DID NOT CATCH: the gate is broken',
    },
    cleanAfter: { textText: clean2.textText, textInk: clean2.textInk, verdict: clean2.textText || clean2.textInk ? 'FAIL' : 'PASS' },
  }
  fs.writeFileSync(`${OUT}/probe-demo.json`, JSON.stringify(demo, null, 2))
  console.log('[final] probe demo:', JSON.stringify(demo))
  proofs.steps.probe = demo
}

fs.writeFileSync(RESULTS, JSON.stringify(proofs, null, 2))
await browser.close()
console.log('[final] DONE')
