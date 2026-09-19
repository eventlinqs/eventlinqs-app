/**
 * THE FETCHED HALF OF THE ARTIST SITEMAP FAMILY, DRIVEN AGAINST A RUNNING SITE.
 *
 * ============================================================================
 * WHAT THIS ADDS THAT THE GUARD CANNOT
 * ============================================================================
 *
 * `scripts/guards/sitemap-covers-the-catalogue.mjs` compares two READS of the
 * database and never opens a socket to the site. Its own header says so: it
 * determines from the ROW that a URL would answer 200, and "would" is a
 * deduction. This asks the site.
 *
 * Three things are asked, and all three are things the guard is structurally
 * unable to see:
 *
 *   1. THE SERVED SITEMAP CARRIES THE FAMILY. The guard judges what
 *      `readArtistCatalogue` returns. `src/app/sitemap.ts` is what Google reads,
 *      and between them sits a feature flag and a `for` loop. A family can be
 *      correct in the reader and absent from the document.
 *   2. EVERY ADVERTISED ARTIST URL ACTUALLY ANSWERS 200. A published row is not
 *      a rendered page.
 *   3. EVERY ADVERTISED ARTIST IS REACHABLE BY A HUMAN. This is the defect that
 *      started the whole item: on 19 September 2026 `/artists/aurora-skies-wrejiu`
 *      answered 200, sat in the sitemap, and NOTHING on the crawled site linked
 *      to it, because the only internal link to an artist is a confirmed lineup
 *      on an event page and every such event had ended. A URL that answers 200
 *      and that no page reaches is an orphan whether or not it renders.
 *
 * ============================================================================
 * IT PROVES ITS OWN INSTRUMENT FIRST
 * ============================================================================
 *
 * This repository has lost a day to a harness that failed loudly and was
 * believed: six proofs accused the product and all six were the harness. So
 * before it judges anything, this drive asserts that the sitemap it fetched
 * parses and carries a plausible number of URLs. A zero-URL sitemap is reported
 * as a BROKEN DRIVE, never as a platform with no pages.
 *
 * Usage (the shim and the alias loader are both required: this reaches
 * `src/lib/seo/sitemap-catalogue.ts`, which reaches the flag resolver, which
 * reaches `@sentry/nextjs`):
 *
 *   node --import ./scripts/lib/server-only-shim.mjs \
 *        --import ./scripts/lib/src-alias-loader.mjs \
 *        --env-file=.env.local scripts/verify/artist-sitemap-drive.mjs http://localhost:3200
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readArtistCatalogue } from '@/lib/seo/sitemap-catalogue'

const TAG = '[artist-sitemap-drive]'
const BASE = (process.argv[2] ?? 'http://localhost:3200').replace(/\/$/, '')
const OUT = process.env.DRIVE_OUT ?? join('C:', 'dev', 'EVIDENCE', 'SITEMAP-ARTISTS')
const WIDTHS = [390, 768, 1440]

mkdirSync(OUT, { recursive: true })

const results = []
let failures = 0
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail })
  if (!ok) failures += 1
  console.log(`${TAG} ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`)
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: 'manual' })
  const body = await res.text()
  return { status: res.status, body }
}

/* ------------------------------------------------- 0. prove the instrument */

const sitemap = await get('/sitemap.xml')
if (sitemap.status !== 200) {
  console.error(`${TAG} BROKEN DRIVE: ${BASE}/sitemap.xml answered ${sitemap.status}. Nothing was judged.`)
  process.exit(2)
}
const locs = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
if (locs.length < 50) {
  console.error(
    `${TAG} BROKEN DRIVE: the served sitemap parsed to ${locs.length} URL(s), which is not a catalogue. ` +
      `This is reported as a broken instrument rather than as a platform with no pages.`,
  )
  process.exit(2)
}
console.log(`${TAG} instrument ok: ${locs.length} URL(s) in the served sitemap`)

/* ------------------------------------- 1. the served document carries them */

