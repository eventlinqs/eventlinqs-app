/**
 * A3, SCOPE v5 3.1.1: THE VENUE FINDER, THE COORDINATES, THE MAP.
 *
 * One organiser, through the real wizard on a local production server against
 * TEST, at the viewport JOURNEY_VIEWPORT names (desktop-1440, tablet-768,
 * mobile-390). Two events:
 *
 *   1. THE PICK. Types "Forum Melb" into the venue finder, picks the suggestion
 *      with the keyboard, and every address field fills itself; the map preview
 *      card appears; the event publishes; the row on TEST carries the
 *      coordinates, the place id, source 'places', city_primary 'melbourne'
 *      and a suburb; the event page carries the map with those coordinates;
 *      /city/melbourne carries the event's pin.
 *   2. THE TYPED ADDRESS. No pick: the organiser types the venue and address.
 *      The event publishes with no coordinates, and the server log names why
 *      (server geocoding is off: the browser key stands in for the server key).
 *
 * WHERE GOOGLE IS. The browser key is referer restricted to www.eventlinqs.com.au,
 * so from a local server the real Places library answers "Requests from referer
 * ... are blocked" (C:\dev\EVIDENCE\A3-places-js-probe-20260904.txt). Two modes:
 *
 *   JOURNEY_PLACES_STUB unset   the finder is driven against the REAL library and
 *                               is expected to say, in one sentence, that it
 *                               cannot search from this address; event 1 is then
 *                               created by typing, like event 2. This is the
 *                               honest state on a local server today. After the
 *                               founder adds the local referer to the key, this
 *                               same mode drives the real pick.
 *   JOURNEY_PLACES_STUB=1       the Maps JS is served from scripts/journeys/stubs/
 *                               maps-js-stub.mjs, built from Google's real answer
 *                               for "Forum Melbourne". Drives the finder's own UI
 *                               end to end. Printed as STUBBED PLACES on every
 *                               line; NOT the proof of the pick against Google.
 *
 * Usage: powershell -File C:\dev\run-journey.ps1 -Script scripts\journeys\a3-venue-geocoding.mjs
 */
