/**
 * L1 ITEMS 4 AND 8, DRIVEN ANONYMOUSLY ON PRODUCTION AT 390, 768 AND 1440.
 *
 * Close-out L1 item 4: "the event appears on /events/[slug], on browse, on its
 * city page, and on any community it belongs to."
 * Close-out L1 item 8: "find the event from the homepage without knowing the URL."
 *
 * WHY THESE TWO AND NOT THE OTHER TWELVE. L1 says driven on production. Twelve of
 * the sixteen items write to the live database (a signup, an event, a card
 * charge, a scan) and are OWNER BLOCKED until Lawal approves that. These two do
 * not write anything: item 4 is page loads and item 8 is a click. The previous
 * session recorded all fourteen non-sweep rows as blocked in one sentence, and
 * two of them were not. Testing an inherited blocker is cheaper than inheriting
 * it.
 *
 * READ ONLY, GET ONLY, ANONYMOUS. No form is submitted, nothing signs in, no
 * account is created, and the same boundary as production-route-sweep.mjs applies
 * for the same reason: this is pointed at the live site without the owner's
 * approval, so it must stay the kind of check that can be.
 *
 * NO SLUG IS EVER TYPED. The event comes from the platform's own sitemap; the
 * cities come from /cities and the communities from /communities, both read as
 * links off the platform's own index pages.
 *
 * THE TEST IS INVERTED, AND THAT IS THE WHOLE DESIGN. The first version of this
 * file asked the EVENT PAGE which city and communities it belonged to, by
 * harvesting its anchors, and then checked those pages. It produced nine false
 * failures on the first run: the six /community/ links on an event page are the
 * community rail that every page carries, not that event's tags, so four of them
 * correctly did not list it and were reported as defects. The event page also
 * names no /city/ link at all, which the harness reported as "its city page
 * cannot be reached", a sentence about the harness rather than the product.
 *
 * So the question is asked the other way round, which is also the way a user
 * would meet it: of the twenty cities and twenty one communities the platform
 * itself publishes, WHICH ONES LIST THIS EVENT. That needs no guess about where
 * the event belongs, and it cannot be fooled by navigation chrome.
 *
 * WHAT COUNTS AS THE EVENT APPEARING: its own path, as an href, on the page under
 * test. Not its title, because a title can coincide and a heading is not a way
 * in. A card the user can click is the claim being made.
 *
 * Usage:
 *   node scripts/verify/launch-readiness-drive.mjs --out C:/dev/EVIDENCE/L5
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const argOf = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

const BASE = (argOf('--base') ?? 'https://www.eventlinqs.com.au').replace(/\/$/, '')
const OUT = argOf('--out') ?? '.'
const SHOTS = join(OUT, 'shots')
const UA = 'eventlinqs-l1-drive/1.0'
const VIEWPORTS = [
  ['390', { width: 390, height: 844 }],
  ['768', { width: 768, height: 1024 }],
  ['1440', { width: 1440, height: 900 }],
]

const TAG = '[l1-drive]'
mkdirSync(SHOTS, { recursive: true })

const results = { base: BASE, driven: new Date().toISOString(), item4: {}, item8: {}, faults: [] }
const fail = (m) => {
  results.faults.push(m)
  console.error(`${TAG} FAIL: ${m}`)
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { 'user-agent': UA } })
  return { status: res.status, body: res.ok ? await res.text() : '' }
}

/** Distinct internal paths matching a pattern, off a page's own markup. */
const linksMatching = (html, re) => [
  ...new Set([...html.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1].split('#')[0]).filter((h) => re.test(h))),
]

/**
 * A visitor's way to every night a guide holds: All dates, then every Show more, the same presses acceptance-live makes
 * for law 16. A page with neither button is read as it stands. Returns the presses made, so the record shows them.
 */
async function openEverything(page) {
  let allDates = false
  const all = page.getByRole('button', { name: 'All dates', exact: true })
  if (await all.count()) {
    await all.first().click()
    allDates = true
  }
  let showMore = 0
  for (let i = 0; i < 400; i++) {
    const more = page.getByRole('button', { name: /^Show more/ })
    if ((await more.count()) === 0) break
    await more.first().click()
    showMore += 1
  }
  await page.waitForTimeout(400)
  return { allDates, showMore }
}

/**
 * The consent strip covers the foot of a phone screen until it is answered. The drive gives the safe answer a visitor
 * gives, 'No thanks', which only sets the visitor's own cookie (consent-banner-shell.tsx; nothing is sent), so a card
 * under the strip can be pressed.
 */
