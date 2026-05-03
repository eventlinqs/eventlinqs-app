#!/usr/bin/env node
/**
 * M6 Phase 2 audit
 *
 * Drives Lighthouse and axe-core against the public dev preview route
 * /dev/connect-onboarding-preview at mobile (375 wide) and desktop
 * (1440 wide). Writes a single JSON summary plus per-run reports under
 * docs/m6/audit/phase2/.
 *
 * Locked gates:
 *   - Performance >= 0.95
 *   - Accessibility = 1.00
 *   - Best Practices = 1.00
 *   - SEO          = 1.00
 *   - axe-core violations = 0
 *
 * Pre-reqs: a running production build at http://localhost:3000.
 *
 * Run:
 *   npm run build && npm run start &
 *   node scripts/m6-phase2-audit.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import lighthouse from 'lighthouse'
import * as chromeLauncher from 'chrome-launcher'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'

const URL_PATH = '/dev/connect-onboarding-preview'
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const TARGET = `${BASE}${URL_PATH}`
const OUT_DIR = resolve('docs/m6/audit/phase2')

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

async function runLighthouse(viewportName, vp) {
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  })
  try {
    const result = await lighthouse(
      TARGET,
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
          throttlingMethod: 'simulate',
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
    const lhr = result.lhr
    const scores = {
      performance: lhr.categories.performance?.score ?? null,
      accessibility: lhr.categories.accessibility?.score ?? null,
      bestPractices: lhr.categories['best-practices']?.score ?? null,
      seo: lhr.categories.seo?.score ?? null,
    }
    await writeFile(
      resolve(OUT_DIR, `lh-${viewportName}.json`),
      JSON.stringify(lhr, null, 2)
    )
    return { scores, fetchedUrl: lhr.finalUrl }
  } finally {
    try {
      await chrome.kill()
    } catch (err) {
      // Windows occasionally fails to clean its tmp profile dir even after
      // Chrome exits. The Lighthouse run is complete by this point so we
      // can safely swallow the cleanup error.
      if (err?.code !== 'EPERM' && err?.code !== 'EBUSY') throw err
    }
  }
}

async function runAxe(viewportName, vp) {
  const browser = await chromium.launch()
  try {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.deviceScaleFactor,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
    })
    const page = await ctx.newPage()
    const res = await page.goto(TARGET, { waitUntil: 'networkidle' })
    if (!res || res.status() >= 400) {
      throw new Error(`axe load failed at ${TARGET}: ${res?.status()}`)
    }
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    await writeFile(
      resolve(OUT_DIR, `axe-${viewportName}.json`),
      JSON.stringify(results, null, 2)
    )
    return {
      violations: results.violations.length,
      details: results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.length,
        help: v.help,
      })),
    }
  } finally {
    await browser.close()
  }
}

function pct(v) {
  return v == null ? 'n/a' : (v * 100).toFixed(0)
}

function gate(scores, axe) {
  return {
    performance: scores.performance != null && scores.performance >= 0.95,
    accessibility: scores.accessibility === 1,
    bestPractices: scores.bestPractices === 1,
    seo: scores.seo === 1,
    axe: axe.violations === 0,
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const summary = {
    target: TARGET,
    timestamp: new Date().toISOString(),
    runs: {},
    pass: true,
  }

  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    process.stdout.write(`\n[${name}] Lighthouse... `)
    const lh = await runLighthouse(name, vp)
    process.stdout.write('done\n')
    process.stdout.write(`[${name}] axe-core...   `)
    const axe = await runAxe(name, vp)
    process.stdout.write('done\n')

    const gates = gate(lh.scores, axe)
    const allOk = Object.values(gates).every(Boolean)
    summary.runs[name] = {
      viewport: vp,
      scores: lh.scores,
      axe,
      gates,
      pass: allOk,
    }
    summary.pass = summary.pass && allOk

    console.log(
      `[${name}] Perf ${pct(lh.scores.performance)} | A11y ${pct(lh.scores.accessibility)} | BP ${pct(lh.scores.bestPractices)} | SEO ${pct(lh.scores.seo)} | axe violations ${axe.violations}`
    )
    if (axe.violations > 0) {
      for (const v of axe.details) {
        console.log(`  axe: ${v.id} (${v.impact}, ${v.nodes} node(s)) - ${v.help}`)
      }
    }
    for (const [k, ok] of Object.entries(gates)) {
      if (!ok) console.log(`  GATE FAIL: ${k}`)
    }
  }

  await writeFile(resolve(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2))
  console.log(
    `\n${summary.pass ? 'AUDIT PASS' : 'AUDIT FAIL'}  -> docs/m6/audit/phase2/summary.json`
  )
  process.exit(summary.pass ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
