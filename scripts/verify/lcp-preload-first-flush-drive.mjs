/**
 * DRIVEN PROOF that the image which decides the paint is preloaded from the
 * FIRST CHUNK of the response, and that the page still renders at 390, 768 and
 * 1440 while it does.
 *
 * ============================================================================
 * WHY A DRIVE AND NOT ONLY A GUARD
 * ============================================================================
 *
 * scripts/guards/lcp-preload-in-the-first-flush.mjs reads the source and can
 * see that the page component renders its hero ahead of every streaming
 * boundary. It cannot see when a byte left the socket, and that is the whole
 * property: a hero rendered directly by a page whose PARENT awaits would still
 * be late, and the source of the page alone says nothing about that.
 *
 * So this opens the response as a STREAM and looks at what is in the first
 * chunk, which is the only reading that settles it.
 *
 * ============================================================================
 * THE THREE CLAUSES
 * ============================================================================
 *
 * 1. THE FIRST CHUNK CARRIES THE HERO PRELOAD. Not "the document contains a
 *    preload": the `<link rel="preload" as="image">` must be in the FIRST chunk
 *    the server writes. Close-out C8B.3 measured what the other arrangement
 *    costs: with the page body behind a streaming boundary the first byte came
 *    324 ms sooner and the hero's resource load delay went from 20 ms to 527 ms,
 *    for 597 ms more LCP and six points of performance score at matched machine
 *    speed (C:\dev\EVIDENCE\C8B3-FLUSH\).
 *
 *    The count is compared against the whole document as well, because exactly
 *    ONE image preload is allowed per document (scripts/guards/one-priority-image.mjs)
 *    and a drive that accepted "at least one, somewhere" would pass a page that
 *    had quietly grown a second.
 *
 * 2. THE PAGE STILL RENDERS, AT 390, 768 AND 1440. The hero image is present
 *    and actually decoded (naturalWidth > 0, not merely in the DOM), the header
 *    is there, and the page carries event links. A page that failed to render
 *    would satisfy clause 1 perfectly.
 *
 * 3. IT COSTS NO LAYOUT SHIFT. Cumulative Layout Shift is measured over the
 *    load with the browser's own PerformanceObserver and must stay under 0.1,
 *    the threshold Lighthouse calls good. The homepage streams its below-fold
 *    rails into skeletons and the design system requires that settle to be
 *    shift-free; this is where that is checked rather than asserted.
 *
 * ============================================================================
 * WHAT IT CANNOT SEE
 * ============================================================================
 *
 * - Whether the page is FAST. Chunk arrival on localhost has no network in it.
 *   The performance verdict belongs to scripts/perf/lh-local-median.mjs, and
 *   this drive deliberately quotes no score.
 * - Anything about production: `next start` has no CDN and no cold start.
 *
 * The routes and their hero components are IMPORTED from the guard's own
 * registry, never retyped, so the drive and the guard cannot disagree about
 * their subject.
 *
 * Usage:
 *   node --env-file=.env.local scripts/verify/lcp-preload-first-flush-drive.mjs --serve --port=3200
 *   node --env-file=.env.local scripts/verify/lcp-preload-first-flush-drive.mjs http://127.0.0.1:3200
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { startGateServer, envFor } from '../ops/pre-push-gate.mjs'
import { LCP_FIRST_FLUSH_ROUTES } from '../guards/lcp-preload-in-the-first-flush.mjs'

const args = process.argv.slice(2)
const SERVE = args.includes('--serve')
const PORT = Number(args.find(a => a.startsWith('--port='))?.split('=')[1] ?? 3200)
let BASE = (args.find(a => a.startsWith('http')) ?? `http://127.0.0.1:${PORT}`).replace(/\/$/, '')
const OUT =
  args.find(a => a.startsWith('--out='))?.slice('--out='.length) ?? 'C:/dev/EVIDENCE/C8B3-FLUSH/driven'
const WIDTHS = [390, 768, 1440]
const TAG = '[lcp-preload-first-flush-drive]'

const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n        ${detail}` : ''}`)
}

/**
 * The URL a registry entry names. `src/app/page.tsx` is `/`; anything deeper is
 * its directory path. A dynamic segment would need a slug harvested from the
 * running app rather than invented, so it is REFUSED here instead of guessed.
 */
function routeUrlFor(file) {
  const m = file.match(/^src\/app\/(.*)page\.tsx$/)
  if (!m) return null
  const path = m[1].replace(/\/$/, '')
  if (path.includes('[')) return null
  return `${BASE}/${path}`.replace(/\/+$/, '') || BASE
}

/** `<link rel="preload" as="image">`, in either attribute order. */
const IMAGE_PRELOAD = /<link\b(?=[^>]*\brel="preload")(?=[^>]*\bas="image")[^>]*>/g

