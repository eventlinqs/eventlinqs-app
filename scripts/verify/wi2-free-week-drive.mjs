/**
 * WI2 PART 2, DRIVEN: the city guide's week, /free/<city>/this-week, on TEST.
 *
 * WI2-ITEM.md, How it is judged: "Driven proof at 390, 768 and 1440 ... both city
 * guide pages" (every guide city, by ruling a of 21 October 2026), and section
 * 5: "A night not confirmed for 21 days is hidden from the guide until checked
 * again". docs/walk-in/WI2-PLAN.md section 8a states what each check reads.
 *
 * THE FRESHNESS PROOF. Two fixture nights at a Geelong host, each with one
 * occurrence tomorrow: one last checked 22 days ago, one yesterday. The database
 * gives each occurrence its freshness the moment it is written (the trigger
 * event_takes_its_series_freshness), so the first is past its 21 days and the
 * second is not. The stale night must be on no guide page; the fresh one must be
 * on Geelong's. Both are made as a real listing is: the night, its listing check,
 * then the daily run's own route makes the occurrence. At the end each night is
 * retired (status removed; the service role holds no delete on event_series) and
 * its occurrence made UNLISTED, never deleted here: the events sitemap holds a
 * 300 second snapshot and a deleted public page would answer 404 to whatever read
 * it. The next daily run takes the occurrences off by the retired night's own
 * lifecycle.
 *
 * Usage, against a production build served locally against TEST, with
 * CRON_SECRET in the environment (the occurrences are made first by the daily
 * run's own route); the loader is what lets it read the card sizes from src:
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     node --import ./scripts/lib/src-alias-loader.mjs --env-file=.env.local \
 *     scripts/verify/wi2-free-week-drive.mjs http://localhost:3000 --label=run1
 *
 * TEST ONLY: the repository preflight, then the TEST ref.
 */
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { Agent } from 'undici'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { answerTheCookieBanner } from './lib/cookie-banner.mjs'

// The card sizes come from the one place that states them with their sources,
// never typed here (Law 7, and the guard sourced-specifications).
const { SOCIAL_CARD_FORMATS } = await import('../../src/lib/broadcast/social-card-spec.ts')

assertNotProduction()

const TAG = '[wi2-free-week]'
const args = process.argv.slice(2)
const BASE = args.find((a) => a.startsWith('http')) ?? 'http://localhost:3000'
const LABEL = args.find((a) => a.startsWith('--label='))?.split('=')[1] ?? 'run'
const OUT = join('C:/dev/EVIDENCE/WI1/wi2-free-week', LABEL)
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON = process.env.CRON_SECRET
if (!URL_ || !SERVICE) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
if (!/vkapkibzokmfaxqogypq/.test(URL_)) throw new Error(`refusing to write to ${URL_}: this drive runs against TEST only`)
if (!CRON) throw new Error('CRON_SECRET is required to make the occurrences through the daily run')
mkdirSync(OUT, { recursive: true })

