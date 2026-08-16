/**
 * THE LAUNCH COMPOSER WALK, AT EXACT VIEWPORTS.
 *
 * WHY THIS EXISTS AND WHY IT IS NOT A BROWSER EXTENSION. Chrome on Windows
 * clamps a window to a minimum of 750 CSS pixels, and the extension's
 * resize_window reports success while doing nothing, so every "mobile" finding
 * taken that way was actually taken at 750. Playwright sets a context viewport
 * directly and headlessly, so 390 means 390. Every pass below PRINTS the width
 * the page itself measured, so the number in the report is the page's own
 * answer rather than the number this script asked for.
 *
 * WHAT IT WALKS, cold and anonymous, exactly as a promoter arrives:
 *   1. /launch                the composer, from a cold anonymous start
 *   2. the composer filled and submitted
 *   3. the reveal             the kit screen at /launch/k/<code>
 *   4. the event page preview inside the reveal
 *
 * THE SPECIFIC QUESTION IT ANSWERS. The fixed mobile bottom nav was seen
 * overlapping the "From $25" pill at 750. The layout reserves `pb-16 md:pb-0`
 * (64px) on #main-content and the nav is `h-16`, so on paper it clears. This
 * measures the two rectangles at 390 and at 1440 and reports the real overlap
 * rather than reasoning about the classes.
 *
 * REACT AND form_input. Setting `input.value` directly updates the DOM but does
 * not notify React, whose onChange rides the native `input` event through its
 * own value tracker; the component goes on believing the field is empty. The
 * native setter is called explicitly below so React sees the change.
 *
 * Usage:
 *   node scripts/verify/launch-viewport-walk.mjs <baseUrl>
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.argv[2]
if (!BASE) {
  console.error('usage: node scripts/verify/launch-viewport-walk.mjs <baseUrl>')
  process.exit(1)
}

const OUT = join(process.cwd(), 'docs', 'design', 'launch-viewport-walk')
mkdirSync(OUT, { recursive: true })

const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '1440', width: 1440, height: 900 },
]

/** A real promoter's first sentence, priced so the pill reads "From $25". */
const ARRIVAL =
  'Warehouse party at the Barwon Club, Marlo Reyes b2b Kita, Sat 20th September, doors 10pm, $25 presale'

/** Set a React-controlled field so the component actually sees the value. */
async function reactFill(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 30_000 })
  await page.$eval(
    selector,
    (el, v) => {
      const proto =
        el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
      setter.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    },
    value,
  )
}

/** The page's own measurement of its viewport, plus any horizontal overflow. */
async function measure(page) {
  return page.evaluate(() => ({
    innerWidth: window.innerWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    dpr: window.devicePixelRatio,
  }))
}

/**
 * Overlap between the fixed bottom nav and the price pill, measured after
 * scrolling the pill into view and again at the very bottom of the document.
 */
async function navOverlap(page) {
  return page.evaluate(() => {
    // The whole price, not its first digit: an earlier version of this pattern
    // ended after `\$\d` and so could never match "From $25", which made the
    // walk report "no pill" on a page that plainly had one.
    const findPill = () =>
      [...document.querySelectorAll('span, button, a')].find(el =>
        /^\s*(From \$[\d.,]+|Free entry)\s*$/.test(el.textContent || ''),
      )
    const nav = document.querySelector('nav[class*="fixed"], [class*="fixed"][class*="bottom-0"]')
    const pill = findPill()
    if (!pill) return { pill: null, nav: nav ? nav.getBoundingClientRect().toJSON() : null }

    pill.scrollIntoView({ block: 'center' })
    const inView = pill.getBoundingClientRect().toJSON()
    const navInView = nav ? nav.getBoundingClientRect().toJSON() : null

    window.scrollTo(0, document.body.scrollHeight)
    const atBottom = pill.getBoundingClientRect().toJSON()
    const navAtBottom = nav ? nav.getBoundingClientRect().toJSON() : null

    const overlapOf = (a, b) =>
      a && b ? Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) : 0

    return {
      navPresent: Boolean(nav),
      navRect: navInView,
      pillText: pill.textContent.trim(),
      pillCentred: inView,
      pillAtBottom: atBottom,
      overlapCentred: overlapOf(inView, navInView),
      overlapAtBottom: overlapOf(atBottom, navAtBottom),
    }
  })
}

const browser = await chromium.launch()
const report = []

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()
  const step = async (label) => {
    const m = await measure(page)
    console.log(`  [${vp.name}] ${label}: measured innerWidth=${m.innerWidth} clientWidth=${m.clientWidth} scrollWidth=${m.scrollWidth}`)
    if (m.scrollWidth > m.clientWidth + 1) {
      console.log(`  [${vp.name}] HORIZONTAL OVERFLOW of ${m.scrollWidth - m.clientWidth}px on ${label}`)
    }
    await page.screenshot({ path: join(OUT, `${vp.name}-${label}.png`), fullPage: false })
    return m
  }

  console.log(`\n=== VIEWPORT ${vp.width} x ${vp.height} ===`)

  // 1. the composer, cold and anonymous
  await page.goto(`${BASE}/launch`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.waitForTimeout(1500)
  const composer = await step('01-composer')

  // 2. fill it. Selectors are discovered rather than hardcoded so a copy change
  //    does not silently turn this walk into a no-op.
  const fields = await page.$$eval('input:not([type=hidden]), textarea', els =>
    els.map((el, i) => ({
      i,
      tag: el.tagName,
      type: el.getAttribute('type'),
      name: el.getAttribute('name'),
      id: el.id,
      placeholder: el.getAttribute('placeholder'),
      label: (el.labels && el.labels[0] && el.labels[0].textContent.trim()) || null,
    })),
  )
  console.log(`  [${vp.name}] composer fields: ${JSON.stringify(fields)}`)

  report.push({ viewport: vp.name, composer, fields })

  // 3. fill it and submit. One textarea, so this is the whole form.
  await reactFill(page, '#launch-description', ARRIVAL)
  await page.waitForTimeout(400)
  const submit = page
    .getByRole('button', { name: /make|build|create|generate|kit|start|go/i })
    .first()
  await submit.click({ timeout: 30_000 })

  // 4. the reveal. The composer works for a few seconds, so this waits on the
  //    kit surface appearing rather than on a fixed delay.
  await page
    .waitForURL((u) => /\/launch\/(k|with)\//.test(u.pathname), { timeout: 180_000 })
    .catch(() => console.log(`  [${vp.name}] no url change; the kit may render in place`))
  await page.waitForTimeout(4000)
  await step('02-reveal')
  console.log(`  [${vp.name}] reveal url: ${page.url()}`)

  // 5. the event page preview inside the reveal, and the measurement this walk
  //    exists for.
  const overlap = await navOverlap(page)
  console.log(`  [${vp.name}] REVEAL nav/pill: ${JSON.stringify(overlap)}`)
  await step('03-reveal-bottom')

  await context.close()
}

await browser.close()
console.log(`\nscreenshots written to ${OUT}`)
