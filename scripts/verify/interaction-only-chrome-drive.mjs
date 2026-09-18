/**
 * THE DEFERRED CHROME IS NOT FETCHED ON LOAD, AND IS FETCHED ON THE ACTION,
 * ASKED OF A REAL BROWSER AT 390, 768 AND 1440.
 *
 * ============================================================================
 * WHY THIS EXISTS BESIDE THE GUARD, THE TESTS AND THE BUDGET TABLE
 * ============================================================================
 *
 * Three other things already hold part of this change and not one of them can
 * see a browser:
 *
 *   scripts/guards/interaction-only-chrome-is-split.mjs   reads source text. It
 *     proves no static import reaches these modules. It cannot prove the bundler
 *     acted on that, and it cannot prove a visitor never pays.
 *   tests/component/layout/interaction-only-chrome.test.tsx   runs the
 *     components in jsdom. It proves the surfaces still work and that the import
 *     resolves asynchronously. jsdom has no network, so it cannot see a fetch.
 *   scripts/perf/first-load-budget.mjs   weighs the build output. It proves the
 *     chunk lists shrank. A chunk list is a manifest, and a manifest is an
 *     intention: what a browser actually requests is a different question, and
 *     this repository has already been caught by that difference once (the
 *     legacy polyfill bundle is real bytes in the document that no modern
 *     browser ever fetches).
 *
 * So this asks the only source that can settle it. It records every JavaScript
 * chunk the browser fetches, splits them at the moment of the interaction, and
 * asserts by CONTENT rather than by file name, because the names are hashed and
 * a drive that matched a hash would go stale on the next build and pass by
 * matching nothing.
 *
 * ============================================================================
 * WHAT WOULD MAKE THIS DRIVE LIE, and what is done about each
 * ============================================================================
 *
 *   A MARKER THAT MATCHES NOTHING passes vacuously: no chunk on load contains
 *   it, assertion satisfied, and the deferral was never tested. So every marker
 *   must be FOUND after the interaction before its absence before the
 *   interaction is allowed to mean anything. An absence that is never turned
 *   into a presence is reported as a FAULT, not a pass.
 *
 *   A SERVER SOMEBODY ELSE STARTED would be measuring another lane's build.
 *   This machine runs three. The base URL is checked for a build id that
 *   matches this tree's .next/BUILD_ID before anything is asserted.
 *
 * Run: node scripts/verify/interaction-only-chrome-drive.mjs [baseUrl]
 *
 * ============================================================================
 * --functional-only, AND WHY IT IS NOT A SOFTER VERSION OF THIS DRIVE
 * ============================================================================
 *
 * The chunk assertions above need a PRODUCTION build, and on this machine the
 * build belongs to one lane, so a lane that has only `next dev` running cannot
 * make them. `--functional-only` runs the half that a dev server CAN answer
 * honestly - the surfaces open, they close, and nothing overflows at 390 - and
 * REFUSES to make the deferral claim at all.
 *
 * That refusal is not caution, it is correctness. Measured against the dev
 * server on 19 September 2026: `next dev` serves
 * `src_components_analytics_measurement-stack_tsx_*.js` on the homepage, and
 * that module is lane A's deliberately deferred measurement tree. Dev compiles
 * and ships eagerly, so the "in none of the chunks fetched on load" assertion
 * would report a FAULT against code that is correctly deferred in the build
 * anybody deploys. A drive that ran it in dev would not be weaker, it would be
 * WRONG.
 *
 * The mode still proves the server is this worktree's, by a different route:
 * dev chunks are unminified, so a source identifier this lane has and the
 * others do not is visible in what the server actually serves.
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { catalogueWeight } from '../perf/lib/document-weight.mjs'
import { CATALOGUES } from '../perf/lib/catalogues.mjs'

const args = process.argv.slice(2)
const FUNCTIONAL_ONLY = args.includes('--functional-only')
const BASE = args.find(a => !a.startsWith('--')) || 'http://localhost:3200'

/**
 * An identifier that exists in THIS worktree and not in the other lanes'.
 *
 * It stands in for the build-id probe when there is no build to probe. It is a
 * source identifier rather than copy on purpose: `next dev` does not minify, so
 * it survives into the served chunk verbatim, and it is checked for PRESENCE in
 * something the server actually sent rather than read off disk.
 */