async function refuseConsent(page) {
  const no = page.getByRole('button', { name: 'No thanks', exact: true })
  if (await no.first().isVisible().catch(() => false)) await no.first().click()
}

const browser = await chromium.launch()

try {
  // -----------------------------------------------------------------------
  // The event under test, and the surfaces that exist, all from the platform.
  // -----------------------------------------------------------------------
  const sitemap = await get('/sitemap.xml')
  if (sitemap.status !== 200) throw new Error(`sitemap.xml answered HTTP ${sitemap.status}`)
  const slugs = [...new Set([...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => new URL(m[1]).pathname)
    .map((p) => p.match(/^\/events\/([^/]+)$/)?.[1])
    .filter(Boolean))]
  if (slugs.length === 0) throw new Error('the sitemap publishes no /events/<slug>, so there is no real event to drive')

  /*
   * The first UPCOMING event in the sitemap, by its own page's Event data. The sitemap keeps ended events' pages, and a
   * guide rightly lists no ended night (law 16's no-ended-night), so the first sitemap entry of 7 November 2026, a show of
   * 5 November, was read as missing from every city and browse page: the drive's fault, not the platform's.
   */
  let slug = null
  for (const candidate of slugs.slice(0, 40)) {
    const page = await get(`/events/${candidate}`)
    if (page.status !== 200) continue
    const dates = [...page.body.matchAll(/"(?:endDate|startDate)"\s*:\s*"([^"]+)"/g)].map((m) => Date.parse(m[1])).filter(Number.isFinite)
    if (dates.length > 0 && Math.max(...dates) > Date.now()) {
      slug = candidate
      break
    }
  }
  if (!slug) throw new Error('none of the sitemap\'s first 40 events is upcoming by its own Event data, so there is no live event to drive')
  const eventPath = `/events/${slug}`
  console.log(`${TAG} ${slugs.length} event(s) in the sitemap; driving ${eventPath}`)

  const citiesIndex = await get('/cities')
  const communitiesIndex = await get('/communities')
  if (citiesIndex.status !== 200) fail(`/cities answered HTTP ${citiesIndex.status}`)
  if (communitiesIndex.status !== 200) fail(`/communities answered HTTP ${communitiesIndex.status}`)
  const cityPaths = linksMatching(citiesIndex.body, /^\/city\/[^/]+$/)
  const communityPaths = linksMatching(communitiesIndex.body, /^\/community\/[^/]+$/)
  console.log(`${TAG} the platform publishes ${cityPaths.length} cities and ${communityPaths.length} communities`)

  /*
   * WHICH of them list this event, asked IN A BROWSER, as a visitor asks. Asked of every one, so nothing is assumed.
   *
   * 7 November 2026: this used to be a plain fetch of each page's first HTML, and it reported the 2026 Boxing Day Test
   * (26 December, the MCG) as listed on no city and no browse page. A guide's first paint is its near dates; the rest
   * of its nights are one press of All dates and a few of Show more away (law 16 promises every night under All dates,
   * and Melbourne's guide went from 47 linked nights to 157 after All dates and seven Show more presses, the Boxing Day
   * Test among them). /events/browse/<city> now lands on that same guide. The fetch could not press a button, so it
   * judged the first screen, not the guide.
   */
  const scan = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA })
  const scanPage = await scan.newPage()
  const listsEvent = async (path) => {
    const r = await scanPage.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 90000 })
    const status = r?.status() ?? 0
    await refuseConsent(scanPage)
    const opened = status === 200 ? await openEverything(scanPage) : { allDates: false, showMore: 0 }
    const links = status === 200 && (await scanPage.locator(`a[href="${eventPath}"]`).count()) > 0
    return { path, status, landedOn: new URL(scanPage.url()).pathname, ...opened, links }
  }

  const cityRows = []
  for (const p of cityPaths) cityRows.push(await listsEvent(p))
  const communityRows = []
  for (const p of communityPaths) communityRows.push(await listsEvent(p))

  const citiesListing = cityRows.filter((r) => r.links).map((r) => r.path)
  const communitiesListing = communityRows.filter((r) => r.links).map((r) => r.path)

  // Browse is per city, and the city is the one the PLATFORM just told us.
  const browseRows = []
  for (const c of citiesListing) browseRows.push(await listsEvent(`/events/browse/${c.split('/')[2]}`))
  const browseListing = browseRows.filter((r) => r.links).map((r) => r.path)
  await scan.close()

  const badStatus = [...cityRows, ...communityRows, ...browseRows].filter((r) => r.status !== 200)
  for (const r of badStatus) fail(`item 4: ${r.path} answered HTTP ${r.status}`)

  if (citiesListing.length === 0) fail(`item 4: no city page out of ${cityPaths.length} lists ${eventPath}`)
  if (browseListing.length === 0) fail(`item 4: no browse page lists ${eventPath}`)
  if (communitiesListing.length === 0) {
    console.log(`${TAG} item 4: no community lists ${eventPath}, so it belongs to none. L1 says "any community it belongs to", so nothing is owed.`)
  }

  console.log(`${TAG} item 4: listed on ${citiesListing.join(', ') || 'no city'}`)
  console.log(`${TAG} item 4: listed on ${browseListing.join(', ') || 'no browse page'}`)
  console.log(`${TAG} item 4: listed on ${communitiesListing.join(', ') || 'no community'}`)

  results.item4.enumeration = {
    eventPath,
    citiesPublished: cityPaths.length,
    communitiesPublished: communityPaths.length,
    citiesListing,
    browseListing,
    communitiesListing,
    cityRows,
    communityRows,
    browseRows,
  }

  // -----------------------------------------------------------------------
  // Now DRIVE it in a real browser, at each viewport: the event page and every
  // surface that was found to list it, plus the homepage click for item 8.
  // -----------------------------------------------------------------------
  const surfaces = [...citiesListing, ...browseListing, ...communitiesListing]

  for (const [label, viewport] of VIEWPORTS) {
    const context = await browser.newContext({ viewport, userAgent: UA })
    const page = await context.newPage()
    const perViewport = { eventStatus: 0, title: '', surfaces: [] }

    const evRes = await page.goto(`${BASE}${eventPath}`, { waitUntil: 'networkidle' })
    perViewport.eventStatus = evRes?.status() ?? 0
    perViewport.title = (await page.locator('h1').first().textContent().catch(() => ''))?.trim() ?? ''
    if (perViewport.eventStatus !== 200) fail(`item 4 at ${label}: ${eventPath} answered HTTP ${perViewport.eventStatus}`)
    if (!perViewport.title) fail(`item 4 at ${label}: ${eventPath} rendered no h1`)
    await page.screenshot({ path: join(SHOTS, `item4-event-${label}.png`) })

    await refuseConsent(page)
    for (const path of surfaces) {
      const r = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
      const status = r?.status() ?? 0
      const opened = status === 200 ? await openEverything(page) : { allDates: false, showMore: 0 }
      const rendered = await page.locator(`a[href="${eventPath}"]`).count()
      perViewport.surfaces.push({ path, status, landedOn: new URL(page.url()).pathname, ...opened, renderedLinks: rendered })
      if (status !== 200) fail(`item 4 at ${label}: ${path} answered HTTP ${status}`)
      else if (rendered === 0) fail(`item 4 at ${label}: ${path} renders no link to ${eventPath} in the browser, All dates and every Show more pressed`)
      else {
        // The card itself, where a visitor meets it, and then the guide's own top.
        const kind = path.startsWith('/city/') ? 'city' : path.startsWith('/community/') ? 'community' : 'browse'
        const card = page.locator(`a[href="${eventPath}"]`).first()
        await card.scrollIntoViewIfNeeded()
        await page.screenshot({ path: join(SHOTS, `item4-${kind}-${label}-card.png`) })
      }
    }
    results.item4[label] = perViewport

    // ---------------------------------------------------------------------
    // ITEM 8. No URL is typed: one way is clicks only, the other types the
    // event's own name into the homepage's search, as a visitor who heard of it.
    // waitForURL, not waitForLoadState: the first version read page.url()
    // straight after the click, before the App Router soft navigation had
    // committed, and recorded three false failures saying the click landed
    // back on the homepage.
    // ---------------------------------------------------------------------
    const homeRes = await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
    const homeStatus = homeRes?.status() ?? 0
    if (homeStatus !== 200) fail(`item 8 at ${label}: the homepage answered HTTP ${homeStatus}`)
    await page.screenshot({ path: join(SHOTS, `item8-home-${label}.png`) })

    /*
     * THE EVENT UNDER TEST, NOT ANY EVENT (7 November 2026). This used to click the homepage's first event link and pass
     * on wherever it landed, which proves a link works, not that THIS event can be found. Now two ways in, each ending
     * on this event's own page:
     *   by clicking: the homepage's own link to the guide that lists it (through /cities when the homepage names no
     *     link to that guide), All dates and every Show more, then its card;
     *   by its name: the homepage's search control, the event's own title typed, Enter, then its card in the results.
     */
    const landOn = async (card, how) => {
      await card.scrollIntoViewIfNeeded()
      await card.click()
      const navigated = await page.waitForURL(`**${eventPath}`, { timeout: 15000 }).then(() => true, () => false)
      const landedTitle = (await page.locator('h1').first().textContent().catch(() => ''))?.trim() ?? ''
      if (!navigated) fail(`item 8 at ${label} (${how}): pressing the card did not reach ${eventPath}; the browser is on ${new URL(page.url()).pathname}`)
      else if (landedTitle !== perViewport.title) fail(`item 8 at ${label} (${how}): ${eventPath} reads '${landedTitle}', not '${perViewport.title}'`)
      // The hero's content staggers in on arrival (Motion); a shot taken the instant the URL changes catches it mid fade.
      await page.waitForTimeout(1200)
      await page.screenshot({ path: join(SHOTS, `item8-${how}-event-${label}.png`) })
      return { navigated, landedTitle }
    }

    const byClick = { guide: citiesListing[0] ?? null }
    if (!byClick.guide) fail(`item 8 at ${label} (click): no guide lists ${eventPath}, so no click reaches it`)
    else {
      let guideLink = page.locator(`a[href="${byClick.guide}"]:visible`).first()
      if ((await guideLink.count()) === 0) {
        byClick.via = '/cities'
        const cities = page.locator('a[href="/cities"]:visible').first()
        if ((await cities.count()) > 0) {
          await cities.click()
          await page.waitForURL('**/cities', { timeout: 15000 }).catch(() => {})
          guideLink = page.locator(`a[href="${byClick.guide}"]:visible`).first()
        }
      }
      if ((await guideLink.count()) === 0) fail(`item 8 at ${label} (click): neither the homepage nor /cities offers a visible link to ${byClick.guide}`)
      else {
        await guideLink.scrollIntoViewIfNeeded()
        await guideLink.click()
        await page.waitForURL(`**${byClick.guide}`, { timeout: 15000 }).catch(() => {})
        await page.waitForLoadState('networkidle')
        Object.assign(byClick, await openEverything(page))
        const card = page.locator(`a[href="${eventPath}"]`).first()
        if ((await card.count()) === 0) fail(`item 8 at ${label} (click): ${byClick.guide}, reached from the homepage, links no ${eventPath}`)
        else Object.assign(byClick, await landOn(card, 'click'))
      }
    }

    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
    const bySearch = { typed: perViewport.title }
    let box = page.locator('input[name="search"]:visible').first()
    if ((await box.count()) === 0) {
      await page.getByRole('button', { name: 'Open search' }).first().click()
      await page.waitForTimeout(400)
      box = page.locator('input[name="search"]:visible').first()
    }
    if ((await box.count()) === 0) fail(`item 8 at ${label} (search): the homepage offers no visible search box`)
    else {
      await box.fill(perViewport.title)
      const asked = Date.now()
      await box.press('Enter')
      const card = page.locator(`main a[href="${eventPath}"]`).first()
      const found = await card.waitFor({ state: 'attached', timeout: 20000 }).then(() => true, () => false)
      bySearch.resultsUrl = new URL(page.url()).pathname + new URL(page.url()).search
      bySearch.msToCard = Date.now() - asked
      await page.screenshot({ path: join(SHOTS, `item8-search-results-${label}.png`) })
      if (!found) fail(`item 8 at ${label} (search): '${perViewport.title}' typed into the homepage search, and ${bySearch.resultsUrl} links no ${eventPath} within 20s`)
      else Object.assign(bySearch, await landOn(card, 'search'))
    }
    results.item8[label] = { homeStatus, byClick, bySearch }

    console.log(`${TAG} ${label} done`)
    await context.close()
  }
} finally {
  await browser.close()
}

writeFileSync(join(OUT, 'l1-drive.json'), JSON.stringify(results, null, 2))
console.log('')
if (results.faults.length > 0) {
  console.error(`${TAG} FAIL - ${results.faults.length} fault(s)`)
  process.exit(1)
}
console.log(`${TAG} PASS - items 4 and 8 driven on production at 390, 768 and 1440, 0 faults`)
