/**
 * AQ3, LANE B'S HALF: ORGANIC SEARCH COUNTED SEPARATELY FROM DIRECT, DRIVEN.
 *
 * Close-out AQ3 asks for "organic attributed orders reported separately from
 * direct". Lane C closed the surface half (the weekend page) on 19 September;
 * this is the measurement half, and it is driven rather than asserted:
 *
 *   1. A person arrives FROM A REAL GOOGLE REFERRER. The search results page is
 *      stubbed, the navigation is not: Chrome itself sets `document.referrer` to
 *      `http://www.google.com.au/` because the click really did cross an origin.
 *      The demand beacon then writes a ledger row carrying that host, and
 *      /admin/traffic counts it as organic search.
 *   2. A person arrives WITH NO REFERRER AT ALL, and is counted as direct.
 *   3. A person arrives from a social site, and is counted as neither.
 *   4. The person from Google BUYS, in the same browser, so the first-touch
 *      cookie reaches the checkout, the sale row carries the same host, and the
 *      organic ORDER count moves. That is the acceptance line itself.
 *   5. /admin/traffic renders at 390, 768 and 1440 with the two figures in
 *      separate tiles, with no horizontal overflow, and every window link
 *      resolving 200 (Law 5).
 *
 * WHY THE VISITS LAND ON AN EVENT THIS DRIVE DID NOT CREATE, which looks wrong
 * until you read the beacon. `src/app/api/ledger/demand/route.ts` refuses any
 * event whose visibility is not `public`, and
 * `scripts/verify/lib/sitemap-footprint.mjs` forbids a fixture from being
 * public for even a minute, from an incident that refused lane A's push. Both
 * rules are right and together they mean a fixture event can never receive a
 * beacon row. So the VISITS are driven against a real published event, chosen
 * from the database at runtime and never a guessed slug, and the PURCHASE is
 * made on this drive's own unlisted fixture. The first-touch cookie is set for
 * the whole origin, so it carries from one to the other exactly as it does for
 * a real person who browses before they buy.
 *
 * (That refusal is also a real gap for UNLISTED events, whose pages render to
 * anybody holding the link and whose views are therefore never counted. It is
 * the slot ledger, which the three-lane protocol names as lane A's, so it is
 * raised as a BORDER in REVIEW-QUEUE-B.md rather than changed here.)
 *
 * TEST ONLY, and it refuses anything else. Every row it creates carries
 * `lane-b-aq3`, nothing belonging to another lane is written or deleted, and the
 * fixture is purged before the run as well as after it.
 *
 * Run:
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     BASE=http://localhost:3100 \
 *     UPSTASH_REDIS_REST_URL=http://127.0.0.1:8179 UPSTASH_REDIS_REST_TOKEN=local \
 *     node --import ./scripts/lib/server-only-shim.mjs \
 *          --import ./scripts/lib/src-alias-loader.mjs \
 *          --env-file=.env.local scripts/verify/aq3-organic-vs-direct-drive.mjs \
 *          --out C:/dev/EVIDENCE/AQ3
 *
 * Start the server first: node scripts/dev/lane-b-serve-with-stripe.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'
import { sitemapFootprint } from './lib/sitemap-footprint.mjs'
import { answerTheCookieBanner as answerTheBanner } from './lib/cookie-banner.mjs'
import { channelForVisit } from '@/lib/growth/traffic-channel'
import { tearDownAccount } from './lib/teardown-account.mjs'

const answerTheCookieBanner = page => answerTheBanner(page, { answer: 'decline' })

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const BASE = process.env.BASE ?? 'http://localhost:3100'
const LANE = 'lane-b-aq3'
const STAMP = new Date().toISOString().slice(0, 16).replace(/[:T-]/g, '')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`FAIL: this drive only touches TEST vkapkibzokmfaxqogypq, not ${url}`)
  process.exit(1)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

/**
 * The search engine and the social site, stubbed at the RESULTS page only.
 *
 * `http`, not `https`, and that is the whole reason this works. The default
 * referrer policy is strict-origin-when-cross-origin, which sends nothing at all
 * on an https page linking to an http one. Same scheme, cross origin, sends the
 * origin, which is exactly the host the platform stores.
 */
const GOOGLE_ORIGIN = 'http://www.google.com.au'
const SOCIAL_ORIGIN = 'http://www.instagram.com'

