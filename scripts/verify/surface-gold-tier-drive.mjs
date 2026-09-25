/**
 * SURFACE GOLD TIER DRIVE. What a reader's eye actually receives on the shared
 * designed empty state, measured rather than computed from a token table.
 *
 * WHY THE PIXELS AND NOT THE TOKENS. `scripts/guards/surface-flag-colours-branch.mjs`
 * and `tests/unit/a11y/hero-empty-gold-tiers.test.ts` both compute their ratios
 * from globals.css, which is the right thing for a build-time gate and is still
 * arithmetic about a stylesheet. The empty state does not paint a token onto a
 * token: the eyebrow sits on a 10% gold pill, which sits on a card, which sits
 * over a 7% radial gold wash and a 3.5% navy grid, all of them siblings the
 * cascade cannot composite for you. The only honest background is the one the
 * browser actually drew.
 *
 * So the foreground is read EXACTLY (`getComputedStyle().color`, no
 * antialiasing to argue with) and the background is SAMPLED from the rendered
 * screenshot at a point inside the element and away from any glyph. That pair
 * is what the contrast ratio is computed from.
 *
 * FLOORS, from the primary source (Law 7), both fetched 2026-09-19:
 *   the eyebrow is 12px text          4.5:1   WCAG 2.2 SC 1.4.3
 *     https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
 *   the trust-pillar icon is a glyph  3:1     WCAG 2.2 SC 1.4.11
 *     https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
 *   Neither is rounded up to its floor; the W3C says so in terms.
 *
 * Usage:
 *   node scripts/verify/surface-gold-tier-drive.mjs --base http://localhost:3200 \
 *     --out C:\dev\EVIDENCE\UX-GOLD-TIERS --url /city/hobart --url /city/sydney/inner-west
 */
import { chromium } from 'playwright'
import sharp from 'sharp'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
let base = 'http://localhost:3200'
let out = null
const urls = []
for (let i = 0; i < args.length; i += 1) {
  const a = args[i]
  if (a === '--base') base = args[++i].replace(/\/$/, '')
  else if (a === '--out') out = args[++i]
  else if (a === '--url') urls.push(args[++i])
}
if (!out || urls.length === 0) {
  console.error('FAIL: --out and at least one --url are required')
  process.exit(1)
}
if (!existsSync(out)) mkdirSync(out, { recursive: true })

const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 900 },
]
const TEXT_FLOOR = 4.5 // SC 1.4.3, normal text
const GLYPH_FLOOR = 3 // SC 1.4.11, graphical object

const channel = (c) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
const contrast = (a, b) => {
  const l1 = Math.max(luminance(a), luminance(b))
  const l2 = Math.min(luminance(a), luminance(b))
  return (l1 + 0.05) / (l2 + 0.05)
}
const parseRgb = (s) => {
  const m = s.match(/rgba?\(([^)]+)\)/)
  if (!m) throw new Error(`cannot parse colour ${s}`)
  const p = m[1].split(',').map((x) => parseFloat(x.trim()))
  return [p[0], p[1], p[2]]
}
const hex = ([r, g, b]) =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()

