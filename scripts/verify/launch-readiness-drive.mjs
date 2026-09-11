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

  const slug = slugs[0]
  const eventPath = `/events/${slug}`
  console.log(`${TAG} ${slugs.length} event(s) in the sitemap; driving ${eventPath}`)

  const citiesIndex = await get('/cities')
  const communitiesIndex = await get('/communities')
  if (citiesIndex.status !== 200) fail(`/cities answered HTTP ${citiesIndex.status}`)
  if (communitiesIndex.status !== 200) fail(`/communities answered HTTP ${communitiesIndex.status}`)
  const cityPaths = linksMatching(citiesIndex.body, /^\/city\/[^/]+$/)
  const communityPaths = linksMatching(communitiesIndex.body, /^\/community\/[^/]+$/)
  console.log(`${TAG} the platform publishes ${cityPaths.length} cities and ${communityPaths.length} communities`)

  // WHICH of them list this event. Asked of every one, so nothing is assumed.
  const listsEvent = async (path) => {
    const { status, body } = await get(path)
    return { path, status, links: status === 200 && body.includes(`href="${eventPath}"`) }
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

    for (const path of surfaces) {
      const r = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
      const status = r?.status() ?? 0
      const rendered = await page.locator(`a[href="${eventPath}"]`).count()
      perViewport.surfaces.push({ path, status, renderedLinks: rendered })
      if (status !== 200) fail(`item 4 at ${label}: ${path} answered HTTP ${status}`)
      else if (rendered === 0) fail(`item 4 at ${label}: ${path} renders no link to ${eventPath} in the browser`)
      else {
        const kind = path.startsWith('/city/') ? 'city' : path.startsWith('/community/') ? 'community' : 'browse'
        await page.screenshot({ path: join(SHOTS, `item4-${kind}-${label}.png`) })
      }
    }
    results.item4[label] = perViewport

    // ---------------------------------------------------------------------
    // ITEM 8. Clicking only. Nothing after the homepage is typed.
    // waitForURL, not waitForLoadState: the first version read page.url()
    // straight after the click, before the App Router soft navigation had
    // committed, and recorded three false failures saying the click landed
    // back on the homepage.
    // ---------------------------------------------------------------------
    const homeRes = await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
    const homeStatus = homeRes?.status() ?? 0
    if (homeStatus !== 200) fail(`item 8 at ${label}: the homepage answered HTTP ${homeStatus}`)
    await page.screenshot({ path: join(SHOTS, `item8-home-${label}.png`) })

    const homeEventLinks = [
      ...new Set(
        await page.$$eval('a[href^="/events/"]', (as) =>
          as.map((a) => a.getAttribute('href') ?? '').filter((h) => /^\/events\/[^/]+$/.test(h)),
        ),
      ),
    ]
    let reached = null
    if (homeEventLinks.length === 0) {
      fail(`item 8 at ${label}: the homepage offers no event link at all, so an event cannot be found from it`)
    } else {
      const target = homeEventLinks[0]
      const link = page.locator(`a[href="${target}"]`).first()
      await link.scrollIntoViewIfNeeded()
      await link.click()
      let navigated = true
      try {
        await page.waitForURL(`**${target}`, { timeout: 15000 })
      } catch {
        navigated = false
      }
      const landedPath = new URL(page.url()).pathname
      const landedTitle = (await page.locator('h1').first().textContent().catch(() => ''))?.trim() ?? ''
      const isRealEvent = slugs.includes(landedPath.replace('/events/', ''))
      reached = { clicked: target, navigated, landedPath, landedTitle, isRealEvent }
      if (!navigated) fail(`item 8 at ${label}: clicking ${target} did not navigate within 15s; the browser stayed on ${landedPath}`)
      if (!landedTitle) fail(`item 8 at ${label}: the page reached by clicking rendered no h1`)
      if (!isRealEvent) fail(`item 8 at ${label}: ${landedPath} is not one of the events the sitemap publishes`)
      await page.screenshot({ path: join(SHOTS, `item8-event-${label}.png`) })
    }
    results.item8[label] = { homeStatus, eventLinksOnHome: homeEventLinks.length, reached }

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
