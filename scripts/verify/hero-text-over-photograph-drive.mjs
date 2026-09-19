/**
 * HERO TEXT OVER A PHOTOGRAPH. What a reader's eye actually receives on the
 * text the platform paints on top of a picture, measured rather than computed
 * from a stylesheet.
 *
 * WHY A DRIVE AND NOT A TEST. Every other contrast gate on this platform
 * computes its ratio from `globals.css`: a token against a token, which is the
 * right thing to do when both sides are declared. A hero declares only one
 * side. The other side is a JPEG that the licensed spine, a bundled raster or a
 * third-party photo API chose, composited under a hand-written navy gradient,
 * and no amount of arithmetic about a stylesheet can tell you how bright the
 * sky is behind the word MELBOURNE. Only the painted pixel can.
 *
 * HOW THE BACKGROUND IS OBTAINED, with no heuristic anywhere in it. For each
 * text run the page is screenshotted TWICE at the same scroll offset: once as
 * shipped, and once with `visibility: hidden` on that one element. Visibility
 * preserves layout, so the second capture is the identical frame with the
 * glyphs removed and whatever was behind them revealed. The glyph pixels are
 * then the pixels that DIFFER between the two captures, and the background
 * under each of them is its value in the second capture. Nothing is sampled
 * "near" the text and nothing is averaged over a box.
 *
 * WHICH PIXELS COUNT. Antialiased edge pixels carry only a fraction of the
 * foreground colour, so judging them would overstate the fault. Only CORE
 * pixels are judged: the ones the browser painted at full glyph coverage,
 * which are what a reader sees as the letter.
 *
 * FULL COVERAGE IS COMPUTED, NOT ASSUMED TO BE THE DECLARED COLOUR, because a
 * hero subtitle is `text-white/85` and a translucent foreground has no single
 * painted colour: what lands on the page is `a x fg + (1-a) x background`, and
 * the background is the photograph, so it differs pixel by pixel. The drive
 * resolves the computed `color` to sRGB AND its alpha (through a canvas, so
 * `oklab()` and every other modern colour space the stylesheet may emit is the
 * browser's problem rather than this file's), composites it over the revealed
 * background per pixel, and calls a pixel core when the shipped capture matches
 * that composite. At alpha 1 this reduces exactly to "equals the declared
 * colour". The ratio is then taken between that composited glyph colour and its
 * own background, which is the pair the eye actually receives.
 *
 * THE FLOORS, from the primary source (Law 7), fetched 2026-09-19:
 *   normal text            4.5:1   WCAG 2.2 SC 1.4.3
 *     https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
 *   large text             3:1     same page. Large is >= 24px, or >= 18.66px
 *                                  when the computed weight is 700 or more.
 *     https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
 *   Size is read from the element at the viewport under test, never assumed,
 *   because every hero headline steps down at 390.
 *
 * WHAT IS REPORTED PER RUN: the worst core pixel, the median, and the share of
 * core pixels below the floor. The VERDICT is taken on the worst pixel, because
 * a letter that is unreadable is unreadable whatever the other letters do, and
 * the median is printed beside it so the size of a failure is never guessed.
 *
 * Usage:
 *   BASE=http://localhost:3200 node scripts/verify/hero-text-over-photograph-drive.mjs \
 *     --out C:\dev\EVIDENCE\HERO-CONTRAST --label green
 *   ... --only /categories/technology       measure one route
 *   ... --shots                             write a PNG per measured run
 */
import { chromium } from 'playwright'
import sharp from 'sharp'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/HERO-CONTRAST'
let label = 'run'
let shots = false
const only = []
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') out = args[++i]
  else if (args[i] === '--label') label = args[++i]
  else if (args[i] === '--only') only.push(args[++i])
  else if (args[i] === '--shots') shots = true
}
out = join(out, `drive-${label}`)
mkdirSync(out, { recursive: true })

const BASE = (process.env.BASE ?? 'http://localhost:3200').replace(/\/$/, '')

/* ── The routes, ENUMERATED FROM SOURCE, never typed here ──────────────────
 * A slug typed into a drive is a slug that silently stops existing. Each
 * family is read out of the module that declares it, and the drive refuses to
 * run if a family comes back implausibly small, so a renamed export fails
 * loudly instead of quietly measuring four pages.
 */
const enumerate = (file, re, min, what) => {
  const found = [...readFileSync(file, 'utf8').matchAll(re)].map(m => m[1])
  const uniq = [...new Set(found)]
  if (uniq.length < min) {
    console.error(`[hero-contrast] BROKEN DRIVE: only ${uniq.length} ${what} enumerated from ${file} (expected >= ${min}).`)
    process.exit(1)
  }
  return uniq
}