let failures = 0
let checks = 0
const rows = []
const note = (ok, text) => {
  checks += 1
  if (!ok) failures += 1
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${text}`)
}

const browser = await chromium.launch()
try {
  for (const url of urls) {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
      })
      const page = await ctx.newPage()
      const label = `${url.replace(/\W+/g, '-').replace(/^-|-$/g, '')}-${vp.name}`
      const res = await page.goto(base + url, { waitUntil: 'load' })
      if (!res || res.status() !== 200) {
        note(false, `${url} @${vp.name} answered ${res ? res.status() : 'no response'}`)
        await ctx.close()
        continue
      }

      const hero = page.locator(':is(.hero-marketing, .hero-marketing-grow).rounded-2xl').first()
      if ((await hero.count()) === 0) {
        note(false, `${url} @${vp.name} renders no empty-state hero to measure`)
        await ctx.close()
        continue
      }
      await hero.scrollIntoViewIfNeeded()
      await page.waitForTimeout(250)

      const geom = await hero.evaluate((root) => ({
        clip: { boxH: Math.round(root.getBoundingClientRect().height), contentH: root.scrollHeight },
      }))

      /*
       * THE LOCKED SCALE IS STILL THE LOCKED SCALE. `.hero-marketing` was
       * refactored on 19 September 2026 to read its height from a custom
       * property so `.hero-marketing-grow` could share the numbers, and a
       * refactor of a founder-locked value is worth nothing on the claim that
       * it computes the same. Every fixed-scale hero on the page is measured
       * against the ruling of 7 July 2026: 52vh base, 55vh from 40rem, 60vh
       * from 64rem, floor 400px, ceiling 600px at lg.
       */
      const scale = vp.width >= 1024 ? 0.6 : vp.width >= 640 ? 0.55 : 0.52
      let expected = Math.max(scale * vp.height, 400)
      if (vp.width >= 1024) expected = Math.min(expected, 600)
      const fixedHeroes = await page.$$eval('.hero-marketing', (els) =>
        els.map((e) => Math.round(e.getBoundingClientRect().height)),
      )
      for (const [i, h] of fixedHeroes.entries()) {
        rows.push({ url, viewport: vp.name, element: `fixed-hero-${i}`, height: h, expected: Math.round(expected) })
        note(
          Math.abs(h - expected) <= 1,
          `${url} @${vp.name} fixed hero ${i} holds the locked scale: ${h}px against ${Math.round(expected)}px`,
        )
      }

      /*
       * HOW THE BACKGROUND IS SAMPLED, and why it is not an element screenshot.
       *
       * The first version of this drive captured the hero with
       * `elementHandle.screenshot()`. Playwright stitches a capture taller than
       * the viewport, and FIXED-POSITION chrome is painted into every stitched
       * band, so at 390 the navy bottom nav, the filter pills and the consent
       * banner all appeared inside a picture of a card they do not cover. The
       * icon sample landed on the bottom nav and the drive reported 2.70:1
       * against the product. It was measuring its own capture.
       *
       * So: each measured element is scrolled to the MIDDLE of the viewport,
       * where no fixed top or bottom bar can reach it, and the sample is taken
       * from a VIEWPORT screenshot at that element's viewport coordinates. That
       * is what a reader's eye receives, composited by the browser. If fixed
       * chrome genuinely covered the element, this would still show it.
       */
      const sampleAt = async (selector, dx, dy) => {
        const el = hero.locator(selector).first()
        if ((await el.count()) === 0) return null
        await el.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }))
        await page.waitForTimeout(150)
        const m = await el.evaluate((e) => {
          const b = e.getBoundingClientRect()
          const cs = getComputedStyle(e)
          return { x: b.x, y: b.y, width: b.width, height: b.height, color: cs.color, fontSize: parseFloat(cs.fontSize) }
        })
        const buf = await page.screenshot()
        const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true })
        const x = Math.round(m.x + dx(m))
        const y = Math.round(m.y + dy(m))
        if (x < 0 || y < 0 || x >= info.width || y >= info.height) {
          throw new Error(`sample point (${x},${y}) is outside the ${info.width}x${info.height} viewport`)
        }
        const i = (y * info.width + x) * info.channels
        return { ...m, bg: [data[i], data[i + 1], data[i + 2]] }
      }

      /*
       * CLIPPING FIRST, because a colour nobody can see is not a pass. On
       * 19 September 2026 this surface put 637px of content in a 439px box with
       * `overflow-hidden` at 390, and the trust pillars this drive measures were
       * cut off entirely - the measurement below would have thrown rather than
       * reported, which is how the defect was found.
       */
      rows.push({ url, viewport: vp.name, element: 'box', boxH: geom.clip.boxH, contentH: geom.clip.contentH })
      note(
        geom.clip.contentH <= geom.clip.boxH + 1,
        `${url} @${vp.name} shows all of itself: ${geom.clip.contentH}px of content in a ${geom.clip.boxH}px box`,
      )
      /* ── The eyebrow: 12px text on a 10% gold pill on the card ─────────── */
      // 4px inside the pill's left edge is padding: pill background, no glyph.
      const eb = await sampleAt('span.rounded-full', () => 4, (m) => m.height / 2)
      if (eb) {
        const fg = parseRgb(eb.color)
        const ratio = contrast(fg, eb.bg)
        const floor = eb.fontSize >= 18.5 ? GLYPH_FLOOR : TEXT_FLOOR
        rows.push({ url, viewport: vp.name, element: 'eyebrow', fg: hex(fg), bg: hex(eb.bg), fontSizePx: eb.fontSize, ratio: Number(ratio.toFixed(2)), floor })
        note(
          ratio >= floor,
          `${url} @${vp.name} eyebrow ${hex(fg)} on ${hex(eb.bg)} = ${ratio.toFixed(2)}:1 (floor ${floor}, ${eb.fontSize}px)`,
        )
      } else {
        note(false, `${url} @${vp.name} renders no eyebrow`)
      }

      /* ── The trust-pillar icon: an 18px glyph on the card ──────────────── */
      // 3px to the LEFT of the glyph box is card, not stroke.
      const ic = await sampleAt('svg', () => -3, (m) => m.height / 2)
      if (ic) {
        const fg = parseRgb(ic.color)
        const ratio = contrast(fg, ic.bg)
        rows.push({ url, viewport: vp.name, element: 'pillar-icon', fg: hex(fg), bg: hex(ic.bg), ratio: Number(ratio.toFixed(2)), floor: GLYPH_FLOOR })
        note(
          ratio >= GLYPH_FLOOR,
          `${url} @${vp.name} pillar icon ${hex(fg)} on ${hex(ic.bg)} = ${ratio.toFixed(2)}:1 (floor ${GLYPH_FLOOR})`,
        )
      } else {
        note(false, `${url} @${vp.name} renders no trust-pillar icon`)
      }

      /*
       * The evidence capture is the HERO SCROLLED TO THE TOP OF THE VIEWPORT,
       * taken as a viewport shot. A stitched element capture of a card taller
       * than the viewport paints fixed chrome through it and is unreadable as
       * evidence, which is the defect described above the sampler.
       */
      await hero.evaluate((e) => e.scrollIntoView({ block: 'start', behavior: 'instant' }))
      await page.waitForTimeout(200)
      await page.screenshot({ path: join(out, `hero-${label}.png`) })
      await ctx.close()
    }
  }
} finally {
  await browser.close()
}

writeFileSync(join(out, 'gold-tier-measurements.json'), JSON.stringify(rows, null, 2))
console.log('')
console.log(`${checks - failures} of ${checks} checks passed, ${failures} failed.`)
console.log(`measurements: ${join(out, 'gold-tier-measurements.json')}`)
process.exit(failures === 0 ? 0 : 1)
