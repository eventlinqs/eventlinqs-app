/**
 * THE WEEKEND RAIL, DRIVEN, AT THREE WIDTHS.
 *
 * ============================================================================
 * WHAT IT PROVES THAT A UNIT TEST CANNOT
 * ============================================================================
 *
 * `tests/unit/events/weekend-in-the-right-zone.test.ts` pins the arithmetic: it
 * shows that the shared rule includes a Saturday morning Melbourne event the old
 * UTC window dropped, and excludes a Monday morning one the old window admitted.
 * That is the rule. It is not the page.
 *
 * Between the rule and the page sit a query, a listing window, a slice(0, 10)
 * and a component that refuses to render a rail with nothing in it. This walks
 * the rendered homepage and reads what a visitor would actually see.
 *
 * THE THREE FIXTURES IT LOOKS FOR are seeded by
 * scripts/ops/seed-weekend-window-fixture.mjs and each one is on the page for a
 * reason:
 *
 *   lane-c-weekend-saturday-morning   MUST be on the rail. Saturday 09:00 local
 *                                     is Friday 23:00 UTC, so the old window
 *                                     excluded it.
 *   lane-c-weekend-saturday-night     MUST be on the rail. Both rules agreed.
 *   lane-c-weekend-monday-morning     MUST NOT be on the rail. Monday 09:00
 *                                     local is Sunday 23:00 UTC, so the old
 *                                     window admitted a Monday to the weekend.
 *
 * The third is the one worth having. A drive that only checked for presence
 * would pass just as happily on the broken rule, because the broken rule showed
 * MORE events, not fewer. The absence is the assertion that can only pass after
 * the fix.
 *
 * ============================================================================
 * IT PROVES ITS OWN INSTRUMENT FIRST
 * ============================================================================
 *
 * A rail with no events does not render at all, so "the Monday event is not in
 * the rail" is trivially true on a page where the rail is missing, on a page
 * that 500ed, and on a drive pointed at the wrong port. This repository has lost
 * a day to a harness that failed loudly and was believed. So before it judges
 * anything, this asserts the page answered 200 and that the rail is present with
 * at least one event in it. If it is not, that is reported as a BROKEN DRIVE and
 * nothing is judged.
 *
 * Usage:
 *   node scripts/verify/weekend-rail-drive.mjs http://127.0.0.1:3200
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const TAG = '[weekend-rail-drive]'
const BASE = (process.argv[2] ?? 'http://127.0.0.1:3200').replace(/\/$/, '')
const OUT = process.env.DRIVE_OUT ?? join('C:', 'dev', 'EVIDENCE', 'WEEKEND-WINDOW')
const WIDTHS = [390, 768, 1440]
const RAIL = 'section[aria-label="Events this weekend"]'

const MUST_BE_ON = ['lane-c-weekend-saturday-morning', 'lane-c-weekend-saturday-night']
const MUST_NOT_BE_ON = ['lane-c-weekend-monday-morning']

mkdirSync(OUT, { recursive: true })

const results = []
let failures = 0
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail })
  if (!ok) failures += 1
  console.log(`${TAG} ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`)
}

const browser = await chromium.launch()
const shots = []

try {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    const response = await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 120000 })

    /* ---------------------------------------------- prove the instrument */

    if (response?.status() !== 200) {
      console.error(`${TAG} BROKEN DRIVE: the homepage answered ${response?.status()} at ${width}px. Nothing judged.`)
      await browser.close()
      process.exit(2)
    }

    const rail = page.locator(RAIL)
    await rail.scrollIntoViewIfNeeded({ timeout: 30000 }).catch(() => {})
    const railCount = await rail.count()
    if (railCount === 0) {
      console.error(
        `${TAG} BROKEN DRIVE at ${width}px: no ${RAIL} on the page. The rail does not render when it has ` +
          `nothing to show, so an absent rail makes every assertion below vacuously true. ` +
          `Run scripts/ops/seed-weekend-window-fixture.mjs and try again.`,
      )
      await browser.close()
      process.exit(2)
    }

    const hrefs = await rail.locator('a[href^="/events/"]').evaluateAll(as => as.map(a => a.getAttribute('href')))
    const slugs = [...new Set(hrefs.map(h => String(h).split('/events/')[1]?.split(/[?#]/)[0]).filter(Boolean))]

    if (slugs.length === 0) {
      console.error(`${TAG} BROKEN DRIVE at ${width}px: the rail rendered with no event links in it. Nothing judged.`)
      await browser.close()
      process.exit(2)
    }

    /* ------------------------------------------------------ the judgement */

    for (const slug of MUST_BE_ON) {
      check(`${width}px: the rail shows ${slug}`, slugs.includes(slug), `rail holds ${slugs.length} event(s)`)
    }
    for (const slug of MUST_NOT_BE_ON) {
      check(
        `${width}px: the rail does NOT show ${slug}, which the UTC window admitted`,
        !slugs.includes(slug),
        slugs.includes(slug) ? 'IT IS THERE, so the weekend still runs on a UTC day' : 'absent, as the local-zone rule requires',
      )
    }

    const heading = (await rail.locator('h2, h3').first().textContent().catch(() => '')) ?? ''
    check(`${width}px: the rail carries its heading`, heading.trim().length > 0, `"${heading.trim()}"`)

    const file = join(OUT, `weekend-rail-${width}.png`)
    await rail.screenshot({ path: file }).catch(async () => {
      await page.screenshot({ path: file, fullPage: false })
    })
    shots.push({ width, file, slugs })

    await ctx.close()
  }
} finally {
  await browser.close()
}

const report = {
  base: BASE,
  ranAt: new Date().toISOString(),
  widths: WIDTHS,
  mustBeOn: MUST_BE_ON,
  mustNotBeOn: MUST_NOT_BE_ON,
  shots,
  checks: results,
  failures,
}
const reportPath = join(OUT, 'weekend-rail-drive.json')
writeFileSync(reportPath, JSON.stringify(report, null, 2))

console.log(`${TAG} ${results.length - failures} of ${results.length} check(s) passed. Report: ${reportPath}`)
if (failures > 0) process.exitCode = 1