const CATEGORIES = enumerate('src/lib/categories/category-editorial.ts', /^ {4}slug: '([a-z-]+)',$/gm, 20, 'category slug(s)')
const COMMUNITIES = enumerate('src/lib/communities/data.ts', /^ {4}slug: '([a-z-]+)',$/gm, 15, 'community slug(s)')

/*
 * CITIES AND SUBURBS LIVE IN ONE FILE AND ARE NOT THE SAME THING, which the
 * first version of this drive did not notice: `slug: '...'` matched both, so
 * the sweep asked for /city/sydney-inner-west 48 times and counted 72 clean
 * 404s as failures. A suburb IS worth measuring - it renders the same CityHero
 * - but at its own URL, which the page builds as `${city.slug}-${suburb}`, so
 * the city prefix comes off. Both shapes are matched by the field that tells
 * them apart rather than by indentation.
 */
const CITIES = enumerate('src/lib/cities/data.ts', /^ {4}slug: '([a-z-]+)', name: '[^']+', state:/gm, 20, 'city slug(s)')
const SUBURBS = [
  ...readFileSync('src/lib/cities/data.ts', 'utf8').matchAll(/^ {4}slug: '([a-z-]+)', citySlug: '([a-z-]+)',/gm),
].map(m => ({ city: m[2], suburb: m[1].startsWith(`${m[2]}-`) ? m[1].slice(m[2].length + 1) : m[1] }))
if (SUBURBS.length < 10) {
  console.error(`[hero-contrast] BROKEN DRIVE: only ${SUBURBS.length} suburb(s) enumerated from src/lib/cities/data.ts.`)
  process.exit(1)
}

/*
 * WHY EVERY SLUG AND NOT A SAMPLE. The declared side of this contrast is one
 * colour on every one of these pages; the undeclared side is a different
 * photograph on each. A sample of three would measure three photographs and
 * say nothing about the other hundred, and the failures this drive exists to
 * find are exactly the ones that depend on which picture landed.
 */
const ROUTES = [
  '/',
  '/this-weekend',
  '/cities',
  '/communities',
  ...CATEGORIES.map(s => `/categories/${s}`),
  ...CITIES.map(s => `/city/${s}`),
  ...SUBURBS.map(s => `/city/${s.city}/${s.suburb}`),
  /* PhotographicCityHero renders HERE and on no other family. The first
   * version of this drive left it out, and a template with its own gradient
   * would then have been "measured" by a sweep that never loaded a page it
   * appears on. Every hero template must have at least one route in this list. */
  ...CITIES.map(s => `/events/browse/${s}`),
  ...COMMUNITIES.map(s => `/community/${s}`),
]
/*
 * EVERY HERO TEMPLATE MUST HAVE A ROUTE IN THAT LIST, and the drive refuses to
 * run if one does not. This is not decoration: the first version of this file
 * measured 91 routes, reported on four templates, and had never loaded a single
 * page that renders PhotographicCityHero. A sweep that is missing a family does
 * not look any different from a sweep that is green.
 */
const TEMPLATE_ROUTES = {
  'src/components/templates/PhotographicCategoryHero.tsx': '/categories/',
  'src/components/templates/PhotographicCityHero.tsx': '/events/browse/',
  'src/components/templates/PhotographicCommunityHero.tsx': '/community/',
  'src/components/features/city/city-hero.tsx': '/city/',
}
for (const [file, prefix] of Object.entries(TEMPLATE_ROUTES)) {
  readFileSync(file, 'utf8') // throws loudly if a template was renamed
  if (!ROUTES.some(r => r.startsWith(prefix))) {
    console.error(`[hero-contrast] BROKEN DRIVE: ${file} renders on ${prefix}* and this sweep loads no such route.`)
    process.exit(1)
  }
}

console.log(
  `[hero-contrast] enumerated ${CATEGORIES.length} categories, ${CITIES.length} cities, ${SUBURBS.length} suburbs, ${COMMUNITIES.length} communities -> ${ROUTES.length} routes`,
)

const TARGETS = only.length ? ROUTES.filter(r => only.includes(r)) : ROUTES
if (only.length && TARGETS.length !== only.length) {
  console.error(`[hero-contrast] --only named a route this drive does not know: ${only.filter(o => !ROUTES.includes(o)).join(', ')}`)
  process.exit(1)
}

const VIEWPORTS = [
  { label: '390', width: 390, height: 844 },
  { label: '768', width: 768, height: 1024 },
  { label: '1440', width: 1440, height: 1000 },
]

const TEXT_FLOOR = 4.5
const LARGE_FLOOR = 3
/** How close a painted pixel must be to the computed colour to count as core. */
const CORE_TOLERANCE = 10

