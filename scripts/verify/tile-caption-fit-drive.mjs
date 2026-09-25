/**
 * DOES A TILE CAPTION FIT THE TILE IT IS ANCHORED TO? Measured in the browser,
 * at every viewport, rather than reasoned about from a class list.
 *
 * WHY THIS EXISTS, and it is the half of the tile fix that a contrast drive can
 * never see. `src/components/media/tile-photo-scrim.ts` anchors the wash to the
 * LABEL in absolute lengths, which makes the contrast floor independent of
 * layout: every pixel from the caption's first line downward carries at least
 * TILE_CAPTION_MIN_ALPHA, for a label of any length, at any width. That fixes
 * the 149 runs measured below floor on 20 September 2026 and it introduces a
 * new way to be wrong.
 *
 * On /cities at 390 the tile is 173x108 and the caption it carried - a city
 * name, a state line and an event-count pill - measured 112px. The caption was
 * TALLER THAN ITS TILE. Anchoring the wash to it therefore covered 100 per cent
 * of the picture in navy: perfectly legible, and an image-poor tile on an
 * image-rich platform, which Law 4 forbids as clearly as WCAG forbids the
 * original. `C:/dev/EVIDENCE/TILE-CAPTION/cities-390-anchored-only.png` is what
 * that looks like and is why this drive exists.
 *
 * SO THE RULE IS A CEILING ON THE DARKENED BAND, and it is inherited rather than
 * chosen: six tiles in this family declared `h-2/3` for their wash before any of
 * this was measured, so the platform had already answered "how much of a tile
 * may be darkened" in its own markup. `TILE_CAPTION_MAX_SHARE` is that answer,
 * and a caption over it means its secondary lines belong BELOW the image, which
 * is what the design system asks for in the first place.
 *
 * HOW A CAPTION IS FOUND, with no heuristic in it. The first version of this
 * measurement looked for "an absolutely positioned element at bottom:0 with text
 * in it", and on /cities at 768 it reported the whole page as a tile. A caption
 * is not a shape; it is the thing painting THE SHARED WASH. The drive reads the
 * gradient out of the module that declares it, asks the browser which elements
 * compute that exact background, and takes each one's parent. The tile is then
 * that caption's own `offsetParent`, which is the browser's answer to "what is
 * this absolutely positioned box anchored to" rather than anybody's guess.
 *
 * Usage:
 *   BASE=http://localhost:3200 node scripts/verify/tile-caption-fit-drive.mjs \
 *     --routes-file C:/dev/EVIDENCE/TILE-CAPTION/routes.txt \
 *     --out C:/dev/EVIDENCE/TILE-CAPTION --label fit
 */
import { chromium } from 'playwright'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/TILE-CAPTION'
let label = 'fit'
let routesFile = null
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') out = args[++i]
  else if (args[i] === '--label') label = args[++i]
  else if (args[i] === '--routes-file') routesFile = args[++i]
}
out = join(out, `fit-${label}`)
mkdirSync(out, { recursive: true })

const BASE = (process.env.BASE ?? 'http://localhost:3200').replace(/\/$/, '')

/* ── THE CONTRACT, READ FROM THE MODULE THAT DECLARES IT ───────────────────
 * Never restated here. A drive that carries its own copy of the number it is
 * checking is a drive that goes on passing after the number changes.
 */
const SCRIM_MODULE = 'src/components/media/tile-photo-scrim.ts'
const scrimSrc = readFileSync(SCRIM_MODULE, 'utf8')
const constantOf = name => {
  const m = scrimSrc.match(new RegExp(`export const ${name} =\\s*(?:'([^']+)'|([0-9./ ]+))`))
  if (!m) {
    console.error(`[tile-fit] BROKEN DRIVE: ${SCRIM_MODULE} no longer declares ${name}.`)
    process.exit(1)
  }
  return m[1] !== undefined ? m[1] : m[2].trim()
}
const FADE = constantOf('TILE_CAPTION_FADE')
const MAX_SHARE = (() => {
  const raw = constantOf('TILE_CAPTION_MAX_SHARE')
  const frac = raw.match(/^(\d+)\s*\/\s*(\d+)$/)
  return frac ? Number(frac[1]) / Number(frac[2]) : Number(raw)
})()
if (!Number.isFinite(MAX_SHARE) || MAX_SHARE <= 0 || MAX_SHARE > 1) {
  console.error(`[tile-fit] BROKEN DRIVE: TILE_CAPTION_MAX_SHARE read as ${MAX_SHARE}, which is not a share.`)
  process.exit(1)
}

