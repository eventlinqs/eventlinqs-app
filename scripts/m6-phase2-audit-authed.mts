#!/usr/bin/env node
/**
 * M6 Phase 2 - authed dashboard audit
 *
 * Runs Lighthouse + axe against /dashboard/payouts in three Connect
 * states (not_started, in_progress, complete) at mobile (375 wide) and
 * desktop (1440 wide). Six Lighthouse JSONs and six axe JSONs are
 * written under docs/m6/audit/phase2/.
 *
 * Auth: tests/fixtures/auth.ts handles user/org seeding via service role
 *       and produces .auth/organiser.json from a real login round trip.
 *       This script imports those helpers via tsx.
 *
 * Same gate as Item 1: Perf 0.95+, A11y 1.00, BP 1.00, SEO 1.00, axe 0.
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import lighthouse from 'lighthouse'
import * as chromeLauncher from 'chrome-launcher'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'

import {
  ensureTestOrganiser,
  loginAndSaveStorageState,
  setConnectState,
  STORAGE_STATE_PATH,
} from '../tests/fixtures/auth.mts'

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const TARGET_PATH = '/dashboard/payouts'
const TARGET = `${BASE}${TARGET_PATH}`
const OUT_DIR = resolve('docs/m6/audit/phase2')

const STATES = ['not_started', 'in_progress', 'complete']

const VIEWPORTS = {
  mobile: {
    width: 375,
    height: 812,
    deviceScaleFactor: 3,
    mobile: true,
    formFactor: 'mobile',
    ua: 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  },
  desktop: {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
    formFactor: 'desktop',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
}

async function loadCookies() {
  const text = await readFile(STORAGE_STATE_PATH, 'utf8')
  const state = JSON.parse(text)
  return state.cookies ?? []
}

function adaptCookieForCDP(c) {
  // Network.setCookie expects expires as seconds since epoch.
  const out = {
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path || '/',
    secure: !!c.secure,
    httpOnly: !!c.httpOnly,
    sameSite: c.sameSite || 'Lax',
  }
  if (typeof c.expires === 'number' && c.expires > 0) {
    out.expires = Math.floor(c.expires)
  }
  return out
}

async function runLighthouse(viewportName, vp, stateName) {
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  })
  try {
    // Inject auth cookies before Lighthouse navigates.
    const cookies = (await loadCookies()).map(adaptCookieForCDP)
    const cdp = await fetch(`http://localhost:${chrome.port}/json/version`)
      .then((r) => r.json())
      .then((v) => v.webSocketDebuggerUrl)
    if (cookies.length) {
      // Use Chrome DevTools Protocol via Lighthouse's port. The lighthouse
      // package includes a helper for this via its `--extra-headers`
      // option, but cookies must be set via Network.setCookies. We'll do
      // it through a minimal CDP client.
      const WebSocket = (await import('ws')).default
      const ws = new WebSocket(cdp)
      await new Promise((res, rej) => {
        ws.once('open', res)
        ws.once('error', rej)
      })
      let id = 0
      const send = (method, params) =>
        new Promise((res, rej) => {
          const msgId = ++id
          const onMsg = (data) => {
            const msg = JSON.parse(data.toString())
            if (msg.id === msgId) {
              ws.off('message', onMsg)
              if (msg.error) rej(new Error(msg.error.message))
              else res(msg.result)
            }
          }
          ws.on('message', onMsg)
          ws.send(JSON.stringify({ id: msgId, method, params }))
        })
      // Open a target so the network domain is available.
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
      const { sessionId } = await send('Target.attachToTarget', {
        targetId,
        flatten: true,
      })
      const sendOnSession = (method, params) =>
        new Promise((res, rej) => {
          const msgId = ++id
          const onMsg = (data) => {
            const msg = JSON.parse(data.toString())
            if (msg.id === msgId) {
              ws.off('message', onMsg)
              if (msg.error) rej(new Error(msg.error.message))
              else res(msg.result)
            }
          }
          ws.on('message', onMsg)
          ws.send(
            JSON.stringify({ sessionId, id: msgId, method, params })
          )
        })
      await sendOnSession('Network.enable', {})
      await sendOnSession('Network.setCookies', { cookies })
      ws.close()
    }
    const result = await lighthouse(
      TARGET,
      {
        port: chrome.port,
        output: 'json',
        logLevel: 'error',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        disableStorageReset: true,
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
          emulatedUserAgent: vp.ua,
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
      resolve(OUT_DIR, `lighthouse-payouts-${stateName}-${viewportName}.json`),
      JSON.stringify(lhr, null, 2)
    )
    return { scores, fetchedUrl: lhr.finalUrl }
  } finally {
    try {
      await chrome.kill()
    } catch (err) {
      if (err?.code !== 'EPERM' && err?.code !== 'EBUSY') throw err
    }
  }
}

async function runAxe(viewportName, vp, stateName) {
  const browser = await chromium.launch()
  try {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.deviceScaleFactor,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
      storageState: STORAGE_STATE_PATH,
    })
    const page = await ctx.newPage()
    const res = await page.goto(TARGET, { waitUntil: 'networkidle' })
    if (!res || res.status() >= 400) {
      throw new Error(`axe load failed at ${TARGET}: ${res?.status()}`)
    }
    // If we landed on /login the cookies didn't carry the session.
    if (page.url().includes('/login')) {
      throw new Error(`axe redirected to login - storageState stale`)
    }
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    await writeFile(
      resolve(OUT_DIR, `axe-payouts-${stateName}-${viewportName}.json`),
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

  // Seed the test organiser + login + save storage state once.
  const { organisationId } = await ensureTestOrganiser()
  console.log(`[seed] organisationId=${organisationId}`)
  console.log(`[auth] logging in as test organiser...`)
  await loginAndSaveStorageState()
  console.log(`[auth] storageState saved -> ${STORAGE_STATE_PATH}`)

  const summary = {
    target: TARGET,
    timestamp: new Date().toISOString(),
    runs: {},
    pass: true,
  }

  for (const stateName of STATES) {
    console.log(`\n[state] switching to ${stateName}`)
    await setConnectState(organisationId, stateName)
    for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
      const key = `${stateName}-${vpName}`
      process.stdout.write(`[${key}] Lighthouse... `)
      const lh = await runLighthouse(vpName, vp, stateName)
      process.stdout.write('done\n')
      process.stdout.write(`[${key}] axe-core...   `)
      const axe = await runAxe(vpName, vp, stateName)
      process.stdout.write('done\n')

      const gates = gate(lh.scores, axe)
      const allOk = Object.values(gates).every(Boolean)
      summary.runs[key] = {
        viewport: vp,
        state: stateName,
        scores: lh.scores,
        axe,
        gates,
        pass: allOk,
      }
      summary.pass = summary.pass && allOk
      console.log(
        `[${key}] Perf ${pct(lh.scores.performance)} | A11y ${pct(lh.scores.accessibility)} | BP ${pct(lh.scores.bestPractices)} | SEO ${pct(lh.scores.seo)} | axe ${axe.violations}`
      )
      if (axe.violations > 0) {
        for (const v of axe.details) {
          console.log(`  axe: ${v.id} (${v.impact}, ${v.nodes} nodes) - ${v.help}`)
        }
      }
      for (const [k, ok] of Object.entries(gates)) {
        if (!ok) console.log(`  GATE FAIL: ${k}`)
      }
    }
  }

  await writeFile(
    resolve(OUT_DIR, 'summary-authed.json'),
    JSON.stringify(summary, null, 2)
  )
  console.log(
    `\n${summary.pass ? 'AUDIT PASS' : 'AUDIT FAIL'}  -> docs/m6/audit/phase2/summary-authed.json`
  )
  process.exit(summary.pass ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
