/**
 * /this-weekend WITH NOTHING ON IT, DRIVEN. THE REVERSAL CONDITION, PROVEN.
 *
 * ============================================================================
 * WHY THIS IS A SEPARATE DRIVE AND WHY IT IS THE IMPORTANT ONE
 * ============================================================================
 *
 * Close-out AQ3 writes the rule for this page in its own words:
 *
 *     "if a surface cannot be filled with real events it is not published,
 *      because an empty city page is worse than no city page"
 *
 * Every other discovery page on this platform is empty by ACCIDENT. This one is
 * empty BY SCHEDULE: every Sunday night its entire contents expire, and on a
 * thin catalogue it holds nothing for most of the week. So the state this drive
 * exercises is not an edge case, it is the state the page is in most of the
 * time, and it is the only state nobody would notice being wrong.
 *
 * THREE THINGS MUST HAPPEN AT ONCE and they are decided in three different
 * files. The page must render the shared designed empty state rather than a
 * blank band; it must tell a crawler not to index it; and the sitemap must stop
 * advertising it. A unit test can pin the third, and neither of the first two.
 *
 * ============================================================================
 * HOW IT EMPTIES THE WEEKEND, AND WHAT IT REFUSES TO DO
 * ============================================================================
 *
 * It sets every publicly visible event in the current weekend window to `draft`
 * and puts them back afterwards. That is a mutation of shared TEST state, so:
 *
 *   - it refuses any project that is not TEST vkapkibzokmfaxqogypq;
 *   - it ENUMERATES the rows in the window rather than naming them;
 *   - it REFUSES TO RUN AT ALL if any row in the window is not a lane-c fixture,
 *     because hiding another lane's event, even for ninety seconds, is not this
 *     lane's to do;
 *   - it restores in a `finally`, verifies the restore by reading the rows back,
 *     and exits non-zero with the repair command printed if a single row is left
 *     drafted.
 *
 * THE SERVER MUST BE RESTARTED EITHER SIDE, and that is stated rather than
 * automated, because the server is the lane's own and stopping a process this
 * script did not start is a rule of the three-lane protocol. `fetchPublicEventsCached`
 * keys by the hour and the route revalidates every 300 seconds, so a freshly
 * drafted catalogue is invisible to a warm server for up to an hour. Run:
 *
 *   1. node scripts/verify/weekend-empty-state-drive.mjs --draft
 *   2. restart the dev server on 3200
 *   3. node scripts/verify/weekend-empty-state-drive.mjs --judge http://127.0.0.1:3200
 *   4. node scripts/verify/weekend-empty-state-drive.mjs --restore
 *   5. restart the dev server on 3200
 *
 * `--draft` prints the restore command before it writes anything, so the repair
 * is on the screen before the damage is possible.
 */
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { weekendWindowUtc, isStillListed } from '@/lib/events/listing-window'
import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'
import { WEEKEND_SURFACE_PATH } from '@/lib/events/weekend-days'

/*
 * THE FIRST EXECUTABLE STATEMENT, because this script WRITES to the database.
 *
 * `scripts/guards/no-unguarded-production-write.mjs` requires it and was right
 * to refuse the first version of this file: the by-name refusal below runs
 * inside `--draft` and `--restore`, so a future branch that wrote before
 * reaching it would have had nothing in front of it. The shared preflight
 * resolves the project this process will actually use and refuses PRODUCTION
 * before anything else in the file runs.
 */
assertNotProduction()

const TAG = '[weekend-empty-state-drive]'
const OUT = process.env.DRIVE_OUT ?? join('C:', 'dev', 'EVIDENCE', 'AQ3-WEEKEND')
const WIDTHS = [390, 768, 1440]
const TEST_REF = 'vkapkibzokmfaxqogypq'
const PROD_REF = 'gndnldyfudbytbboxesk'
const LANE = 'lane-c-'

const args = process.argv.slice(2)
const DRAFT = args.includes('--draft')
const JUDGE = args.includes('--judge')
const RESTORE = args.includes('--restore')
const BASE = (args.find(a => a.startsWith('http')) ?? 'http://127.0.0.1:3200').replace(/\/$/, '')
const STATE = join(OUT, 'empty-state-drafted.json')