/*
 * The gradient's own first stop, which is what identifies a painted caption in
 * the DOM. Matching the WHOLE declaration would be brittle: a browser
 * normalises `rgba(10,22,40,0)` to `rgba(10, 22, 40, 0)` and rewrites lengths.
 * The alpha stop at the fade distance is the part that is distinctive and the
 * part this drive is actually about.
 */
const MIN_ALPHA_STOP = (() => {
  const hero = readFileSync('src/components/media/hero-photo-scrim.ts', 'utf8')
  const m = hero.match(/HERO_CAPTION_MIN_ALPHA\s*=\s*([0-9.]+)/)
  if (!m) {
    console.error('[tile-fit] BROKEN DRIVE: hero-photo-scrim.ts no longer declares HERO_CAPTION_MIN_ALPHA.')
    process.exit(1)
  }
  return Number(m[1])
})()

const ROUTES = (() => {
  if (!routesFile) {
    console.error('[tile-fit] BROKEN DRIVE: --routes-file is required. A slug typed into a drive is a slug that silently stops existing.')
    process.exit(1)
  }
  const lines = readFileSync(routesFile, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l.startsWith('/'))
  if (lines.length === 0) {
    console.error(`[tile-fit] BROKEN DRIVE: ${routesFile} held no route beginning with '/'.`)
    process.exit(1)
  }
  return lines
})()

const VIEWPORTS = [
  { label: '390', width: 390, height: 844 },
  { label: '768', width: 768, height: 1024 },
  { label: '1440', width: 1440, height: 1000 },
]

const checks = []
let failures = 0
function check(id, ok, detail) {
  checks.push({ id, ok, detail })
  if (!ok) failures += 1
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}

const browser = await chromium.launch()
for (const route of ROUTES) {
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
    let measured = []
    try {
      const res = await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 120000 })
      const status = res ? res.status() : 0
      if (status !== 200) {
        check(`${route}@${vp.label}`, false, `HTTP ${status}: a drive cannot measure a page that did not load`)
        await page.close()
        continue
      }
      /* Lazy tiles below the fold have no layout until they are reached. */
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
          window.scrollTo(0, y)
          await new Promise(r => setTimeout(r, 90))
        }
        window.scrollTo(0, 0)
      })
      await page.waitForTimeout(600)
      measured = await page.evaluate(
        ({ fade, minAlpha }) => {
          const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
          const fadePx = fade.endsWith('rem') ? parseFloat(fade) * rem : parseFloat(fade)
          /*
           * THE STOP AND ITS DISTANCE, not the alpha alone. The hero caption
           * paints the SAME floor - it is deliberately one number, imported
           * rather than restated - so matching the alpha on its own found every
           * hero on the page and reported a 439px hero band with a 372px caption
           * as a tile taking 90 per cent of itself. A hero is governed by
           * hero-photo-scrim.ts and by a different rule. What separates the two
           * is the FADE distance, which is exactly the thing that had to differ
           * because a tile is 108px and a hero is 400.
           */
          const stop = `rgba(10, 22, 40, ${minAlpha}) ${fadePx}px`
          const rows = []
          for (const el of document.querySelectorAll('[aria-hidden]')) {
            const bg = getComputedStyle(el).backgroundImage
            if (!bg || !bg.includes(stop)) continue
            const caption = el.parentElement
            if (!caption) continue
            const tile = caption.offsetParent
            if (!tile) continue
            const cr = caption.getBoundingClientRect()
            const tr = tile.getBoundingClientRect()
            if (tr.height < 1) continue
            rows.push({
              tileClass: (tile.className || '').toString().slice(0, 56),
              text: (caption.innerText || '').trim().split('\n')[0].slice(0, 30),
              tile: [Math.round(tr.width), Math.round(tr.height)],
              caption: Math.round(cr.height),
              band: Math.round(cr.height + fadePx),
              share: Math.round(((cr.height + fadePx) / tr.height) * 1000) / 1000,
            })
          }
          return rows
        },
        { fade: FADE, minAlpha: MIN_ALPHA_STOP },
      )
    } catch (e) {
      check(`${route}@${vp.label}`, false, `drive error: ${String(e).split('\n')[0]}`)
      await page.close()
      continue
    }
    await page.close()

    if (measured.length === 0) {
      /*
       * A route with no caption is REPORTED, never silently counted as clean -
       * "nothing failed" and "nothing was looked at" print identically
       * otherwise, and that is the failure mode this whole family of work
       * exists to end.
       *
       * IT IS NOT A FAILURE ON ITS OWN, and calling it one cost three red
       * checks against a correct product on 20 September 2026. The route list
       * is handed in, and a page with no tile caption is a legitimate answer to
       * a handed-in question: the homepage carries a hero carousel and rails
       * whose labels sit BELOW their images, which is what the design system
       * asks for, so it paints no tile caption and should not.
       *
       * The anti-false-pass survives one level out, where it belongs: a run in
       * which NO route anywhere painted the shared wash means the drive has
       * gone blind, and that is asserted after the loop. Same reasoning, and
       * the same wording, as `--routes-file` in the contrast drive beside it.
       */
      console.log(`  NONE  ${route}@${vp.label}  no tile caption on this page (not a failure; see the run total below)`)
      continue
    }
    /* One row per DISTINCT tile shape and caption height: twenty tiles of the
     * same size on one grid is one measurement, not twenty identical lines. */
    const seen = new Set()
    for (const r of measured) {
      const key = `${r.tile.join('x')}|${r.caption}`
      if (seen.has(key)) continue
      seen.add(key)
      check(
        `${route}@${vp.label} "${r.text}"`,
        r.share <= MAX_SHARE,
        `tile ${r.tile[0]}x${r.tile[1]} [${r.tileClass}], caption ${r.caption}px + ${FADE} fade = ${r.band}px, ` +
          `${(r.share * 100).toFixed(1)}% of the tile (ceiling ${(MAX_SHARE * 100).toFixed(1)}%)`,
      )
    }
  }
}
await browser.close()

