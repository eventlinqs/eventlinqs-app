/**
 * /this-weekend, DRIVEN, AT THREE WIDTHS, AGAINST REAL ROWS.
 *
 * ============================================================================
 * WHAT IT PROVES THAT A UNIT TEST CANNOT
 * ============================================================================
 *
 * `tests/unit/events/weekend-surface.test.ts` pins the rules: that a preset
 * narrows the listing window rather than replacing it, and that a card is filed
 * under the day it happens in its OWN zone. Those are the rules. They are not
 * the page.
 *
 * Between the rules and the page sit a cached fetcher, a 60-row cap, a grid that
 * declares its own height, a robots directive, a sitemap entry and five
 * components. This walks the rendered page and reads what a visitor sees.
 *
 * THE SIX FIXTURES it looks for are seeded by
 * scripts/ops/seed-weekend-surface-fixture.mjs, and each is on the page, or
 * deliberately not, for a reason:
 *
 *   ...-ended                  MUST NOT appear. It finished this morning. Until
 *                              this item, `/events?preset=weekend` still listed
 *                              it, because the preset REPLACED the listing rule
 *                              instead of narrowing it.
 *   ...-sat-geelong            Saturday group.
 *   ...-sat-melbourne          Saturday group, second city.
 *   ...-sun-sydney             Sunday group.
 *   ...-sun-brisbane           Sunday group, fourth city.
 *   ...-perth-late-saturday    Saturday 22:30 AWST, which is SUNDAY 00:30 in
 *                              Sydney. It must sit under the SATURDAY heading,
 *                              because that is the day it happens where it
 *                              happens and that is what its own card says.
 *
 * THE ABSENCES ARE THE ASSERTIONS WORTH HAVING. A drive that only checked for
 * presence would pass just as happily on the broken rule, because the broken
 * rule showed MORE events, not fewer.
 *
 * ============================================================================
 * IT PROVES ITS OWN INSTRUMENT FIRST
 * ============================================================================
 *
 * "The finished event is not on the page" is trivially true of a page that
 * 500ed, of a page with no events on it, and of a drive pointed at the wrong
 * port. This repository has lost a day to a harness that failed loudly and was
 * believed. So before it judges anything it asserts the page answered 200, that
 * the h1 is there, and that at least four event cards rendered. If not, that is
 * reported as a BROKEN DRIVE and nothing is judged.
 *
 * Usage:
 *   node scripts/verify/weekend-surface-drive.mjs http://127.0.0.1:3200
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const TAG = '[weekend-surface-drive]'
const BASE = (process.argv[2] ?? 'http://127.0.0.1:3200').replace(/\/$/, '')
const OUT = process.env.DRIVE_OUT ?? join('C:', 'dev', 'EVIDENCE', 'AQ3-WEEKEND')
const WIDTHS = [390, 768, 1440]
const PATH = '/this-weekend'

const MUST_BE_ON = [
  'lane-c-weekend-surface-sat-geelong',
  'lane-c-weekend-surface-sat-melbourne',
  'lane-c-weekend-surface-sun-sydney',
  'lane-c-weekend-surface-sun-brisbane',
  'lane-c-weekend-surface-perth-late-saturday',
]
const MUST_NOT_BE_ON = ['lane-c-weekend-surface-ended']
const PERTH = 'lane-c-weekend-surface-perth-late-saturday'

mkdirSync(OUT, { recursive: true })

const results = []
let failures = 0
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail })
  if (!ok) failures += 1
  console.log(`${TAG} ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`)
}
function broken(why) {
  console.error(`${TAG} BROKEN DRIVE: ${why} Nothing judged.`)
  process.exit(2)
}

/**
 * The day labels this weekend resolves to, DERIVED rather than written down.
 *
 * A literal "Saturday 19 September" in this file would be correct for one
 * weekend and quietly wrong for every other one, which is a check that rots into
 * a false failure. Both are built with the same Intl options the page uses, from
 * the same clock.
 */