async function streamOf(url) {
  const started = performance.now()
  const res = await fetch(url, { headers: { 'user-agent': 'eventlinqs-lcp-preload-drive' } })
  if (!res.ok) return { error: `${url} answered ${res.status}` }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let first = null
  let firstAt = null
  let whole = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    const text = decoder.decode(value, { stream: true })
    if (first === null) {
      first = text
      firstAt = performance.now() - started
    }
    whole += text
  }
  return { first, firstAt, whole, totalMs: performance.now() - started }
}

let stopServer = null
try {
  if (SERVE) {
    mkdirSync('.tmp', { recursive: true })
    const started = await startGateServer(envFor('local'), '.tmp/lcp-preload-drive-server.log', { port: PORT })
    if (started.error) {
      console.error(`${TAG} could not serve the build: ${started.error}`)
      process.exit(1)
    }
    BASE = started.base
    stopServer = started.stop
    console.log(`${TAG} serving the production build on ${BASE}`)
  }

  mkdirSync(OUT, { recursive: true })

  const subjects = []
  for (const entry of LCP_FIRST_FLUSH_ROUTES) {
    const url = routeUrlFor(entry.file)
    if (!url) {
      record(`registry entry ${entry.file} resolves to a URL`, false,
        'this drive cannot turn that file into a route without guessing a dynamic segment, and it refuses to guess')
      continue
    }
    subjects.push({ entry, url })
  }

  /* Clause 1: the first chunk carries the hero preload. */
  for (const { entry, url } of subjects) {
    const r = await streamOf(url)
    if (r.error) {
      record(`clause 1 ${entry.file}`, false, r.error)
      continue
    }
    const inFirst = (r.first.match(IMAGE_PRELOAD) ?? []).length
    const inWhole = (r.whole.match(IMAGE_PRELOAD) ?? []).length
    const ok = inFirst === 1 && inWhole === 1
    record(
      `clause 1: the first chunk of ${url} carries the one image preload`,
      ok,
      `first chunk ${r.first.length} B at ${Math.round(r.firstAt)} ms of ${Math.round(r.totalMs)} ms total; ` +
        `image preloads ${inFirst} in the first chunk, ${inWhole} in the document` +
        (ok
          ? ''
          : inWhole !== 1
            ? ' - one image preload per document (scripts/guards/one-priority-image.mjs)'
            : ' - the hero is discovered only when a later chunk arrives, which cost 597 ms of LCP when it was measured'),
    )
  }

  /* Clauses 2 and 3: the page renders, and costs no layout shift. */
  const browser = await chromium.launch()
  try {
    for (const { entry, url } of subjects) {
      for (const width of WIDTHS) {
        const context = await browser.newContext({
          viewport: { width, height: width === 390 ? 844 : 1000 },
        })
        const page = await context.newPage()
        await page.addInitScript(() => {
          window.__clsTotal = 0
          new PerformanceObserver(list => {
            for (const e of list.getEntries()) {
              if (!e.hadRecentInput) window.__clsTotal += e.value
            }
          }).observe({ type: 'layout-shift', buffered: true })
        })
        await page.goto(url, { waitUntil: 'networkidle' })

        const seen = await page.evaluate(() => {
          const imgs = [...document.querySelectorAll('img')]
          const painted = imgs.filter(i => i.naturalWidth > 0)
          const biggest =
            painted
              .map(i => {
                const r = i.getBoundingClientRect()
                return { w: r.width, h: r.height }
              })
              .sort((a, b) => b.w * b.h - a.w * a.h)[0] ?? null
          return {
            header: Boolean(document.querySelector('header')),
            images: imgs.length,
            painted: painted.length,
            biggest,
            eventLinks: document.querySelectorAll('a[href^="/events/"]').length,
            cls: window.__clsTotal ?? null,
          }
        })

        const renders =
          seen.header && seen.painted > 0 && seen.biggest !== null && seen.biggest.w > 0 && seen.eventLinks > 0
        record(
          `clause 2: ${entry.file} renders at ${width}`,
          renders,
          `header ${seen.header}; ${seen.painted} of ${seen.images} images decoded; ` +
            `largest painted ${seen.biggest ? `${Math.round(seen.biggest.w)}x${Math.round(seen.biggest.h)}` : 'none'}; ` +
            `${seen.eventLinks} event links`,
        )

        const clsOk = typeof seen.cls === 'number' && seen.cls < 0.1
        record(
          `clause 3: ${entry.file} shifts under 0.1 at ${width}`,
          clsOk,
          `cumulative layout shift ${typeof seen.cls === 'number' ? seen.cls.toFixed(4) : 'not reported'}`,
        )

        await page.screenshot({
          path: join(OUT, `${entry.file.replace(/[^a-z0-9]+/gi, '-')}-${width}.png`),
          fullPage: false,
        })
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }
} finally {
  if (stopServer) stopServer()
}

const failed = results.filter(r => !r.ok)
console.log('')
console.log(`${TAG} ${results.length - failed.length} of ${results.length} checks passed; evidence in ${OUT}`)
if (failed.length) process.exit(1)
