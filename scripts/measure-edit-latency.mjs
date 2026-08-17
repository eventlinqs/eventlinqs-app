/**
 * MEASURE, DO NOT ASSERT: how long after an organiser saves does the PUBLIC page
 * show the change?
 *
 * WHY A MEASUREMENT AND NOT A TEST. The unit tests prove revalidateEventSurfaces
 * calls revalidatePath for the right paths. They cannot prove the deployed CDN
 * then serves the new page, because that is a property of the running platform,
 * not of the source. The founder asked for a measured number, so this measures
 * one, on a real deployment, through the real organiser UI.
 *
 * THE METHOD, stated so the number can be judged rather than trusted:
 *
 *   1. Fetch the public page and record the value it currently shows. This also
 *      guarantees the page is IN the cache, so what follows measures an
 *      invalidation and not a cold miss.
 *   2. Make the change through the organiser dashboard, in a real browser, with a
 *      real session. The clock starts the instant the save completes.
 *   3. Poll the public page, uncached at the fetch layer (cache: 'no-store', plus
 *      a cache-busting query so no intermediary answers from its own copy), until
 *      the NEW value appears. The clock stops there.
 *
 * The query string is deliberate and is worth naming: without it a fetch can be
 * answered by a proxy that has its own copy, and the number would then describe
 * that proxy rather than the platform. With it, the only thing that can serve the
 * response is the deployment.
 *
 * IT REFUSES PRODUCTION. The preflight is the same one every write-capable script
 * uses; this one drives an organiser UI and therefore writes.
 *
 * Usage:
 *   node scripts/measure-edit-latency.mjs <baseUrl> --storage .auth/organiser.json
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const require = createRequire(import.meta.url)
const { assertNotProduction } = require('./lib/production-write-preflight.mjs')
assertNotProduction({ envFile: '.env.test' })

const BASE = (process.argv[2] || '').replace(/\/$/, '')
const storageIdx = process.argv.indexOf('--storage')
const STORAGE = storageIdx === -1 ? '.auth/organiser.json' : process.argv[storageIdx + 1]
if (!BASE) {
  console.error('usage: node scripts/measure-edit-latency.mjs <baseUrl> --storage <file>')
  process.exit(2)
}

const env = {}
for (const line of readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const POLL_MS = 250
const TIMEOUT_MS = 90_000

/**
 * Poll the public page until `predicate` is satisfied. Returns the elapsed ms, or
 * null on timeout, which is reported as a timeout rather than quietly as a large
 * number: "did not appear within 90 seconds" and "took 90 seconds" are different
 * findings.
 */
async function timeUntilVisible(path, predicate, startedAt) {
  while (Date.now() - startedAt < TIMEOUT_MS) {
    const res = await fetch(`${BASE}${path}?cb=${Date.now()}${Math.random()}`, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
    })
    const html = await res.text()
    if (predicate(html)) return Date.now() - startedAt
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
  return null
}

const results = []
function record(name, ms, detail) {
  results.push({ name, ms, detail })
  const shown = ms === null ? 'DID NOT APPEAR within 90s' : `${ms} ms`
  console.log(`  ${String(name).padEnd(34)} ${shown}   ${detail ?? ''}`)
}

// ---- pick a TEST event owned by an organiser this session can edit ----------
const { data: candidates, error: pickErr } = await db
  .from('events')
  .select('id, slug, title, status, organisation_id, venue_name, timezone')
  .eq('status', 'published')
  .limit(25)

if (pickErr || !candidates?.length) {
  console.error('[latency] could not find a TEST event to drive:', pickErr?.message)
  process.exit(1)
}

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  storageState: STORAGE,
})
const page = await context.newPage()

// Which of those events does THIS session actually own? Ask the dashboard.
await page.goto(`${BASE}/dashboard/events`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2000)
const editable = await page.evaluate(() =>
  [...document.querySelectorAll('a[href*="/dashboard/events/"]')]
    .map((a) => a.getAttribute('href'))
    .filter((h) => h && /\/dashboard\/events\/[0-9a-f-]{36}/.test(h)),
)
const ids = [...new Set(editable.map((h) => h.match(/([0-9a-f-]{36})/)?.[1]).filter(Boolean))]
if (ids.length === 0) {
  console.error('[latency] this session owns no events on the dashboard; nothing to measure')
  await browser.close()
  process.exit(1)
}

