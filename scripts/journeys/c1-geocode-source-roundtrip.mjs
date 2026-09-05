/**
 * C1, THE TYPES-DRIFT REPAIR: THE GEOCODE SOURCE ROUND TRIP THROUGH THE REAL UI.
 *
 * WHY A DRIVE FOR A CI FIX. origin/main went red at dc71374e because the union
 * 'places' | 'geocoding' | 'manual' had been hand-written into the GENERATED
 * section of src/types/database.ts for events.venue_geocode_source, a TEXT
 * column. 20260905000003 makes that column a real Postgres enum, and the
 * generated types now carry the union from the schema. The one user-facing
 * surface that reads the column back into a form is the organiser's event edit
 * page (the row's venue_geocode_source flows into EventForm's typed field),
 * and this journey proves that round trip at the viewport JOURNEY_VIEWPORT
 * names, on a local production server against TEST, where the enum is live.
 *
 *   1. THE PICK. The organiser signs up through the real wizard, types
 *      "Forum Melb" into the venue finder (the Maps JS served from
 *      scripts/journeys/stubs/maps-js-stub.mjs, built from Google's real answer,
 *      because the browser key is referer restricted to www.eventlinqs.com.au),
 *      picks the suggestion with the keyboard, and publishes. The row on TEST
 *      carries source 'places' and a geocoded time.
 *   2. THE DATABASE REFUSES A STRAY VALUE. A service-role update of the same row
 *      to 'bogus' is refused by Postgres (22P02, invalid input value for enum
 *      venue_geocode_source) and the row still reads 'places'.
 *   3. THE EDIT PAGE. The organiser opens the event's edit page, walks to the
 *      Location step, and finds the picked venue, its address and the map
 *      preview card already there: the enum value came back through the form.
 *   4. SAVE CHANGES. The organiser saves from the Review step; the row still
 *      carries 'places' and the same coordinates, so the edit path writes the
 *      enum value the form was handed, unchanged.
 *
 * Usage: powershell -File C:\dev\run-journey.ps1 -Script scripts\journeys\c1-geocode-source-roundtrip.mjs
 *        with JOURNEY_PLACES_STUB=1 (the only mode this journey runs in).
 */
import { copyFileSync, mkdirSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  chromium,
  BASE,
  makeJourney,
  note,
  attach,
  describe,
  finish,
  messagesOnScreen,
  fillIf,
  clickText,
  signUpAndConfirm,
} from './harness.mjs'
import { MAPS_JS_STUB } from './stubs/maps-js-stub.mjs'

if (process.env.JOURNEY_PLACES_STUB !== '1') {
  console.error('[c1] this journey drives the finder against the STUBBED Maps JS only; set JOURNEY_PLACES_STUB=1')
  process.exit(2)
}
const MODE = 'STUBBED PLACES'
const j = makeJourney('c1-geocode-source-roundtrip', `C1: the geocode source round trip through the edit page (${MODE})`)
const stamp = process.env.RUN_STAMP ?? String(Date.now()).slice(-6)
const viewportLabel = process.env.JOURNEY_VIEWPORT ?? 'desktop-1440'
const VIEWPORTS = {
  'mobile-390': { width: 390, height: 844 },
  'tablet-768': { width: 768, height: 1024 },
  'desktop-1440': { width: 1440, height: 1000 },
}
const viewport = VIEWPORTS[viewportLabel] ?? VIEWPORTS['desktop-1440']
const ORGANISER = { name: 'Priya Nair', email: `priya.source.${stamp}@example.com`, password: `Str0ng-${stamp}-Source!` }
const TITLE = `Forum Round Trip ${stamp}`

const browser = await chromium.launch()
const results = []
function verdict(name, ok, detail) {
  results.push({ name, ok, detail })
  note(j, `${ok ? 'PASS' : 'FAIL'}  ${name}`, detail)
  if (!ok) j.blockers.push(`${name}: ${detail ?? ''}`)
}

const run = { viewport: viewportLabel, base: BASE, mode: MODE }

const db = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !service) return null
  if (/gndnldyfudbytbboxesk/.test(url)) throw new Error('refusing to run a journey against production')
  return createClient(url, service, { auth: { persistSession: false } })
})()