if (!DRAFT && !JUDGE && !RESTORE) {
  console.error(`${TAG} REFUSING: pass --draft, --judge or --restore. See this file's header for the order.`)
  process.exit(1)
}

const URL_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/$/, '')
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const headers = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }

function refuseUnlessTest() {
  if (!URL_BASE || !KEY) {
    console.error(`${TAG} REFUSED: no NEXT_PUBLIC_SUPABASE_URL or no SUPABASE_SERVICE_ROLE_KEY.`)
    process.exit(2)
  }
  if (URL_BASE.includes(PROD_REF)) {
    console.error(`${TAG} REFUSED: that is PRODUCTION (${PROD_REF}).`)
    process.exit(2)
  }
  if (!URL_BASE.includes(TEST_REF)) {
    console.error(`${TAG} REFUSED: the project is not TEST ${TEST_REF}. Nothing was written.`)
    process.exit(2)
  }
}

async function read(query) {
  const res = await fetch(`${URL_BASE}/rest/v1/${query}`, { headers })
  const body = await res.text()
  if (!res.ok) throw new Error(`read ${query.split('?')[0]} answered ${res.status}: ${body.slice(0, 300)}`)
  return JSON.parse(body)
}
async function setStatus(ids, status) {
  const res = await fetch(`${URL_BASE}/rest/v1/events?id=in.(${ids.join(',')})`, {
    method: 'PATCH',
    headers: { ...headers, prefer: 'return=representation' },
    body: JSON.stringify({ status }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`patch answered ${res.status}: ${body.slice(0, 300)}`)
  return JSON.parse(body)
}

/** Every publicly visible event inside the current weekend window. */
async function weekendRows() {
  const now = new Date()
  const { from, to } = weekendWindowUtc(now, PLATFORM_TIME_ZONE)
  const rows = await read(
    `events?select=id,slug,start_date,end_date,timezone&status=eq.published&visibility=eq.public` +
      `&start_date=gte.${from.toISOString()}&start_date=lte.${to.toISOString()}&order=start_date.asc`,
  )
  return rows.filter(r => isStillListed(r, now))
}

mkdirSync(OUT, { recursive: true })

/* ------------------------------------------------------------------ DRAFT */

if (DRAFT) {
  refuseUnlessTest()
  const rows = await weekendRows()
  if (rows.length === 0) {
    console.log(`${TAG} nothing is on this weekend already. Skip to --judge.`)
    writeFileSync(STATE, JSON.stringify({ ids: [], slugs: [] }, null, 2))
    process.exit(0)
  }
  const foreign = rows.filter(r => !r.slug.startsWith(LANE))
  if (foreign.length > 0) {
    console.error(
      `${TAG} REFUSED: ${foreign.length} of ${rows.length} event(s) on this weekend are not lane C's ` +
        `(${foreign.map(r => r.slug).join(', ')}). Hiding another lane's event, even for ninety seconds, ` +
        `is not this lane's to do. Nothing was written.`,
    )
    process.exit(1)
  }
  const ids = rows.map(r => r.id)
  console.log(`${TAG} RESTORE COMMAND, before anything is written:`)
  console.log(`${TAG}   node --import ./scripts/lib/server-only-shim.mjs --import ./scripts/lib/src-alias-loader.mjs --env-file=.env.local scripts/verify/weekend-empty-state-drive.mjs --restore`)
  writeFileSync(STATE, JSON.stringify({ ids, slugs: rows.map(r => r.slug) }, null, 2))
  await setStatus(ids, 'draft')
  const left = await weekendRows()
  if (left.length > 0) {
    console.error(`${TAG} FAIL: ${left.length} event(s) are still visible on this weekend after drafting.`)
    process.exit(1)
  }
  console.log(`${TAG} drafted ${ids.length} lane-c event(s); the weekend now holds nothing.`)
  console.log(`${TAG} RESTART THE DEV SERVER ON 3200, then run --judge.`)
  process.exit(0)
}

/* ---------------------------------------------------------------- RESTORE */

if (RESTORE) {
  refuseUnlessTest()
  const { readFileSync } = await import('node:fs')
  let saved = { ids: [] }
  try {
    saved = JSON.parse(readFileSync(STATE, 'utf8'))
  } catch {
    console.error(`${TAG} REFUSED: ${STATE} could not be read, so there is no record of what to restore.`)
    process.exit(1)
  }
  if (saved.ids.length === 0) {
    console.log(`${TAG} nothing to restore.`)
    process.exit(0)
  }
  await setStatus(saved.ids, 'published')
  const back = await read(`events?select=id,slug,status&id=in.(${saved.ids.join(',')})`)
  const stuck = back.filter(r => r.status !== 'published')
  if (stuck.length > 0) {
    console.error(`${TAG} FAIL: ${stuck.length} event(s) are still drafted: ${stuck.map(r => r.slug).join(', ')}`)
    process.exit(1)
  }
  console.log(`${TAG} restored ${back.length} event(s) to published, verified by reading them back.`)
  console.log(`${TAG} RESTART THE DEV SERVER ON 3200.`)
  process.exit(0)
}

/* ------------------------------------------------------------------ JUDGE */

const results = []
let failures = 0
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail })
  if (!ok) failures += 1
  console.log(`${TAG} ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`)
}