writeFileSync(
  join(out, 'fit.json'),
  JSON.stringify({ base: BASE, fade: FADE, maxShare: MAX_SHARE, checks }, null, 2),
)
console.log(`\n[tile-fit] ${checks.length - failures}/${checks.length} checks passed. Written to ${out}`)

/*
 * THE DRIVE MUST HAVE SEEN A CAPTION SOMEWHERE, or it has measured nothing and
 * is reporting a clean sweep of it. This is the assertion the per-route one was
 * trying to be, moved to the scope where zero is genuinely wrong.
 */
if (checks.length === 0) {
  console.error(
    '[tile-fit] NO tile caption was found on ANY route at ANY viewport. Either the route list reaches no ' +
      'tile surface, or the shared wash this drive reads out of src/components/media/tile-photo-scrim.ts no ' +
      'longer matches what the caption paints. A green sweep of nothing is not evidence.',
  )
  process.exit(1)
}

if (failures) {
  /*
   * SAY WHICH FAILURES THESE ARE, rather than assuming they are all the size
   * ceiling. The summary line used to read "N caption(s) take more of their
   * tile than 66.7%" for every kind of failure, and on 20 September 2026 it
   * printed exactly that about three COVERAGE checks, sending a reader to hunt
   * for an oversized caption that did not exist. A summary that names the wrong
   * cause is worse than no summary.
   */
  const oversize = checks.filter(c => !c.ok && / of the tile \(ceiling /.test(c.detail))
  const other = checks.filter(c => !c.ok && !/ of the tile \(ceiling /.test(c.detail))
  if (oversize.length) {
    console.error(
      `[tile-fit] ${oversize.length} caption(s) take more of their tile than ${(MAX_SHARE * 100).toFixed(1)}%. ` +
        'A caption that big washes out the picture it sits on; move its secondary lines below the image.',
    )
    for (const c of oversize) console.error(`    ${c.id}: ${c.detail}`)
  }
  if (other.length) {
    console.error(`[tile-fit] ${other.length} other failure(s):`)
    for (const c of other) console.error(`    ${c.id}: ${c.detail}`)
  }
  process.exit(1)
}
