#!/usr/bin/env node
/**
 * Brand-sweep Phase 5 follow-up B audit.
 *
 * Drives Lighthouse and axe-core across the 13 brand-sweep public routes at
 * mobile (375 wide) and desktop (1440 wide). Per-run reports go under
 * docs/brand-sweep/verification/{lighthouse,axe}/. A single summary lives at
 * docs/brand-sweep/verification/summary.json.
 *
 * Locked gates (public routes):
 *   Performance >= 0.95
 *   Accessibility = 1.00
 *   Best Practices = 1.00
 *   SEO          = 1.00
 *   axe-core violations = 0
 *
 * Pre-req: a running production build at http://localhost:3000.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import lighthouse from 'lighthouse'
import * as chromeLauncher from 'chrome-launcher'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

const ROUTES = [
  { path: '/', slug: 'home' },
  { path: '/events', slug: 'events' },
  { path: '/organisers', slug: 'organisers' },
  { path: '/pricing', slug: 'pricing' },
  { path: '/about', slug: 'about' },
  { path: '/contact', slug: 'contact' },
  { path: '/help', slug: 'help' },
  { path: '/legal/terms', slug: 'legal-terms' },
  { path: '/legal/privacy', slug: 'legal-privacy' },
  { path: '/legal/refunds', slug: 'legal-refunds' },
  { path: '/this-route-does-not-exist-404-probe', slug: '404', is404: true },
  { path: '/login', slug: 'login' },
  { path: '/signup', slug: 'signup' },
]

const VIEWPORTS = {
  mobile: {
    width: 375,
    height: 812,
    deviceScaleFactor: 3,
    mobile: true,
    formFactor: 'mobile',
  },
  desktop: {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
    formFactor: 'desktop',
  },
}

const LH_DIR = resolve('docs/brand-sweep/verification/lighthouse')
const AXE_DIR = resolve('docs/brand-sweep/verification/axe')
const SUMMARY = resolve('docs/brand-sweep/verification/summary.json')

async function prewarm(target) {
  // Two warm fetches let Next.js boot the route handler and serve the
  // pre-rendered HTML from cache for the Lighthouse run. Without this the
  // first request can be slow enough that Lantern's simulator fails with
  // NO_LCP because the trace ends before LCP fires.
  for (let i = 0; i < 2; i++) {
    try {
      await fetch(target)
    } catch {
      // ignore
    }
  }
}

// Lighthouse defaults assume mobile throttling. When formFactor is desktop we
// have to explicitly pass desktop throttling settings, otherwise the run uses
// 4G + 4x CPU slowdown and produces artificially low scores. Values mirror
// the built-in Lighthouse desktop config preset.
const DESKTOP_THROTTLING = {
  rttMs: 40,
  throughputKbps: 10240,
  cpuSlowdownMultiplier: 1,
  requestLatencyMs: 0,
  downloadThroughputKbps: 0,
  uploadThroughputKbps: 0,
}

const MOBILE_THROTTLING = {
  rttMs: 150,
  throughputKbps: 1638.4,
  requestLatencyMs: 562.5,
  downloadThroughputKbps: 1474.5600000000002,
  uploadThroughputKbps: 675,
  cpuSlowdownMultiplier: 4,
}

async function runLighthouseOnce(target, vp, throttlingMethod) {
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  })
  try {
    const result = await lighthouse(
      target,
      {
        port: chrome.port,
        output: 'json',
        logLevel: 'error',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      },
      {
        extends: 'lighthouse:default',
        settings: {
          formFactor: vp.formFactor,
          throttlingMethod,
          throttling: vp.formFactor === 'desktop' ? DESKTOP_THROTTLING : MOBILE_THROTTLING,
          screenEmulation: {
            mobile: vp.mobile,
            width: vp.width,
            height: vp.height,
            deviceScaleFactor: vp.deviceScaleFactor,
            disabled: false,
          },
          emulatedUserAgent:
            vp.formFactor === 'mobile'
              ? 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
              : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      }
    )
    return result
  } finally {
    try {
      await chrome.kill()
    } catch (err) {
      if (err?.code !== 'EPERM' && err?.code !== 'EBUSY') throw err
    }
  }
}

async function runLighthouse(target, viewportName, vp) {
  await prewarm(target)
  let result
  let throttlingUsed = 'simulate'
  try {
    result = await runLighthouseOnce(target, vp, 'simulate')
  } catch (err) {
    if (err?.code === 'NO_LCP' || /NO_LCP/.test(err?.message ?? '')) {
      throttlingUsed = 'devtools'
      result = await runLighthouseOnce(target, vp, 'devtools')
    } else {
      throw err
    }
  }
  // Lantern's NO_LCP failure mode often does not throw — Lighthouse swallows
  // the trace_engine error and returns a partial lhr with performance:null.
  // Detect that and re-run with devtools throttling.
  if (
    result.lhr.runtimeError == null &&
    result.lhr.categories.performance?.score == null
  ) {
    throttlingUsed = 'devtools'
    result = await runLighthouseOnce(target, vp, 'devtools')
  }
  return {
    lhr: result.lhr,
    throttlingUsed,
    scores: {
      performance: result.lhr.categories.performance?.score ?? null,
      accessibility: result.lhr.categories.accessibility?.score ?? null,
      bestPractices: result.lhr.categories['best-practices']?.score ?? null,
      seo: result.lhr.categories.seo?.score ?? null,
    },
  }
}

async function runAxe(target, vp, allow404) {
  const browser = await chromium.launch()
  try {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.deviceScaleFactor,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
    })
    const page = await ctx.newPage()
    const res = await page.goto(target, { waitUntil: 'networkidle' })
    if (!res) throw new Error(`axe load returned no response: ${target}`)
    const status = res.status()
    if (status >= 400 && !(allow404 && status === 404)) {
      throw new Error(`axe load failed at ${target}: ${status}`)
    }
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    return {
      status,
      violations: results.violations.length,
      details: results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.length,
        help: v.help,
      })),
      raw: results,
    }
  } finally {
    await browser.close()
  }
}

function pct(v) {
  return v == null ? 'n/a' : (v * 100).toFixed(0)
}

function gate(scores, axe, is404) {
  if (is404) {
    // Lighthouse refuses to score pages that return non-2xx, so the
    // performance / SEO / a11y / BP categories all come back null with a
    // runtimeError of ERRORED_DOCUMENT_REQUEST. The 404 page is still
    // user-facing, so we run axe-core (which does not gate on HTTP status)
    // and gate only on axe violations. Documented in results doc.
    return { axe: axe.violations === 0 }
  }
  return {
    performance: scores.performance != null && scores.performance >= 0.95,
    accessibility: scores.accessibility === 1,
    bestPractices: scores.bestPractices === 1,
    seo: scores.seo === 1,
    axe: axe.violations === 0,
  }
}

async function main() {
  await mkdir(LH_DIR, { recursive: true })
  await mkdir(AXE_DIR, { recursive: true })

  const onlyArg = process.argv.find((a) => a.startsWith('--only='))
  const onlyRoutes = onlyArg ? new Set(onlyArg.replace('--only=', '').split(',')) : null
  const onlyVpArg = process.argv.find((a) => a.startsWith('--viewport='))
  const onlyVps = onlyVpArg ? new Set(onlyVpArg.replace('--viewport=', '').split(',')) : null

  const summary = {
    base: BASE,
    timestamp: new Date().toISOString(),
    routes: {},
    pass: true,
    failures: [],
  }

  for (const route of ROUTES) {
    if (onlyRoutes && !onlyRoutes.has(route.slug)) continue
    const target = `${BASE}${route.path}`
    summary.routes[route.slug] = { path: route.path, runs: {} }

    for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
      if (onlyVps && !onlyVps.has(vpName)) continue
      const tag = `${route.slug} ${vpName}`
      let lh, axe, lhFile, axeFile
      try {
        process.stdout.write(`[${tag}] LH... `)
        lh = await runLighthouse(target, vpName, vp)
        lhFile = resolve(LH_DIR, `${route.slug}-${vpName}.json`)
        await writeFile(lhFile, JSON.stringify(lh.lhr, null, 2))
        process.stdout.write('axe... ')
        axe = await runAxe(target, vp, route.is404)
        axeFile = resolve(AXE_DIR, `${route.slug}-${vpName}.json`)
        await writeFile(axeFile, JSON.stringify(axe.raw, null, 2))
      } catch (err) {
        console.log(`ERROR ${err.message}`)
        summary.routes[route.slug].runs[vpName] = { error: err.message, pass: false }
        summary.pass = false
        summary.failures.push(`${tag}: ${err.message}`)
        continue
      }

      const gates = gate(lh.scores, axe, route.is404)
      const pass = Object.values(gates).every(Boolean)
      summary.routes[route.slug].runs[vpName] = {
        viewport: { width: vp.width, height: vp.height },
        scores: lh.scores,
        throttling: lh.throttlingUsed,
        axe: { violations: axe.violations, status: axe.status, details: axe.details },
        gates,
        pass,
      }
      if (!pass) {
        summary.pass = false
        for (const [k, ok] of Object.entries(gates)) {
          if (!ok) summary.failures.push(`${tag}: ${k} fail`)
        }
      }
      console.log(
        `Perf ${pct(lh.scores.performance)} A11y ${pct(lh.scores.accessibility)} BP ${pct(lh.scores.bestPractices)} SEO ${pct(lh.scores.seo)} axe ${axe.violations} ${pass ? 'PASS' : 'FAIL'}`
      )
      if (axe.violations > 0) {
        for (const v of axe.details) {
          console.log(`  axe: ${v.id} (${v.impact}, ${v.nodes} node(s)) ${v.help}`)
        }
      }
    }
  }

  await writeFile(SUMMARY, JSON.stringify(summary, null, 2))
  console.log(
    `\n${summary.pass ? 'AUDIT PASS' : 'AUDIT FAIL'} -> ${SUMMARY}`
  )
  if (!summary.pass) {
    console.log('Failures:')
    for (const f of summary.failures) console.log(`  - ${f}`)
  }
  process.exit(summary.pass ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
