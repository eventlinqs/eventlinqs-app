/**
 * LOCAL MOBILE LIGHTHOUSE, MEDIAN OF N, WITH THE OPTIMISER WARMED FIRST.
 *
 * WHY THIS EXISTS. CLAUDE.md forbids quoting a single localhost Lighthouse run,
 * and the Lighthouse gate was made advisory on 25 August 2026 precisely because
 * the CI runner was measuring itself rather than the product: the same commit
 * and the same URLs scored 0.76 on the runner and 0.88 from a warmed real
 * client. So a number from this repository is only meaningful if it says how
 * many runs it is the median of, and what was warm when the stopwatch started.
 *
 * This harness answers both. It warms every /_next/image variant on each page
 * using the SAME code the CI gate uses (scripts/ci/warm-preview.mjs), then runs
 * Lighthouse mobile N times per URL and reports the MEDIAN, not the best run.
 * That last point matters: the CI gate aggregates category floors with
 * `optimistic`, which resolves to Math.max, and reading that as a median has
 * already cost this project hours once.
 *
 * IT SETTLES A AND B, NOT AN ABSOLUTE. Localhost has no network latency to
 * Sydney and no Vercel cold start, so the absolute score here runs HIGHER than
 * the preview. What it measures honestly is the DELTA from a change, on one
 * machine, with everything else held still. Any absolute claim still has to
 * come from the warmed preview.
 *
 * Settings mirror lighthouserc.json exactly (mobile, the el-audit cookie, and
 * the four gather-window values), so a number here is comparable to a number
 * there rather than a differently-shaped one.
 *
 * Usage:
 *   node scripts/perf/lh-local-median.mjs http://localhost:3100 / /events /pricing
 *   node scripts/perf/lh-local-median.mjs http://localhost:3100 --runs=5 /
 */
import { launch } from 'chrome-launcher'
import lighthouse from 'lighthouse'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { optimisedImageUrls } from '../ci/warm-preview.mjs'

const args = process.argv.slice(2)
const base = args.find((a) => a.startsWith('http')) ?? 'http://localhost:3100'
const runsArg = args.find((a) => a.startsWith('--runs='))
const RUNS = runsArg ? Number(runsArg.split('=')[1]) : 3
const paths = args.filter((a) => a.startsWith('/'))
if (paths.length === 0) paths.push('/')

/*
 * Lighthouse needs a REAL Chrome, not Playwright's bundled build.
 *
 * Playwright installs `chromium_headless_shell`, which is a cut-down shell.
 * Driving Lighthouse with it fails every navigation with
 * FAILED_DOCUMENT_REQUEST / net::ERR_ABORTED and reports a null performance
 * score, on every URL including one with no images at all. That reads exactly
 * like a broken page and is not: the same URL loads 200 in Playwright itself.
 * Found on 3 September 2026 after three pages in a row scored null.
 */
const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
]
if (!process.env.CHROME_PATH) {
  const found = CHROME_CANDIDATES.find((c) => c && existsSync(c))
  if (!found) {
    process.stderr.write('No Chrome found. Set CHROME_PATH.' + String.fromCharCode(10))
    process.exit(1)
  }
  process.env.CHROME_PATH = found
}
process.stdout.write('chrome: ' + process.env.CHROME_PATH + String.fromCharCode(10))

const SETTINGS = {
  formFactor: 'mobile',
  screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
  onlyCategories: ['performance'],
  maxWaitForLoad: 60000,
  pauseAfterLoadMs: 5000,
  networkQuietThresholdMs: 5000,
  cpuQuietThresholdMs: 3000,
  extraHeaders: { Cookie: 'el-audit=1' },
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Warm the page HTML and every optimised image variant it references. */
async function warm(url) {
  const res = await fetch(url, { headers: { Cookie: 'el-audit=1' } })
  const html = await res.text()
  const variants = optimisedImageUrls(html, base)
  let warmed = 0
  for (const v of variants) {
    try {
      const r = await fetch(v, { headers: { Cookie: 'el-audit=1' } })
      await r.arrayBuffer()
      warmed += 1
    } catch (error) {
      /* A variant that will not fetch is a FINDING, not a crash: it means the
       * measurement that follows is running against a partly cold optimiser and
       * the number will be pessimistic for a reason that has nothing to do with
       * the page. Say so rather than swallowing it. */
      console.warn(`  warm failed: ${v.slice(0, 90)} :: ${error.message}`)
    }
  }
  await fetch(url, { headers: { Cookie: 'el-audit=1' } })
  return { status: res.status, variants: variants.length, warmed }
}

mkdirSync('docs/verification/lh-local', { recursive: true })
const summary = []

for (const p of paths) {
  const url = base + p
  const w = await warm(url)
  process.stdout.write(`\n${p}  (HTTP ${w.status}, warmed ${w.warmed}/${w.variants} image variants)\n`)

  const scores = []
  const lcps = []
  let lcpElement = 'not reported'

  for (let i = 0; i < RUNS; i += 1) {
    const chrome = await launch({ chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] })
    try {
      const result = await lighthouse(url, { port: chrome.port, output: 'json', logLevel: 'error' }, { extends: 'lighthouse:default', settings: SETTINGS })
      const lhr = result.lhr
      const score = lhr.categories.performance.score
      const lcp = lhr.audits['largest-contentful-paint']?.numericValue ?? 0
      scores.push(score === null ? 0 : score)
      lcps.push(lcp)

      const el = lhr.audits['largest-contentful-paint-element']
      const node = el?.details?.items?.[0]?.items?.[0]?.node
      if (node?.snippet) lcpElement = node.snippet.slice(0, 150)

      process.stdout.write(`  run ${i + 1}: perf ${score === null ? 'NULL' : score.toFixed(2)}  LCP ${Math.round(lcp)}ms\n`)
      writeFileSync(`docs/verification/lh-local/${p.replaceAll('/', '_') || 'root'}-run${i + 1}.json`, JSON.stringify({ score, lcp, lcpElement }, null, 2))
    } finally {
      /* chrome-launcher removes its own temp profile on kill, and on Windows
       * that races the still-exiting browser and throws EPERM. The measurement
       * is already taken by this point, so a failure to tidy up must not lose
       * it. */
      try {
        await chrome.kill()
      } catch {
        /* leaked temp profile, harmless, Windows will reclaim it */
      }
    }
  }

  const mScore = median(scores)
  const mLcp = median(lcps)
  summary.push({ path: p, score: mScore, lcp: mLcp, lcpElement, scores, lcps })
  process.stdout.write(`  MEDIAN perf ${mScore.toFixed(2)}  LCP ${Math.round(mLcp)}ms\n`)
  process.stdout.write(`  LCP element: ${lcpElement}\n`)
}

process.stdout.write(`\n${'='.repeat(72)}\nMEDIAN OF ${RUNS}, mobile, warmed, base ${base}\n${'='.repeat(72)}\n`)
for (const s of summary) {
  process.stdout.write(
    `${s.path.padEnd(12)} perf ${s.score.toFixed(2)}  LCP ${String(Math.round(s.lcp)).padStart(6)}ms   runs [${s.scores.map((x) => x.toFixed(2)).join(', ')}]\n`,
  )
}
