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
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.argv[2] || 'http://localhost:3200'
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
  const localBuildId = existsSync('.next/BUILD_ID') ? readFileSync('.next/BUILD_ID', 'utf8').trim() : null
  if (!localBuildId) {
    console.error(`${TAG} no .next/BUILD_ID in this worktree. Build before driving.`)
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
  const probe = `${BASE}/_next/static/${localBuildId}/_ssgManifest.js`
  const probeStatus = await fetch(probe).then(r => r.status).catch(() => 0)
  if (probeStatus !== 200) {
    console.error(`${TAG} ${probe} answered ${probeStatus}, not 200.`)
    console.error(`${TAG} whatever is on ${BASE} is not this tree's build (${localBuildId}), and this machine`)
    console.error(`${TAG} runs three lanes. Nothing is asserted against somebody else's server.`)
    process.exit(1)
  }
  console.log(`${TAG} the server on ${BASE} is serving this tree's build ${localBuildId}`)

  const browser = await chromium.launch()
  try {
    for (const vp of VIEWPORTS) {
      console.log(`${TAG} ${vp.width}x${vp.height}`)
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
      const page = await context.newPage()

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
        const carriers = onLoad.filter(([, body]) => body && markersIn(body, surface).length > 0)
        check(
          carriers.length === 0,
          `${vp.label}: ${surface.name} is in none of the ${onLoad.length} chunk(s) fetched on load` +
            (carriers.length ? ` (found in ${carriers.map(([u]) => u.split('/').pop()).join(', ')})` : ''),
        )
      }

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
        check(
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
        check(
          carriers.length > 0,
          `${vp.label}: the city dialog ARRIVED on the interaction, in ${carriers.length} newly fetched chunk(s) of ${after.length}`,
        )

        // It has to still WORK, not merely arrive.
        const search = page.getByPlaceholder('Search for a city')
        if (await search.count() > 0) {
          await search.fill('geel')
          await page.waitForTimeout(300)
          const matched = await page.getByText('Geelong').count()
          check(matched > 0, `${vp.label}: the dialog's own search still filters ("geel" finds Geelong)`)
        } else {
          check(false, `${vp.label}: the dialog has no city search box`)
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
  console.log(`${TAG} found ${faults.length} fault(s)`)
  writeFileSync(join(OUT, 'result.json'), JSON.stringify({ assertionsMade, faults, notes }, null, 2))
  if (faults.length > 0) {
    console.error(`${TAG} FAIL`)
    process.exit(1)
  }
  console.log(`${TAG} PASS`)
}

main().catch(err => {
  console.error(`${TAG} ${err?.stack || err}`)
  process.exit(1)
})