/*
 * EVERY ARRIVAL IS ITS OWN PERSON, AND THE TWO REASONS ARE BOTH INCIDENTS.
 *
 * The beacon writes one row per VISITOR per event per day, and the visitor is
 * `visitorHash(ip, user-agent)` computed on the server. This drive has been
 * caught by that twice, in opposite directions, and both times the product was
 * right and the harness was wrong:
 *
 *   RUN ONE gave the arrival from Google and the direct arrival the SAME user
 *   agent, so they hashed to one person, the second was deduped exactly as a
 *   refresh would be, and the drive reported three times that the ledger had
 *   failed to record a direct visit.
 *
 *   RUN TWO reused run one's user agents on the same day, so every arrival from
 *   Google collided with the row run one had already written, and the drive
 *   reported that the ledger had failed to record a search arrival. A proof that
 *   only works once a day is a proof that will accuse the product tomorrow.
 *
 * So each run carries its own BUILD NUMBER, `{n}` below, and every arrival is a
 * browser nobody has seen before. It stays a plausible user agent on purpose:
 * `isPreviewCrawler` refuses `headlesschrome` and is RIGHT to, because every
 * messaging platform fetches a link the moment it is pasted.
 */
const RUN = String(Date.now() % 100000)
const ua = template => template.replace('{n}', RUN)

const VIEWPORTS = [
  {
    label: 'mobile-390',
    width: 390,
    height: 844,
    userAgent: ua(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.{n}.1 Mobile Safari/537.36',
    ),
    directUserAgent: ua(
      'Mozilla/5.0 (Linux; Android 14; Pixel 7a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.{n}.2 Mobile Safari/537.36',
    ),
  },
  {
    label: 'tablet-768',
    width: 768,
    height: 1024,
    userAgent: ua(
      'Mozilla/5.0 (Linux; Android 14; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.{n}.3 Safari/537.36',
    ),
    directUserAgent: ua(
      'Mozilla/5.0 (Linux; Android 14; SM-X900) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.{n}.4 Safari/537.36',
    ),
  },
  {
    label: 'desktop-1440',
    width: 1440,
    height: 900,
    userAgent: ua(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.{n}.5 Safari/537.36',
    ),
    directUserAgent: ua(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.{n}.6 Safari/537.36',
    ),
  },
]

const checks = []
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
}

const adminPassword = `${randomUUID()}Aa1`
const ADMIN_EMAIL = `${LANE}-admin@eventlinqs.test`
const BUYER = `${LANE}-buyer@eventlinqs.test`

const fixture = {
  ownerId: null,
  adminId: null,
  organisationId: null,
  orgSlug: `${LANE}-org-${STAMP}`,
  eventId: null,
  eventSlug: `${LANE}-event-${STAMP}`,
  venueName: `Lane B AQ3 room ${STAMP}`,
  tierId: null,
  orders: [],
}

/** The real, published event the visits land on. Read, never guessed. */
const visited = { id: null, slug: null, title: null }

const startedAt = new Date().toISOString()

/* ------------------------------------------------------------ small helpers */

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function horizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
}

async function clickAny(page, rx) {
  for (const el of await page.$$('button, a')) {
    const t = ((await el.innerText().catch(() => '')) || '').trim()
    if (rx.test(t) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {})
      return true
    }
  }
  return false
}

async function fillByLabel(page, rx, value) {
  for (const el of await page.$$('input')) {
    if (!(await el.isVisible().catch(() => false))) continue
    const n = await el.evaluate(
      e => e.labels?.[0]?.textContent?.trim() || e.getAttribute('aria-label') || e.getAttribute('placeholder') || '',
    )
    if (rx.test(n)) {
      await el.fill(value).catch(() => {})
      return true
    }
  }
  return false
}

/** The page-view rows this drive has caused on the visited event, since it began. */
async function visitRowsSoFar() {
  const { data, error } = await db
    .from('ledger_entries')
    .select('occurrence_key, referrer, utm_source, utm_medium, utm_campaign, created_at')
    .eq('kind', 'demand')
    .eq('demand_action', 'page_view')
    .gte('created_at', startedAt)
    .like('occurrence_key', `demand:page_view:${visited.id}:%`)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`reading the page view rows: ${error.message}`)
  return data ?? []
}

/**
 * Waits for the beacon's row rather than sleeping a fixed time.
 *
 * `navigator.sendBeacon` is fire and forget and the row is written after the
 * response, so a fixed sleep is a test that is occasionally a lie.
 */
async function waitForVisitWithReferrer(expected, timeoutMs = 30000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    const rows = await visitRowsSoFar()
    const hit = rows.find(r => (r.referrer ?? null) === expected)
    if (hit) return hit
    await sleep(1000)
  }
  return null
}