const db = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const results = []
function check(name, ok, detail) {
  results.push(Boolean(ok))
  console.log(`${TAG} ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
}
/**
 * A check whose subject was never made: counted, never passed, and said as what it is. Drive 3 (25 October
 * 2026) reported one failed connection as eleven failures, the last a 404 for a night opened with no slug
 * ("[event-detail] no public row for undefined"); a check that cannot look says NOT REACHED and why.
 */
const notReached = []
function unreached(name, why) {
  results.push(false)
  notReached.push(name)
  console.log(`${TAG} NOT REACHED  ${name} - ${why}`)
}
async function must(label, promise) {
  const { data, error } = await promise
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}
const stamp = Date.now().toString(36)
/** What a proof night's listing check cites: a reserved documentation address, never a real source. */
const FIXTURE_SOURCE = 'https://example.org/wi2-proof-fixture'
/** Text as React escapes it into server HTML, so a host called "Murphy's" is found. */
const asReactWritesIt = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
const ZONE = 'Australia/Melbourne'
const day = (offset) => {
  const d = new Date(Date.now() + offset * 864e5)
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
const WIDTHS = [
  { label: '390', width: 390, height: 844 },
  { label: '768', width: 768, height: 1024 },
  { label: '1440', width: 1440, height: 900 },
]

// The first run on a fresh import makes every night's next dates, each with its
// cover drawn, which can outlast fetch's default 300 second wait for headers. No
// limit here; the time it took is printed, because Vercel's own function limit
// is what production's first run has to fit inside.
const patient = new Agent({ headersTimeout: 0, bodyTimeout: 0 })
async function callRun() {
  const began = Date.now()
  const r = await fetch(`${BASE}/api/cron/listing-occurrences`, { headers: { Authorization: `Bearer ${CRON}` }, dispatcher: patient })
  const body = await r.json().catch(() => null)
  const seconds = Math.round((Date.now() - began) / 1000)
  for (const f of body?.failed ?? []) console.log(`${TAG}   failed ${f.seriesId} ${f.date ?? ''}: ${f.why}`)
  for (const h of body?.held ?? []) console.log(`${TAG}   held ${h.seriesId} ${h.date}: ${h.why}`)
  const said = JSON.stringify({ status: r.status, seconds, nights: body?.nights, made: body?.created, changed: body?.updated, deleted: body?.deleted, unchanged: body?.unchanged, held: body?.held?.length, failed: body?.failed?.length, stoppedEarly: body?.stoppedEarly, nightsNotReached: body?.nightsNotReached })
  return { status: r.status, body, seconds, said, fine: r.status === 200 && body?.ok === true && (body.failed?.length ?? 1) === 0 }
}
async function dailyRun(label) {
  const run = await callRun()
  check(`${label}: the daily run answers and no night fails (${run.seconds} s)`, run.fine, run.said)
  return run
}

// 1. Every night's dated occurrences, through the daily run's own route. A night
//    an earlier run retired loses its occurrence here, by the same lifecycle.
await dailyRun('the first run')

const cities = await must('the guide cities', db.from('cities').select('slug, name, timezone').eq('free_guide', true).eq('is_active', true).order('display_order'))
check('the cities table names the guide cities', cities.length >= 4, cities.map((c) => c.slug).join(', '))

// 2. The freshness fixtures, made the way a real listing is: a night, its
//    check, then the daily run makes its occurrence and the database gives it
//    its freshness. Only the check's date differs between the two.
const listings = await must('the listings organisation', db.from('organisations').select('id').eq('slug', 'eventlinqs-listings').single())
const host = await must('a Geelong host', db.from('venues').select('id, name').eq('city_slug', 'geelong').eq('listing_source', 'eventlinqs').is('removed_at', null).order('name').limit(1).single())
const donor = await must('a category a real night uses', db.from('event_series').select('category_id').eq('listing_source', 'eventlinqs').not('category_id', 'is', null).limit(1).single())
const tomorrow = day(1)
const dow = new Date(`${tomorrow}T12:00:00Z`).getUTCDay()
const fixtures = []
const budgetNights = []
const allFixtureNights = () => [...fixtures.map((f) => f.seriesId), ...budgetNights]

/**
 * Every proof night is retired (status removed; the service role holds no delete
 * on event_series) and its occurrences made unlisted, never deleted here. Called
 * on EVERY way out once the first fixture exists: a throw while they are made, or
 * the end of the page drive, so no proof night is left active on TEST.
 */
async function retireFixtures() {
  if (allFixtureNights().length === 0) return
  const retired = await db.from('event_series').update({ status: 'removed' }).in('id', allFixtureNights()).select('id')
  const hidden = await db.from('events').update({ visibility: 'unlisted' }).in('listing_series_id', allFixtureNights()).select('id')
  console.log(`${TAG} ${(retired.data ?? []).length} of ${allFixtureNights().length} proof night(s) retired, ${(hidden.data ?? []).length} occurrence(s) made unlisted (the next daily run takes them off)`)
}

async function makeFixtures() {
  for (const [kind, checkedOn] of [['stale', day(-22)], ['fresh', day(-1)]]) {
    const name = `Freshness proof ${kind} ${stamp}`
    const series = await must(`the ${kind} night`, db.from('event_series').insert({
      venue_id: host.id,
      organisation_id: listings.id,
      name,
      category_id: donor.category_id,
      rule: 'once',
      anchor_date: tomorrow,
      day: dow,
      starts_at: '19:00',
      ends_at: '21:00',
      timezone: ZONE,
      summary: 'A fixture for the WI2 freshness proof, retired when the proof ends.',
    }).select('id').single())
    await must(`the ${kind} night's check`, db.from('listing_checks').insert({
      series_id: series.id,
      source_url: FIXTURE_SOURCE,
      source_date: checkedOn,
      import_file: 'wi2-free-week-drive (a proof fixture)',
      outcome: 'confirmed',
      reuse_basis: 'manual_research_facts_only',
    }))
    fixtures.push({ kind, name, seriesId: series.id, checkedOn })
  }
  // THE BUDGET, PROVED ON THE SERVED ROUTE (the-daily-run-finishes-what-it-starts):
  // six weekly nights owe 48 dates, more than one run makes inside its 240 s budget
  // at the several seconds a date this machine takes. EVERY call must stop inside
  // the route's declared 300 s, BETWEEN writes (no draft left), and the calls that
  // follow must finish what is left. How many calls that takes is not the claim:
  // the 25 October drive measured about 100 s of reads before any write on this
  // machine, so the second call stopped at its budget too, correctly.
  for (let n = 1; n <= 6; n += 1) {
    const series = await must(`budget night ${n}`, db.from('event_series').insert({
      venue_id: host.id,
      organisation_id: listings.id,
      name: `Budget proof ${n} ${stamp}`,
      category_id: donor.category_id,
      rule: 'weekly',
      anchor_date: tomorrow,
      day: dow,
      starts_at: '18:00',
      ends_at: '20:00',
      timezone: ZONE,
      summary: 'A fixture for the WI2 budget proof, retired when the proof ends.',
    }).select('id').single())
    await must(`budget night ${n}'s check`, db.from('listing_checks').insert({
      series_id: series.id,
      source_url: FIXTURE_SOURCE,
      source_date: day(-1),
      import_file: 'wi2-free-week-drive (a proof fixture)',
      outcome: 'confirmed',
      reuse_basis: 'manual_research_facts_only',
    }))
    budgetNights.push(series.id)
  }
  const budgeted = await callRun()
  check(`a run owed ${2 + 6 * 8} dates stops at its budget, inside its declared 300 s (${budgeted.seconds} s)`,
    budgeted.fine && budgeted.body?.stoppedEarly === true && budgeted.seconds < 300, budgeted.said)
  if (!budgeted.fine) {
    const why = `the run's first call answered ${budgeted.said}, so nothing it owed was made`
    for (const name of ['the stopped run left no draft behind', 'the calls that follow finish what was left', 'every owed date is made and published',
      'the daily run made the stale night its one published occurrence', 'the daily run made the fresh night its one published occurrence',
      'the stale night: a freshness already passed', 'the fresh night: a freshness still to come']) unreached(name, why)
    return { stale: fixtures.find((f) => f.kind === 'stale'), fresh: fixtures.find((f) => f.kind === 'fresh'), made: false }
  }
  const halfway = await must('the fixture occurrences after the stopped run', db.from('events').select('status').in('listing_series_id', allFixtureNights()))
  check('the stopped run left no draft behind: it stopped between writes', halfway.every((e) => e.status === 'published'), `${halfway.length} made, ${halfway.filter((e) => e.status !== 'published').length} not published`)
  const MAX_CALLS = 5
  let calls = 1
  let last = budgeted
  while (last.fine && last.body?.stoppedEarly === true && calls < MAX_CALLS) {
    last = await callRun()
    calls += 1
    const between = await must(`the fixture occurrences after call ${calls}`, db.from('events').select('status').in('listing_series_id', allFixtureNights()))
    check(`call ${calls} stops inside its declared 300 s, leaving no draft (${last.seconds} s)`,
      last.fine && last.seconds < 300 && between.every((e) => e.status === 'published'), last.said)
  }
  check(`the calls that follow finish what was left, within ${MAX_CALLS} calls (${calls} made)`, last.fine && last.body?.stoppedEarly === false, last.said)
  const whole = await must('the fixture occurrences after the last call', db.from('events').select('status').in('listing_series_id', allFixtureNights()))
  check(`every owed date is made and published (${whole.length} of ${2 + 6 * 8})`, whole.length === 2 + 6 * 8 && whole.every((e) => e.status === 'published'))
  for (const f of fixtures) {
    const rows = await must(`the ${f.kind} occurrence`, db.from('events').select('id, slug, status, visibility, listing_fresh_until').eq('listing_series_id', f.seriesId))
    Object.assign(f, rows[0] ?? {})
    check(`the daily run made the ${f.kind} night its one published occurrence`, rows.length === 1 && f.status === 'published' && f.visibility === 'public', `${rows.length} row(s), ${f.status}, ${f.slug}`)
  }
  const stale = fixtures.find((f) => f.kind === 'stale')
  const fresh = fixtures.find((f) => f.kind === 'fresh')
  check(`checked ${stale.checkedOn}: the database gives the occurrence a freshness already passed`, Boolean(stale.listing_fresh_until) && Date.parse(stale.listing_fresh_until) <= Date.now(), stale.listing_fresh_until)
  check(`checked ${fresh.checkedOn}: a freshness still to come`, Boolean(fresh.listing_fresh_until) && Date.parse(fresh.listing_fresh_until) > Date.now(), fresh.listing_fresh_until)
  return { stale, fresh, made: true }
}

