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
 * WHAT IT RECORDS, and why it is these five and not the score alone. Close-out
 * C8B.3 asks for "actual script bytes, TBT, LCP, main thread work and the
 * performance score before and after" on every change, and C8B.4 asks for byte
 * weight and sequencing TOGETHER, because a split that improves one while
 * worsening the other has to be justified or reverted. A harness that reports
 * only the score cannot tell those two apart, so every run here carries all
 * five plus the machine reading Lighthouse took for itself.
 *
 * THE MACHINE READING IS NOT DECORATION. environment.benchmarkIndex is what
 * separates "the page got slower" from "the laptop did", which this repository
 * has already paid for twice (scripts/perf/machine-speed.mjs carries the
 * incident). A median quoted without it is not a measurement anyone can check.
 *
 * SERVING. --serve starts the build the way the push gate starts it, through
 * startGateServer, which is the only function permitted to serve it
 * (scripts/guards/gate-servers-carry-a-limiter.mjs). That hands the server the
 * in-memory Upstash stub and the Sentry parity sink, so a measurement here sees
 * the same bundle and the same request set the gate's own Lighthouse step sees.
 * Without --serve the base URL is whatever is already listening, and nothing
 * checks what built it.
 *
 * Usage (paths carry NO leading slash so no shell can rewrite them):
 *   node scripts/perf/lh-local-median.mjs http://localhost:3100 --path=home --path=events
 *   node scripts/perf/lh-local-median.mjs http://localhost:3100 --runs=5 --path=pricing
 *   node scripts/perf/lh-local-median.mjs --serve --port=3200 --runs=5 --out=x.json --path=home
 */
import { launch } from 'chrome-launcher'
import lighthouse from 'lighthouse'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { optimisedImageUrls } from '../ci/warm-preview.mjs'
import { lcpElement as readLcpElement, scriptBytes as readScriptBytes } from '../ci/lighthouse-truth-table.mjs'
import { startGateServer, envFor } from '../ops/pre-push-gate.mjs'
import { explainPhases } from './lib/lcp-breakdown.mjs'

const args = process.argv.slice(2)
const runsArg = args.find((a) => a.startsWith('--runs='))
const RUNS = runsArg ? Number(runsArg.split('=')[1]) : 3
const SERVE = args.includes('--serve')
const portArg = args.find((a) => a.startsWith('--port='))
const PORT = portArg ? Number(portArg.split('=')[1]) : undefined
const outArg = args.find((a) => a.startsWith('--out='))
const OUT = outArg ? outArg.split('=')[1] : null
/*
 * PATHS ARE TAKEN FROM `--path=` AS WELL AS FROM BARE ARGUMENTS, AND THE REASON
 * IS A MEASUREMENT THIS HARNESS SILENTLY DID NOT TAKE.
 *
 * Asked for four URLs from Git Bash on Windows, it measured one. MSYS rewrites
 * any argument that looks like an absolute POSIX path into a Windows path
 * before the process starts, so `/events` arrived as `C:/Program Files/Git/events`,
 * failed `startsWith('/')`, and the list fell through to its `['/']` default.
 * The run took forty minutes and reported a confident median of the wrong set,
 * which is the worst shape a measurement can have.
 *
 * `--path=/events` DOES NOT FIX IT EITHER, which was the first attempt and was
 * wrong: MSYS rewrites the value after an `=` as well, so the next run died on
 * `http://127.0.0.1:3200C:/Program Files/Git/`. The only form no shell touches
 * is a path with no leading slash, so that is the documented one, and `home`
 * names the root. Bare `/events` still works from PowerShell and from CI.
 *
 * A mangled argument is now REFUSED rather than dropped. Dropping it is what
 * produced a forty-minute collection of the wrong set with a confident median
 * at the end of it; refusing costs one line and cannot mislead anybody.
 */