async function textOnPage(p) {
  return (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ')
}

async function stepHeading(p) {
  return (await p.evaluate(() => document.querySelector('h2')?.textContent ?? '')).trim()
}

/** Steps 1 and 2 of the wizard, up to the location step (the A3 shape). */
async function wizardToLocation(p, title, summary) {
  await p.goto(`${BASE}/dashboard/events/create`, { waitUntil: 'networkidle', timeout: 60000 })
  await p.waitForTimeout(2500)
  if (await p.$('button:has-text("Continue to event details")')) {
    await fillIf(p, 'input#name, input[name="name"]', `Nair Presents ${stamp}`)
    await fillIf(p, 'textarea#description, textarea[name="description"]', 'Live music across Melbourne.')
    await clickText(p, 'Continue to event details')
    await p.waitForTimeout(6000)
  }
  await fillIf(p, 'input[placeholder^="e.g. Summer Music Festival"]', title)
  await fillIf(p, 'input[placeholder^="A brief one-line"]', summary)
  await fillIf(p, 'textarea[placeholder^="Describe your event in detail"]', 'Two sets, one room, doors at eight.')
  if (await p.$('select')) {
    const opt = await p.evaluate(() => {
      const s = document.querySelector('select')
      const o = [...s.options].find((x) => /music/i.test(x.textContent)) ?? [...s.options].find((x) => x.value)
      return o?.value ?? null
    })
    if (opt) await p.selectOption('select', opt)
  }
  await clickText(p, 'Continue')
  await p.waitForTimeout(3500)
  const dates = await p.$$('input[type="date"], input[type="datetime-local"]')
  for (let d = 0; d < dates.length; d += 1) {
    const when = new Date(Date.now() + 21 * 864e5 + d * 3 * 36e5)
    const type = await p.evaluate((e) => e.type, dates[d])
    await dates[d].fill(type === 'date' ? when.toISOString().slice(0, 10) : when.toISOString().slice(0, 16)).catch(() => {})
  }
  await clickText(p, 'Continue')
  await p.waitForTimeout(3500)
}

/** From the location step through media, one free tier, review and publish. Returns { url, eventId, slug }. */
async function finishAndPublish(p, label) {
  await clickText(p, 'Continue')
  await p.waitForTimeout(3500)
  if (await p.$('button:has-text("Make a cover")')) {
    await clickText(p, 'Make a cover')
    const started = Date.now()
    let made = false
    while (Date.now() - started < 45000) {
      made = await p.evaluate(() =>
        [...document.querySelectorAll('img')].some((im) => {
          const r = im.getBoundingClientRect()
          return r.width > 120 && r.height > 80 && im.complete && im.naturalWidth > 0
        }),
      )
      if (made) break
      await p.waitForTimeout(1500)
    }
    if (made && (await p.$('button:has-text("Use this cover")'))) {
      await clickText(p, 'Use this cover')
      await p.waitForTimeout(3000)
    }
  }
  const ticketingStarted = Date.now()
  while (!(await p.$('button:has-text("Add Ticket Tier")')) && Date.now() - ticketingStarted < 90000) {
    await clickText(p, 'Continue')
    await p.waitForTimeout(2500)
    const shown = await messagesOnScreen(p)
    if (shown.some((s) => /still uploading/i.test(s))) await p.waitForTimeout(3000)
  }
  if (!(await p.$('button:has-text("Add Ticket Tier")'))) {
    await describe(j, p, `${label}: stuck before ticketing`)
    j.blockers.push(`${label}: never reached the ticketing step: ${(await messagesOnScreen(p)).join(' // ') || 'no message shown'}`)
    return null
  }
  await fillIf(p, '#tier-name-0', 'General admission')
  const t0 = await p.$('#type-21, select#type-21')
  if (t0) await t0.selectOption('free').catch(() => {})
  await fillIf(p, '#tier-capacity-0', '120')
  for (let i = 0; i < 4; i += 1) {
    if (await p.$('button:has-text("Publish and get your launch kit")')) break
    if (!(await clickText(p, 'Continue'))) break
    await p.waitForTimeout(3500)
  }
  const pub = await p.$('button:has-text("Publish and get your launch kit")')
  if (!pub) {
    j.blockers.push(`${label}: never reached Review: ${(await messagesOnScreen(p)).join(' // ') || 'no message'}`)
    return null
  }
  await pub.click()
  await p.waitForTimeout(12000)
  const url = p.url()
  const shown = await messagesOnScreen(p)
  const published = /launch-kit|\/dashboard\/events\//.test(url) && !shown.some((s) => /could not|refused|failed/i.test(s))
  verdict(`${label}: the event published`, published, `${url.replace(BASE, '')} ${shown.join(' // ')}`)
  await describe(j, p, `${label}: after publish`)
  const eventId = url.match(/\/dashboard\/events\/([0-9a-f-]{36})/)?.[1] ?? null
  const slug = await p.evaluate(() => {
    const skip = new Set(['create', 'browse', 'map', 'search'])
    for (const a of document.querySelectorAll('a[href]')) {
      const m = a.getAttribute('href')?.match(/^(?:https?:\/\/[^/]+)?\/events\/([a-z0-9-]+)\/?$/)
      if (m && !skip.has(m[1])) return m[1]
    }
    return null
  })
  return { url, eventId, slug }
}

async function rowFor(eventId) {
  if (!db || !eventId) return null
  const { data } = await db
    .from('events')
    .select('slug, summary, venue_name, venue_address, venue_latitude, venue_longitude, venue_place_id, venue_geocode_source, venue_geocoded_at')
    .eq('id', eventId)
    .maybeSingle()
  return data ?? null
}

try {
  const ctx = await browser.newContext({ viewport, locale: 'en-AU' })
  await ctx.route('https://maps.googleapis.com/maps/api/js**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: MAPS_JS_STUB }),
  )
  const p = await ctx.newPage()
  await attach(j, p)
  note(j, 'Mode', MODE)

  await signUpAndConfirm(j, p, ORGANISER)

  // ── 1. The pick ────────────────────────────────────────────────────────────
  await wizardToLocation(p, TITLE, 'A night at the Forum, then an edit.')
  const finder = p.getByLabel(/^find the venue/i).first()
  verdict('the location step offers a venue finder', (await finder.count()) > 0)
  let picked = false
  if (await finder.count()) {
    await finder.fill('Forum Melb')
    await p.waitForTimeout(2500)
    const options = p.locator('[role="listbox"] [role="option"]')
    const optionCount = await options.count()
    verdict('typing a venue opens a list of suggestions (STUBBED PLACES)', optionCount > 0, `${optionCount} option(s)`)
    if (optionCount > 0) {
      await finder.press('ArrowDown')
      await finder.press('ArrowUp')
      await finder.press('Enter')
      await p.waitForTimeout(2000)
      const name = await p.getByLabel(/^venue name/i).first().inputValue()
      const address = await p.getByLabel(/^address/i).first().inputValue()
      verdict('the pick fills the venue and the address', name === 'Forum Melbourne' && address === '154 Flinders Street', `${name} | ${address}`)
      verdict('the map preview card appears once the pick has coordinates', (await p.locator('[data-testid="venue-map-preview"]').count()) > 0)
      await describe(j, p, 'Create: address filled from the pick, with the map preview')
      picked = true
    }
  }
  if (!picked) throw new Error('the pick did not happen, so there is no round trip to prove')

  const one = await finishAndPublish(p, 'the pick')
  run.eventId = one?.eventId ?? null
  run.slug = one?.slug ?? null
  const rowOne = await rowFor(one?.eventId)
  verdict(
    'the row on TEST carries source places (the enum) and a geocoded time',
    Boolean(rowOne) && rowOne.venue_geocode_source === 'places' && typeof rowOne.venue_geocoded_at === 'string' && typeof rowOne.venue_latitude === 'number',
    rowOne ? `${rowOne.venue_geocode_source} at ${rowOne.venue_geocoded_at} (${rowOne.venue_latitude}, ${rowOne.venue_longitude})` : 'no row',
  )

  // ── 2. The database refuses a stray value ─────────────────────────────────
  if (db && one?.eventId) {
    const { error } = await db.from('events').update({ venue_geocode_source: 'bogus' }).eq('id', one.eventId)
    const rowAfter = await rowFor(one.eventId)
    verdict(
      'Postgres refuses a value outside places, geocoding and manual (22P02) and the row still reads places',
      Boolean(error) && /invalid input value for enum venue_geocode_source/i.test(error.message ?? '') && rowAfter?.venue_geocode_source === 'places',
      error ? `${error.code ?? ''} ${error.message}` : 'the update was ACCEPTED, so the column is not the enum',
    )
  }

  // ── 3. The edit page hands the pick back to the form ──────────────────────
  if (one?.eventId) {
    const editRes = await p.goto(`${BASE}/dashboard/events/${one.eventId}/edit`, { waitUntil: 'networkidle', timeout: 60000 })
    await p.waitForTimeout(3000)
    verdict('the edit page resolves for the organiser', editRes?.status() === 200 && /Edit Event/i.test(await textOnPage(p)), `status ${editRes?.status()}`)
    await describe(j, p, 'Edit: the first step of the event')
    for (let i = 0; i < 2; i += 1) {
      await clickText(p, 'Continue')
      await p.waitForTimeout(2500)
    }
    const heading = await stepHeading(p)
    verdict('walking Continue twice reaches the Location step in edit mode', /Location/i.test(heading), heading)
    const name = await p.getByLabel(/^venue name/i).first().inputValue().catch(() => '')
    const address = await p.getByLabel(/^address/i).first().inputValue().catch(() => '')
    const preview = await p.locator('[data-testid="venue-map-preview"]').count()
    verdict(
      'the edit form carries the picked venue, its address and the map preview (the enum value came back through the form)',
      name === 'Forum Melbourne' && address === '154 Flinders Street' && preview > 0,
      `${name} | ${address} | preview=${preview}`,
    )
    await describe(j, p, 'Edit: the Location step with the pick and the map preview')

    // ── 4. Save Changes writes the enum value back unchanged ────────────────
    let saved = false
    for (let i = 0; i < 6; i += 1) {
      if (await p.$('button:has-text("Save Changes")')) { saved = true; break }
      if (!(await clickText(p, 'Continue'))) break
      await p.waitForTimeout(2500)
      const shown = await messagesOnScreen(p)
      if (shown.some((s) => /still uploading/i.test(s))) await p.waitForTimeout(3000)
    }
    verdict('the Review step offers Save Changes', saved, await stepHeading(p))
    if (saved) {
      await clickText(p, 'Save Changes')
      await p.waitForTimeout(8000)
      const shown = await messagesOnScreen(p)
      await describe(j, p, 'Edit: after Save Changes')
      const rowTwo = await rowFor(one.eventId)
      verdict(
        'after the save the row still carries places and the same coordinates',
        Boolean(rowTwo) && rowTwo.venue_geocode_source === 'places' && rowTwo.venue_latitude === rowOne?.venue_latitude && rowTwo.venue_longitude === rowOne?.venue_longitude && !shown.some((s) => /could not|refused|failed/i.test(s)),
        rowTwo ? `${rowTwo.venue_geocode_source} (${rowTwo.venue_latitude}, ${rowTwo.venue_longitude}) ${shown.join(' // ')}` : 'no row',
      )
    }
  }

  if (one?.slug) {
    const eventRes = await p.goto(`${BASE}/events/${one.slug}`, { waitUntil: 'networkidle', timeout: 60000 })
    verdict('the public event page still resolves with the venue', eventRes?.status() === 200 && (await textOnPage(p)).includes('Forum Melbourne'), `status ${eventRes?.status()}`)
    await describe(j, p, 'The public event page after the edit')
  }

  await ctx.close()
} catch (err) {
  j.blockers.push(`journey stopped: ${err instanceof Error ? err.message : String(err)}`)
} finally {
  const passed = results.filter((r) => r.ok).length
  note(j, 'Verdicts', `${passed} of ${results.length} passed (${MODE})`)
  if (process.env.EVIDENCE_DIR) {
    const dest = join(process.env.EVIDENCE_DIR, `${viewportLabel}-stubbed`)
    mkdirSync(dest, { recursive: true })
    for (const f of readdirSync(j.OUT)) copyFileSync(join(j.OUT, f), join(dest, f))
    run.verdicts = results
    writeFileSync(join(dest, 'run.json'), JSON.stringify(run, null, 2))
    note(j, 'Evidence copied', dest)
  }
  await finish(j, browser)
  if (!existsSync(j.OUT)) process.exit(1)
  process.exit(results.some((r) => !r.ok) || j.blockers.length > 0 ? 1 : 0)
}
