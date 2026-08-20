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

// `--slug` pins the event, so a run is repeatable and a measurement is not
// quietly taken against a different event than the previous one.
const slugIdx = process.argv.indexOf('--slug')
const PINNED = slugIdx === -1 ? null : process.argv[slugIdx + 1]

// A pinned slug is fetched by name. Looking for it inside the 25-row sample
// reported "this session owns no published event", which was false: the event
// simply was not in the sample.
let target = null
if (PINNED) {
  const { data: pinned } = await db
    .from('events')
    .select('id, slug, title, status, organisation_id, venue_name, timezone')
    .eq('slug', PINNED)
    .maybeSingle()
  if (pinned && ids.includes(pinned.id)) target = pinned
  else if (pinned) {
    console.error(`[latency] ${PINNED} exists but is not owned by this session`)
  } else {
    console.error(`[latency] no event with slug ${PINNED}`)
  }
} else {
  target = candidates.find((c) => ids.includes(c.id)) ?? null
}
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
 * Walk the edit wizard to its end and save.
 *
 * The edit form is the multi-step wizard, not a single form with a Save button,
 * and its fields carry neither name nor id: they are addressed by placeholder,
 * which is what a screen reader and a human both use. Guessing at
 * `input[name="title"]` found nothing and reported six timeouts that were really
 * six selector misses, which is its own kind of lie, so the walk is explicit.
 */
/** Advance the wizard one step. */
async function advance() {
  const next = page.locator('button', { hasText: /^Continue$/ }).first()
  if ((await next.count()) === 0 || !(await next.isEnabled())) return false
  await next.click()
  await page.waitForTimeout(1100)
  return true
}

/** Walk to the review step and press the real control, which is "Save Changes". */
async function saveWizard() {
  for (let step = 0; step < 9; step += 1) {
    const save = page.locator('button', { hasText: /^Save Changes$/ }).first()
    if ((await save.count()) > 0) {
      if (!(await save.isEnabled())) return { ok: false, why: 'Save Changes is disabled on the review step' }
      await save.click()
      await page.waitForTimeout(3000)
      const err = await page.evaluate(() => {
        const t = document.body.innerText
        const m = t.match(/[^\n]*(could not|failed|required|must |invalid|error)[^\n]*/i)
        return m ? m[0].slice(0, 160) : null
      })
      return { ok: !err, why: err }
    }
    if (!(await advance())) return { ok: false, why: `no Continue and no Save Changes at step ${step}` }
  }
  return { ok: false, why: 'never reached the review step' }
}

/**
 * Drive one field on the edit form and time the public page.
 */
async function measureField({ name, selector, value, expectOnPage, step = 0 }) {
  // Warm the public page so this measures an invalidation, not a cold miss.
  await fetch(`${BASE}/events/${target.slug}`, { cache: 'no-store' })

  await page.goto(`${BASE}/dashboard/events/${target.id}/edit`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  })
  await page.waitForTimeout(3000)

  // Walk to the step the field lives on. The price is on the tickets step, not
  // the first one, and looking for it on step 0 reported "field not found" for
  // what was really "wrong screen".
  for (let i = 0; i < step; i += 1) {
    if (!(await advance())) break
  }

  const field = page.locator(selector).first()
  if ((await field.count()) === 0) {
    record(name, null, `field not found on step ${step}: ${selector}`)
    return
  }
  await field.fill(value)
  await page.waitForTimeout(400)

  const saved = await saveWizard()
  if (!saved.ok) {
    record(name, null, `save did not complete: ${saved.why}`)
    return
  }
  const startedAt = Date.now()

  const ms = await timeUntilVisible(`/events/${target.slug}`, (html) => html.includes(expectOnPage), startedAt)
  record(name, ms, `looked for "${expectOnPage}"`)
}

// Selectors read off the rendered form rather than guessed. The wizard fields
// carry no name and no id; the placeholder is the stable handle.
await measureField({
  name: '1. event title',
  selector: 'input[placeholder="e.g. Summer Music Festival 2026"]',
  value: `Aso Ebi Affair ${stamp}`,
  expectOnPage: stamp,
})

await measureField({
  name: '2. summary (event card text)',
  selector: 'input[placeholder="A brief one-line description shown on event cards"]',
  value: `Summary ${stamp}b`,
  expectOnPage: `Summary ${stamp}b`,
})

await measureField({
  name: '3. description',
  selector: 'textarea[placeholder^="Describe your event"]',
  value: `Description ${stamp}c`,
  expectOnPage: `Description ${stamp}c`,
})

await measureField({
  name: '4. ticket price',
  selector: 'input[placeholder="0.00"]',
  value: '77.77',
  expectOnPage: '77.77',
  step: 4, // the tickets step
})

// ---- status mutations, driven from the events table ------------------------
/**
 * A status mutation, driven from the events table.
 *
 * The public marker is the ticket panel, not the word "Checkout": that button is
 * only labelled Checkout once a quantity is chosen, so looking for it in the
 * server HTML measured nothing. A paused event renders the paused notice
 * instead of a selector, which IS in the server HTML.
 */
async function measureStatus({ name, labels, expect }) {
  await fetch(`${BASE}/events/${target.slug}`, { cache: 'no-store' })
  await page.goto(`${BASE}/dashboard/events`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)

  let clicked = null
  for (const label of labels) {
    const btn = page.locator('button', { hasText: new RegExp(`^${label}$`, 'i') }).first()
    if ((await btn.count()) > 0 && (await btn.isEnabled())) {
      await btn.click()
      clicked = label
      break
    }
  }
  if (!clicked) {
    // Say what WAS on the page, so "control not found" is a finding rather than
    // a shrug. A label that has been renamed is a one-line fix; a control that
    // does not exist is a defect, and these two must be distinguishable.
    const present = await page.evaluate(() =>
      [...new Set([...document.querySelectorAll('button')].map((b) => b.innerText.trim()))]
        .filter((t) => t && t.length < 24)
        .join(' | '),
    )
    record(name, null, `no control among [${labels.join(', ')}]; page offers: ${present}`)
    return
  }
  await page.waitForTimeout(2000)
  const startedAt = Date.now()
  const ms = await timeUntilVisible(`/events/${target.slug}`, expect, startedAt)
  record(name, ms, `pressed "${clicked}"`)
}

/*
 * THE MARKER WAS ESTABLISHED BEFORE IT WAS USED, and that is not pedantry.
 *
 * The first version of this measurement polled for `!html.includes('Checkout')`,
 * which was ALREADY TRUE before the mutation: the checkout button is only
 * labelled "Checkout" once a quantity is chosen, so the word never appears in
 * server HTML. The predicate was satisfied on the first poll and the script
 * reported 217 ms for a mutation it had not observed at all. That is exactly the
 * vacuous-green failure this project keeps being bitten by, produced here by the
 * very harness meant to detect it, so the numbers it printed were discarded.
 *
 * The marker below was measured first, on the two states, driven directly in the
 * database: a published event renders 196,880 bytes and contains the tier name;
 * a paused one renders 53,697 bytes and is a 404. It therefore changes, which is
 * the only property a poll predicate needs and the one the first version lacked.
 */
const TIER_MARKER = 'General Admission'

await measureStatus({
  name: '5. pause (takes it off sale)',
  labels: ['Pause'],
  expect: (html) => !html.includes(TIER_MARKER),
})

await measureStatus({
  name: '6. republish (puts it back on sale)',
  labels: ['Publish', 'Resume', 'Go live', 'Republish'],
  expect: (html) => html.includes(TIER_MARKER),
})

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
