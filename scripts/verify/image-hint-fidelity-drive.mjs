/**
 * THE DRIVEN HALF OF THE `sizes` CONTRACT (close-out C8B.3, 18 September 2026).
 *
 * ============================================================================
 * WHY A DRIVE AND NOT ONLY A GUARD
 * ============================================================================
 *
 * `scripts/guards/image-hints-match-the-cell.mjs` proves that a RAIL hint is
 * derived from its cell, which is decidable from source. It says in its own
 * header what it cannot do: a GRID's rendered width comes from the column count,
 * the gaps, the page padding and the container cap, resolved by a browser at a
 * viewport. Deriving that statically would mean reimplementing CSS inside a
 * guard and then trusting the reimplementation.
 *
 * So this drives a real browser and asks the only question that matters:
 *
 *     for every image on the page, is the candidate the browser CHOSE at least
 *     as wide as the slot the image LANDED in?
 *
 * ============================================================================
 * WHY UNDER-FETCH IS THE FAILURE AND OVER-FETCH IS A COST
 * ============================================================================
 *
 * They are not symmetric and treating them as one "accuracy" number hides the
 * difference. A hint larger than the slot costs bytes, which is measured and
 * reported. A hint SMALLER than the slot renders a soft, blurry tile on any 2x
 * screen, which the premium bar forbids, and it is invisible to every static
 * check because the markup is perfectly well formed.
 *
 * It was also live. Before this item, the city tiles on the homepage and on
 * /cities asked for 288px for a slot that renders at 338 and fetched 640px where
 * 644 were needed (`C:\dev\EVIDENCE\C8B3-HINTS\before-sweep.txt`).
 *
 * THE ONE EXEMPTION IS NAMED, NOT TOLERATED. `MEDIA_SIZES.fullBleed` asks for
 * 75vw on mobile deliberately: the hero is a photographic backdrop under a 40 to
 * 80 percent navy scrim, so a smaller source is visually identical and the hero
 * owns the LCP. That decision is written in `src/components/media/sizes.ts` and
 * is exempted here BY ITS LITERAL, so a second under-fetch cannot hide behind
 * it and widening a tolerance cannot excuse one.
 *
 * ============================================================================
 * WHAT IT CANNOT SEE
 * ============================================================================
 *
 * - Whether any of this reaches the Lighthouse score. Almost every image here is
 *   lazy and below the fold, so it is not on the paint path: what it costs is
 *   bytes and radio time on a phone at a venue. Read the score off
 *   `scripts/perf/lh-local-median.mjs`, never off this.
 * - An image that never scrolls into view. A horizontal rail holds more cards
 *   than a viewport shows, and this scrolls the PAGE, not each rail. The report
 *   prints how many of the images in the DOM were judged so the coverage is a
 *   number rather than an impression.
 *
 * ============================================================================
 * THE DEFAULT ROUTE LIST, AND THE TWO ROUTES DELIBERATELY NOT IN IT
 * ============================================================================
 *
 * The default is `/`, `/events`, `/cities`, `/communities`: the three routes the
 * C8B.1 cost table named, plus the community index. They pass.
 *
 * `--path=organisers` and `--path=about` FAIL, and that is a real defect rather
 * than a harness problem. Both render a `MarketingMedia variant="band"`, and that
 * one variant dresses two different layouts, which is the same fault this whole
 * item exists to fix:
 *
 *     /organisers 1920   a 636px contained band    needs 1272, chose 1920  x1.51
 *     /organisers 1920   a 1334px full-width band  needs 2668, chose 1920  x0.72
 *     /about      1920   a 1920px full-bleed band  needs 3840, chose 1920  x0.50
 *
 * Fixing it means splitting the variant and editing the marketing surfaces, which
 * are lane B's, so lane C measured it, drove it, and handed it over rather than
 * editing another lane's pages. The numbers and the fix are the BORDER line in
 * C:\dev\REVIEW-QUEUE-C.md. Add those two paths to this drive the day it lands.
 *
 *   node --env-file=.env.local scripts/verify/image-hint-fidelity-drive.mjs --serve --port=3200
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { startGateServer, envFor } from '../ops/pre-push-gate.mjs'
import { readLadder } from '../guards/lib/candidate-ladder.mjs'

const TAG = '[image-hint-fidelity-drive]'
const args = process.argv.slice(2)
const SERVE = args.includes('--serve')
const PORT = Number(args.find(a => a.startsWith('--port='))?.split('=')[1] ?? 3200)
let BASE = (args.find(a => a.startsWith('http')) ?? `http://127.0.0.1:${PORT}`).replace(/\/$/, '')
const OUT = args.find(a => a.startsWith('--out='))?.slice('--out='.length) ?? 'C:/dev/EVIDENCE/C8B3-HINTS/driven'
const DPR = 2

/** Every viewport the contract is claimed at, including both sides of each breakpoint. */
const WIDTHS = [360, 390, 430, 640, 768, 1024, 1280, 1440, 1920]
/** The three the screenshots are taken at. */
const SHOT_WIDTHS = [390, 768, 1440]