const servedArtists = locs
  .map(u => {
    try {
      return new URL(u).pathname
    } catch {
      return u
    }
  })
  .filter(p => p.startsWith('/artists/'))
  .sort()

const reader = await readArtistCatalogue()
if (reader.error) {
  console.error(`${TAG} BROKEN DRIVE: the shipped reader errored: ${reader.error}`)
  process.exit(2)
}
const expected = reader.rows.map(r => r.path).sort()

check(
  'the served sitemap publishes exactly the artists the shipped reader returns',
  servedArtists.length === expected.length && servedArtists.every((p, i) => p === expected[i]),
  `served ${servedArtists.join(', ') || '(none)'} | reader ${expected.join(', ') || '(none)'}`,
)

check(
  'the artist family is not empty, so this drive is comparing something',
  expected.length > 0,
  `${expected.length} artist URL(s). An empty family makes every check below vacuous.`,
)

/* ------------------------------------------ 2. every advertised URL is a page */

for (const path of servedArtists) {
  const res = await get(path)
  check(`${path} answers 200 to a real request`, res.status === 200, `status ${res.status}`)
}

/* ------------------------------------------ 3. every advertised URL is reached */

/*
 * THE LINK IS LOOKED FOR WHERE IT ACTUALLY LIVES. The only internal link to an
 * artist is the confirmed lineup on an event page, so the event pages in the
 * served sitemap are the only place worth asking. Crawling the whole site again
 * would duplicate scripts/verify/internal-reachability.mjs; this asks the narrow
 * question that specific defect turned on.
 */
const eventPaths = locs
  .map(u => {
    try {
      return new URL(u).pathname
    } catch {
      return u
    }
  })
  .filter(p => /^\/events\/[^/]+$/.test(p))

const reachedBy = new Map()
for (const eventPath of eventPaths) {
  const res = await get(eventPath)
  if (res.status !== 200) continue
  for (const artistPath of servedArtists) {
    if (res.body.includes(`href="${artistPath}"`) || res.body.includes(`${artistPath}"`)) {
      if (!reachedBy.has(artistPath)) reachedBy.set(artistPath, eventPath)
    }
  }
  if (reachedBy.size === servedArtists.length) break
}

for (const path of servedArtists) {
  check(
    `${path} is linked from an event page, so it is not the orphan of 19 September`,
    reachedBy.has(path),
    reachedBy.get(path) ? `linked from ${reachedBy.get(path)}` : 'NO event page in the sitemap links to it',
  )
}

/* ---------------------------------------------- 4. the page renders, 3 widths */

let shots = []
if (servedArtists.length > 0) {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch()
  try {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
      const page = await ctx.newPage()
      const target = `${BASE}${servedArtists[0]}`
      const response = await page.goto(target, { waitUntil: 'load', timeout: 90000 })
      const heading = await page.locator('h1').first().textContent().catch(() => null)
      const file = join(OUT, `artist-${width}.png`)
      await page.screenshot({ path: file, fullPage: false })
      shots.push({ width, file, status: response?.status() ?? 0, heading: (heading ?? '').trim() })
      check(
        `${servedArtists[0]} renders a heading at ${width}px`,
        response?.status() === 200 && Boolean((heading ?? '').trim()),
        `status ${response?.status()}, h1 "${(heading ?? '').trim()}", shot ${file}`,
      )
      await ctx.close()
    }
  } finally {
    await browser.close()
  }
}

/* ------------------------------------------------------------------ report */

const report = {
  base: BASE,
  ranAt: new Date().toISOString(),
  sitemapUrls: locs.length,
  servedArtists,
  readerArtists: expected,
  reachedBy: Object.fromEntries(reachedBy),
  widths: WIDTHS,
  shots,
  checks: results,
  failures,
}
const reportPath = join(OUT, 'artist-sitemap-drive.json')
writeFileSync(reportPath, JSON.stringify(report, null, 2))

console.log(`${TAG} ${results.length - failures} of ${results.length} check(s) passed. Report: ${reportPath}`)
if (failures > 0) process.exitCode = 1