/** Anything carrying a Windows drive letter and a Git/MSYS install directory. */
const MANGLED = /[A-Za-z]:[\\/].*(Git|MSYS|mingw)/i
const rawPaths = [
  ...args.filter((a) => a.startsWith('--path=')).map((a) => a.slice('--path='.length)),
  ...args.filter((a) => a.startsWith('/')),
]
const mangled = [...args.filter((a) => MANGLED.test(a))]
if (mangled.length > 0) {
  process.stderr.write(
    `refusing to measure: ${mangled.length} argument(s) arrived rewritten by the shell, e.g. ${mangled[0]}.${String.fromCharCode(10)}` +
      `Pass paths WITHOUT a leading slash, which no shell rewrites:  --path=events  --path=events/browse/melbourne  --path=home${String.fromCharCode(10)}`,
  )
  process.exit(1)
}
/*
 * `home` and `events/browse/melbourne` mean `/` and `/events/browse/melbourne`.
 * A leading slash is what MSYS rewrites, INCLUDING inside `--path=`, so the
 * form that survives every shell is the one with no slash at the front. `home`
 * is spelled out rather than allowing an empty value, because `--path=` with
 * nothing after it reads like a mistake and would be one on any other flag.
 */
const paths = rawPaths.map((p) => (p === 'home' || p === '/' ? '/' : p.startsWith('/') ? p : `/${p}`))
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

/* --desktop measures the desktop profile. Default stays mobile, because mobile
 * is the one the 95 law is failing and the one the CI gate audits. */
const DESKTOP = args.includes('--desktop')