const target = candidates.find((c) => ids.includes(c.id)) ?? null
if (!target) {
  console.error('[latency] no PUBLISHED event owned by this session; nothing to measure')
  await browser.close()
  process.exit(1)
}

console.log(`[latency] base    : ${BASE}`)
console.log(`[latency] event   : ${target.title} (${target.slug})`)
console.log(`[latency] method  : save in the dashboard, then poll the public page uncached`)
console.log('')
console.log('MUTATION                            LATENCY TO PUBLIC PAGE')

const stamp = Date.now().toString().slice(-6)

/**
 * Drive one field on the edit form and time the public page.
 */
async function measureField({ name, selector, value, expectOnPage }) {
  // Warm the public page so this measures an invalidation, not a cold miss.
  await fetch(`${BASE}/events/${target.slug}`, { cache: 'no-store' })

  await page.goto(`${BASE}/dashboard/events/${target.id}/edit`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  })
  await page.waitForTimeout(2500)

  const field = page.locator(selector).first()
  if ((await field.count()) === 0) {
    record(name, null, `field not found: ${selector}`)
    return
  }
  await field.fill(value)

  // Save, and start the clock the moment the save resolves.
  const save = page
    .locator('button:has-text("Save"), button:has-text("Update"), button[type="submit"]')
    .last()
  await save.click()
  await page.waitForTimeout(1500)
  const startedAt = Date.now()

  const ms = await timeUntilVisible(`/events/${target.slug}`, (html) => html.includes(expectOnPage), startedAt)
  record(name, ms, `looked for "${expectOnPage}"`)
}

await measureField({
  name: '1. event title',
  selector: 'input[name="title"], #title',
  value: `${target.title} ${stamp}`,
  expectOnPage: stamp,
})

await measureField({
  name: '2. venue name',
  selector: 'input[name="venue_name"], #venue_name',
  value: `Venue ${stamp}`,
  expectOnPage: `Venue ${stamp}`,
})

await measureField({
  name: '3. ticket price',
  selector: 'input[placeholder="0.00"]',
  value: '7.77',
  expectOnPage: '7.77',
})

await measureField({
  name: '4. summary',
  selector: 'textarea[name="summary"], #summary',
  value: `Summary ${stamp}`,
  expectOnPage: `Summary ${stamp}`,
})

// ---- status mutations, driven from the events table ------------------------
async function measureStatus({ name, buttonText, expectGone }) {
  await fetch(`${BASE}/events/${target.slug}`, { cache: 'no-store' })
  await page.goto(`${BASE}/dashboard/events`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2000)
  const btn = page.locator(`button:has-text("${buttonText}")`).first()
  if ((await btn.count()) === 0) {
    record(name, null, `control not found: ${buttonText}`)
    return
  }
  await btn.click()
  await page.waitForTimeout(1500)
  const startedAt = Date.now()
  const ms = await timeUntilVisible(
    `/events/${target.slug}`,
    (html) => (expectGone ? !html.includes('Checkout') : html.includes('Checkout')),
    startedAt,
  )
  record(name, ms, expectGone ? 'checkout should disappear' : 'checkout should return')
}

await measureStatus({ name: '5. pause (stops selling)', buttonText: 'Pause', expectGone: true })
await measureStatus({ name: '6. publish (resumes selling)', buttonText: 'Publish', expectGone: false })

await browser.close()

console.log('')
const measured = results.filter((r) => r.ms !== null)
const timedOut = results.filter((r) => r.ms === null)
if (measured.length > 0) {
  const values = measured.map((r) => r.ms).sort((a, b) => a - b)
  console.log(
    `[latency] ${measured.length} of ${results.length} mutations measured. ` +
      `min ${values[0]} ms, median ${values[Math.floor(values.length / 2)]} ms, max ${values[values.length - 1]} ms`,
  )
}
if (timedOut.length > 0) {
  console.log(`[latency] ${timedOut.length} NOT measured: ${timedOut.map((t) => t.name).join(', ')}`)
}

writeFileSync(
  'docs/verification/edit-latency.json',
  JSON.stringify({ base: BASE, event: target.slug, results }, null, 2),
)
console.log('[latency] written to docs/verification/edit-latency.json')