function weekendHeadings(now) {
  const zone = 'Australia/Sydney'
  const dayOfWeek = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short' })
      .format(now)
      .replace(/Sun/, '0').replace(/Mon/, '1').replace(/Tue/, '2').replace(/Wed/, '3')
      .replace(/Thu/, '4').replace(/Fri/, '5').replace(/Sat/, '6'),
  )
  const toSaturday = dayOfWeek === 6 ? 0 : dayOfWeek === 0 ? -1 : 6 - dayOfWeek
  const midday = new Date(now.getTime() + toSaturday * 86400000)
  const long = d =>
    new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long' }).format(d)
  const short = d =>
    new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short' }).format(d)
  return {
    saturday: long(midday),
    sunday: long(new Date(midday.getTime() + 86400000)),
    saturdayShort: short(midday),
    sundayShort: short(new Date(midday.getTime() + 86400000)),
  }
}

const labels = weekendHeadings(new Date())
console.log(`${TAG} this weekend resolves to "${labels.saturday}" and "${labels.sunday}"`)

const browser = await chromium.launch()
const shots = []
let jsonLd = null

try {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    const response = await page.goto(`${BASE}${PATH}`, { waitUntil: 'load', timeout: 180000 })

    /* ---------------------------------------------- prove the instrument */

    if (response?.status() !== 200) {
      broken(`${PATH} answered ${response?.status()} at ${width}px.`)
    }
    const h1 = ((await page.locator('h1').first().textContent().catch(() => '')) ?? '').trim()
    if (!h1) broken(`no h1 rendered at ${width}px.`)

    const cardHrefs = await page
      .locator('main a[href^="/events/"]')
      .evaluateAll(as => as.map(a => a.getAttribute('href')))
    const slugs = [...new Set(cardHrefs.map(h => String(h).split('/events/')[1]?.split(/[?#]/)[0]).filter(Boolean))]
    if (slugs.length < 4) {
      broken(
        `only ${slugs.length} event card(s) at ${width}px. The page renders a designed empty state when ` +
          `nothing is on this weekend, which would make every absence below vacuously true. Run ` +
          `scripts/ops/seed-weekend-surface-fixture.mjs and try again.`,
      )
    }

    /* ------------------------------------------------------ the judgement */

    check(`${width}px: the h1 names the weekend`, /weekend/i.test(h1), `"${h1}"`)

    for (const slug of MUST_BE_ON) {
      check(`${width}px: the page shows ${slug}`, slugs.includes(slug), `${slugs.length} card(s) on the page`)
    }
    for (const slug of MUST_NOT_BE_ON) {
      check(
        `${width}px: the page does NOT show ${slug}, which has already finished`,
        !slugs.includes(slug),
        slugs.includes(slug)
          ? 'IT IS THERE, so the preset window still replaces the listing rule'
          : 'absent, as the listing rule requires',
      )
    }

    /* ------------------------------------------------- the two day groups */

    const headings = (await page.locator('main h2').evaluateAll(hs => hs.map(h => h.textContent?.trim() ?? '')))
      .filter(Boolean)
    check(
      `${width}px: there is a "${labels.saturday}" heading`,
      headings.includes(labels.saturday),
      `headings: ${headings.join(' | ')}`,
    )
    check(
      `${width}px: there is a "${labels.sunday}" heading`,
      headings.includes(labels.sunday),
      `headings: ${headings.join(' | ')}`,
    )
    check(
      `${width}px: Saturday comes before Sunday on the page`,
      headings.indexOf(labels.saturday) < headings.indexOf(labels.sunday),
      `Saturday at ${headings.indexOf(labels.saturday)}, Sunday at ${headings.indexOf(labels.sunday)}`,
    )

    /*
     * THE PERTH CARD IS UNDER SATURDAY, AND ITS OWN DATE SAYS SATURDAY.
     *
     * Both halves, because either alone can pass while the page contradicts
     * itself. The card sits in the section whose heading is Saturday; the label
     * printed on it is the Saturday date. A platform-zone heading would put this
     * card under Sunday while the card kept saying Saturday, which is the defect
     * one level up from the eight components that printed the UTC day.
     */
    const perthSection = page.locator(`section:has(a[href="/events/${PERTH}"])`).first()
    const perthHeading =
      ((await perthSection.locator('h2').first().textContent().catch(() => '')) ?? '').trim()
    check(
      `${width}px: the Perth card sits under "${labels.saturday}"`,
      perthHeading === labels.saturday,
      `it sits under "${perthHeading}"`,
    )
    const perthText = (
      (await page.locator(`a[href="/events/${PERTH}"]`).first().textContent().catch(() => '')) ?? ''
    ).replace(/\s+/g, ' ')
    check(
      `${width}px: the Perth card is dated ${labels.saturdayShort}, not ${labels.sundayShort}`,
      perthText.includes(labels.saturdayShort) && !perthText.includes(labels.sundayShort),
      `card reads "${perthText.trim().slice(0, 90)}"`,
    )

    /* -------------------------------------------------------- the city strip */

    const cityHrefs = await page
      .locator('main a[href^="/city/"]')
      .evaluateAll(as => as.map(a => a.getAttribute('href')))
    const citySlugs = [...new Set(cityHrefs.map(h => String(h).split('/city/')[1]).filter(Boolean))]
    for (const expected of ['geelong', 'melbourne', 'sydney', 'brisbane', 'perth']) {
      check(
        `${width}px: the city strip links to /city/${expected}`,
        citySlugs.includes(expected),
        `strip: ${citySlugs.join(', ')}`,
      )
    }

    if (width === 1440) {
      jsonLd = await page.locator('script[type="application/ld+json"]').evaluateAll(ss =>
        ss.map(s => {
          try {
            return JSON.parse(s.textContent ?? '{}')
          } catch {
            return { parseError: true }
          }
        }),
      )
    }

    /*
     * THE IMAGES ARE SETTLED BEFORE ANYTHING IS CAPTURED, AND THEN ASSERTED.
     *
     * The first run of this drive reported 67 of 67 and its 1440 screenshot
     * showed two cards as empty grey boxes. Nothing was wrong with the page: the
     * cards below the fold lazy-load, and the capture was taken at `load`. That
     * is the harness accusing the product, which this repository has already lost
     * a day to. So the page is scrolled, the images are waited for, and a BLANK
     * TILE IS NOW A FAILED CHECK rather than something a reader has to notice in
     * a picture.
     */
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y)
        await new Promise(r => setTimeout(r, 120))
      }
      window.scrollTo(0, 0)
    })
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {})
    const blank = await page
      .locator('main a[href^="/events/"] img')
      .evaluateAll(is => is.filter(i => !i.complete || i.naturalWidth === 0).map(i => i.getAttribute('alt')))
    check(
      `${width}px: every event card renders a real image, none blank`,
      blank.length === 0,
      blank.length === 0 ? 'every card image has pixels' : `blank: ${blank.join(' | ')}`,
    )

    /*
     * THREE VIEWPORT SHOTS, NOT ONE FULL-PAGE ONE.
     *
     * A `fullPage: true` capture of this page shows the Sunday group and the
     * city strip as EMPTY WHITE SPACE, and the first version of this drive
     * produced exactly that. Nothing is wrong with the page: both sections carry
     * `content-visibility: auto` (close-out C8B.3), so a section scrolled away
     * from is not painted, and a full-page capture stitches the unpainted state.
     * The evidence read like a broken page and was not one, which is the same
     * trap as the blank tiles above and costs somebody the same hour.
     *
     * So each band is scrolled into view and the VIEWPORT is captured, which is
     * what a reader actually sees.
     */
    const shot = async (name, selector) => {
      const file = join(OUT, `this-weekend-${width}-${name}.png`)
      if (selector) {
        await page.locator(selector).first().scrollIntoViewIfNeeded({ timeout: 30000 }).catch(() => {})
        // A beat for the section to paint after content-visibility releases it.
        await page.waitForTimeout(600)
      } else {
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.waitForTimeout(300)
      }
      await page.screenshot({ path: file, fullPage: false })
      return file
    }
    const top = await shot('top', null)
    const saturday = await shot('saturday', `section:has(a[href="/events/${PERTH}"])`)
    const sunday = await shot('sunday', 'main a[href^="/city/"]')
    shots.push({ width, top, saturday, sunday, slugs, headings })

    await ctx.close()
  }
} finally {
  await browser.close()
}