const WORKTREE_MARKER = 'useDeferredComponent'
const OUT = 'C:/dev/EVIDENCE/C8-SHELL/driven'
const TAG = '[interaction-only-chrome-drive]'

/**
 * A string that appears in the deferred module and NOWHERE in the shell.
 *
 * Both are user-visible copy rather than an identifier, because copy survives
 * minification unchanged and an identifier does not.
 */
const SURFACES = [
  {
    name: 'the global search overlay',
    marker: 'What are you looking for?',
    fallbackMarkers: ['search_overlay_opened', 'header-search-suggestions'],
  },
  {
    name: 'the city dialog',
    marker: 'Choose your city',
    fallbackMarkers: ['location-picker-title', 'Use my current location'],
  },
]

const VIEWPORTS = [
  { label: '390', width: 390, height: 844 },
  { label: '768', width: 768, height: 1024 },
  { label: '1440', width: 1440, height: 900 },
]

/**
 * THE ENDPOINT THE CITY DIALOG'S DATA NOW COMES FROM (close-out C8B.3).
 *
 * Splitting the dialog's CODE did nothing for its DATA: the catalogue was a
 * prop, and a prop crossing the server/client boundary is serialised into the
 * document whether the component reading it ever mounts or not. 6,988 bytes on
 * every page of the platform, twice, 7.29 percent of the login document.
 *
 * The two assertions below are the pair that means something together and
 * nothing apart: the catalogue is NOT in the served document, and the request
 * for it happens ON THE INTERACTION. Absence alone is satisfied by deleting the
 * feature; a request alone is satisfied by fetching it on mount, which moves the
 * cost rather than removing it (close-out C8B.4).
 */
const CITY_CATALOGUE_ENDPOINT = '/api/location/cities'

/**
 * Served documents swept for a catalogue. `/login` and `/events` are here
 * because they are DYNAMIC: no prerendered file exists for them, so
 * scripts/guards/no-catalogue-in-every-document.mjs cannot weigh them and only a
 * request can. `/login` is the one the cost table found this on.
 */
const DOCUMENT_SWEEP = ['/', '/login', '/events', '/pricing']

/**
 * Is this control somewhere a finger or a pointer could actually land?
 *
 * BOTH AXES, and that is not pedantry. Measured against the running server at
 * 390: the location trigger sits at x 406 of a 390-wide viewport while the
 * navigation sheet is shut and at x 22 once it is open, at y 88 in both cases.
 * A check that asked about `y` alone answered "reachable" for a control that is
 * off the right-hand edge, the sheet was never opened, and Playwright spent
 * thirty seconds refusing to click something "outside of the viewport". A
 * harness that cannot tell reachable from present reports the product broken.
 *
 * `page` is taken but unused deliberately: it keeps the call sites reading as a
 * question about a page rather than about a locator in the abstract, and it is
 * the seam if this ever has to account for a fixed overlay covering the control.
 */
async function reachableTrigger(page, locator, viewport) {
  if (await locator.count() === 0) return false
  const box = await locator.boundingBox()
  if (box === null) return false
  return box.x >= 0 && box.x < viewport.width && box.y >= 0 && box.y < viewport.height
}

const faults = []
const notes = []
let assertionsMade = 0

function check(ok, message) {
  assertionsMade += 1
  if (ok) console.log(`${TAG}   ok    ${message}`)
  else {
    console.log(`${TAG}   FAULT ${message}`)
    faults.push(message)
  }
}

/** Which of a surface's markers a body carries, if any. */
function markersIn(body, surface) {
  const all = [surface.marker, ...surface.fallbackMarkers]
  return all.filter(m => body.includes(m))
}

