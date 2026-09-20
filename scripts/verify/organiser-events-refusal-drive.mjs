/**
 * WHAT AN ORGANISER SEES WHEN THE PLATFORM REFUSES TO PUBLISH THEIR EVENT,
 * FROM THEIR EVENTS LIST, AT 390, 768 AND 1440.
 *
 * ============================================================================
 * THE DEFECT, HANDED OVER WITH A PICTURE RATHER THAN FOUND HERE
 * ============================================================================
 *
 * Lane A's money drive screenshotted it on 21 September 2026
 * (C:\dev\EVIDENCE\MONEY-A8\2026-09-21-run6\mobile-390-5-refused.png) and
 * recorded it in C:\dev\LANE-RETURNS.md as an observation rather than a
 * regression, because nothing about it is new: the events list is a
 * five-column table, the refusal renders inside the ACTIONS column, and at 390
 * a 172-character sentence wraps to FOURTEEN lines of red and pushes Edit,
 * View and Duplicate a screen down.
 *
 * READ THE SCREENSHOT AND IT IS WORSE THAN THE SENTENCE DESCRIBES. The table
 * is wider than the phone, so the row a person is looking at starts at DATE:
 * the event's OWN TITLE is off the left edge. The wall of red is the first and
 * almost only thing on the page, and it does not say which event it is about.
 *
 * AND THE REFUSAL HAS NO DOOR. `checkPublishGate` returns
 * `nextAction: { label: 'Connect Stripe', href: '/dashboard/payouts' }` beside
 * that message, and `publishEvent` carries it through in its ActionResult. The
 * events table's RowActions reads `result.error` and drops `result.nextAction`
 * on the floor, so the organiser is told to connect Stripe by a sentence with
 * nothing to press. That exact defect was already found and fixed ONCE, in
 * src/components/features/events/event-form.tsx, whose own comment says "the
 * caller used to throw it away, so 'Connect Stripe' was advice with no door".
 * The list never inherited the fix.
 *
 * ============================================================================
 * WHAT IT ASSERTS, AND WHY THE THRESHOLDS ARE RATIOS AND NOT PIXELS
 * ============================================================================
 *
 * CLAUSE 1, THE LIST FITS THE PHONE. The list container's scrollWidth must not
 * exceed its clientWidth. A five-column table at 390 fails this; nothing else
 * has to be said about it.
 *
 * CLAUSE 2, THE REFUSAL NAMES ITS EVENT. The title of the event that was
 * refused must be inside the viewport at the moment the refusal is on screen.
 * A refusal a person cannot attribute is not a refusal they can act on.
 *
 * CLAUSE 3, A SENTENCE GETS AT LEAST HALF THE SCREEN. The refusal's rendered
 * width must be at least 60 per cent of the list's own width. That is a RATIO
 * on purpose: "fewer than six lines" would need re-tuning every time the copy
 * or the type scale moved, and this does not. Measured before the fix: 135px
 * of a 390px viewport, 35 per cent, fourteen lines.
 *
 * CLAUSE 4, IT IS ANNOUNCED. `role="alert"`, because a refusal nobody hears is
 * the same defect for a screen-reader user that an off-screen title is for a
 * sighted one. The event form already does this and says why.
 *
 * CLAUSE 5, THE DOOR THE GATE COMPUTED IS OFFERED. A link whose href is the
 * gate's own nextAction must be inside the refusal.
 *
 * CLAUSE 6, THE ACTIONS SURVIVE, AS A ROW. Edit, View and Duplicate must
 * still be visible and at least 44px on their smaller side, and the row's
 * controls must occupy at most two lines. That second half was added after
 * reading a screenshot rather than a report: at 768 the table fitted, passed
 * every other clause, and stacked six actions vertically down a column.
 *
 * CLAUSE 7, THE ANTI-FALSE-PASS. The drive refuses to report a pass unless it
 * performed every check at every width, and the refusal it measures must be
 * the REAL one: the assertion is the publish gate's own sentence, read out of
 * src/lib/events/publish-gate.ts rather than typed here, so a copy change
 * fails this loudly instead of letting it match nothing.
 *
 * TEST ONLY, and it checks twice: assertNotProduction() from the one module
 * that owns that decision, then an explicit TEST-ref check. Every row it
 * creates carries `lane-c` and is removed at the end.
 *
 * Usage:
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     node --env-file=.env.local scripts/verify/organiser-events-refusal-drive.mjs \
 *       --serve --port=3200 --label=before
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { startGateServer, envFor } from '../ops/pre-push-gate.mjs'
import { refuseUnlessThePortIsFree } from './lib/port-is-ours.mjs'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'
import { answerTheCookieBanner } from './lib/cookie-banner.mjs'

assertNotProduction()

const TAG = '[organiser-events-refusal]'
const args = process.argv.slice(2)
const SERVE = args.includes('--serve')
const PORT = Number(args.find((a) => a.startsWith('--port='))?.split('=')[1] ?? 3200)
const LABEL = args.find((a) => a.startsWith('--label='))?.split('=')[1] ?? 'run'
const OUT = process.env.DRIVE_OUT ?? join('C:', 'dev', 'EVIDENCE', 'C8', 'organiser-refusal')
let BASE = args.find((a) => a.startsWith('http')) ?? `http://127.0.0.1:${PORT}`

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !SERVICE) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
if (!/vkapkibzokmfaxqogypq/.test(URL_)) throw new Error(`refusing to write to ${URL_}: this drive runs against TEST only`)

/*
 * THE SENTENCE AND THE DOOR ARE READ OUT OF THE GATE, NEVER TYPED HERE. A copy
 * change should fail this drive with "the refusal never appeared", which is
 * true and actionable, rather than silently matching nothing.
 */