/* ---------------------------------------------------------- structured data */

const collection = (jsonLd ?? []).find(b => b['@type'] === 'CollectionPage')
check('the page emits a CollectionPage block', Boolean(collection), collection ? '' : 'no CollectionPage found')
const list = collection?.mainEntity
check('the CollectionPage carries an ItemList', list?.['@type'] === 'ItemList', `got ${list?.['@type']}`)
const items = Array.isArray(list?.itemListElement) ? list.itemListElement : []
check('the ItemList has items', items.length > 0, `${items.length} item(s)`)
check(
  'no Event node is emitted on this listing page',
  !JSON.stringify(jsonLd ?? []).includes('"@type":"Event"'),
  'Google supports the event experience on a leaf page only',
)
check(
  'every ItemList url points at a leaf event page',
  items.length > 0 && items.every(i => String(i.url ?? '').includes('/events/')),
  items.map(i => String(i.url ?? '').split('/events/')[1]).slice(0, 3).join(', '),
)
const breadcrumb = (jsonLd ?? []).find(b => b['@type'] === 'BreadcrumbList')
check('the page emits a BreadcrumbList', Boolean(breadcrumb))

/* --------------------------------------- the sitemap, the robots directive */

const sitemapRes = await fetch(`${BASE}/sitemap.xml`)
const sitemapXml = await sitemapRes.text()
check(
  `the sitemap publishes ${PATH} while the weekend holds events`,
  sitemapRes.ok && sitemapXml.includes(`${PATH}<`),
  `sitemap answered ${sitemapRes.status}, ${(sitemapXml.match(/<loc>/g) ?? []).length} url(s)`,
)

