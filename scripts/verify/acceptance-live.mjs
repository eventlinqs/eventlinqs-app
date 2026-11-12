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
 *   photo-credit-alt      every photograph drawn on a night is the night's own, rights recorded, with alt text; or
 *                         (Lawal, 12 November 2026, 01:01) the venue photograph the photo lock dealt to that night,
 *                         the card naming it as the venue and printing the credit its licence asks for.
 *   cards-no-uncredited   the CONTROLLER's 12:55 (3), one rule everywhere: no event card on / or /events draws a
 *                         Wikimedia Commons (venue) photograph without 'The venue' and, where its licence asks, its credit.
 *   every-tap-works       the CONTROLLER's 14:10: at 390 with a touch profile, every link, chip, tab and button on /, the
 *                         four guides, the Victoria page, /events, one event page and AMCF lands on a 200 page or visibly
 *                         changes state within 300 ms; no 404, no dead tap, no scroll only (scripts/verify/every-tap.mjs).
 *
 * Production is read READ ONLY through the Supabase Management API's SQL endpoint ({ read_only: true }) with the CLI's
 * token: run under scripts\ops\with-supabase-token.ps1. The site read is our own pages only, in one browser.
 *
 * Usage: node scripts/verify/acceptance-live.mjs --base https://www.eventlinqs.com.au --out <dir> [--cities geelong,melbourne,ballarat,bendigo]
 * Exit 0 only when every check passes.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { everyTap } from './every-tap.mjs'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const BASE = arg('base', 'https://www.eventlinqs.com.au').replace(/\/$/, '')
const OUT = arg('out', '.')
/*
 * IN PARTS (7 November 2026: the host stopped long background runs for low memory three times, and this run is about 55
 * minutes, most of it the taps). --no-cities leaves the city checks out of a run; --tap-paths and --wide-paths name the
 * pages tapped at 390 and at 1440 ('none' for none), so the taps run in parts that each fit a foreground run. Without
 * them the run is the whole of it, as before.
 */