const SETTINGS = {
  formFactor: DESKTOP ? 'desktop' : 'mobile',
  screenEmulation: DESKTOP
    ? { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }
    : { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
  /*
   * THROTTLING MUST MOVE WITH THE FORM FACTOR, and forgetting that produces a
   * number that looks like a finding and is not. Measured on 3 September 2026:
   * setting only formFactor and the viewport to desktop, while leaving the
   * MOBILE throttling in place (4x CPU, simulated slow 4G), scored the homepage
   * 0.62 desktop against 0.80 mobile. Desktop is not slower than mobile; the
   * page was being run at mobile speed and marked against desktop's stricter
   * thresholds. These are Lighthouse's own desktop preset values.
   */
  throttling: DESKTOP
    ? { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1, requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0 }
    : { rttMs: 150, throughputKbps: 1638.4, cpuSlowdownMultiplier: 4, requestLatencyMs: 562.5, downloadThroughputKbps: 1474.56, uploadThroughputKbps: 675 },
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

/*
 * The script bytes THAT ARRIVED come from the gate's own reader, for the same
 * reason the LCP element does: one definition, already tested, rather than a
 * second one here that can drift from it. `readScriptBytes` answers null when
 * the audit is absent, which is a different fact from zero bytes and is kept
 * distinct below.
 */

/**
 * THE PHASES OF THE LCP, WHICH IS THE ONLY THING THAT SAYS WHERE TO WORK.
 *
 * An LCP of 3,495 ms is not actionable. The same 3,495 ms split as "2,100 of
 * it is time to first byte" and "2,100 of it is element render delay" point at
 * opposite halves of the platform: the first is the server and the cache, the
 * second is script on the main thread. C8B.1's rule ("without it every change
 * after it is a guess") is about exactly this distinction.
 *
 * THE SPLIT AND THE SCORE ARE DIFFERENT QUANTITIES, and this reporter used to
 * print them side by side without saying so. The phases come from
 * `lcp-breakdown-insight` and describe the OBSERVED paint; the LCP the score
 * is computed from is the SIMULATED one. On the homepage on 19 September 2026
 * they read 1,881 ms and 3,740 ms in the same report. The reconciliation, the
 * invariant that keeps it honest across Lighthouse releases, and the refusal
 * when they stop agreeing all live in ./lib/lcp-breakdown.mjs, where they are
 * tested against reports whose answers are known.
 */

/*
 * THE BUILD IS SERVED THE WAY THE GATE SERVES IT, OR NOT BY THIS SCRIPT AT ALL.
 * startGateServer is the one function permitted to run `next start` for a
 * measurement, and it is the one that hands the server the Upstash stub and the
 * Sentry parity sink. A bare `next start` measures a page whose telemetry
 * request fails, which Chrome logs and Lighthouse counts.
 */
let stopServer = null
let base = args.find((a) => a.startsWith('http')) ?? 'http://localhost:3100'
if (SERVE) {
  mkdirSync('.tmp', { recursive: true })
  const started = await startGateServer(envFor('local'), '.tmp/lh-local-server.log', {
    also: [['scripts/verify/sentry-parity-sink.mjs']],
    port: PORT,
  })
  if (started.error) {
    process.stderr.write(`could not serve the build: ${started.error}${String.fromCharCode(10)}`)
    process.exit(1)
  }
  base = started.base
  stopServer = started.stop
  process.stdout.write(`serving the production build on ${base} (log .tmp/lh-local-server.log)${String.fromCharCode(10)}`)
}

mkdirSync('docs/verification/lh-local', { recursive: true })
const summary = []

for (const p of paths) {
  const url = base + p
  const w = await warm(url)
  process.stdout.write(`\n${p}  (HTTP ${w.status}, warmed ${w.warmed}/${w.variants} image variants)\n`)

  const scores = []
  const lcps = []
  const tbts = []
  const mains = []
  const bytes = []
  const benches = []
  const phaseRuns = []
  /* The observed paint, kept beside the simulated one so the summary can name
   * both rather than leaving a reader to assume they are the same number. */
  const observedRuns = []
  let lcpElement = 'not reported'

  for (let i = 0; i < RUNS; i += 1) {
    const chrome = await launch({ chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] })
    try {
      const result = await lighthouse(url, { port: chrome.port, output: 'json', logLevel: 'error' }, { extends: 'lighthouse:default', settings: SETTINGS })
      const lhr = result.lhr
      const score = lhr.categories.performance.score
      const lcp = lhr.audits['largest-contentful-paint']?.numericValue ?? 0
      const tbt = lhr.audits['total-blocking-time']?.numericValue ?? 0
      const main = lhr.audits['mainthread-work-breakdown']?.numericValue ?? 0
      const bench = lhr.environment?.benchmarkIndex ?? 0
      const bs = readScriptBytes(lhr) ?? 0
      scores.push(score === null ? 0 : score)
      lcps.push(lcp)
      tbts.push(tbt)
      mains.push(main)
      bytes.push(bs)
      benches.push(bench)

      /*
       * THE ELEMENT COMES FROM THE GATE'S OWN READER, NOT A SECOND ONE HERE.
       *
       * This harness used to read `largest-contentful-paint-element` alone and
       * reported "not reported" on all five runs of the first collection it was
       * asked for. The installed Lighthouse is 13, which retired that audit for
       * the LCP insights and carries the element as an item of type 'node'
       * rather than nested under one. `scripts/ci/lighthouse-truth-table.mjs`
       * already knows both shapes and is covered by its own tests, so it is
       * imported rather than reimplemented: a second copy is a second thing to
       * be wrong, and C8B.1 turns on this value being right.
       */
      const found = readLcpElement(lhr)
      if (found && !found.startsWith('not reported')) lcpElement = found
      const explained = explainPhases(lhr)
      const phases = explained.trustworthy ? explained.phases : {}
      phaseRuns.push(phases)
      if (typeof explained.observed === 'number') observedRuns.push(explained.observed)

      process.stdout.write(
        `  run ${i + 1}: perf ${score === null ? 'NULL' : score.toFixed(2)}  LCP ${Math.round(lcp)}ms  TBT ${Math.round(tbt)}ms  main ${Math.round(main)}ms  script ${Math.round(bs / 1024)}KB  bench ${Math.round(bench)}\n`,
      )
      /* The split is labelled OBSERVED and carries the paint it sums to,
       * because the LCP on the line above is the SIMULATED one the score is
       * computed from and the two are different quantities. When they stop
       * agreeing, the note is printed instead of a split nothing supports. */
      const phaseLine = Object.entries(phases)
        .map(([k, v]) => `${k} ${Math.round(v)}ms`)
        .join(' | ')
      if (phaseLine) {
        process.stdout.write(
          `          OBSERVED LCP ${Math.round(explained.observed)}ms = ${phaseLine}` +
            `  (the scored LCP above is the SIMULATED ${Math.round(lcp)}ms)\n`,
        )
      } else {
        process.stdout.write(`          LCP phases NOT reported: ${explained.note}\n`)
      }
      writeFileSync(
        `docs/verification/lh-local/${p.replaceAll('/', '_') || 'root'}-run${i + 1}.json`,
        JSON.stringify(
          {
            score,
            /* `lcp` is kept under its old name so nothing reading these files
             * breaks, and named again as what it actually is. */
            lcp,
            simulatedLcp: lcp,
            observedLcp: explained.observed,
            tbt,
            main,
            scriptBytes: bs,
            benchmarkIndex: bench,
            lcpElement,
            phases,
            phasesTrustworthy: explained.trustworthy,
          },
          null,
          2,
        ),
      )
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

  const row = {
    path: p,
    score: median(scores),
    lcp: median(lcps),
    tbt: median(tbts),
    main: median(mains),
    scriptBytes: median(bytes),
    benchmarkIndex: median(benches),
    /* Null rather than 0 when no run reported one: a paint nobody observed is
     * a different fact from a paint at time zero. */
    observedLcp: observedRuns.length > 0 ? median(observedRuns) : null,
    // One median per phase, over the runs that reported that phase. A phase
    // Lighthouse did not report on a run is absent from that run rather than
    // counted as zero, which would drag the median toward a value nothing
    // measured.
    phases: Object.fromEntries(
      [...new Set(phaseRuns.flatMap((r) => Object.keys(r)))].map((label) => [
        label,
        median(phaseRuns.map((r) => r[label]).filter((v) => typeof v === 'number')),
      ]),
    ),
    lcpElement,
    scores,
    lcps,
    tbts,
    mains,
    bytes,
    benches,
  }
  summary.push(row)
  process.stdout.write(
    `  MEDIAN perf ${row.score.toFixed(2)}  LCP ${Math.round(row.lcp)}ms  TBT ${Math.round(row.tbt)}ms  main ${Math.round(row.main)}ms  script ${Math.round(row.scriptBytes / 1024)}KB  bench ${Math.round(row.benchmarkIndex)}\n`,
  )
  process.stdout.write(`  LCP element: ${lcpElement}\n`)
  const medPhases = Object.entries(row.phases)
    .map(([k, v]) => `${k} ${Math.round(v)}ms`)
    .join(' | ')
  if (medPhases) {
    process.stdout.write(
      `  MEDIAN OBSERVED LCP ${Math.round(row.observedLcp)}ms = ${medPhases}\n` +
        `  (the MEDIAN line above carries the SIMULATED LCP, which is the one the score is computed from)\n`,
    )
  }
}

process.stdout.write(`\n${'='.repeat(72)}\nMEDIAN OF ${RUNS}, ${DESKTOP ? 'desktop' : 'mobile'}, warmed, base ${base}\n${'='.repeat(72)}\n`)
for (const s of summary) {
  process.stdout.write(
    `${s.path.padEnd(46)} perf ${s.score.toFixed(2)}  LCP ${String(Math.round(s.lcp)).padStart(5)}ms  TBT ${String(Math.round(s.tbt)).padStart(4)}ms  main ${String(Math.round(s.main)).padStart(5)}ms  script ${String(Math.round(s.scriptBytes / 1024)).padStart(4)}KB  bench ${String(Math.round(s.benchmarkIndex)).padStart(4)}\n`,
  )
}
/*
 * THE MACHINE IS STATED BESIDE THE NUMBERS, NEVER INFERRED LATER. This
 * repository's own record: "on battery this laptop benchmarks 1539 against a
 * floor of 2000; on AC 2069 and the step passes". A reader who cannot see which
 * of those two afternoons produced a median cannot use it.
 */
const allBenches = summary.flatMap((s) => s.benches)
if (allBenches.length > 0) {
  process.stdout.write(
    `\nmachine: benchmarkIndex ${Math.round(Math.min(...allBenches))} to ${Math.round(Math.max(...allBenches))} across ${allBenches.length} run(s)\n`,
  )
}
if (OUT) {
  writeFileSync(OUT, JSON.stringify({ base, runs: RUNS, formFactor: DESKTOP ? 'desktop' : 'mobile', takenAt: new Date().toISOString(), summary }, null, 2))
  process.stdout.write(`written: ${OUT}\n`)
}
if (stopServer) stopServer()