/**
 * The hero hint is the ONE deliberate under-fetch on the platform, exempted by
 * its literal rather than by a tolerance. If this string stops matching what
 * sizes.ts declares, the exemption stops applying and the drive goes red, which
 * is the correct direction to fail in.
 */
const DELIBERATE_UNDERFETCH = '(max-width: 768px) 75vw, 1920px'

const rawPaths = args.filter(a => a.startsWith('--path=')).map(a => a.split('=')[1])
const paths = (rawPaths.length ? rawPaths : ['home', 'events', 'cities', 'communities']).map(p => {
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) {
    console.error(
      `${TAG} REFUSING: --path=${p} arrived with a leading slash or a drive letter.\n` +
        '             MSYS rewrites a leading slash before this process starts, and a harness that\n' +
        '             silently measures the wrong route is worse than one that stops.',
    )
    process.exit(1)
  }
  return p === 'home' ? '/' : `/${p}`
})

/**
 * The configured ladder, read from next.config.ts by the same reader the guard
 * uses. Not retyped here: a drive with its own copy of the list would agree with
 * itself about a number neither of them holds.
 */
const ladderConfig = readLadder(readFileSync('next.config.ts', 'utf8'))
if (ladderConfig === null) {
  console.error(`${TAG} REFUSING: deviceSizes and imageSizes could not be read out of next.config.ts.`)
  process.exit(1)
}
const LADDER = ladderConfig.ladder

const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n        ${detail}` : ''}`)
}

const PROBE = () => {
  const widthOf = url => {
    const m = /[?&]w=(\d+)/.exec(url ?? '')
    return m ? Number(m[1]) : null
  }
  return [...document.querySelectorAll('img')].map(img => {
    const r = img.getBoundingClientRect()
    const section = img.closest('section, [aria-label]')
    return {
      sizes: img.getAttribute('sizes'),
      slotWidth: Math.round(r.width),
      chosenWidth: widthOf(img.currentSrc),
      decoded: img.naturalWidth > 0,
      heading:
        section?.getAttribute('aria-label') ??
        section?.querySelector('h1, h2, h3')?.textContent?.trim().slice(0, 48) ??
        null,
    }
  })
}

/**
 * Every distinct `w=` a candidate list OFFERS, as opposed to the one the browser
 * CHOSE. Clause 1 judges the choice; this judges the bill: an offered width no
 * slot can select is still ~230 bytes of document, once per image.
 */
const OFFERED = () => {
  const widths = new Set()
  for (const img of document.querySelectorAll('img')) {
    for (const m of (img.getAttribute('srcset') ?? '').matchAll(/[?&]w=(\d+)/g)) {
      widths.add(Number(m[1]))
    }
  }
  return [...widths].sort((a, b) => a - b)
}

const BYTES = () =>
  performance
    .getEntriesByType('resource')
    .filter(e => e.initiatorType === 'img' || /\/_next\/image/.test(e.name))
    .reduce((a, e) => ({ n: a.n + 1, bytes: a.bytes + (e.encodedBodySize || 0) }), { n: 0, bytes: 0 })

async function revealEverything(page) {
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8)
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise(r => setTimeout(r, 120))
    }
    window.scrollTo(0, document.body.scrollHeight)
    await new Promise(r => setTimeout(r, 400))
    window.scrollTo(0, 0)
    await new Promise(r => setTimeout(r, 200))
  })
  await page.waitForLoadState('networkidle').catch(() => {})
}

let stopServer = null
const report = { takenAt: new Date().toISOString(), dpr: DPR, routes: [] }

