/**
 * WHAT THE BROWSER WAS TOLD, AGAINST THE SPACE THE PICTURE ACTUALLY LANDS IN.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * `scripts/perf/srcset-weight.mjs` measures what the candidate lists cost in the
 * DOCUMENT. It says so in its own header that it cannot see the other half:
 *
 *     "Whether a candidate is actually FETCHED. That depends on the device pixel
 *      ratio and the layout, and it is a question for a driven browser, not a
 *      document reader."
 *
 * This is that question, driven. For every image on a route it records the
 * `sizes` hint the markup declared, the width the slot ACTUALLY renders at, and
 * the candidate the browser CHOSE, and reports the ratio between the last two.
 *
 * ============================================================================
 * WHY THE HINT AND NOT THE IMAGE IS THE SUBJECT
 * ============================================================================
 *
 * `sizes` is a PROMISE about layout that the markup makes to the browser before
 * layout exists. The browser believes it: it picks a srcset candidate from the
 * hint alone, at parse time, because that is the whole point of the attribute.
 * A hint that is too generous is therefore not a rounding error, it is the
 * browser being told to download a bigger picture than the page has room for,
 * and it is invisible in every static check because the markup is well formed
 * and the image is correct.
 *
 * The failure mode of FIXING it is the opposite and is worse: a hint that is too
 * small makes a tile blurry on a retina phone, which the premium bar forbids. So
 * this harness reports UNDER-fetch as a hard failure and OVER-fetch as a cost,
 * rather than reporting a single "accuracy" number that hides the difference.
 *
 * ============================================================================
 * WHAT IT ATTRIBUTES TO, AND WHY NOT TO A COMPONENT NAME
 * ============================================================================
 *
 * The DOM does not carry component names, and adding a data attribute to every
 * image so a measurement can read it would ship bytes to every visitor for the
 * benefit of this script. So each image is attributed to the thing a person can
 * actually find in the source: the `sizes` string it declared, the nearest
 * ancestor link, and the nearest section heading above it. A role that renders
 * at four different widths shows up as one `sizes` string with four widths under
 * it, named by the four headings, which is the finding rather than a summary of
 * it.
 *
 * ============================================================================
 * WHAT IT CANNOT SEE
 * ============================================================================
 *
 * - Whether a saving reaches the score. Most of these images are lazy and below
 *   the fold, so they are not on the paint path at all: the cost they carry is
 *   bytes and radio time on a phone, not Largest Contentful Paint. Read that off
 *   `scripts/perf/lh-local-median.mjs`, never off this.
 * - A real network. Transfer sizes here are local and uncompressed by any CDN.
 *   The byte figures are the optimiser's own output, which is what production
 *   serves from its edge cache, but the TIMING is meaningless on loopback.
 *
 * SERVING. `--serve` starts this tree's production build through
 * `startGateServer`, the one function permitted to run `next start` for a
 * measurement (scripts/guards/gate-servers-carry-a-limiter.mjs).
 *
 *   node scripts/perf/image-hint-fidelity.mjs --serve --port=3200 --path=home
 *   node scripts/perf/image-hint-fidelity.mjs --serve --port=3200 --path=home --out=x.json
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { chromium } from 'playwright'
import { startGateServer, envFor } from '../ops/pre-push-gate.mjs'

const TAG = '[image-hint-fidelity]'
const args = process.argv.slice(2)
const SERVE = args.includes('--serve')
const PORT = Number(args.find(a => a.startsWith('--port='))?.split('=')[1] ?? 3200)
let base = (args.find(a => a.startsWith('http')) ?? `http://127.0.0.1:${PORT}`).replace(/\/$/, '')
const outArg = args.find(a => a.startsWith('--out='))?.split('=')[1]
const DPR = Number(args.find(a => a.startsWith('--dpr='))?.split('=')[1] ?? 2)
const WIDTHS = (args.find(a => a.startsWith('--widths='))?.split('=')[1] ?? '390,768,1440')
  .split(',')
  .map(Number)

const rawPaths = args.filter(a => a.startsWith('--path=')).map(a => a.split('=')[1])
if (rawPaths.length === 0) {
  console.error(`${TAG} REFUSING: no --path given. Nothing to measure.`)
  process.exit(1)
}
/*
 * MSYS rewrites a leading slash into a Windows path BEFORE this process starts,
 * so `--path=/events` arrives as `--path=C:/Program Files/Git/events` and a
 * filter that silently drops it reports a confident median over one route. That
 * happened once already (close-out C8B.1) and the refusal is the fix.
 */
