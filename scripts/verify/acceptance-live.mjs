/**
 * ACCEPTANCE ON LIVE DATA (law 17 of C:\dev\CLAUDE.md, Lawal 3 November 2026, 12:04: 'the design is accepted on LIVE
 * data, never on TEST data'). Every item is a named check that prints PASS or FAIL with what it read, never a judgement
 * from a screenshot. It runs against a build that reads PRODUCTION's rows (before GO CAR) and against
 * www.eventlinqs.com.au (after every car); the CONTROLLER reads its output.
 *
 * The six named checks of law 17 (d), in order:
 *   amcf-row-photo        AMCF's row shows its own photograph (/city/melbourne).
 *   amcf-leads-big-nights AMCF leads Melbourne's Big nights.
 *   law16-reachable       every published, still listed night of each city is reachable on its guide with All dates
 *                         (one listing, title at venue, is one entry: at least one of its nights is linked).
 *   no-ended-night        no night past its end is linked on any guide.
 *   headline-reachable    Boyz II Men is reachable on the Geelong guide (Lawal 12:29, the CONTROLLER's 12:31: Big nights
 *                         stays photo first then date, so a show without a permitted photograph is reachable, not forced in).
 *   photo-credit-alt      every photograph drawn on a night is the night's own, rights recorded, with alt text; a third
 *                         party photograph (a venue photo) is never drawn there without its visible credit.
 *   cards-no-uncredited   the CONTROLLER's 12:55 (3), one rule everywhere: no event card on / or /events draws a
 *                         photograph whose licence needs a visible credit (a Wikimedia Commons venue photo).
 *
 * Production is read READ ONLY through the Supabase Management API's SQL endpoint ({ read_only: true }) with the CLI's
 * token: run under scripts\ops\with-supabase-token.ps1. The site read is our own pages only, in one browser.
 *
 * Usage: node scripts/verify/acceptance-live.mjs --base https://www.eventlinqs.com.au --out <dir> [--cities geelong,melbourne,ballarat,bendigo]
 * Exit 0 only when every check passes.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const BASE = arg('base', 'https://www.eventlinqs.com.au').replace(/\/$/, '')
const OUT = arg('out', '.')
const CITIES = arg('cities', 'geelong,melbourne,ballarat,bendigo').split(',')
const REF = 'gndnldyfudbytbboxesk'
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
if (!TOKEN) {
  console.error('REFUSED: run under scripts\\ops\\with-supabase-token.ps1 (production is read through the Management API, read only).')
  process.exit(2)
}
mkdirSync(OUT, { recursive: true })

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, read_only: true }),
  })
  if (!res.ok) throw new Error(`production read refused (${res.status}): ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

// Every published, public night still listed now, with what the checks need. The listing rule is listing-window.ts's:
// its end where held, else the end of its start day in its own zone.
const nights = await sql(`
  select e.slug, e.title, e.venue_name, lower(coalesce(e.venue_city, '')) as city, e.start_date, e.end_date, e.timezone,
         e.cover_image_url, nullif(btrim(coalesce(e.cover_image_alt, '')), '') as cover_alt,
         (select r.rights_state from public.event_image_rights r where r.event_id = e.id and r.image_role = 'cover' limit 1) as cover_rights,
         coalesce(e.end_date, ((date_trunc('day', e.start_date at time zone coalesce(e.timezone, 'Australia/Melbourne')) + interval '1 day')
           at time zone coalesce(e.timezone, 'Australia/Melbourne'))) as until
    from public.events e
   where e.status = 'published' and e.visibility = 'public'
     and coalesce(e.end_date, ((date_trunc('day', e.start_date at time zone coalesce(e.timezone, 'Australia/Melbourne')) + interval '1 day')
           at time zone coalesce(e.timezone, 'Australia/Melbourne'))) >= now()`)
const bySlug = new Map(nights.map((n) => [n.slug, n]))
const listingOf = (n) => `${n.title.trim().toLowerCase()}|${(n.venue_name ?? '').trim().toLowerCase()}`
const [{ now: dbNow }] = await sql('select now()')

const results = []
const record = (id, city, ok, detail) => {
  results.push({ id, city, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id}${city ? ` (${city})` : ''}: ${detail}`)
}

const browser = await chromium.launch()
const pageData = {}
for (const city of CITIES) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await page.goto(`${BASE}/city/${city}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  // The first look: Big nights' links in order, and every photograph drawn inside a night's link.
  const big = await page.$$eval('section[aria-label^="Big nights in"] a[href^="/events/"]', (as) => [...new Set(as.map((a) => a.getAttribute('href')))])
  const photos = await page.$$eval('a[href^="/events/"] img', (imgs) =>
    imgs
      .filter((i) => !i.closest('[aria-hidden="true"]'))
      .map((i) => ({ href: i.closest('a').getAttribute('href'), src: i.currentSrc || i.getAttribute('src') || '', alt: i.getAttribute('alt') ?? '' })),
  )
  await page.screenshot({ path: join(OUT, `${city}-390-top.png`), fullPage: false })
  const bigBox = page.locator('section[aria-label^="Big nights in"]')
  if (await bigBox.count()) await bigBox.first().screenshot({ path: join(OUT, `${city}-390-big-nights.png`) })
  // All dates, then every 'Show more', then every night linked anywhere on the page.
  const allDates = page.getByRole('button', { name: 'All dates', exact: true })
  if (await allDates.count()) await allDates.first().click()
  for (let i = 0; i < 400; i++) {
    const more = page.getByRole('button', { name: /^Show more/ })
    if ((await more.count()) === 0) break
    await more.first().click()
  }
  const linked = await page.$$eval('a[href^="/events/"]', (as) => [...new Set(as.map((a) => a.getAttribute('href').replace(/^\/events\//, '').split(/[?#]/)[0]))])
  pageData[city] = { big, photos, linked }
  await page.close()
}

// 1 and 2: AMCF on Melbourne.
if (pageData.melbourne) {
  const amcf = pageData.melbourne.photos.filter((p) => p.href === '/events/amcf-2026')
  const own = amcf.filter((p) => /organiser-supplied%2Famcf-2026|organiser-supplied\/amcf-2026/.test(p.src))
  record('amcf-row-photo', 'melbourne', own.length > 0, own.length ? `AMCF draws its own photograph (${own[0].src.slice(-70)})` : `AMCF draws ${amcf.length} image(s), none its own photograph`)
  const first = pageData.melbourne.big[0] ?? '(none)'
  record('amcf-leads-big-nights', 'melbourne', first === '/events/amcf-2026', `Big nights reads ${JSON.stringify(pageData.melbourne.big)}`)
}

// 3: law 16, per city, listing by listing.
for (const city of CITIES) {
  const mine = nights.filter((n) => n.city.includes(city))
  const listings = new Map()
  for (const n of mine) listings.set(listingOf(n), [...(listings.get(listingOf(n)) ?? []), n.slug])
  const linked = new Set(pageData[city].linked)
  const missing = [...listings.entries()].filter(([, slugs]) => !slugs.some((s) => linked.has(s))).map(([k, slugs]) => `${k} (${slugs[0]})`)
  record('law16-reachable', city, missing.length === 0, `${listings.size - missing.length} of ${listings.size} listings (${mine.length} nights) reachable with All dates${missing.length ? `; MISSING ${missing.length}: ${missing.slice(0, 8).join('; ')}` : ''}`)
}

// 4: no ended night linked.
for (const city of CITIES) {
  const ended = pageData[city].linked.filter((s) => !bySlug.has(s))
  record('no-ended-night', city, ended.length === 0, ended.length ? `${ended.length} linked night(s) not listed now (ended or not public): ${ended.slice(0, 8).join(', ')}` : `every linked night is listed at ${dbNow}`)
}

// 5: the headline show in Geelong is reachable on its guide (12:31: not forced into Big nights).
if (pageData.geelong) {
  const boyz = pageData.geelong.linked.filter((s) => /^boyz-ii-men-/.test(s))
  record('headline-reachable', 'geelong', boyz.length > 0, boyz.length ? `Boyz II Men is linked (${boyz[0]}); Big nights reads ${JSON.stringify(pageData.geelong.big)}` : 'Boyz II Men is linked nowhere on the guide, All dates and every Show more pressed')
}

// 6: every photograph on a night is its own, rights recorded, with alt text.
for (const city of CITIES) {
  const bad = []
  for (const p of pageData[city].photos) {
    const n = bySlug.get(p.href.replace(/^\/events\//, ''))
    const file = n?.cover_image_url ? decodeURIComponent(n.cover_image_url).split('/').pop() : null
    const own = Boolean(file) && decodeURIComponent(p.src).includes(file)
    const recorded = n && ['organiser_authorised', 'separately_licensed'].includes(n.cover_rights)
    if (!own || !recorded) bad.push(`${p.href} draws ${own ? 'its cover with rights ' + (n?.cover_rights ?? 'none') : 'an image that is not its own cover (' + decodeURIComponent(p.src).slice(-60) + ')'}`)
    else if (!p.alt.trim()) bad.push(`${p.href} draws its own photograph with no alt text`)
  }
  record('photo-credit-alt', city, bad.length === 0, bad.length ? `${bad.length}: ${bad.slice(0, 6).join('; ')}` : `${pageData[city].photos.length} photograph(s), each the night's own, rights recorded, with alt`)
}

// 7: one rule everywhere, the home rails and /events cards.
for (const path of ['/', '/events']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const commons = await page.$$eval('a[href^="/events/"] img', (imgs) =>
    imgs.map((i) => ({ href: i.closest('a').getAttribute('href'), src: decodeURIComponent(i.currentSrc || i.getAttribute('src') || '') }))
      .filter((p) => /upload\.wikimedia\.org|commons\.wikimedia\.org/.test(p.src)))
  record('cards-no-uncredited', path, commons.length === 0, commons.length ? `${commons.length}: ${commons.slice(0, 5).map((p) => `${p.href} (${p.src.slice(-50)})`).join('; ')}` : 'no event card draws a Commons photograph')
  await page.close()
}

await browser.close()
writeFileSync(join(OUT, 'acceptance-live.json'), JSON.stringify({ base: BASE, read_at: dbNow, results }, null, 1))
const failed = results.filter((r) => !r.ok)
console.log(`${results.length - failed.length} PASS, ${failed.length} FAIL against ${BASE} at ${dbNow}`)
process.exit(failed.length ? 1 : 0)