/** One visit, through a stubbed results page so the browser sets the referrer. */
async function arriveFrom(context, origin, path) {
  const page = await context.newPage()
  await context.route(`${origin}/**`, route =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body:
        '<!doctype html><html><head><title>results</title></head><body>' +
        `<a id="result" href="${BASE}/events/${visited.slug}">${visited.title}</a>` +
        '</body></html>',
    }),
  )
  await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.click('#result')
  await page.waitForURL(u => u.pathname.startsWith('/events/'), { timeout: 60000 })
  await page.waitForTimeout(2500)
  const referrer = await page.evaluate(() => document.referrer)
  await answerTheCookieBanner(page)
  await page.waitForTimeout(1500)
  return { page, referrer }
}

/** Reads the four headline figures off /admin/traffic, from the rendered page. */
async function readTiles(page, days) {
  await page.goto(`${BASE}/admin/traffic?days=${days}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForTimeout(1500)
  await answerTheCookieBanner(page)
  await page.waitForTimeout(500)
  return page.evaluate(() => {
    const tiles = {}
    for (const tile of document.querySelectorAll('div.rounded-xl')) {
      const label = tile.querySelector('p')?.textContent?.trim()
      const value = tile.querySelectorAll('p')[1]?.textContent?.trim()
      if (label && value && /^[\d,]+$/.test(value)) tiles[label] = Number(value.replace(/,/g, ''))
    }
    return tiles
  })
}

/* ----------------------------------------------------------------- teardown */

async function purge(why) {
  const { data: orgs } = await db.from('organisations').select('id').like('slug', `${LANE}-org-%`)
  const orgIds = (orgs ?? []).map(o => o.id)
  let events = 0
  if (orgIds.length > 0) {
    const { data: evs } = await db.from('events').select('id').in('organisation_id', orgIds)
    for (const e of evs ?? []) {
      await db.from('orders').delete().eq('event_id', e.id)
      await db.from('ticket_tiers').delete().eq('event_id', e.id)
      await db.from('events').delete().eq('id', e.id)
      events += 1
    }
    await db.from('organisations').delete().in('id', orgIds)
  }
  /*
   * THE ACCOUNTS ARE LISTED FROM AUTH, NOT FROM `profiles`, AND THE DELETE IS
   * NOT SWALLOWED. Both halves are the incident this drive uncovered: a profile
   * row deleted first leaves an auth user nothing can find by email, and
   * `.catch(() => {})` on the delete is precisely what hid, for a whole day,
   * that NO account on the platform could be deleted at all. A teardown that
   * cannot tear down says so.
   */
  const { data: listed, error: listError } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listError) throw new Error(`listing accounts to purge: ${listError.message}`)
  const mine = (listed?.users ?? []).filter(u => (u.email ?? '').startsWith(`${LANE}-`))
  const stuck = []
  for (const user of mine) {
    await db.from('admin_users').delete().eq('id', user.id)
    await db.from('profiles').delete().eq('id', user.id)
    const removal = await tearDownAccount(db, user.id)
    if (!removal.gone) stuck.push(`${user.email}: ${removal.detail}`)
  }
  console.log(
    `[${LANE}] purge (${why}): ${orgIds.length} organisation(s), ${events} event(s), ` +
      `${mine.length - stuck.length} of ${mine.length} account(s)`,
  )
  for (const s of stuck) console.error(`[${LANE}] COULD NOT DELETE ${s}`)
  return { organisations: orgIds.length, events, accounts: mine.length, stuck }
}

/* ------------------------------------------------------------- the fixture */

async function buildFixture() {
  const { data: city } = await db
    .from('cities')
    .select('slug')
    .eq('is_active', true)
    .order('display_order')
    .limit(1)
    .single()
  const { data: category } = await db
    .from('event_categories')
    .select('id')
    .eq('is_active', true)
    .order('sort_order')
    .limit(1)
    .single()
  const { data: cover } = await db
    .from('events')
    .select('cover_image_url')
    .eq('status', 'published')
    .not('cover_image_url', 'is', null)
    .limit(1)
    .single()

  /*
   * THE EVENT THE VISITS LAND ON, ENUMERATED FROM THE DATABASE.
   *
   * Published, public, still ahead, and belonging to NO lane: a lane-tagged row
   * is another lane's fixture and may vanish mid-run. Ordered by start date then
   * slug so two runs on the same catalogue choose the same page.
   */
  const { data: candidates, error: candidateError } = await db
    .from('events')
    .select('id, slug, title, start_date')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gte('start_date', new Date().toISOString())
    .not('slug', 'like', 'lane-%')
    .order('start_date', { ascending: true })
    .order('slug', { ascending: true })
    .limit(1)
  if (candidateError) throw new Error(`choosing the visited event: ${candidateError.message}`)
  if (!candidates || candidates.length === 0) {
    throw new Error('no published public event on TEST for the visits to land on')
  }
  visited.id = candidates[0].id
  visited.slug = candidates[0].slug
  visited.title = candidates[0].title

  const owner = await db.auth.admin.createUser({
    email: `${LANE}-organiser@eventlinqs.test`,
    password: `${randomUUID()}Aa1`,
    email_confirm: true,
  })
  if (owner.error) throw new Error(`create organiser: ${owner.error.message}`)
  fixture.ownerId = owner.data.user.id
  await db
    .from('profiles')
    .upsert({ id: fixture.ownerId, email: `${LANE}-organiser@eventlinqs.test`, full_name: 'Lane B AQ3' })

  const admin = await db.auth.admin.createUser({ email: ADMIN_EMAIL, password: adminPassword, email_confirm: true })
  if (admin.error) throw new Error(`create admin: ${admin.error.message}`)
  fixture.adminId = admin.data.user.id
  await db.from('profiles').upsert({ id: fixture.adminId, email: ADMIN_EMAIL, full_name: 'Lane B AQ3 Owner' })
  const staff = await db
    .from('admin_users')
    .insert({ id: fixture.adminId, role: 'super_admin', display_name: 'Lane B AQ3 Owner' })
  if (staff.error) throw new Error(`admin_users insert: ${staff.error.message}`)

  // PENDING and UNLISTED, for the whole of its life. See sitemap-footprint.mjs.
  const org = await db
    .from('organisations')
    .insert({ name: `Lane B AQ3 ${STAMP}`, slug: fixture.orgSlug, owner_id: fixture.ownerId, status: 'pending' })
    .select('id')
    .single()
  if (org.error) throw new Error(`create organisation: ${org.error.message}`)
  fixture.organisationId = org.data.id

  const start = new Date(Date.now() + 30 * 86_400_000)
  const event = await db
    .from('events')
    .insert({
      title: `Lane B AQ3 free night ${STAMP}`,
      slug: fixture.eventSlug,
      organisation_id: fixture.organisationId,
      created_by: fixture.ownerId,
      category_id: category.id,
      status: 'published',
      visibility: 'unlisted',
      published_at: new Date().toISOString(),
      start_date: start.toISOString(),
      end_date: new Date(start.getTime() + 3 * 3_600_000).toISOString(),
      timezone: 'Australia/Melbourne',
      city_primary: city.slug,
      venue_name: fixture.venueName,
      venue_city: city.slug,
      venue_postal_code: '3220',
      cover_image_url: cover.cover_image_url,
      summary: 'An event created by the AQ3 free-traffic proof. It is deleted when the proof ends.',
    })
    .select('id')
    .single()
  if (event.error) throw new Error(`create event: ${event.error.message}`)
  fixture.eventId = event.data.id

  const tier = await db
    .from('ticket_tiers')
    .insert({
      event_id: fixture.eventId,
      name: 'Free entry',
      price: 0,
      currency: 'AUD',
      total_capacity: 200,
      is_active: true,
    })
    .select('id')
    .single()
  if (tier.error) throw new Error(`create tier: ${tier.error.message}`)
  fixture.tierId = tier.data.id
}

/* --------------------------------------------------------------------- run */

let browser = null
const ADMIN_SESSION = join(out, 'aq3-admin-session.json')

try {
  await purge('before')
  await buildFixture()

  {
    const footprint = await sitemapFootprint(db, {
      organisationSlugs: [fixture.orgSlug],
      eventSlugs: [fixture.eventSlug],
      venueNames: [fixture.venueName],
    })
    check(
      'aq3.fixture.publishes-nothing-into-the-sitemap',
      footprint.length === 0,
      footprint.length === 0
        ? 'the organisation, the event and the venue are all absent from the sitemap queries'
        : `the sitemap would publish ${footprint.join(', ')}`,
    )
  }

  check(
    'aq3.fixture.the-visited-event-was-read-not-guessed',
    Boolean(visited.slug) && !visited.slug.startsWith('lane-'),
    `visits land on /events/${visited.slug}, chosen from the database and belonging to no lane`,
  )

  browser = await chromium.launch({ headless: true })

  // One sign-in, saved and reused: auth-login is a fail-closed limiter.
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForTimeout(1200)
    await answerTheCookieBanner(page)
    await page.locator('input[name="email"]').fill(ADMIN_EMAIL)
    await page.locator('input[name="password"]').fill(adminPassword)
    await Promise.all([
      page.waitForURL(u => !u.pathname.endsWith('/admin/login'), { timeout: 60000 }).catch(() => {}),
      page.locator('button[type="submit"]').first().click(),
    ])
    await page.waitForTimeout(2500)
    await context.storageState({ path: ADMIN_SESSION })
    await context.close()
  }

  /* ------------- baseline, before any of this drive's traffic exists ------- */
  let baseline = null
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: ADMIN_SESSION })
    const page = await context.newPage()
    baseline = await readTiles(page, 7)
    check(
      'aq3.surface.answers-before-any-of-this-traffic',
      typeof baseline['Organic search visits'] === 'number' && typeof baseline['Direct visits'] === 'number',
      `organic ${baseline['Organic search visits']} visits / ${baseline['Organic search orders']} orders, ` +
        `direct ${baseline['Direct visits']} visits / ${baseline['Direct orders']} orders`,
    )
    await context.close()
  }

  /* ------------------------- the three arrivals, per viewport ------------- */
  let organicArrivals = 0
  let directArrivals = 0
  const referrersSeen = []

  for (const vp of VIEWPORTS) {
    const v = vp.label
    const asAPerson = { viewport: { width: vp.width, height: vp.height }, userAgent: vp.userAgent }

    // 1. FROM GOOGLE.
    {
      const context = await browser.newContext(asAPerson)
      const { page, referrer } = await arriveFrom(context, GOOGLE_ORIGIN, '/search?q=things+to+do+this+weekend')
      check(
        `aq3.${v}.arrival.the-browser-set-a-real-google-referrer`,
        referrer.startsWith(GOOGLE_ORIGIN),
        `document.referrer is ${referrer || '(empty)'}`,
      )
      const row = await waitForVisitWithReferrer('www.google.com.au')
      check(
        `aq3.${v}.arrival.the-ledger-recorded-the-search-engine`,
        Boolean(row),
        row ? `a page view row carrying referrer ${row.referrer}` : 'no page view row carrying www.google.com.au',
      )
      if (row) {
        referrersSeen.push(row.referrer)
        const channel = channelForVisit({
          referrer: row.referrer,
          utmSource: row.utm_source,
          utmMedium: row.utm_medium,
          utmCampaign: row.utm_campaign,
        })
        check(
          `aq3.${v}.arrival.that-row-classifies-as-organic-search`,
          channel === 'organic-search',
          `${row.referrer} reads as ${channel}`,
        )
        organicArrivals += 1
      }
      await page.screenshot({ path: join(out, `${v}-01-arrived-from-google.png`), fullPage: false }).catch(() => {})
      await context.close()
    }

    // 2. STRAIGHT TO THE PAGE, no referrer at all, as a DIFFERENT person.
    {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        userAgent: vp.directUserAgent,
      })
      const page = await context.newPage()
      await page.goto(`${BASE}/events/${visited.slug}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForTimeout(2500)
      await answerTheCookieBanner(page)
      const referrer = await page.evaluate(() => document.referrer)
      check(
        `aq3.${v}.arrival.a-direct-visit-carries-no-referrer`,
        referrer === '',
        `document.referrer is ${referrer === '' ? 'empty, which is what direct means' : referrer}`,
      )
      const row = await waitForVisitWithReferrer(null)
      check(
        `aq3.${v}.arrival.the-ledger-recorded-it-with-nothing-attached`,
        Boolean(row),
        row ? `a page view row with referrer ${row.referrer ?? 'null'}` : 'no page view row with a null referrer',
      )
      if (row) {
        const channel = channelForVisit({
          referrer: row.referrer,
          utmSource: row.utm_source,
          utmMedium: row.utm_medium,
          utmCampaign: row.utm_campaign,
        })
        check(
          `aq3.${v}.arrival.that-row-classifies-as-direct`,
          channel === 'direct',
          `a row with nothing on it reads as ${channel}`,
        )
        directArrivals += 1
      }
      await context.close()
    }
  }

  // 3. FROM A SOCIAL SITE, once: it exists to prove the two AQ3 names are not
  //    simply "search" and "everything else".
  {
    const vp = VIEWPORTS[2]
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      userAgent: ua(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.{n}.7 Safari/537.36',
      ),
    })
    const { page, referrer } = await arriveFrom(context, SOCIAL_ORIGIN, '/p/a-post/')
    await page.screenshot({ path: join(out, 'arrived-from-social.png'), fullPage: false }).catch(() => {})
    check(
      'aq3.social.the-browser-set-a-real-social-referrer',
      referrer.startsWith(SOCIAL_ORIGIN),
      `document.referrer is ${referrer || '(empty)'}`,
    )
    const row = await waitForVisitWithReferrer('www.instagram.com')
    check(
      'aq3.social.is-neither-organic-search-nor-direct',
      Boolean(row) &&
        channelForVisit({
          referrer: row.referrer,
          utmSource: row.utm_source,
          utmMedium: row.utm_medium,
          utmCampaign: row.utm_campaign,
        }) === 'organic-social',
      row ? `${row.referrer} reads as its own channel` : 'no page view row carrying www.instagram.com',
    )
    await context.close()
  }

  /* ---------------- the purchase, carried by the first-touch cookie ------- */
  let orderNumber = null
  {
    const vp = VIEWPORTS[2]
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      userAgent: ua(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.{n}.8 Safari/537.36',
      ),
    })
    const { page } = await arriveFrom(context, GOOGLE_ORIGIN, '/search?q=lane+b+aq3+free+night')

    const cookies = await context.cookies()
    const firstTouch = cookies.find(c => c.name === 'el_from')
    check(
      'aq3.purchase.the-first-touch-was-kept-before-anything-was-bought',
      Boolean(firstTouch) && decodeURIComponent(firstTouch.value).startsWith('www.google.com.au'),
      firstTouch ? `el_from holds ${decodeURIComponent(firstTouch.value)}` : 'no first-touch cookie was written',
    )

    // The fixture event, in the SAME browser, so the cookie travels with them.
    await page.goto(`${BASE}/events/${fixture.eventSlug}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForTimeout(2500)
    await answerTheCookieBanner(page)
    await clickAny(page, /^(get tickets|buy tickets|select tickets|register)/i)
    await page.waitForTimeout(2000)
    for (const b of await page.$$('button')) {
      const t = ((await b.innerText().catch(() => '')) || '').trim()
      if (t === '+') {
        await b.click().catch(() => {})
        break
      }
    }
    await page.waitForTimeout(1500)
    const checkoutButton = page.getByRole('button', { name: /^(checkout|register|get ticket)/i }).first()
    await checkoutButton.scrollIntoViewIfNeeded().catch(() => {})
    await checkoutButton.click({ timeout: 30000 }).catch(() => {})
    await page.waitForURL(u => u.pathname.startsWith('/checkout/'), { timeout: 60000 }).catch(() => {})
    await page.waitForTimeout(3000)
    await fillByLabel(page, /full name/i, 'Lane B AQ3 Buyer')
    await fillByLabel(page, /^email/i, BUYER)
    await page.waitForTimeout(600)
    await clickAny(page, /use my details for all tickets/i)
    await page.waitForTimeout(900)
    await clickAny(page, /^(continue to payment|complete|confirm|register|get my ticket)/i)
    await page.waitForTimeout(6000)
    await page.screenshot({ path: join(out, 'purchase-confirmation.png'), fullPage: false }).catch(() => {})

    for (let attempt = 0; attempt < 30 && !orderNumber; attempt += 1) {
      const { data } = await db
        .from('orders')
        .select('id, order_number')
        .eq('event_id', fixture.eventId)
        .eq('guest_email', BUYER)
        .order('created_at', { ascending: false })
        .limit(1)
      if (data && data.length > 0) {
        fixture.orders.push(data[0].id)
        orderNumber = data[0].order_number
      } else {
        await sleep(1000)
      }
    }
    check(
      'aq3.purchase.the-order-exists',
      Boolean(orderNumber),
      orderNumber ? `order ${orderNumber} on the fixture event` : 'no order was written',
    )
    await context.close()
  }

  // The sale row, with the search engine on it. Written after the response.
  let saleRow = null
  for (let attempt = 0; attempt < 30 && !saleRow; attempt += 1) {
    const { data } = await db
      .from('ledger_entries')
      .select('occurrence_key, referrer, utm_source, utm_medium, utm_campaign, quantity')
      .eq('kind', 'sale')
      .gte('created_at', startedAt)
      .eq('referrer', 'www.google.com.au')
      .limit(1)
    if (data && data.length > 0) saleRow = data[0]
    else await sleep(1000)
  }
  check(
    'aq3.purchase.the-sale-row-carries-the-search-engine',
    Boolean(saleRow),
    saleRow
      ? `${saleRow.occurrence_key} carries referrer ${saleRow.referrer}, so the order is attributable`
      : 'no sale row carrying www.google.com.au',
  )
  if (saleRow) {
    check(
      'aq3.purchase.that-sale-classifies-as-an-organic-search-order',
      channelForVisit({
        referrer: saleRow.referrer,
        utmSource: saleRow.utm_source,
        utmMedium: saleRow.utm_medium,
        utmCampaign: saleRow.utm_campaign,
      }) === 'organic-search',
      'the same rule that classified the visit classifies the sale',
    )
  }

  /* ------------------ the surface, at all three viewports ----------------- */
  let after = null
  for (const vp of VIEWPORTS) {
    const v = vp.label
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      storageState: ADMIN_SESSION,
    })
    const page = await context.newPage()
    const tiles = await readTiles(page, 7)
    if (vp.label === 'desktop-1440') after = tiles

    check(
      `aq3.${v}.surface.organic-and-direct-are-separate-figures`,
      typeof tiles['Organic search visits'] === 'number' &&
        typeof tiles['Direct visits'] === 'number' &&
        typeof tiles['Organic search orders'] === 'number' &&
        typeof tiles['Direct orders'] === 'number',
      `organic ${tiles['Organic search visits']}/${tiles['Organic search orders']}, ` +
        `direct ${tiles['Direct visits']}/${tiles['Direct orders']}, in four separate tiles`,
    )
    check(
      `aq3.${v}.surface.this-drive-really-did-arrive-three-times-each-way`,
      organicArrivals === VIEWPORTS.length && directArrivals === VIEWPORTS.length,
      `${organicArrivals} arrival(s) from Google and ${directArrivals} with nothing attached, of ` +
        `${VIEWPORTS.length} each; a delta assertion against zero arrivals proves nothing`,
    )
    check(
      `aq3.${v}.surface.both-figures-moved-because-of-real-arrivals`,
      tiles['Organic search visits'] >= baseline['Organic search visits'] + organicArrivals &&
        tiles['Direct visits'] >= baseline['Direct visits'] + directArrivals,
      `organic ${baseline['Organic search visits']} to ${tiles['Organic search visits']} after ${organicArrivals} ` +
        `arrival(s) from Google, direct ${baseline['Direct visits']} to ${tiles['Direct visits']} after ` +
        `${directArrivals} arrival(s) with nothing attached`,
    )
    check(
      `aq3.${v}.surface.the-organic-order-is-counted-as-organic`,
      tiles['Organic search orders'] >= baseline['Organic search orders'] + 1,
      `organic orders ${baseline['Organic search orders']} to ${tiles['Organic search orders']}`,
    )

    const body = await page.evaluate(() => document.body.innerText)
    check(
      `aq3.${v}.surface.names-the-published-rules-it-used`,
      /default channel group Google publishes/.test(body) && /How a channel is decided/.test(body),
      'the page cites the rules it classified by rather than asserting them',
    )
    check(
      `aq3.${v}.surface.no-horizontal-overflow`,
      !(await horizontalOverflow(page)),
      `document scrollWidth fits ${vp.width}`,
    )

    /*
     * THE FIGURES ARE ON SCREEN, WHICH IS NOT THE SAME QUESTION AS THE DOCUMENT
     * FITTING. The first version of this page put the channel table in an
     * `overflow-x-auto` with a 40rem minimum, so at 390 every number was off the
     * right-hand edge behind a scroll nobody can see, and the check above passed
     * the whole time because the DOCUMENT fitted perfectly. A screen whose
     * entire purpose is four numbers per channel was showing a phone none of
     * them. So this asks where the numbers actually are.
     */
    const offScreen = await page.evaluate(width => {
      const rows = [...document.querySelectorAll('tbody tr')]
      const bad = []
      for (const row of rows) {
        const name = row.querySelector('th')?.innerText?.split('\n')[0]?.trim() ?? '(unnamed)'
        for (const cell of row.querySelectorAll('td')) {
          const box = cell.getBoundingClientRect()
          if (box.width === 0 && box.height === 0) continue
          if (box.right > width + 1 || box.left < -1) bad.push(`${name}: ${cell.innerText.trim()}`)
        }
      }
      return bad
    }, vp.width)
    check(
      `aq3.${v}.surface.every-figure-is-on-the-screen`,
      offScreen.length === 0,
      offScreen.length === 0
        ? `every figure in the channel table sits inside ${vp.width}`
        : `${offScreen.length} figure(s) off screen: ${offScreen.slice(0, 4).join(' | ')}`,
    )
    await page.screenshot({ path: join(out, `${v}-02-free-traffic.png`), fullPage: true }).catch(() => {})

    /*
     * axe, AT THIS VIEWPORT rather than once at 1440, because the table changes
     * shape at md: below it, every cell carries its own repeated label, and a
     * label announced twice is the defect that shape most often introduces. The
     * repeated labels are aria-hidden and the column headers stay in a real
     * thead at every width, and this is what checks that rather than asserting
     * it. scripts/axe-lane-b-surfaces.mjs cannot reach an authenticated page.
     */
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    const bad = axe.violations.filter(x => x.impact === 'serious' || x.impact === 'critical')
    check(
      `aq3.${v}.surface.axe-finds-nothing-serious`,
      bad.length === 0,
      bad.length === 0
        ? `${axe.violations.length} violation(s) of any impact, 0 serious or critical, ${axe.passes.length} check(s) passed`
        : bad.map(x => `${x.id} (${x.impact}, ${x.nodes.length})`).join(', '),
    )

    /* Law 5: every window link the page renders resolves 200. */
    const hrefs = await page.evaluate(() =>
      [...document.querySelectorAll('nav[aria-label="Period"] a')].map(a => a.getAttribute('href')),
    )
    let dead = 0
    for (const href of hrefs) {
      const response = await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      if (!response || response.status() !== 200) dead += 1
    }
    check(
      `aq3.${v}.surface.every-window-link-resolves`,
      hrefs.length === 4 && dead === 0,
      `${hrefs.length} period link(s), ${dead} not 200`,
    )
    await context.close()
  }

  check(
    'aq3.surface.the-longer-window-can-never-hold-less-than-the-shorter',
    true,
    'checked below against the all-time window',
  )
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: ADMIN_SESSION })
    const page = await context.newPage()
    const allTime = await readTiles(page, 0)
    checks.pop()
    check(
      'aq3.surface.the-longer-window-can-never-hold-less-than-the-shorter',
      allTime['Organic search visits'] >= after['Organic search visits'] &&
        allTime['Direct visits'] >= after['Direct visits'],
      `all time organic ${allTime['Organic search visits']} against 7 days ${after['Organic search visits']}, ` +
        `direct ${allTime['Direct visits']} against ${after['Direct visits']}`,
    )
    await page.screenshot({ path: join(out, 'desktop-1440-03-all-time.png'), fullPage: true }).catch(() => {})
    await context.close()
  }

  check(
    'aq3.ledger.every-referrer-this-drive-caused-was-the-one-it-arrived-with',
    // THE COUNT IS ASSERTED, not merely compared to itself. The first version
    // read `=== organicArrivals`, so a run in which nothing was recorded passed
    // with "0 recorded referrer(s), all www.google.com.au", which is true of an
    // empty list and is the shape of check this project has been burned by.
    referrersSeen.length === VIEWPORTS.length && referrersSeen.every(r => r === 'www.google.com.au'),
    `${referrersSeen.length} recorded referrer(s) against ${VIEWPORTS.length} arrival(s), all www.google.com.au`,
  )
} catch (error) {
  /*
   * A CATCH, BECAUSE THE FIRST VERSION HAD ONLY A `finally` AND IT HID THE ONE
   * THING WORTH READING. A throw anywhere in the run went straight to the
   * teardown, which exits the process on the checks it collected, so the drive
   * reported "1 of 1 checks passed" over an exception nobody ever saw.
   */
  check('aq3.drive.ran-to-the-end', false, `${error instanceof Error ? error.stack : String(error)}`)
} finally {
  if (browser) await browser.close().catch(() => {})

  /*
   * TEARDOWN THAT RE-READS. A GA5 run left a published fixture on TEST for two
   * days in September and it refused lane A's push at the indexing step, so this
   * reports what is ACTUALLY there afterwards rather than what it just deleted.
   */
  const purged = await purge('after')
  const { data: leftOrgs } = await db.from('organisations').select('id').like('slug', `${LANE}-org-%`)
  const { data: leftEvents } = await db.from('events').select('id').like('slug', `${LANE}-%`)
  const { data: leftUsers } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const leftAccounts = (leftUsers?.users ?? []).filter(u => (u.email ?? '').startsWith(`${LANE}-`))
  check(
    'aq3.teardown.test-left-as-found',
    (leftOrgs ?? []).length === 0 && (leftEvents ?? []).length === 0 && leftAccounts.length === 0,
    `${(leftOrgs ?? []).length} fixture organisation(s), ${(leftEvents ?? []).length} fixture event(s) and ` +
      `${leftAccounts.length} account(s) remain; ${purged.stuck.length} account(s) refused deletion`,
  )

  const failed = checks.filter(c => !c.ok)
  const report = {
    drive: 'aq3-organic-vs-direct',
    base: BASE,
    startedAt,
    finishedAt: new Date().toISOString(),
    visitedEvent: visited,
    passed: checks.length - failed.length,
    total: checks.length,
    checks,
  }
  writeFileSync(join(out, 'aq3-organic-vs-direct-drive.json'), JSON.stringify(report, null, 2))
  console.log(`\n=== ${checks.length - failed.length} of ${checks.length} checks passed ===`)
  for (const f of failed) console.log(`  FAILED  ${f.name}  ${f.detail}`)
  process.exit(failed.length === 0 ? 0 : 1)
}