for (const p of rawPaths) {
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) {
    console.error(
      `${TAG} REFUSING: --path=${p} arrived with a leading slash or a drive letter.\n` +
        '             Pass paths with no leading slash: --path=home, --path=events/browse/melbourne',
    )
    process.exit(1)
  }
}
const paths = rawPaths.map(p => (p === 'home' ? '/' : `/${p}`))

/**
 * Read inside the page: every image, what it was told, and where it landed.
 *
 * `currentSrc` is the candidate the browser actually resolved, so the chosen
 * width is read off its own `w=` parameter rather than recomputed from the hint.
 * Recomputing would measure this script's idea of the selection algorithm and
 * would agree with itself no matter what the browser did.
 */
const PROBE = () => {
  const widthOf = url => {
    const m = /[?&]w=(\d+)/.exec(url ?? '')
    return m ? Number(m[1]) : null
  }
  const headingAbove = el => {
    /* The nearest section-ish container, then its own heading. */
    const section = el.closest('section, [aria-label]')
    const label = section?.getAttribute('aria-label')
    if (label) return label
    const h = section?.querySelector('h1, h2, h3')
    return h?.textContent?.trim().slice(0, 60) ?? null
  }
  return [...document.querySelectorAll('img')].map(img => {
    const r = img.getBoundingClientRect()
    const link = img.closest('a[href]')
    return {
      sizes: img.getAttribute('sizes'),
      candidates: (img.getAttribute('srcset') ?? '').split(',').filter(Boolean).length,
      slotWidth: Math.round(r.width),
      slotHeight: Math.round(r.height),
      chosenWidth: widthOf(img.currentSrc),
      naturalWidth: img.naturalWidth,
      decoded: img.naturalWidth > 0,
      loading: img.getAttribute('loading'),
      fetchPriority: img.getAttribute('fetchpriority'),
      href: link?.getAttribute('href') ?? null,
      heading: headingAbove(img),
      alt: (img.getAttribute('alt') ?? '').slice(0, 40),
    }
  })
}

/** Bytes the optimiser actually returned for each image, read off the browser's own resource timing. */
const BYTES = () =>
  performance
    .getEntriesByType('resource')
    .filter(e => e.initiatorType === 'img' || /\/_next\/image/.test(e.name))
    .reduce(
      (acc, e) => ({
        n: acc.n + 1,
        encoded: acc.encoded + (e.encodedBodySize || 0),
        transfer: acc.transfer + (e.transferSize || 0),
      }),
      { n: 0, encoded: 0, transfer: 0 },
    )

/**
 * Force every lazy image to load. Without this the report covers the first
 * screen only and the roles that live below the fold, which is most of them,
 * never appear at all.
 */
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
  /* Give the optimiser time to answer the images the scroll just requested. */
  await page.waitForLoadState('networkidle').catch(() => {})
}

let stopServer = null
const report = { base, takenAt: new Date().toISOString(), dpr: DPR, routes: [] }

