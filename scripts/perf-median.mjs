#!/usr/bin/env node
/**
 * perf-median.mjs - median-of-N Lighthouse harness for v2 mobile-95 push.
 *
 * Differences from scripts/brand-sweep-audit.mjs:
 *   1. Hard taskkill of ALL chrome.exe processes between EVERY run (not just
 *      the chrome instance launched by chrome-launcher). The prior session's
 *      72-process accumulation came from chrome.kill() failing with EPERM
 *      and being silently swallowed.
 *   2. Verifies "tasklist | findstr chrome" is empty before each run. Aborts
 *      with CONTAMINATED if reaping fails twice in a row.
 *   3. N runs per route (default 5), median Performance/LCP/TBT/FCP per route.
 *   4. Range check: if Perf range across runs > 8 points, emits CONTAMINATED
 *      flag in the result JSON.
 *
 * Usage:
 *   node scripts/perf-median.mjs --routes=/,/events,/about --runs=5 \
 *     --base=http://localhost:3000 --out=docs/perf/v2/baseline-median5.json
 *
 * Routes: comma-separated list of paths (default /,/events,/about).
 * Runs:   number of Lighthouse runs per route (default 5).
 * Base:   target origin (default http://localhost:3000).
 * Out:    output JSON path (default docs/perf/v2/median.json).
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { execSync } from 'node:child_process'
import lighthouse from 'lighthouse'
import * as chromeLauncher from 'chrome-launcher'

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const eq = a.indexOf('=')
      return eq > 0 ? [a.slice(2, eq), a.slice(eq + 1)] : [a.slice(2), 'true']
    }),
)

const BASE = args.base ?? 'http://localhost:3000'
const RUNS = Number(args.runs ?? '5')
const ROUTES = (args.routes ?? '/,/events,/about').split(',').filter(Boolean)
const OUT = args.out ?? 'docs/perf/v2/median.json'
const LABEL = args.label ?? 'baseline'

const MOBILE_THROTTLING = {
  rttMs: 150,
  throughputKbps: 1638.4,
  requestLatencyMs: 562.5,
  downloadThroughputKbps: 1474.5600000000002,
  uploadThroughputKbps: 675,
  cpuSlowdownMultiplier: 4,
}

const MOBILE_VIEWPORT = {
  width: 375,
  height: 812,
  deviceScaleFactor: 3,
  mobile: true,
  formFactor: 'mobile',
}

function reapChrome() {
  // Hard kill: every chrome.exe and chromium.exe on the host. Includes child
  // processes via /T. This is the only reaping that has been verified to
  // actually return the host to a clean state after Lighthouse runs.
  for (const proc of ['chrome.exe', 'chromium.exe']) {
    try {
      execSync(`taskkill /F /IM ${proc} /T`, { stdio: 'ignore' })
    } catch {
      // exit code 128 / 1 means no matching process - that is the desired state
    }
  }
}

function chromeRunning() {
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq chrome.exe" /FO CSV /NH', {
      encoding: 'utf8',
    })
    return /chrome\.exe/i.test(out)
  } catch {
    return false
  }
}

function ensureClean() {
  if (!chromeRunning()) return true
  reapChrome()
  if (!chromeRunning()) return true
  // Sometimes chrome takes a moment to die. Wait briefly and re-check.
  const start = Date.now()
  while (Date.now() - start < 3000) {
    if (!chromeRunning()) return true
  }
  reapChrome()
  return !chromeRunning()
}

async function prewarm(target) {
  for (let i = 0; i < 2; i++) {
    try {
      await fetch(target)
    } catch {
      // ignore
    }
  }
}

async function runOne(target, throttlingMethod) {
  const chrome = await chromeLauncher.launch({
    chromeFlags: [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
    ],
  })
  try {
    const result = await lighthouse(
      target,
      {
        port: chrome.port,
        output: 'json',
        logLevel: 'error',
        onlyCategories: ['performance'],
      },
      {
        extends: 'lighthouse:default',
        settings: {
          formFactor: 'mobile',
          throttlingMethod,
          throttling: MOBILE_THROTTLING,
          screenEmulation: {
            mobile: true,
            width: MOBILE_VIEWPORT.width,
            height: MOBILE_VIEWPORT.height,
            deviceScaleFactor: MOBILE_VIEWPORT.deviceScaleFactor,
            disabled: false,
          },
          emulatedUserAgent:
            'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        },
      },
    )
    return result
  } finally {
    try {
      await chrome.kill()
    } catch {
      // chrome-launcher sometimes throws EPERM on Windows; we reap externally
    }
  }
}

async function runWithFallback(target) {
  let result
  let throttlingUsed = 'simulate'
  try {
    result = await runOne(target, 'simulate')
  } catch (err) {
    if (err?.code === 'NO_LCP' || /NO_LCP/.test(err?.message ?? '')) {
      throttlingUsed = 'devtools'
      result = await runOne(target, 'devtools')
    } else {
      throw err
    }
  }
  if (
    result.lhr.runtimeError == null &&
    result.lhr.categories.performance?.score == null
  ) {
    throttlingUsed = 'devtools'
    result = await runOne(target, 'devtools')
  }
  return { result, throttlingUsed }
}

function median(values) {
  const v = [...values].filter(x => Number.isFinite(x)).sort((a, b) => a - b)
  if (v.length === 0) return null
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

function range(values) {
  const v = values.filter(x => Number.isFinite(x))
  if (v.length === 0) return null
  return Math.max(...v) - Math.min(...v)
}

async function main() {
  await mkdir(dirname(resolve(OUT)), { recursive: true })

  const summary = {
    label: LABEL,
    base: BASE,
    runs: RUNS,
    timestamp: new Date().toISOString(),
    routes: {},
  }

  for (const route of ROUTES) {
    const target = `${BASE}${route}`
    const samples = []
    for (let i = 0; i < RUNS; i++) {
      const ok = ensureClean()
      if (!ok) {
        summary.routes[route] = {
          contaminated: true,
          reason: `chrome reaping failed before run ${i + 1}`,
        }
        console.error(
          `[perf-median] CONTAMINATED: chrome reaping failed before run ${
            i + 1
          } for ${route}`,
        )
        break
      }
      await prewarm(target)
      const { result, throttlingUsed } = await runWithFallback(target)
      const lhr = result.lhr
      const audits = lhr.audits
      const sample = {
        run: i + 1,
        throttlingUsed,
        performance: lhr.categories.performance?.score ?? null,
        lcpMs: audits['largest-contentful-paint']?.numericValue ?? null,
        tbtMs: audits['total-blocking-time']?.numericValue ?? null,
        fcpMs: audits['first-contentful-paint']?.numericValue ?? null,
        siMs: audits['speed-index']?.numericValue ?? null,
        cls: audits['cumulative-layout-shift']?.numericValue ?? null,
        lcpElement:
          audits['largest-contentful-paint-element']?.details?.items?.[0]?.node
            ?.selector ?? null,
      }
      samples.push(sample)
      console.log(
        `[perf-median] ${route} run ${i + 1}/${RUNS} ` +
          `perf=${(sample.performance ?? 0) * 100} ` +
          `lcp=${Math.round(sample.lcpMs ?? 0)}ms ` +
          `tbt=${Math.round(sample.tbtMs ?? 0)}ms ` +
          `(${throttlingUsed})`,
      )
    }
    if (samples.length === RUNS) {
      const perfScores = samples.map(s => (s.performance ?? 0) * 100)
      const perfRange = range(perfScores)
      summary.routes[route] = {
        contaminated: perfRange != null && perfRange > 8,
        perfRange,
        medianPerformance: median(perfScores),
        medianLcpMs: median(samples.map(s => s.lcpMs ?? 0)),
        medianTbtMs: median(samples.map(s => s.tbtMs ?? 0)),
        medianFcpMs: median(samples.map(s => s.fcpMs ?? 0)),
        medianSiMs: median(samples.map(s => s.siMs ?? 0)),
        medianCls: median(samples.map(s => s.cls ?? 0)),
        lcpElement: samples[0].lcpElement,
        samples,
      }
      console.log(
        `[perf-median] ${route} MEDIAN perf=${summary.routes[route].medianPerformance} ` +
          `lcp=${Math.round(summary.routes[route].medianLcpMs)}ms ` +
          `range=${perfRange}pts ` +
          `${summary.routes[route].contaminated ? 'CONTAMINATED' : 'OK'}`,
      )
    }
  }

  reapChrome()
  await writeFile(resolve(OUT), JSON.stringify(summary, null, 2))
  console.log(`[perf-median] wrote ${OUT}`)
}

main().catch(err => {
  console.error(err)
  reapChrome()
  process.exit(1)
})