const pageHtml = await (await fetch(`${BASE}${PATH}`)).text()
check(
  'the page does not tell a crawler to ignore itself while it holds events',
  !/name="robots"[^>]*content="[^"]*noindex/.test(pageHtml),
  (pageHtml.match(/name="robots"[^>]*>/) ?? ['(no robots meta, which is index by default)'])[0],
)
check(
  'the page is self-canonical',
  pageHtml.includes(`rel="canonical" href="`) && pageHtml.includes(`${PATH}"`),
  (pageHtml.match(/rel="canonical" href="[^"]*"/) ?? ['(none)'])[0],
)

/* ------------------------- the filter and the page answer the same question */

const filterHtml = await (await fetch(`${BASE}/events?preset=weekend`)).text()
for (const slug of MUST_NOT_BE_ON) {
  check(
    `/events?preset=weekend does NOT list ${slug} either`,
    !filterHtml.includes(`/events/${slug}"`),
    'the page and the filter are one query',
  )
}
for (const slug of MUST_BE_ON) {
  check(
    `/events?preset=weekend lists ${slug}, the same as the page`,
    filterHtml.includes(`/events/${slug}`),
    '',
  )
}

/* ------------------------------------------------ every link on it resolves */

const hrefs = [...new Set((pageHtml.match(/href="(\/[^"#?]*)"/g) ?? []).map(h => h.slice(6, -1)))]
let dead = 0
for (const href of hrefs) {
  const res = await fetch(`${BASE}${href}`, { redirect: 'follow' })
  if (!res.ok) {
    dead += 1
    console.log(`${TAG}   dead: ${href} answered ${res.status}`)
  }
}
check(`every internal link on ${PATH} resolves`, dead === 0, `${hrefs.length} link(s) followed, ${dead} dead`)

const report = {
  base: BASE,
  path: PATH,
  ranAt: new Date().toISOString(),
  weekend: labels,
  checks: results.length,
  failures,
  shots,
  links: hrefs.length,
}
writeFileSync(join(OUT, 'weekend-surface-drive.json'), JSON.stringify(report, null, 2))

console.log(`\n${TAG} ${results.length - failures}/${results.length} checks passed.`)
console.log(`${TAG} report: ${join(OUT, 'weekend-surface-drive.json')}`)
process.exit(failures === 0 ? 0 : 1)