try {
  if (SERVE) {
    mkdirSync('.tmp', { recursive: true })
    const started = await startGateServer(envFor('local'), '.tmp/image-hint-fidelity-server.log', {
      port: PORT,
    })
    if (started.error) {
      console.error(`${TAG} could not serve the build: ${started.error}`)
      process.exit(1)
    }
    base = started.base
    report.base = base
    stopServer = started.stop
    console.log(`${TAG} serving the production build on ${base}`)
  }

  const browser = await chromium.launch()
  try {
    for (const path of paths) {
      const url = base + path
      const head = await fetch(url, { headers: { 'user-agent': 'eventlinqs-image-hint-fidelity' } })
      if (!head.ok) {
        console.error(`${TAG} REFUSING: ${url} answered ${head.status}`)
        process.exit(1)
      }
      const route = { path, widths: [] }
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
        await context.close()

        /* Only images that actually rendered and actually resolved a candidate can be judged. */
        const judged = images.filter(i => i.decoded && i.chosenWidth && i.slotWidth > 0)
        const byRole = new Map()
        for (const i of judged) {
          const need = Math.round(i.slotWidth * DPR)
          const key = i.sizes ?? '(no sizes: fixed width, x descriptors)'
          const entry = byRole.get(key) ?? { sizes: key, images: [], slots: new Map() }
          entry.images.push({ ...i, need, ratio: i.chosenWidth / need })
          const slot = entry.slots.get(i.slotWidth) ?? { n: 0, chosen: new Set(), headings: new Set() }
          slot.n += 1
          slot.chosen.add(i.chosenWidth)
          if (i.heading) slot.headings.add(i.heading)
          entry.slots.set(i.slotWidth, slot)
          byRole.set(key, entry)
        }

        const roles = [...byRole.values()]
          .map(e => ({
            sizes: e.sizes,
            images: e.images.length,
            candidates: Math.round(
              e.images.reduce((s, i) => s + i.candidates, 0) / Math.max(1, e.images.length),
            ),
            underfetched: e.images.filter(i => i.ratio < 1).length,
            worstOverfetch: Number(Math.max(...e.images.map(i => i.ratio)).toFixed(2)),
            meanOverfetch: Number(
              (e.images.reduce((s, i) => s + i.ratio, 0) / e.images.length).toFixed(2),
            ),
            slots: [...e.slots.entries()]
              .sort((a, b) => a[0] - b[0])
              .map(([w, v]) => ({
                slotWidth: w,
                need: Math.round(w * DPR),
                n: v.n,
                chosen: [...v.chosen].sort((a, b) => a - b),
                headings: [...v.headings].slice(0, 3),
              })),
          }))
          .sort((a, b) => b.images - a.images)

        route.widths.push({
          viewport: width,
          imagesInDom: images.length,
          judged: judged.length,
          imageRequests: bytes.n,
          imageEncodedBytes: bytes.encoded,
          roles,
        })

        console.log('')
        console.log(`${path}   viewport ${width}   dpr ${DPR}`)
        console.log(
          `  ${judged.length} of ${images.length} images judged; ` +
            `${bytes.n} image responses, ${bytes.encoded} B from the optimiser`,
        )
        for (const r of roles) {
          const flag = r.underfetched > 0 ? '  UNDER-FETCH' : ''
          console.log(
            `    n=${String(r.images).padStart(3)}  ${r.candidates} cands  ` +
              `mean x${r.meanOverfetch}  worst x${r.worstOverfetch}${flag}   sizes=${r.sizes}`,
          )
          for (const s of r.slots) {
            console.log(
              `         slot ${String(s.slotWidth).padStart(4)}px x${String(s.n).padStart(2)}  ` +
                `needs ${String(s.need).padStart(4)}  chose ${s.chosen.join('/')}` +
                (s.headings.length ? `   <- ${s.headings.join(' | ')}` : ''),
            )
          }
        }
      }
      report.routes.push(route)
    }
  } finally {
    await browser.close()
  }
} finally {
  if (stopServer) stopServer()
}

if (outArg) {
  const out = resolve(outArg)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(report, null, 2))
  console.log(`\n${TAG} written ${out}`)
}
