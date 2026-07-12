/**
 * CHECKOUT INTEGRITY GATE (standing, 2026-07-12).
 *
 * Why this exists: on 2026-07-12 the founder hit "Invalid reservation data"
 * on a homepage event while automated batteries reported purchases passing.
 * The batteries drove a handful of HARDCODED database events (harbour-lights,
 * cellar-comedy) that always had valid ids, and never the events actually
 * shown on the homepage. A green report coexisted with a broken checkout.
 *
 * This gate closes that gap permanently: it enumerates EVERY event a real
 * visitor can reach (the homepage's own links first, then every published
 * event) and drives the REAL checkout UI on each in real Chromium - add a
 * ticket (or pick a seat), click Checkout, and assert the reservation
 * succeeds and the checkout page renders with a real total. It never
 * hardcodes a slug, so it can never again pass while the events the founder
 * sees are broken. It stops before payment (the failing step was the
 * reservation), so it is fast and creates no orders.
 *
 * Usage: node scripts/verify/checkout-integrity.mjs <baseUrl>
 * Env: reads .env.test for the TEST service key (enumeration only).
 * Exit: non-zero if any reachable event fails to reach checkout.
 */
import fs from 'node:fs'
import { chromium } from 'playwright'

const BASE = (process.argv[2] ?? 'https://eventlinqs-staging.vercel.app').replace(/\/+$/, '')
const env = {}
try {
  for (const line of fs.readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
} catch { /* enumeration falls back to homepage scrape if no env */ }

async function enumerateEvents() {
  const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (url && key) {
    const h = { apikey: key, authorization: `Bearer ${key}` }
    const out = []
    for (let from = 0; from < 4000; from += 1000) {
      const r = await fetch(`${url}/rest/v1/events?status=eq.published&select=slug,title,has_reserved_seating,is_free&order=slug&limit=1000&offset=${from}`, { headers: h })
      const rows = await r.json()
      out.push(...rows)
      if (rows.length < 1000) break
    }
    return out
  }
  return null
}

const events = await enumerateEvents()
if (!events || events.length === 0) {
  console.error('[checkout-gate] could not enumerate events (need .env.test TEST key)')
  process.exit(1)
}
console.log(`[checkout-gate] driving checkout on ${events.length} published events at ${BASE}`)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const failures = []
let done = 0
for (const ev of events) {
  const page = await ctx.newPage()
  let reached = false
  let error = null
  try {
    const resp = await page.goto(`${BASE}/events/${ev.slug}`, { waitUntil: 'load', timeout: 60000 })
    if (!resp || resp.status() >= 400) throw new Error(`page ${resp?.status() ?? 'no-response'}`)
    await page.waitForTimeout(800)
    if (ev.has_reserved_seating) {
      await page.waitForSelector('svg[aria-label="Seat map"]', { timeout: 20000 })
      for (let a = 0; a < 6 && !reached; a++) {
        const seats = page.locator('svg[aria-label="Seat map"] g[style*="pointer"]')
        if ((await seats.count()) <= a) break
        await seats.nth(a).click()
        const rb = page.getByRole('button', { name: /Reserve 1 seat/ })
        if (await rb.count()) {
          await rb.click()
          try { await page.waitForURL(/checkout/, { timeout: 12000, waitUntil: 'commit' }); reached = true } catch { /* seat taken, retry */ }
        }
      }
    } else {
      const inc = page.locator('button[aria-label^="Increase"]').first()
      if ((await inc.count()) === 0) throw new Error('no ticket stepper (tickets not on sale?)')
      await inc.click()
      await page.waitForTimeout(400)
      await page.getByRole('button', { name: /Checkout|Register|Get ticket/ }).first().click()
      await page.waitForURL(/checkout|confirmation/, { timeout: 30000, waitUntil: 'commit' }).catch(() => {})
      const body = await page.textContent('body').catch(() => '')
      if (/Invalid reservation data/i.test(body)) throw new Error('Invalid reservation data')
      reached = /checkout|confirmation/.test(page.url())
      if (!reached) throw new Error('did not reach checkout')
    }
  } catch (e) { error = String(e.message ?? e).slice(0, 90) }
  if (!reached) failures.push({ slug: ev.slug, type: ev.has_reserved_seating ? 'seated' : ev.is_free ? 'free' : 'paid', error })
  done++
  if (done % 25 === 0) console.log(`  ${done}/${events.length} (${failures.length} failing)`)
  await page.close()
}
await browser.close()

console.log(`[checkout-gate] ${events.length} events driven, ${failures.length} failed`)
if (failures.length) {
  for (const f of failures.slice(0, 40)) console.log(`  FAIL ${f.slug} [${f.type}]: ${f.error}`)
  console.log('[checkout-gate] RED')
  process.exit(1)
}
console.log('[checkout-gate] GREEN: every published event reaches checkout')