async function main() {
  mkdirSync(OUT, { recursive: true })

  // THE SERVER MUST BE THIS TREE'S BUILD. Three lanes run on this machine and a
  // drive that measures another lane's server reports a fault that belongs to
  // the machine (see scripts/verify/lib/port-is-ours.mjs for the incident).
  if (FUNCTIONAL_ONLY) {
    console.log(`${TAG} ====================================================================`)
    console.log(`${TAG} FUNCTIONAL ONLY. The chunk assertions are NOT RUN and NOTHING in this`)
    console.log(`${TAG} run says the chrome is deferred. dev serves deferred modules eagerly,`)
    console.log(`${TAG} so running them here would report a fault against correct code.`)
    console.log(`${TAG} What IS asserted: the surfaces open, they close, and nothing overflows.`)
    console.log(`${TAG} ====================================================================`)
    const html = await fetch(BASE).then(r => r.text()).catch(() => '')
    const chunkUrls = [...html.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map(m => m[0])
    let served = false
    for (const u of chunkUrls) {
      const body = await fetch(`${BASE}${u}`).then(r => r.text()).catch(() => '')
      if (body.includes(WORKTREE_MARKER)) { served = true; break }
    }
    if (!served) {
      console.error(`${TAG} none of the ${chunkUrls.length} chunk(s) on ${BASE} contains ${WORKTREE_MARKER}.`)
      console.error(`${TAG} whatever is on ${BASE} is not this worktree's tree, and this machine runs`)
      console.error(`${TAG} three lanes. Nothing is asserted against somebody else's server.`)
      process.exit(1)
    }
    console.log(`${TAG} ${BASE} is serving this worktree's source (${WORKTREE_MARKER} found in a served chunk)`)
  }

  const localBuildId = existsSync('.next/BUILD_ID') ? readFileSync('.next/BUILD_ID', 'utf8').trim() : null
  if (!FUNCTIONAL_ONLY && !localBuildId) {
    console.error(`${TAG} no .next/BUILD_ID in this worktree. Build before driving,`)
    console.error(`${TAG} or run with --functional-only to drive the half a dev server can answer.`)
    process.exit(1)
  }

  /*
   * ASK THE SERVER FOR AN ASSET ONLY THIS BUILD HAS.
   *
   * The first version of this check read `__NEXT_DATA__` for the build id. That
   * is a PAGES ROUTER element and this application is App Router, so the element
   * is not in the document, the id read back as null, and the check quietly
   * skipped itself: a guard against measuring another lane's server that would
   * have passed no matter whose server answered.
   *
   * `/_next/static/<buildId>/_ssgManifest.js` is served by the build that
   * produced that id and by no other. Verified both ways against the running
   * server before this was relied on: this tree's id answers 200, and an id that
   * is not a build answers 404.
   */
  const probe = FUNCTIONAL_ONLY ? null : `${BASE}/_next/static/${localBuildId}/_ssgManifest.js`
  const probeStatus = probe === null ? 200 : await fetch(probe).then(r => r.status).catch(() => 0)
  if (!FUNCTIONAL_ONLY && probeStatus !== 200) {
    console.error(`${TAG} ${probe} answered ${probeStatus}, not 200.`)
    console.error(`${TAG} whatever is on ${BASE} is not this tree's build (${localBuildId}), and this machine`)
    console.error(`${TAG} runs three lanes. Nothing is asserted against somebody else's server.`)
    process.exit(1)
  }
  if (!FUNCTIONAL_ONLY) console.log(`${TAG} the server on ${BASE} is serving this tree's build ${localBuildId}`)

  /*
   * ---- THE CATALOGUE IS NOT IN THE SERVED DOCUMENT ----
   *
   * Asked of the SERVER rather than of the browser, and once rather than per
   * viewport, because what a document contains does not depend on how wide the
   * window is. It runs in --functional-only too: a prop is serialised by the
   * server in dev exactly as it is in a build, so this half is answerable there.
   */
  for (const path of DOCUMENT_SWEEP) {
    const res = await fetch(`${BASE}${path}`, { headers: { 'user-agent': TAG } }).catch(() => null)
    if (res === null || !res.ok) {
      check(false, `the document sweep could not read ${path} (${res ? res.status : 'no response'})`)
      continue
    }
    const html = await res.text()
    for (const catalogue of CATALOGUES) {
      const weight = catalogueWeight(html, { marker: catalogue.marker, arrayKeys: catalogue.arrayKeys })
      check(
        weight.bytes === 0,
        `${path}: the "${catalogue.name}" catalogue is not in the served document (${weight.bytes} B, ` +
          `${weight.rows} row(s), ${weight.copies} copy(ies) of ${html.length} B)`,
      )
    }
  }

  const browser = await chromium.launch()
  try {
    for (const vp of VIEWPORTS) {
      console.log(`${TAG} ${vp.width}x${vp.height}`)
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
      const page = await context.newPage()

      /** Every request for the city catalogue this page made, in order. */
      const catalogueRequests = []
      page.on('request', req => {
        if (req.url().includes(CITY_CATALOGUE_ENDPOINT)) catalogueRequests.push(req.url())
      })

      /** name -> body, for every JavaScript chunk this page actually fetched. */
      const fetched = new Map()
      page.on('response', async res => {
        const url = res.url()
        if (!url.includes('/_next/static/') || !url.endsWith('.js')) return
        try {
          fetched.set(url, await res.text())
        } catch {
          // A response whose body is gone by the time it is asked for is not a
          // fault in the product. It is recorded as unread rather than counted
          // as absent, because counting it as absent would be the vacuous pass
          // this drive exists to refuse.
          fetched.set(url, null)
        }
      })

      await page.goto(BASE, { waitUntil: 'networkidle' })

      const unread = [...fetched.values()].filter(v => v === null).length
      if (unread > 0) notes.push(`${vp.label}: ${unread} chunk body/bodies could not be read`)

      // ---- ON LOAD: neither surface may be in anything the browser fetched ----
      const onLoad = [...fetched.entries()]
      for (const surface of SURFACES) {
        // Skipped in FUNCTIONAL_ONLY: dev ships deferred modules eagerly, so this
        // would fault on code the build defers correctly. See the header.
        if (FUNCTIONAL_ONLY) continue
        const carriers = onLoad.filter(([, body]) => body && markersIn(body, surface).length > 0)
        check(
          carriers.length === 0,
          `${vp.label}: ${surface.name} is in none of the ${onLoad.length} chunk(s) fetched on load` +
            (carriers.length ? ` (found in ${carriers.map(([u]) => u.split('/').pop()).join(', ')})` : ''),
        )
      }

      // ---- THE CATALOGUE IS NOT REQUESTED ON LOAD ----
      // Half of a pair. On its own it is satisfied by a dialog with no cities in
      // it, so the other half is asserted after the click below and a run that
      // never reaches it is reported as a fault there.
      check(
        catalogueRequests.length === 0,
        `${vp.label}: the city catalogue is not requested on load (${catalogueRequests.length} request(s) to ${CITY_CATALOGUE_ENDPOINT})`,
      )

      const loadedUrls = new Set(fetched.keys())
      await page.screenshot({ path: join(OUT, `shell-${vp.label}.png`), fullPage: false })

      // ---- NO HORIZONTAL OVERFLOW, the 390 clause and worth asking everywhere ----
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      check(overflow <= 0, `${vp.label}: no horizontal overflow (scrollWidth - clientWidth = ${overflow})`)

      // ---- THE SEARCH OVERLAY, opened the way a visitor opens it ----
      /*
       * AT 1440 THERE IS NO SEARCH TRIGGER UNTIL THE PAGE IS SCROLLED, and that
       * is the design rather than a defect. Read out of
       * src/components/layout/site-header-client.tsx: the desktop pill is
       * `hidden xl:flex` and carries `inert` plus `aria-hidden` until the header
       * reaches State B, which use-header-scroll-state.ts sets when the sentinel
       * leaves the viewport; the mobile icon beside it is `xl:hidden`, so above
       * the xl breakpoint neither is reachable at the top of the page.
       *
       * The first version of this drive did not know that and reported "no
       * visible Open search trigger" at 1440 as a fault, which would have sent
       * somebody looking for a broken header. So it scrolls, the way a visitor
       * does, and only calls it a fault if the trigger is still not there.
       */
      let searchTrigger = page.getByRole('button', { name: 'Open search' }).first()
      if (!(await reachableTrigger(page, searchTrigger, vp))) {
        await page.mouse.wheel(0, 600)
        await page.waitForTimeout(700)
        searchTrigger = page.getByRole('button', { name: 'Open search' }).first()
        notes.push(`${vp.label}: the search trigger appears in header State B, so the page was scrolled first`)
      }
      if (await reachableTrigger(page, searchTrigger, vp)) {
        // Snapshot at the CLICK, not at load: a scroll may have pulled in lazy
        // section chunks, and counting those as "arrived on the interaction"
        // would weaken the assertion below into something that could pass by
        // accident.
        loadedUrls.clear()
        for (const u of fetched.keys()) loadedUrls.add(u)
        await searchTrigger.click()
        await page.waitForTimeout(1200)
        const dialogOpen = await page.getByRole('dialog').count()
        check(dialogOpen > 0, `${vp.label}: the search overlay opened on the trigger`)
        await page.screenshot({ path: join(OUT, `search-open-${vp.label}.png`), fullPage: false })

        const after = [...fetched.entries()].filter(([u]) => !loadedUrls.has(u))
        const carriers = after.filter(([, body]) => body && markersIn(body, SURFACES[0]).length > 0)
        if (!FUNCTIONAL_ONLY) check(
          carriers.length > 0,
          `${vp.label}: the search overlay ARRIVED on the interaction, in ${carriers.length} newly fetched chunk(s)` +
            ` of ${after.length} (this is what makes the absence above mean something)`,
        )
        await page.keyboard.press('Escape')
        await page.waitForTimeout(400)
      } else {
        check(false, `${vp.label}: no visible "Open search" trigger to drive`)
      }

      // ---- THE CITY DIALOG ----
      const beforeCity = new Set(fetched.keys())
      /*
       * THE PICKER IS NOT IN THE SAME PLACE AT EVERY WIDTH, and the first
       * version of this drive did not know that. At 390 the header collapses and
       * the picker's `inline` variant lives inside the navigation sheet. It is
       * still in the accessibility tree while the sheet is shut, so
       * getByRole found it, reported it visible and enabled, and then spent
       * thirty seconds failing to click something "outside of the viewport".
       *
       * That is the harness being wrong about the product, so the drive opens
       * the sheet the way a thumb does rather than asserting against a control
       * no thumb can reach.
       */
      let cityTrigger = page.getByRole('button', { name: /Change location/ }).first()
      if (!(await reachableTrigger(page, cityTrigger, vp))) {
        const menu = page.getByRole('button', { name: 'Open navigation menu' })
        if (await menu.count() > 0 && await menu.isVisible()) {
          await menu.click()
          await page.waitForTimeout(600)
          notes.push(`${vp.label}: the picker is inside the navigation sheet at this width, so the sheet was opened first`)
          cityTrigger = page.getByRole('button', { name: /Change location/ }).first()
        }
      }
      if (await reachableTrigger(page, cityTrigger, vp)) {
        await cityTrigger.click()
        await page.waitForTimeout(1200)
        const heading = await page.getByText('Choose your city').count()
        check(heading > 0, `${vp.label}: the city dialog opened on the trigger`)
        await page.screenshot({ path: join(OUT, `city-open-${vp.label}.png`), fullPage: false })

        const after = [...fetched.entries()].filter(([u]) => !beforeCity.has(u))
        const carriers = after.filter(([, body]) => body && markersIn(body, SURFACES[1]).length > 0)
        if (!FUNCTIONAL_ONLY) check(
          carriers.length > 0,
          `${vp.label}: the city dialog ARRIVED on the interaction, in ${carriers.length} newly fetched chunk(s) of ${after.length}`,
        )

        // ---- THE OTHER HALF OF THE PAIR: it ARRIVED on the interaction ----
        check(
          catalogueRequests.length > 0,
          `${vp.label}: the city catalogue was requested ON THE INTERACTION ` +
            `(${catalogueRequests.length} request(s) to ${CITY_CATALOGUE_ENDPOINT}); this is what ` +
            `makes the absence on load mean something rather than meaning the list is gone`,
        )

        // It has to still WORK, not merely arrive. With the catalogue now coming
        // off the wire, this is also the proof that what arrived reached the
        // list: a dialog rendering an empty catalogue would find no Geelong.
        const search = page.getByPlaceholder('Search for a city')
        if (await search.count() > 0) {
          await search.fill('geel')
          await page.waitForTimeout(600)
          const matched = await page.getByText('Geelong').count()
          check(matched > 0, `${vp.label}: the dialog's own search still filters ("geel" finds Geelong)`)
        } else {
          check(false, `${vp.label}: the dialog has no city search box`)
        }

        // The failure state is real and reachable, not a branch nobody has run.
        // Asked at 390 only: it is one code path, and repeating it at three
        // widths would be three screenshots of the same paragraph.
        if (vp.label === '390') {
          const failing = await context.newPage()
          await failing.route(`**${CITY_CATALOGUE_ENDPOINT}`, r => r.fulfill({ status: 503, body: '{"error":"unavailable"}' }))
          await failing.goto(BASE, { waitUntil: 'domcontentloaded' })
          const menu = failing.getByRole('button', { name: 'Open navigation menu' })
          if (await menu.count() > 0 && await menu.isVisible()) {
            await menu.click()
            await failing.waitForTimeout(600)
          }
          const trigger = failing.getByRole('button', { name: /Change location/ }).first()
          if (await reachableTrigger(failing, trigger, vp)) {
            await trigger.click()
            await failing.waitForTimeout(1500)
            const said = await failing.getByText('The city list did not load').count()
            check(said > 0, `${vp.label}: a 503 on the catalogue shows the dialog's failure state, not an empty list`)
            const emptyClaim = await failing.getByText(/No cities match/).count()
            check(emptyClaim === 0, `${vp.label}: a 503 never tells a visitor that no city matches`)

            /*
             * THE RECOVERY HAS TO BE VISIBLE, NOT MERELY PRESENT, and this
             * assertion exists because the first version of this drive did not
             * make it and was wrong in the most embarrassing way available. The
             * retry button carried `bg-navy`, which is not a colour in this
             * Tailwind build (globals.css defines `--color-navy-950` and nothing
             * called `navy`), so it compiled to no rule and painted white text on
             * the white dialog. The jsdom test found it by accessible name and
             * passed. The assertion above found the message and passed. Only the
             * SCREENSHOT showed a failure state with no way out of it.
             *
             * A transparent background under white text is the shape of that
             * defect, so that is what is asked.
             */
            const retry = failing.getByRole('button', { name: 'Try again' })
            const paint = await retry.count() === 0 ? null : await retry.evaluate(el => {
              const cs = getComputedStyle(el)
              return { bg: cs.backgroundColor, color: cs.color }
            })
            const transparent = paint === null || /rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)/.test(paint.bg) || paint.bg === 'transparent'
            check(
              paint !== null && !transparent,
              `${vp.label}: the failure state's "Try again" is actually painted ` +
                `(background ${paint ? paint.bg : 'no such button'}, text ${paint ? paint.color : '-'})`,
            )
            await failing.screenshot({ path: join(OUT, `city-catalogue-failed-${vp.label}.png`), fullPage: false })
          } else {
            check(false, `${vp.label}: could not reach the picker to drive the catalogue failure state`)
          }
          await failing.close()
        }

        await page.keyboard.press('Escape')
        await page.waitForTimeout(400)
        check(
          (await page.getByText('Choose your city').count()) === 0,
          `${vp.label}: Escape closes the city dialog`,
        )
      } else {
        // Not a note this time. If the picker cannot be reached at a viewport a
        // visitor uses, that is a finding about the product, and a drive that
        // downgrades it to a note is the drive lying by omission.
        check(false, `${vp.label}: the location picker could not be reached, even through the navigation sheet`)
      }

      await context.close()
    }
  } finally {
    await browser.close()
  }

  console.log('')
  for (const n of notes) console.log(`${TAG} note: ${n}`)
  console.log(`${TAG} did ${assertionsMade} assertion(s) across ${VIEWPORTS.length} viewport(s)`)
  if (FUNCTIONAL_ONLY) {
    console.log(`${TAG} FUNCTIONAL ONLY: the surfaces were driven and the deferral was NOT asserted.`)
    console.log(`${TAG} A green run here is NOT evidence that the chrome is out of the first load.`)
  }
  console.log(`${TAG} found ${faults.length} fault(s)`)
  writeFileSync(join(OUT, 'result.json'), JSON.stringify({ assertionsMade, faults, notes }, null, 2))
  if (faults.length > 0) {
    console.error(`${TAG} FAIL`)
    process.exit(1)
  }
  console.log(FUNCTIONAL_ONLY ? `${TAG} PASS (functional only)` : `${TAG} PASS`)
}

main().catch(err => {
  console.error(`${TAG} ${err?.stack || err}`)
  process.exit(1)
})