const CITIES = process.argv.includes('--no-cities') ? [] : arg('cities', 'geelong,melbourne,ballarat,bendigo').split(',').filter(Boolean)
const pathsArg = (name, fallback) => {
  const v = arg(name, null)
  if (v === null) return fallback
  return v === 'none' ? [] : v.split(',').filter(Boolean)
}
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
         (select c.image_url from public.event_cover_photos_for(array[e.id], 'event_card') c limit 1) as venue_photo,
         (select c.licence from public.event_cover_photos_for(array[e.id], 'event_card') c limit 1) as venue_licence,
         coalesce(e.end_date, ((date_trunc('day', e.start_date at time zone coalesce(e.timezone, 'Australia/Melbourne')) + interval '1 day')
           at time zone coalesce(e.timezone, 'Australia/Melbourne'))) as until
    from public.events e
   where e.status = 'published' and e.visibility = 'public'
     and coalesce(e.end_date, ((date_trunc('day', e.start_date at time zone coalesce(e.timezone, 'Australia/Melbourne')) + interval '1 day')
           at time zone coalesce(e.timezone, 'Australia/Melbourne'))) >= now()`)
const bySlug = new Map(nights.map((n) => [n.slug, n]))
// A public list drops a night LIST_END_LEAD_MS before its end (car 43, src/lib/events/listing-window.ts), so law 16 can
// only demand a night that still had more than that to run when its guide was read. Read from its one source.
// (10 November 2026: 'MISSING 1: disaster preparation at home|geelong west library' read at 11:26:00, four minutes
// before its 11:30 end, was the check's fault, not the guide's.) no-ended-night keeps the true end, because a cached
// page may carry a night into its lead until the five minute purge runs.
const LEAD_MS = (() => {
  const src = readFileSync(join(process.cwd(), 'src', 'lib', 'events', 'listing-window.ts'), 'utf8')
  const m = src.match(/export const LIST_END_LEAD_MS = ([0-9][0-9 *]*)/)
  if (!m) throw new Error('LIST_END_LEAD_MS is not declared in src/lib/events/listing-window.ts')
  return m[1].split('*').reduce((a, x) => a * Number(x.trim()), 1)
})()
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
  const readAt = Date.now() // the guide was rendered before this instant, so it judged no later than this plus its lead
  await page.waitForTimeout(1500)
  // The first look: Big nights' links in order, and every photograph drawn inside a night's link.
  const big = await page.$$eval('section[aria-label^="Big nights in"] a[href^="/events/"]', (as) => [...new Set(as.map((a) => a.getAttribute('href')))])
  const photos = await page.$$eval('a[href^="/events/"] img', (imgs) =>
    imgs
      .filter((i) => !i.closest('[aria-hidden="true"]'))
      .map((i) => ({
        href: i.closest('a').getAttribute('href'),
        src: i.currentSrc || i.getAttribute('src') || '',
        alt: i.getAttribute('alt') ?? '',
        card: i.closest('a').textContent ?? '',
      })),
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
  pageData[city] = { big, photos, linked, readAt }
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
  const inCity = nights.filter((n) => n.city.includes(city))
  const mine = inCity.filter((n) => Date.parse(n.until) >= pageData[city].readAt + LEAD_MS)
  const inLead = inCity.length - mine.length
  const listings = new Map()
  for (const n of mine) listings.set(listingOf(n), [...(listings.get(listingOf(n)) ?? []), n.slug])
  const linked = new Set(pageData[city].linked)
  const missing = [...listings.entries()].filter(([, slugs]) => !slugs.some((s) => linked.has(s))).map(([k, slugs]) => `${k} (${slugs[0]})`)
  record('law16-reachable', city, missing.length === 0, `${listings.size - missing.length} of ${listings.size} listings (${mine.length} nights) reachable with All dates${inLead ? ` (${inLead} night(s) inside their last ${LEAD_MS / 60000} minutes not required)` : ''}${missing.length ? `; MISSING ${missing.length}: ${missing.slice(0, 8).join('; ')}` : ''}`)
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

// 6: every photograph on a night is its own, rights recorded, with alt text; OR (Lawal, 12 November 2026, 01:01: venue
// photos on cards, labelled as the venue) the venue photograph the photo lock dealt to THAT night, with the card naming
// the venue and printing the credit its licence asks for.
const NO_CREDIT_ASKED = new Set(['cc0', 'public_domain'])
for (const city of CITIES) {
  const bad = []
  let venueShown = 0
  for (const p of pageData[city].photos) {
    const n = bySlug.get(p.href.replace(/^\/events\//, ''))
    const src = decodeURIComponent(p.src)
    const file = n?.cover_image_url ? decodeURIComponent(n.cover_image_url).split('/').pop() : null
    const own = Boolean(file) && src.includes(file)
    const recorded = n && ['organiser_authorised', 'separately_licensed'].includes(n.cover_rights)
    const venueFile = n?.venue_photo ? decodeURIComponent(n.venue_photo).split('/').pop() : null
    const venue = !own && Boolean(venueFile) && src.includes(venueFile)
    if (venue) {
      venueShown += 1
      if (!p.card.includes('The venue')) bad.push(`${p.href} draws its venue's photograph without naming it as the venue`)
      else if (!NO_CREDIT_ASKED.has(n.venue_licence) && !p.card.includes('Photo: ')) bad.push(`${p.href} draws its venue's ${n.venue_licence} photograph without its credit`)
      else if (!p.alt.trim()) bad.push(`${p.href} draws its venue's photograph with no alt text`)
    } else if (!own || !recorded) bad.push(`${p.href} draws ${own ? 'its cover with rights ' + (n?.cover_rights ?? 'none') : 'an image that is neither its own cover nor the venue photo dealt to it (' + src.slice(-60) + ')'}`)
    else if (!p.alt.trim()) bad.push(`${p.href} draws its own photograph with no alt text`)
  }
  record('photo-credit-alt', city, bad.length === 0, bad.length ? `${bad.length}: ${bad.slice(0, 6).join('; ')}` : `${pageData[city].photos.length} photograph(s): ${pageData[city].photos.length - venueShown} the night's own, rights recorded; ${venueShown} the venue's, dealt to that night, named and credited; each with alt`)
}