try {
  if (SERVE) {
    mkdirSync('.tmp', { recursive: true })
    const started = await startGateServer(envFor('local'), '.tmp/image-hint-drive-server.log', { port: PORT })
    if (started.error) {
      console.error(`${TAG} could not serve the build: ${started.error}`)
      process.exit(1)
    }
    BASE = started.base
    stopServer = started.stop
    console.log(`${TAG} serving the production build on ${BASE}`)
  }
  report.base = BASE
  mkdirSync(OUT, { recursive: true })

  const browser = await chromium.launch()
  try {
    for (const path of paths) {
      const url = BASE + path
      const head = await fetch(url, { headers: { 'user-agent': 'eventlinqs-image-hint-drive' } })
      if (!head.ok) {
        record(`${path} is served`, false, `answered ${head.status}; nothing on it can be judged`)
        continue
      }

      const route = { path, widths: [] }
      const under = []
      const offered = new Set()
      let judgedTotal = 0
      let inDomTotal = 0
      let worst = { ratio: Infinity }

      for (const width of WIDTHS) {
        const context = await browser.newContext({
          viewport: { width, height: width === 390 ? 844 : 1000 },
          deviceScaleFactor: DPR,
        })
        const page = await context.newPage()
        await page.goto(url, { waitUntil: 'domcontentloaded' })
        await revealEverything(page)
        const images = await page.evaluate(PROBE)
        const bytes = await page.evaluate(BYTES)
        for (const w of await page.evaluate(OFFERED)) offered.add(w)

        const judged = images.filter(i => i.decoded && i.chosenWidth && i.slotWidth > 0)
        judgedTotal += judged.length
        inDomTotal += images.length

        for (const i of judged) {
          const need = Math.round(i.slotWidth * DPR)
          const ratio = i.chosenWidth / need
          if (i.sizes === DELIBERATE_UNDERFETCH) continue
          if (ratio < 1) {
            under.push({ width, ...i, need, ratio: Number(ratio.toFixed(3)) })
          }
          if (ratio < worst.ratio) worst = { ratio, width, sizes: i.sizes, slot: i.slotWidth, need, chose: i.chosenWidth, heading: i.heading }
        }

        route.widths.push({
          viewport: width,
          imagesInDom: images.length,
          judged: judged.length,
          imageRequests: bytes.n,
          imageBytes: bytes.bytes,
        })

        if (SHOT_WIDTHS.includes(width)) {
          const rendered = await page.evaluate(() => ({
            header: Boolean(document.querySelector('header')),
            painted: [...document.querySelectorAll('img')].filter(i => i.naturalWidth > 0).length,
            links: document.querySelectorAll('a[href^="/"]').length,
          }))
          record(
            `clause 2: ${path} renders at ${width}`,
            rendered.header && rendered.painted > 0 && rendered.links > 0,
            `header ${rendered.header}; ${rendered.painted} images decoded; ${rendered.links} internal links`,
          )
          await page.screenshot({
            path: join(OUT, `${(path === '/' ? 'home' : path.slice(1)).replace(/[^a-z0-9]+/gi, '-')}-${width}.png`),
            fullPage: false,
          })
        }

        await context.close()
      }

      record(
        `clause 1: no image on ${path} is fetched SMALLER than its slot, at any of ${WIDTHS.length} viewports`,
        under.length === 0,
        under.length === 0
          ? `${judgedTotal} of ${inDomTotal} images judged; tightest margin x${worst.ratio === Infinity ? 'n/a' : worst.ratio.toFixed(2)}` +
            (worst.sizes ? ` (${worst.slot}px slot needing ${worst.need}, chose ${worst.chose}, ${worst.heading ?? 'unnamed'})` : '')
          : under
              .slice(0, 6)
              .map(u => `${u.width}: a ${u.slotWidth}px slot needs ${u.need} and the browser chose ${u.chosenWidth} (x${u.ratio}) - ${u.heading ?? 'unnamed'}, sizes=${u.sizes}`)
              .join('\n        '),
      )

      /*
       * CLAUSE 3, added 19 September 2026 with the width ladder.
       * `scripts/guards/candidate-ladder-has-no-dead-rung.mjs` proves from SOURCE
       * that every configured width is one some declared slot can select. This
       * proves the other end of the same claim, from the bytes a browser was
       * actually served: nothing is offered that the ladder no longer carries.
       * The guard can be right about a config the build does not use; this
       * cannot.
       */
      const offLadder = [...offered].filter(w => !LADDER.includes(w))
      record(
        `clause 3: every width offered on ${path} is on the configured ladder`,
        offLadder.length === 0,
        offLadder.length === 0
          ? `${offered.size} distinct widths offered across ${WIDTHS.length} viewports, ` +
            `smallest ${Math.min(...offered)}, largest ${Math.max(...offered)}`
          : `offered and not on the ladder: ${offLadder.join(', ')}. The served build and ` +
            'next.config.ts disagree, so the guard is judging a config this build did not use.',
      )
      route.offeredWidths = [...offered]

      route.judged = judgedTotal
      route.imagesInDom = inDomTotal
      route.underfetched = under
      report.routes.push(route)
    }
  } finally {
    await browser.close()
  }
} finally {
  if (stopServer) stopServer()
}

/* Clause 3: the byte cost, reported rather than asserted. There is no
   threshold here on purpose: the number is compared to the SAME number taken
   before the change, and a threshold invented now would be a number nobody
   measured. */
console.log('')
console.log(`${TAG} image bytes from the optimiser, per route per viewport:`)
for (const r of report.routes) {
  const row = r.widths.map(w => `${w.viewport}:${Math.round(w.imageBytes / 1024)}K`).join('  ')
  console.log(`  ${r.path.padEnd(14)} ${row}`)
}

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))

const failed = results.filter(r => !r.ok)
console.log('')
console.log(`${TAG} ${results.length - failed.length} of ${results.length} checks passed; evidence in ${OUT}`)
if (failed.length) process.exit(1)