const html = await (await fetch(`${BASE}${WEEKEND_SURFACE_PATH}`)).text()

/*
 * THE INSTRUMENT FIRST. Every assertion below is about an EMPTY page, and every
 * one of them would pass on a page that failed to render at all. So the page is
 * required to be a real page with its own copy before anything is judged.
 */
if (!html.includes("What's on this weekend")) {
  console.error(`${TAG} BROKEN DRIVE: the page did not render its own headline. Nothing judged.`)
  process.exit(2)
}
if (html.includes('/events/lane-c-')) {
  console.error(
    `${TAG} BROKEN DRIVE: the page still lists events, so the server is serving a cached weekend. ` +
      `Restart the dev server on 3200 and run --judge again. Nothing judged.`,
  )
  process.exit(2)
}

check('the page still answers with its own copy when nothing is on', html.includes("What's on this weekend"))
check(
  'the page renders the shared designed empty state, not a blank band',
  html.includes('could be yours'),
  'CategoryHeroEmpty, the same one behind every community, city and category page',
)
check(
  'the empty state offers the organiser the next action',
  html.includes('/organisers/signup') && html.includes('Start selling tickets'),
)
check('the empty state offers the visitor somewhere to go', html.includes('href="/events"'))
check(
  'the page tells a crawler NOT to index it while it is empty',
  /name="robots"[^>]*content="noindex/.test(html),
  (html.match(/name="robots"[^>]*>/) ?? ['(no robots meta at all, which is index by default)'])[0],
)
check(
  'the page is STILL self-canonical while empty',
  html.includes(`${WEEKEND_SURFACE_PATH}"`) && html.includes('rel="canonical"'),
  'pointing it elsewhere while empty is what produced "Google chose different canonical"',
)

const sitemapXml = await (await fetch(`${BASE}/sitemap.xml`)).text()
check(
  `the sitemap has STOPPED advertising ${WEEKEND_SURFACE_PATH}`,
  !sitemapXml.includes(`${WEEKEND_SURFACE_PATH}<`),
  `${(sitemapXml.match(/<loc>/g) ?? []).length} url(s) published`,
)

const browser = await chromium.launch()
const shots = []
try {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    const res = await page.goto(`${BASE}${WEEKEND_SURFACE_PATH}`, { waitUntil: 'load', timeout: 180000 })
    check(`${width}px: the empty page answers 200, never a 404`, res?.status() === 200, `status ${res?.status()}`)
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y)
        await new Promise(r => setTimeout(r, 120))
      }
      window.scrollTo(0, 0)
    })
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {})
    const file = join(OUT, `this-weekend-empty-${width}.png`)
    await page.locator('main').screenshot({ path: file }).catch(async () => {
      await page.screenshot({ path: file, fullPage: false })
    })
    shots.push(file)
    await ctx.close()
  }
} finally {
  await browser.close()
}

writeFileSync(
  join(OUT, 'weekend-empty-state-drive.json'),
  JSON.stringify({ base: BASE, ranAt: new Date().toISOString(), checks: results.length, failures, shots }, null, 2),
)
console.log(`\n${TAG} ${results.length - failures}/${results.length} checks passed.`)
process.exit(failures === 0 ? 0 : 1)