let stale
let fresh
let made
try {
  ;({ stale, fresh, made } = await makeFixtures())
} catch (error) {
  await retireFixtures()
  throw error
}

const browser = await chromium.launch()
try {
  // 3. Every guide city, at every width.
  for (const city of cities) {
    const path = `/free/${city.slug}/this-week`
    for (const vp of WIDTHS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
      const page = await context.newPage()
      const res = await page.goto(`${BASE}${path}`, { waitUntil: 'load' })
      await answerTheCookieBanner(page)
      const where = `${city.slug} ${vp.label}`
      check(`${where}: the page answers 200`, res?.status() === 200, String(res?.status()))
      const h1 = (await page.locator('h1').first().textContent())?.trim()
      check(`${where}: the heading names the city and the week`, h1 === `Free things to do in ${city.name} this week`, h1)
      const html = await page.content()
      check(`${where}: the listings organisation is named nowhere`, !/EventLinqs listings/.test(html))
      const text = await page.locator('main').innerText()
      const dayHeadings = await page.locator('main h2[id^="day-"]').allTextContents()
      const cards = await page.locator('main a[href^="/events/"]').count()
      if (cards > 0) {
        check(`${where}: the week is grouped by day`, dayHeadings.length > 0, dayHeadings.slice(0, 3).join(' | '))
        check(`${where}: every event says which free it is`, /Free entry, no ticket needed|Free, ticket needed/.test(text))
        const ld = await page.locator('script[type="application/ld+json"]').allTextContents()
        check(`${where}: an ItemList of the occurrences' own pages`, ld.some((j) => j.includes('"ItemList"') && j.includes('/events/')))
      } else {
        check(`${where}: an empty week shows the designed empty state`, /could be yours/.test(text))
      }
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href')
      check(`${where}: self-canonical`, canonical?.endsWith(path), canonical)
      check(`${where}: Share this week is a button`, (await page.getByRole('button', { name: /Share this week|Link copied/ }).count()) === 1)
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
      check(`${where}: no sideways scroll`, scrollWidth <= vp.width, `${scrollWidth}px`)
      if (city.slug === 'geelong') {
        check(`${where}: the night checked 22 days ago is on no guide page`, !html.includes(stale.name))
        if (made) check(`${where}: the night checked yesterday is on the page`, html.includes(fresh.name))
        else unreached(`${where}: the night checked yesterday is on the page`, 'the run never made it')
      } else {
        check(`${where}: the stale night is on no other guide either`, !html.includes(stale.name))
      }
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      check(`${where}: axe finds no violation`, axe.violations.length === 0, axe.violations.map((v) => `${v.id} (${v.nodes.length})`).join(', '))
      await page.screenshot({ path: join(OUT, `${city.slug}-${vp.label}.png`), fullPage: true })

      if (vp.label === '1440') {
        // The category filter: a chosen category is a real URL that canonicalises to the page.
        const chip = page.locator(`nav a[href^="${path}?category="]`).first()
        if ((await chip.count()) > 0) {
          const href = await chip.getAttribute('href')
          const filtered = await context.newPage()
          const fr = await filtered.goto(`${BASE}${href}`, { waitUntil: 'load' })
          const fcanon = await filtered.locator('link[rel="canonical"]').getAttribute('href')
          check(`${where}: a category view answers 200 and canonicalises to the page`, fr?.status() === 200 && fcanon?.endsWith(path), `${href} -> ${fcanon}`)
          await filtered.close()
        }
        // The two Instagram cards.
        for (const format of ['story', 'square']) {
          const r = await fetch(`${BASE}${path}/card/${format}`)
          const bytes = Buffer.from(await r.arrayBuffer())
          const meta = r.ok ? await sharp(bytes).metadata() : {}
          const want = [SOCIAL_CARD_FORMATS[format].width, SOCIAL_CARD_FORMATS[format].height]
          check(`${city.slug}: the ${format} card is a ${want.join(' x ')} JPEG`, r.status === 200 && meta.format === 'jpeg' && meta.width === want[0] && meta.height === want[1], `${r.status} ${meta.format} ${meta.width}x${meta.height}`)
          if (r.ok) await sharp(bytes).toFile(join(OUT, `${city.slug}-card-${format}.jpg`))
        }
        // An occurrence's own page names its host and offers no organiser Follow.
        const first = page.locator('main a[href^="/events/"]').first()
        if ((await first.count()) > 0) {
          const href = await first.getAttribute('href')
          const ev = await context.newPage()
          const er = await ev.goto(`${BASE}${href}`, { waitUntil: 'load' })
          const evHtml = await ev.content()
          check(`${city.slug}: a card opens its event page`, er?.status() === 200, `${href} ${er?.status()}`)
          check(`${city.slug}: that page never names the listings organisation`, !/EventLinqs listings/.test(evHtml))
          await ev.close()
        }
      }
      await context.close()
    }
  }

  // 4. What answers 404, and the sitemap agreeing with each page's own robots directive.
  if (made) {
    const own = await fetch(`${BASE}/events/${fresh.slug}`)
    const ownHtml = await own.text()
    check('the fresh night, on its own page: 200, and its host named', own.status === 200 && ownHtml.includes(asReactWritesIt(host.name)), `${own.status} ${host.name}`)
    check('and never names the listings organisation or offers to follow it', !/EventLinqs listings/.test(ownHtml) && !/>Follow</.test(ownHtml))
  } else {
    unreached('the fresh night, on its own page: 200, and its host named', 'the run never made it')
    unreached('and never names the listings organisation or offers to follow it', 'the run never made it')
  }
  const unknown = await fetch(`${BASE}/free/nowhere/this-week`)
  check('a city with no guide answers 404', unknown.status === 404, String(unknown.status))
  const holder = await fetch(`${BASE}/organisers/eventlinqs-listings`)
  check('the listings organisation has no page', holder.status === 404, String(holder.status))
  const sitemap = await fetch(`${BASE}/sitemap.xml`).then((r) => r.text())
  check('the listings organisation is not in the sitemap', !sitemap.includes('/organisers/eventlinqs-listings'))
  for (const city of cities) {
    const path = `/free/${city.slug}/this-week`
    const page = await fetch(`${BASE}${path}`).then((r) => r.text())
    const noindex = /<meta name="robots" content="[^"]*noindex/.test(page)
    check(`${city.slug}: the sitemap lists the page exactly when the page asks to be indexed`, sitemap.includes(path) === !noindex, `in sitemap ${sitemap.includes(path)}, noindex ${noindex}`)
  }
} finally {
  await browser.close()
  await retireFixtures()
}

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed${notReached.length ? `, ${notReached.length} of them NOT REACHED` : ''}`)
process.exitCode = passed === results.length ? 0 : 1