const GATE_SOURCE = readFileSync('src/lib/events/publish-gate.ts', 'utf8')
const REFUSAL = GATE_SOURCE.match(/'(Connect Stripe before publishing[^']*)'/)?.[1]
const DOOR = GATE_SOURCE.match(/nextAction: \{ label: 'Connect Stripe', href: '([^']+)' \}/)?.[1]
if (!REFUSAL || !DOOR) {
  console.error(`${TAG} REFUSING: could not read the refusal and its nextAction out of src/lib/events/publish-gate.ts.`)
  process.exit(1)
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const stamp = Date.now().toString(36)
const created = { userId: null, orgId: null, eventIds: [] }

mkdirSync(OUT, { recursive: true })
const results = []
let failures = 0
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail })
  if (!ok) failures += 1
  console.log(`${TAG} ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`)
}
function must(res, what) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data
}

const VIEWPORTS = [
  { label: '390', width: 390, height: 844 },
  { label: '768', width: 768, height: 1024 },
  { label: '1440', width: 1440, height: 900 },
]

let stopServer = null
try {
  /* ----------------------------------------------------------------------
   * The fixture: an organiser who cannot be paid, with a paid draft event
   * that is otherwise ready. Every earlier clause of the publish gate has to
   * be satisfied (a real cover, a venue, a future end date) or it refuses for
   * a different reason and this drive measures the wrong sentence.
   * -------------------------------------------------------------------- */
  const password = randomBytes(12).toString('base64url') + '-Aa1'
  const email = `lane-c-refusal-${stamp}@eventlinqs.test`
  const owner = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), 'create the organiser').user
  created.userId = owner.id

  // `pending`, so nothing here is published into a sitemap three lanes read
  // (scripts/guards/fixtures-are-not-published.mjs). NO stripe_account_id: that
  // absence is the whole subject.
  const org = must(
    await admin
      .from('organisations')
      .insert({ name: `Lane C Refusal ${stamp}`, slug: `lane-c-refusal-${stamp}`, owner_id: owner.id, status: 'pending' })
      .select('id')
      .single(),
    'create the organisation',
  )
  created.orgId = org.id

  const start = new Date(Date.now() + 21 * 864e5).toISOString()
  const end = new Date(Date.now() + 21 * 864e5 + 3 * 36e5).toISOString()
  const title = `Lane C Refusal Night ${stamp}`
  const event = must(
    await admin
      .from('events')
      .insert({
        title,
        slug: `lane-c-refusal-night-${stamp}`,
        organisation_id: org.id,
        created_by: owner.id,
        start_date: start,
        end_date: end,
        timezone: 'Australia/Melbourne',
        status: 'draft',
        visibility: 'unlisted',
        is_free: false,
        cover_image_url: 'https://vkapkibzokmfaxqogypq.supabase.co/storage/v1/object/public/event-images/proof/cover.jpg',
        venue_name: 'The Wool Exchange',
        venue_address: '44 Moorabool Street',
        venue_city: 'Geelong',
      })
      .select('id, slug, title')
      .single(),
    'create the paid draft event',
  )
  created.eventIds.push(event.id)
  must(
    await admin
      .from('ticket_tiers')
      .insert({ event_id: event.id, name: 'General admission', total_capacity: 10, price: 4500, currency: 'AUD', tier_type: 'general_admission', is_active: true, is_visible: true })
      .select('id')
      .single(),
    'create the paid tier',
  )

  /* ----------------------------------------------------------------------
   * The server.
   * -------------------------------------------------------------------- */
  if (SERVE) {
    await refuseUnlessThePortIsFree(PORT, 'before the refusal drive server was started', 'pass --port= for one this lane owns')
    mkdirSync('.tmp', { recursive: true })
    const started = await startGateServer(envFor('local'), `.tmp/organiser-refusal-server-${LABEL}.log`, { port: PORT })
    if (started.error) throw new Error(`could not serve the build: ${started.error}`)
    BASE = started.base
    stopServer = started.stop
    console.log(`${TAG} serving the production build on ${BASE}`)
  }

  const browser = await chromium.launch()
  const measurements = []
  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        isMobile: vp.width < 768,
        hasTouch: vp.width < 768,
      })
      const page = await context.newPage()

      await page.goto(`${BASE}/login`, { waitUntil: 'load' })
      await answerTheCookieBanner(page)
      await page.fill('input[name="email"]', email)
      await page.fill('input[name="password"]', password)
      await page.click('button[type="submit"]')
      await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 })

      await page.goto(`${BASE}/dashboard/events`, { waitUntil: 'load' })
      await answerTheCookieBanner(page)
      const row = page.getByText(title, { exact: false }).first()
      await row.waitFor({ state: 'attached', timeout: 30000 })

      /*
       * CLAUSE 1. The list must fit the phone. Measured on the element that
       * actually scrolls, found by walking up from the event's own title until
       * an ancestor has a horizontal overflow, so this cannot be pointed at the
       * wrong box by a markup change.
       */
      const fit = await row.evaluate((el) => {
        let node = el
        while (node && node !== document.body) {
          const style = getComputedStyle(node)
          if (/(auto|scroll)/.test(style.overflowX) || node.scrollWidth > node.clientWidth + 1) {
            return {
              tag: node.tagName.toLowerCase(),
              overflowX: style.overflowX,
              clientWidth: node.clientWidth,
              scrollWidth: node.scrollWidth,
            }
          }
          node = node.parentElement
        }
        return { tag: 'none', overflowX: 'visible', clientWidth: document.body.clientWidth, scrollWidth: document.body.scrollWidth }
      })

      /*
       * THE DENOMINATOR IS THE LIST, NOT THE DOCUMENT, AND THAT WAS WRONG ONCE.
       *
       * Clause 3 asks what SHARE of the list a sentence gets, so it needs the
       * list's own width. The first version reused the scrolling ancestor's
       * clientWidth, and when the rebuild removed the scroller that fell back to
       * `document.body`, which on this screen includes a 240px fixed sidebar. At
       * 768 the refusal filled its list completely and was reported at 58 per
       * cent of the BODY, so a drive accused a fixed surface of the defect it
       * had just fixed. The table is the list, at every width.
       */
      const listWidth = await row.evaluate((el) => {
        const table = el.closest('table')
        return Math.round((table ?? el.closest('div') ?? document.body).getBoundingClientRect().width)
      })
      check(
        `${vp.label} the events list fits its own width`,
        fit.scrollWidth <= fit.clientWidth + 1,
        `${fit.tag} clientWidth ${fit.clientWidth}, scrollWidth ${fit.scrollWidth}, overflow-x ${fit.overflowX}`,
      )

      // Press Publish on that row. The button is found through the row's own
      // container so a second event could never be the one published.
      const publish = page.getByRole('button', { name: /^publish$/i }).first()
      await publish.waitFor({ state: 'visible', timeout: 30000 })
      await publish.click()

      const refusal = page.getByText(REFUSAL, { exact: false }).first()
      await refusal.waitFor({ state: 'visible', timeout: 30000 })

      const box = await refusal.boundingBox()
      check(
        `${vp.label} the refusal gets at least 60 per cent of the list's width`,
        Boolean(box) && box.width >= listWidth * 0.6,
        `${Math.round(box?.width ?? 0)}px of ${listWidth}px (${Math.round(((box?.width ?? 0) / listWidth) * 100)} per cent), ${Math.round(box?.height ?? 0)}px tall`,
      )

      // CLAUSE 2. The refusal names its event: the title is on screen with it.
      const titleBox = await page.getByText(title, { exact: false }).first().boundingBox()
      check(
        `${vp.label} the refused event's title is on screen with the refusal`,
        Boolean(titleBox) && titleBox.x >= -1 && titleBox.x + titleBox.width <= vp.width + 1,
        titleBox ? `x ${Math.round(titleBox.x)} to ${Math.round(titleBox.x + titleBox.width)} of ${vp.width}` : 'no title box',
      )

      // CLAUSE 4. Announced.
      const announced = await refusal.evaluate((el) => Boolean(el.closest('[role="alert"]')))
      check(`${vp.label} the refusal is announced with role=alert`, announced, announced ? 'role=alert' : 'no role=alert ancestor')

      // CLAUSE 5. The door the gate computed.
      const door = await refusal.evaluate((el, href) => {
        const alert = el.closest('[role="alert"]') ?? el.parentElement
        const link = alert?.querySelector(`a[href="${href}"]`)
        return link ? link.textContent?.trim() ?? '' : null
      }, DOOR)
      check(`${vp.label} the refusal offers the door the gate computed`, typeof door === 'string' && door.length > 0, door ? `${door} -> ${DOOR}` : `no a[href="${DOOR}"] in the refusal`)

      // CLAUSE 6. The actions survive, visible and at least 44px.
      const actions = []
      for (const name of ['Edit', 'View', 'Duplicate']) {
        const control = page.getByRole(name === 'Duplicate' ? 'button' : 'link', { name: new RegExp(`^${name}$`, 'i') }).first()
        const visible = await control.isVisible().catch(() => false)
        const b = visible ? await control.boundingBox() : null
        actions.push({ name, visible, width: Math.round(b?.width ?? 0), height: Math.round(b?.height ?? 0), top: Math.round(b?.y ?? 0) })
      }
      check(
        `${vp.label} Edit, View and Duplicate are still offered at 44px`,
        actions.every((a) => a.visible && Math.min(a.width, a.height) >= 44),
        actions.map((a) => `${a.name} ${a.visible ? `${a.width}x${a.height}` : 'hidden'}`).join(', '),
      )

      /*
       * CLAUSE 6b. THE ACTIONS ARE A ROW, NOT A COLUMN.
       *
       * Added after reading the 768 screenshot rather than the 768 report. The
       * first version of this rebuild switched to cards at `md`, and 768 passed
       * every clause above while rendering the table inside 478px of content
       * (this list sits behind a 240px fixed sidebar): the title wrapped over
       * four lines, "0 / 10" broke in two, and the six actions stacked
       * VERTICALLY down the ACTIONS column at 44px each, about 300px of row.
       *
       * Counted as distinct `top` values among every control in the row, which
       * needs no threshold: six controls on six lines is a column.
       */
      const actionLines = await page.evaluate(() => {
        const controls = [...document.querySelectorAll('a, button')].filter((el) => {
          const text = el.textContent?.trim() ?? ''
          return ['Edit', 'View', 'Duplicate', 'Publish', 'Archive', 'Delete'].includes(text)
        })
        const tops = new Set(controls.map((el) => Math.round(el.getBoundingClientRect().top)))
        return { controls: controls.length, lines: tops.size }
      })
      check(
        `${vp.label} the row's actions read as a row and not a column`,
        actionLines.controls > 0 && actionLines.lines <= 2,
        `${actionLines.controls} control(s) on ${actionLines.lines} line(s)`,
      )

      measurements.push({ viewport: vp.label, fit, listWidth, refusal: box, title: titleBox, announced, door, actions })
      await page.screenshot({ path: join(OUT, `${LABEL}-${vp.label}-refused.png`), fullPage: false })
      await context.close()
    }
  } finally {
    await browser.close()
  }

  // CLAUSE 7. A drive that measured nothing is not a drive that passed.
  const EXPECTED = VIEWPORTS.length * 7
  if (results.length < EXPECTED) {
    check('the drive performed every check it set out to perform', false, `${results.length} checks, expected ${EXPECTED}`)
  }
  writeFileSync(join(OUT, `organiser-refusal-${LABEL}.json`), JSON.stringify({ base: BASE, stamp, refusal: REFUSAL, door: DOOR, measurements, results }, null, 2))
} finally {
  if (stopServer) await stopServer()
  try {
    for (const id of created.eventIds) {
      const r = await admin.from('events').delete().eq('id', id)
      if (r.error) console.error(`${TAG} cleanup: could not delete event ${id}: ${r.error.message}`)
    }
    await admin.from('event_tombstones').delete().like('slug', `lane-c-refusal-%-${stamp}`)
    if (created.orgId) await admin.from('organisations').delete().eq('id', created.orgId)
    if (created.userId) await tearDownAccountOrFailTheRun(admin, created.userId)
  } catch (error) {
    console.error(`${TAG} cleanup failed: ${error.message}`)
  }
}

if (failures) {
  console.error(`${TAG} FAIL - ${failures} of ${results.length}`)
  process.exit(1)
}
console.log(`${TAG} PASS - ${results.length} of ${results.length}`)