const srgb = c => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}
const luminance = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
const contrast = (a, b) => {
  const l1 = Math.max(luminance(a), luminance(b))
  const l2 = Math.min(luminance(a), luminance(b))
  return (l1 + 0.05) / (l2 + 0.05)
}
/** Composite a resolved {rgb, alpha} foreground over one background pixel. */
const composite = (fg, alpha, bg) => [
  alpha * fg[0] + (1 - alpha) * bg[0],
  alpha * fg[1] + (1 - alpha) * bg[1],
  alpha * fg[2] + (1 - alpha) * bg[2],
]
const hex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()

const checks = []
const failures = []
function check(id, ok, detail) {
  checks.push({ id, ok, detail })
  if (!ok) failures.push(`${id}: ${detail}`)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}

const raw = async buf => {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, w: info.width, h: info.height, ch: info.channels }
}

const rows = []
const browser = await chromium.launch()
try {
  for (const route of TARGETS) {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        reducedMotion: 'no-preference',
      })
      const page = await ctx.newPage()
      const id = `${route.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'home'}@${vp.label}`
      let res
      try {
        res = await page.goto(BASE + route, { waitUntil: 'load', timeout: 45000 })
      } catch (e) {
        check(id, false, `navigation threw: ${e.message}`)
        await ctx.close()
        continue
      }
      if (!res || res.status() !== 200) {
        check(id, false, `answered ${res ? res.status() : 'no response'}`)
        await ctx.close()
        continue
      }

      /* The hero image owns the LCP; measuring before it decodes would measure
       * the empty box behind it. Wait for every image inside the hero band to
       * report complete, then let one frame settle. */
      const heroSel = ':is(.hero-marketing, .hero-marketing-grow)'
      const hasHero = await page.locator(heroSel).count()
      if (hasHero === 0) {
        check(id, false, 'renders no hero band at the locked scale to measure')
        await ctx.close()
        continue
      }
      await page.waitForFunction(
        sel => {
          const band = document.querySelector(sel)
          if (!band) return false
          return [...band.querySelectorAll('img')].every(i => i.complete && i.naturalWidth > 0)
        },
        heroSel,
        { timeout: 30000 },
      ).catch(() => {})
      await page.waitForTimeout(400)

      /*
       * THE TEXT RUNS ARE FOUND BY WHAT THEY ARE, NOT BY A CLASS STRING. Four
       * hero templates write four different class lists for the same eyebrow,
       * so matching a class would measure whichever template the author of the
       * drive happened to read. A run is any element inside the hero band that
       * owns visible text of its own and paints no opaque background behind it.
       * An element WITH an opaque backing (the event page's pill) is excluded
       * and counted, because its contrast is a declared pair and is a different
       * gate's business.
       */
      const runs = await page.evaluate(sel => {
        const band = document.querySelector(sel)
        if (!band) return []
        const opaque = el => {
          let n = el
          while (n && n !== band.parentElement) {
            const cs = getComputedStyle(n)
            const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/)
            if (m) {
              const p = m[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat)
              const a = p.length > 3 ? p[3] : 1
              if (a >= 0.7) return true
            }
            n = n.parentElement
          }
          return false
        }
        const found = []
        for (const el of band.querySelectorAll('*')) {
          const own = [...el.childNodes]
            .filter(n => n.nodeType === 3)
            .map(n => n.textContent.trim())
            .join(' ')
            .trim()
          if (!own) continue
          const cs = getComputedStyle(el)
          if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.05) continue
          const b = el.getBoundingClientRect()
          if (b.width < 2 || b.height < 2) continue
          const backed = opaque(el)
          /* The browser resolves the colour, whatever space the stylesheet
           * wrote it in. A 1x1 canvas filled with the computed string reports
           * the sRGB triple and the alpha, which is exactly what is painted. */
          const cv = document.createElement('canvas')
          cv.width = 1
          cv.height = 1
          const cx = cv.getContext('2d')
          cx.clearRect(0, 0, 1, 1)
          cx.fillStyle = cs.color
          cx.fillRect(0, 0, 1, 1)
          const px = cx.getImageData(0, 0, 1, 1).data
          const alpha = px[3] / 255
          /* getImageData returns UN-premultiplied channels, so these are
           * already the source colour. Dividing by alpha here was tried and is
           * wrong: white at 0.85 came back as 300 per channel and no pixel on
           * the page could ever match it, which the drive then reported as
           * "the run is invisible" against three perfectly visible subtitles. */
          const srcRgb = [px[0], px[1], px[2]]
          found.push({
            text: own.slice(0, 40),
            tag: el.tagName.toLowerCase(),
            color: cs.color,
            rgb: srcRgb,
            alpha,
            fontSize: parseFloat(cs.fontSize),
            fontWeight: cs.fontWeight,
            rect: { x: b.x, y: b.y, width: b.width, height: b.height },
            backed,
          })
          el.setAttribute('data-hero-run', String(found.length - 1))
        }
        return found
      }, heroSel)

      if (runs.length === 0) {
        check(id, false, 'hero band holds no text run to measure')
        await ctx.close()
        continue
      }

      const shipped = await raw(await page.screenshot())
      let measured = 0

      for (const [i, run] of runs.entries()) {
        if (run.backed) {
          rows.push({ route, viewport: vp.label, text: run.text, skipped: 'opaque backing' })
          continue
        }
        // Hide this one run; layout is preserved, so the frame is identical.
        await page.evaluate(n => {
          const el = document.querySelector(`[data-hero-run="${n}"]`)
          if (el) el.style.visibility = 'hidden'
        }, i)
        const bare = await raw(await page.screenshot())
        await page.evaluate(n => {
          const el = document.querySelector(`[data-hero-run="${n}"]`)
          if (el) el.style.visibility = ''
        }, i)

        const fg = run.rgb
        const alpha = run.alpha
        const x0 = Math.max(0, Math.floor(run.rect.x))
        const y0 = Math.max(0, Math.floor(run.rect.y))
        const x1 = Math.min(shipped.w, Math.ceil(run.rect.x + run.rect.width))
        const y1 = Math.min(shipped.h, Math.ceil(run.rect.y + run.rect.height))

        const ratios = []
        let worst = null
        for (let y = y0; y < y1; y += 1) {
          for (let x = x0; x < x1; x += 1) {
            const p = (y * shipped.w + x) * shipped.ch
            const a = [shipped.data[p], shipped.data[p + 1], shipped.data[p + 2]]
            const b = [bare.data[p], bare.data[p + 1], bare.data[p + 2]]
            // unchanged by hiding the run: not a glyph pixel
            if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) continue
            // What a fully covered pixel MUST look like over this background.
            const full = composite(fg, alpha, b)
            // Anything short of that is an antialiased edge, not core.
            if (
              Math.abs(a[0] - full[0]) > CORE_TOLERANCE ||
              Math.abs(a[1] - full[1]) > CORE_TOLERANCE ||
              Math.abs(a[2] - full[2]) > CORE_TOLERANCE
            ) continue
            const r = contrast(full, b)
            ratios.push(r)
            if (worst === null || r < worst.r) worst = { r, bg: b, fgPainted: full, x, y }
          }
        }

        const large = run.fontSize >= 24 || (run.fontSize >= 18.66 && Number(run.fontWeight) >= 700)
        const floor = large ? LARGE_FLOOR : TEXT_FLOOR
        const runId = `${id} "${run.text}"`

        if (ratios.length === 0) {
          check(runId, false, `no fully covered glyph pixel found (fg ${hex(fg)} a=${alpha} at ${run.fontSize}px): the run is invisible or the capture did not change`)
          rows.push({ route, viewport: vp.label, text: run.text, corePixels: 0 })
          continue
        }
        measured += 1
        ratios.sort((a, b) => a - b)
        const median = ratios[Math.floor(ratios.length / 2)]
        const below = ratios.filter(r => r < floor).length
        const share = (below / ratios.length) * 100
        rows.push({
          route,
          viewport: vp.label,
          text: run.text,
          tag: run.tag,
          fg: hex(fg),
          alpha,
          fontSizePx: run.fontSize,
          fontWeight: run.fontWeight,
          floor,
          corePixels: ratios.length,
          worst: Number(worst.r.toFixed(2)),
          worstBg: hex(worst.bg),
          worstFgPainted: hex(worst.fgPainted),
          worstAt: { x: worst.x, y: worst.y },
          median: Number(median.toFixed(2)),
          shareBelowFloorPct: Number(share.toFixed(1)),
        })
        check(
          runId,
          worst.r >= floor,
          `${hex(fg)}${alpha < 1 ? `@${alpha}` : ''} ${run.fontSize}px/${run.fontWeight} worst ${worst.r.toFixed(2)}:1 on ${hex(worst.bg)}, median ${median.toFixed(2)}:1, ${share.toFixed(1)}% of ${ratios.length} core px below ${floor}`,
        )
      }

      if (measured === 0) {
        check(`${id} coverage`, false, 'every text run in the hero was skipped or unmeasurable')
      }
      if (shots) {
        await page.screenshot({ path: join(out, `${id.replace('@', '-')}.png`) })
      }
      await ctx.close()
    }
  }
} finally {
  await browser.close()
}

writeFileSync(join(out, 'drive.json'), JSON.stringify({ base: BASE, routes: TARGETS.length, checks, rows }, null, 2))
const passed = checks.filter(c => c.ok).length
console.log(`\n${passed} of ${checks.length} checks passed across ${TARGETS.length} route(s) x ${VIEWPORTS.length} viewports`)
if (failures.length) {
  console.log(`\n${failures.length} FAILURE(S):`)
  for (const f of failures) console.log(`  ${f}`)
  process.exit(1)
}
console.log('ALL GREEN')