// 7: one rule everywhere, the home rails and /events cards.
for (const path of ['/', '/events']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  // A Commons photograph on a card is a venue's, and it is drawn only with its credit in words on that card (Lawal,
  // 12 November 2026, 01:01); the CONTROLLER's 12:55 (3) rule, no uncredited Commons photograph on a card, stands.
  const commons = await page.$$eval('a[href^="/events/"] img', (imgs) =>
    imgs.filter((i) => !i.closest('[aria-hidden="true"]'))
      .map((i) => ({ href: i.closest('a').getAttribute('href'), src: decodeURIComponent(i.currentSrc || i.getAttribute('src') || ''), card: i.closest('a').textContent ?? '' }))
      .filter((p) => /upload\.wikimedia\.org|commons\.wikimedia\.org/.test(p.src)))
  const uncredited = commons.filter((p) => {
    const n = bySlug.get(p.href.replace(/^\/events\//, ''))
    return !p.card.includes('The venue') || (!NO_CREDIT_ASKED.has(n?.venue_licence) && !p.card.includes('Photo: '))
  })
  record('cards-no-uncredited', path, uncredited.length === 0, uncredited.length ? `${uncredited.length}: ${uncredited.slice(0, 5).map((p) => `${p.href} (${p.src.slice(-50)})`).join('; ')}` : `${commons.length} Commons photograph(s) on cards, each named as the venue with its credit`)
  await page.close()
}

// 8: every tap works (--skip-taps leaves it out of a quick run, and says so).
if (process.argv.includes('--skip-taps')) {
  console.log('NOT RUN every-tap-works: --skip-taps')
} else {
  const TAP_PATHS = pathsArg('tap-paths', ['/', '/city/geelong', '/city/melbourne', '/city/ballarat', '/city/bendigo', '/state/victoria', '/events', '/events/boyz-ii-men-mt-duneed-estate-2026-11-28', '/events/amcf-2026', '/login', '/signup'])
  const taps = TAP_PATHS.length ? await everyTap(browser, BASE, TAP_PATHS, join(OUT, 'every-tap')) : []
  for (const path of TAP_PATHS) {
    const mine = taps.filter((t) => t.path === path)
    const bad = mine.filter((t) => !t.ok)
    record('every-tap-works', path, bad.length === 0, `${mine.length - bad.length} of ${mine.length} taps work${bad.length ? `; FAIL ${bad.length}: ${bad.slice(0, 6).map((t) => `[${t.region}] '${t.label}' ${t.result}`).join('; ')}` : ''}`)
  }
  // AND AT 1440 (the CONTROLLER's 15:10 of 4 November (1): 'at 390 and 1440 on /, /city/geelong, /city/melbourne,
  // /city/ballarat, /city/bendigo, /state/victoria and one event page'): the desktop layout, a touch-capable screen so
  // the same press is made.
  const WIDE_PATHS = pathsArg('wide-paths', ['/', '/city/geelong', '/city/melbourne', '/city/ballarat', '/city/bendigo', '/state/victoria', '/events/amcf-2026'])
  const wide = WIDE_PATHS.length ? await everyTap(browser, BASE, WIDE_PATHS, join(OUT, 'every-tap-1440'), { viewport: { width: 1440, height: 900 }, hasTouch: true, isMobile: false, deviceScaleFactor: 1 }) : []
  for (const path of WIDE_PATHS) {
    const mine = wide.filter((t) => t.path === path)
    const bad = mine.filter((t) => !t.ok)
    record('every-tap-works-1440', path, bad.length === 0, `${mine.length - bad.length} of ${mine.length} taps work${bad.length ? `; FAIL ${bad.length}: ${bad.slice(0, 6).map((t) => `[${t.region}] '${t.label}' ${t.result}`).join('; ')}` : ''}`)
  }
}

await browser.close()
writeFileSync(join(OUT, 'acceptance-live.json'), JSON.stringify({ base: BASE, read_at: dbNow, results }, null, 1))
const failed = results.filter((r) => !r.ok)
console.log(`${results.length - failed.length} PASS, ${failed.length} FAIL against ${BASE} at ${dbNow}`)
process.exit(failed.length ? 1 : 0)