import { copyFileSync, mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
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

const STUB = process.env.JOURNEY_PLACES_STUB === '1'
const MODE = STUB ? 'STUBBED PLACES' : 'REAL PLACES'
const j = makeJourney('a3-venue-geocoding', `A3: the venue finder, the coordinates, the map (${MODE})`)
const stamp = process.env.RUN_STAMP ?? String(Date.now()).slice(-6)
const viewportLabel = process.env.JOURNEY_VIEWPORT ?? 'desktop-1440'
const VIEWPORTS = {
  'mobile-390': { width: 390, height: 844 },
  'tablet-768': { width: 768, height: 1024 },
  'desktop-1440': { width: 1440, height: 1000 },
}
const viewport = VIEWPORTS[viewportLabel] ?? VIEWPORTS['desktop-1440']
const ORGANISER = { name: 'Dev Anand', email: `dev.venue.${stamp}@example.com`, password: `Str0ng-${stamp}-Venue!` }
const TITLE_PICK = `Forum Sessions ${stamp}`
const TITLE_TYPED = `Wool Exchange Night ${stamp}`
const SERVER_LOG = process.env.SERVER_LOG ?? '.tmp-serve.log'

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

/** Steps 1 and 2 of the wizard, up to the location step. */
async function wizardToLocation(p, title, summary) {
  await p.goto(`${BASE}/dashboard/events/create`, { waitUntil: 'networkidle', timeout: 60000 })
  await p.waitForTimeout(2500)
  if (await p.$('button:has-text("Continue to event details")')) {
    await fillIf(p, 'input#name, input[name="name"]', `Anand Presents ${stamp}`)
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
    .select('slug, venue_name, venue_address, venue_city, venue_state, venue_postal_code, venue_latitude, venue_longitude, venue_place_id, venue_geocode_source, venue_geocoded_at, city_primary, suburb_primary')
    .eq('id', eventId)
    .maybeSingle()
  return data ?? null
}

try {
  const ctx = await browser.newContext({ viewport, locale: 'en-AU', extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.31' } })
  if (STUB) {
    await ctx.route('https://maps.googleapis.com/maps/api/js**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body: MAPS_JS_STUB }),
    )
  }
  const p = await ctx.newPage()
  await attach(j, p)
  note(j, 'Mode', MODE)

  await signUpAndConfirm(j, p, ORGANISER)

  // ── Event 1: the pick ──────────────────────────────────────────────────────
  await wizardToLocation(p, TITLE_PICK, 'A night at the Forum.')
  const finder = p.getByLabel(/^find the venue/i).first()
  verdict('the location step offers a venue finder', (await finder.count()) > 0)
  await describe(j, p, 'Location step with the venue finder')
  let picked = false
  if (await finder.count()) {
    await finder.fill('Forum Melb')
    await p.waitForTimeout(2500)
    const options = p.locator('[role="listbox"] [role="option"]')
    const optionCount = await options.count()
    const help = (await textOnPage(p)).match(/Venue search is not available[^.]*\./)?.[0] ?? null
    if (STUB) {
      verdict('typing a venue opens a list of suggestions (STUBBED PLACES)', optionCount > 0, `${optionCount} option(s)`)
      await describe(j, p, 'Suggestions open under the finder')
      if (optionCount > 0) {
        // The keyboard path: ArrowDown moves, Enter picks.
        const expanded = await finder.getAttribute('aria-expanded')
        const active = await finder.getAttribute('aria-activedescendant')
        verdict('the finder is a combobox with an active suggestion', expanded === 'true' && Boolean(active), `aria-expanded=${expanded} aria-activedescendant=${active}`)
        await finder.press('ArrowDown')
        await finder.press('ArrowUp')
        await finder.press('Enter')
        await p.waitForTimeout(2000)
        const name = await p.getByLabel(/^venue name/i).first().inputValue()
        const address = await p.getByLabel(/^address/i).first().inputValue()
        const city = await p.getByLabel(/^city/i).first().inputValue()
        const state = await p.getByLabel(/^state/i).first().inputValue()
        const postcode = await p.getByLabel(/^postal code/i).first().inputValue()
        verdict(
          'the pick fills the venue, address, city, state and postcode',
          name === 'Forum Melbourne' && address === '154 Flinders Street' && city === 'Melbourne' && state === 'VIC' && postcode === '3000',
          `${name} | ${address} | ${city} | ${state} | ${postcode}`,
        )
        const preview = p.locator('[data-testid="venue-map-preview"]')
        verdict('the map preview card appears once the pick has coordinates', (await preview.count()) > 0)
        await describe(j, p, 'Address filled from the pick, with the map preview')
        picked = true
      }
    } else {
      verdict(
        'on a blocked origin the finder says so in one sentence and the manual fields stay (REAL PLACES)',
        Boolean(help) && optionCount === 0,
        help ?? `no sentence; ${optionCount} option(s)`,
      )
      await describe(j, p, 'The finder on a blocked origin')
    }
  }
  if (!picked) {
    await fillIf(p, '#venue-name-13', 'Forum Melbourne')
    await fillIf(p, '#address-14', '154 Flinders Street')
    await fillIf(p, '#city-15', 'Melbourne')
    await fillIf(p, '#state-region-16', 'VIC')
    await fillIf(p, '#postal-code-18', '3000')
  }
  const one = await finishAndPublish(p, 'the pick')
  run.slugPick = one?.slug ?? null
  run.eventIdPick = one?.eventId ?? null
  const rowOne = await rowFor(one?.eventId)
  if (picked) {
    verdict(
      'the row on TEST carries the coordinates, the place id and source places',
      Boolean(rowOne) && typeof rowOne.venue_latitude === 'number' && typeof rowOne.venue_longitude === 'number' && Boolean(rowOne.venue_place_id) && rowOne.venue_geocode_source === 'places',
      rowOne ? `${rowOne.venue_latitude}, ${rowOne.venue_longitude} ${rowOne.venue_place_id} ${rowOne.venue_geocode_source}` : 'no row',
    )
    verdict(
      'the city claim and the suburb are resolved from the pick',
      rowOne?.city_primary === 'melbourne' && Boolean(rowOne?.suburb_primary),
      rowOne ? `city_primary=${rowOne.city_primary} suburb_primary=${rowOne.suburb_primary}` : 'no row',
    )
    if (one?.slug) {
      const eventRes = await p.goto(`${BASE}/events/${one.slug}`, { waitUntil: 'networkidle', timeout: 60000 })
      const html = await p.content()
      verdict('the event page resolves and carries the venue map with the stored coordinates', eventRes?.status() === 200 && /-37\.81662/.test(html) && /144\.96957/.test(html), `status ${eventRes?.status()}`)
      await p.evaluate(() => document.querySelector('[class*="aspect-"]')?.scrollIntoView())
      await p.waitForTimeout(1500)
      await describe(j, p, 'Event page with the venue map')
      const cityRes = await p.goto(`${BASE}/city/melbourne`, { waitUntil: 'networkidle', timeout: 90000 })
      const cityHtml = await p.content()
      const hasPin = cityHtml.includes(one.slug) && /-37\.81662/.test(cityHtml)
      verdict('the event appears on its city map (a pin with its coordinates on /city/melbourne)', cityRes?.status() === 200 && hasPin, `status ${cityRes?.status()} slug=${cityHtml.includes(one.slug)} coords=${/-37\.81662/.test(cityHtml)}`)
      await describe(j, p, 'City page carrying the pin')
    }
  } else {
    verdict('a typed address with the server key off saves with no coordinates and the reason is named in the server log', rowOne?.venue_latitude === null && readFileSync(SERVER_LOG, 'utf8').includes('server geocoding is off'), rowOne ? `lat=${rowOne.venue_latitude} source=${rowOne.venue_geocode_source}` : 'no row')
  }

  // ── Event 2: the typed address, no pick ────────────────────────────────────
  await wizardToLocation(p, TITLE_TYPED, 'A night at the Wool Exchange.')
  await fillIf(p, '#venue-name-13', 'The Wool Exchange')
  await fillIf(p, '#address-14', '44 Moorabool Street')
  await fillIf(p, '#city-15', 'Geelong')
  await fillIf(p, '#state-region-16', 'VIC')
  await fillIf(p, '#postal-code-18', '3220')
  await describe(j, p, 'Typed address, no pick')
  const two = await finishAndPublish(p, 'the typed address')
  run.slugTyped = two?.slug ?? null
  const rowTwo = await rowFor(two?.eventId)
  const logHasReason = existsSync(SERVER_LOG) && readFileSync(SERVER_LOG, 'utf8').includes('server geocoding is off')
  verdict(
    'the typed event saves with no coordinates, the city claim from the locality, and the reason named in the server log',
    Boolean(rowTwo) && rowTwo.venue_latitude === null && rowTwo.city_primary === 'geelong' && logHasReason,
    rowTwo ? `lat=${rowTwo.venue_latitude} city_primary=${rowTwo.city_primary} logHasReason=${logHasReason}` : 'no row',
  )
  if (two?.slug) {
    const res = await p.goto(`${BASE}/events/${two.slug}`, { waitUntil: 'networkidle', timeout: 60000 })
    verdict('the typed event page still resolves and offers its venue', res?.status() === 200 && (await textOnPage(p)).includes('The Wool Exchange'), `status ${res?.status()}`)
    await describe(j, p, 'Typed event page')
  }

  await ctx.close()
} catch (err) {
  j.blockers.push(`journey stopped: ${err instanceof Error ? err.message : String(err)}`)
} finally {
  const passed = results.filter((r) => r.ok).length
  note(j, 'Verdicts', `${passed} of ${results.length} passed (${MODE})`)
  if (process.env.EVIDENCE_DIR) {
    const dest = join(process.env.EVIDENCE_DIR, `${viewportLabel}${STUB ? '-stubbed' : ''}`)
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
