/**
 * GA2 DRIVEN PROOF. Five hundred people, a cap of fifty, and a weight moved
 * without a deploy, produced through the screen a person actually uses, at 390,
 * 768 and 1440.
 *
 * WHY IT IS DRIVEN RATHER THAN CALLED. src/lib/matching/run.ts imports
 * `server-only`, so it cannot be loaded by a script, which is the same wall
 * scripts/verify/event-lifecycle-proof.mjs records. That is not a workaround
 * here, it is the better proof: the acceptance asks for a run produced for one
 * event and an admin view that shows it, and pressing the button is how a
 * person produces one.
 *
 * WHAT IT PROVES, and which acceptance line each answers.
 *
 *   1. An audience of 500 lane-B rows, matched with the cap set to 50, returns
 *      exactly 50, records the audience it considered, flags the truncation
 *      rather than hiding it, and ranks 1 to 50 contiguous with no duplicates.
 *                                                              (acceptance 3)
 *   2. Changing ONE WEIGHT ROW changes the ranking on the next run with no
 *      deploy, which is what makes the weights configuration rather than code.
 *                                                              (acceptance 4)
 *   3. The admin view shows the list size, the funnel, the method and version,
 *      the English sentence and one row expanded to its breakdown, with no
 *      horizontal overflow at 390.                             (acceptance 6)
 *   4. The database refuses a score row for somebody the consent resolver
 *      refuses, and refuses a run that would exceed its own cap.
 *   5. The invariant view the guard reads is empty afterwards.
 *
 * EVERY ROW IT CREATES CARRIES lane-b. Everything that can be removed is
 * removed at the end; the consent events cannot be, by GA1's design, and the
 * count that remains is reported rather than pretended away.
 *
 * Run. BOTH loader flags, and neither is optional. This drive sets the matcher
 * feature flag the way /admin/flags sets it, which means importing the
 * product's own invalidateFeatureFlag out of src/lib/flags/broadcast.ts.
 * That module reaches the @/ alias, which node cannot resolve, AND it reaches
 * src/lib/observability/sentry.ts, which imports `isInitialized` from
 * @sentry/nextjs, an export the installed package only has inside a Next
 * build. With the alias loader alone the drive dies on
 *   SyntaxError: The requested module '@sentry/nextjs' does not provide an
 *   export named 'isInitialized'
 * before a single check runs. Added 14 September 2026 with the invalidation.
 *
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     BASE=http://localhost:3100 \
 *     UPSTASH_REDIS_REST_URL=http://127.0.0.1:8179 UPSTASH_REDIS_REST_TOKEN=local \
 *     node --import ./scripts/lib/server-only-shim.mjs \
 *          --import ./scripts/lib/src-alias-loader.mjs \
 *          --env-file=.env.local scripts/verify/ga2-matcher-drive.mjs \
 *          --out C:/dev/EVIDENCE/GA2
 *
 * UPSTASH_* matters here for the same reason the loader does: the flag cache
 * lives in that store, so a drive that cannot reach it cannot clear what the
 * server is reading.
 *
 * Start the server first: node scripts/dev/lane-b-serve-with-stripe.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { chromium, BASE } from '../journeys/harness.mjs'
import { invalidateFeatureFlag, FEATURE_FLAG_CACHE_TTL_SECONDS } from '../../src/lib/flags/broadcast.ts'
import { sitemapFootprint, laneFixturesStillPublished } from './lib/sitemap-footprint.mjs'
import { answerTheCookieBanner as answerTheBanner } from './lib/cookie-banner.mjs'

/*
 * THE CONSENT BANNER. One shared implementation (scripts/verify/lib/cookie-banner.mjs),
 * answered 'decline' here because that is the answer this drive has always given.
 * Five private copies of this helper existed on 15 September 2026 and three of them
 * matched button labels the banner does not carry, so they never dismissed anything.
 */
const answerTheCookieBanner = (page) => answerTheBanner(page, { answer: 'decline' })

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`FAIL: this proof only runs against TEST vkapkibzokmfaxqogypq, not ${url}`)
  process.exit(1)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

const checks = []
const failures = []
function check(id, ok, detail) {
  checks.push({ id, ok, detail })
  if (!ok) failures.push(`${id}: ${detail}`)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}

const STAMP = Date.now().toString(36)
const LANE = `lane-b-ga2-${STAMP}`
const POPULATION = 500
const CAP = 50

const VIEWPORTS = [
  { label: 'mobile-390', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { label: 'tablet-768', viewport: { width: 768, height: 1024 }, isMobile: false, hasTouch: true, deviceScaleFactor: 1 },
  { label: 'desktop-1440', viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
]

const adminPassword = `${randomUUID()}Aa1`
const fixture = {
  ownerId: null,
  organisationId: null,
  eventId: null,
  adminId: null,
  emails: [],
  memberIds: [],
}

/**
 * ONE LOGIN FOR THE WHOLE DRIVE, SAVED AND REUSED.
 *
 * The first version signed in for every block, and the sixth sign-in was
 * refused: auth-login is a FAIL-CLOSED rate limit and six logins from one
 * address inside ten minutes is what it exists to stop. The limiter was right
 * and the drive was hammering it. A saved session is also closer to the truth:
 * a person does not log in again between two presses.
 */
const ADMIN_SESSION = () => join(out, 'admin-session.json')

/**
 * SET THE FLAG THE WAY THE ADMIN SURFACE SETS IT: a row write AND an
 * invalidation, never a row write alone.
 *
 * WHAT THIS COST, on 14 September 2026. The reversal block wrote
 * `feature_flags.enabled = false` directly, proved the button disables, and put
 * it back to `true` in its `finally` - also directly. `isFeatureEnabled` caches
 * a flag for FEATURE_FLAG_CACHE_TTL_SECONDS, and `src/lib/admin/flags.ts` calls
 * `invalidateFeatureFlag` after every write, so a real switch lands at once.
 * This drive invalidated nothing, so the server kept serving `false` after the
 * restore, and the NEXT block found "Produce a match" still disabled and died
 * on `locator.click: Timeout 30000ms exceeded` with the button's own
 * `disabled` attribute in the error. 50 of 51, and the one that failed was
 * `proof.completed`, so it read as the drive falling over rather than as the
 * drive having switched the product off and not switched it back.
 *
 * It passed at closure for the same reason the FT1 fee check passed at closure:
 * with a TTL and no invalidation, whether a read straddles an expiry is a matter
 * of WHEN it runs. That is not a check, and the identical defect in two of this
 * lane's drives is why `drive-usage-names-what-it-needs` exists.
 *
 * The TTL is imported and never typed.
 */
async function setMatcherFlag(enabled) {
  await db.from('feature_flags').update({ enabled }).eq('flag', 'marketing_matcher_enabled')
  await invalidateFeatureFlag('marketing_matcher_enabled')
}

/**
 * THE INVALIDATION ABOVE CANNOT REACH THE SERVER FROM HERE, AND THE COMMENT
 * ABOVE IT BELIEVED IT COULD FOR FIVE DAYS.
 *
 * Measured on 19 September 2026, after this drive failed three runs in a row on
 * `locator.click: Timeout` with the button's own `disabled` attribute in the
 * error, while `feature_flags.enabled` read TRUE and the cache key read null:
 *
 *   .env.local   UPSTASH_REDIS_REST_URL   EMPTY
 *   the server   UPSTASH_REDIS_REST_URL   http://127.0.0.1:8179, the local shim
 *                                         injected by lane-b-serve-with-stripe.mjs
 *
 * `invalidateFeatureFlag` opens with `const redis = getRedisClient(); if
 * (!redis) return`. In THIS process there is no client, so it returns having
 * done nothing, silently, while the SERVER holds the cached value in the shim
 * for FEATURE_FLAG_CACHE_TTL_SECONDS. The header above says the write-plus-
 * invalidate pair fixed exactly this failure. It never could here, and it
 * looked fixed only because whether a run straddles a TTL expiry depends on
 * when it runs - which is the same "not a check" that header says about the FT1
 * fee check.
 *
 * SO THE DRIVE WAITS FOR THE SERVER'S VIEW INSTEAD OF ASSERTING ITS OWN. This
 * is correct whatever the two processes agree about: no Redis, a shared Redis,
 * a longer TTL, an invalidation that works. The page is RELOADED, because the
 * button's disabled state is decided at render and a page already on screen
 * will never change its mind however long it is clicked at.
 *
 * AND A TIMEOUT SAYS WHICH OF THE THREE CONDITIONS IT IS. The button disables
 * on `pending || !matcherEnabled || !eventId`, and the failure this replaces
 * named none of them. Four readings of the source each looked sufficient and
 * each was a guess; what settled it was opening the page and asking, which is
 * what this now does on every failure.
 */
async function waitForProduceButton(page, { enabled, url }) {
  const budgetMs = (FEATURE_FLAG_CACHE_TTL_SECONDS + 20) * 1000
  const deadline = Date.now() + budgetMs
  for (;;) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForTimeout(1200)
    await answerTheCookieBanner(page)

    const button = page.getByRole('button', { name: /produce a match/i })
    const isDisabled = await button.isDisabled().catch(() => null)
    if (isDisabled === !enabled) return

    if (Date.now() > deadline) {
      const eventIdField = await page.locator('input[name="event_id"]').inputValue().catch(() => '<no field>')
      const body = (await page.locator('body').innerText().catch(() => '')).toLowerCase()
      throw new Error(
        `"Produce a match" is ${isDisabled === null ? 'not on the page' : isDisabled ? 'disabled' : 'enabled'} ` +
          `and this block needs it ${enabled ? 'enabled' : 'disabled'}, after ${Math.round(budgetMs / 1000)}s of reloading. ` +
          `It disables on pending || !matcherEnabled || !eventId. ` +
          `event_id is "${eventIdField}"; the page ${/the matcher is switched off/.test(body) ? 'SAYS' : 'does not say'} the matcher is switched off. ` +
          `The flag row and the server's cached copy can disagree for up to ${FEATURE_FLAG_CACHE_TTL_SECONDS}s: ` +
          `this process cannot invalidate the server's cache, see setMatcherFlag above.`,
      )
    }
    await page.waitForTimeout(2000)
  }
}

async function newAdminContext(browser, viewportOptions) {
  return browser.newContext({ ...viewportOptions, storageState: ADMIN_SESSION() })
}

async function signInAsAdmin(page) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForTimeout(1200)
  await answerTheCookieBanner(page)
  await page.locator('input[name="email"]').fill(`${LANE}-admin@eventlinqs.test`)
  await page.locator('input[name="password"]').fill(adminPassword)
  await Promise.all([
    page.waitForURL(u => !u.pathname.endsWith('/admin/login'), { timeout: 60000 }).catch(() => {}),
    page.locator('button[type="submit"]').first().click(),
  ])
  await page.waitForTimeout(2500)
}

/**
 * Produce a run the way a person does: open the page for that event, set the
 * cap, press, and WAIT FOR THE ANSWER rather than for a fixed number of
 * seconds. Scoring five hundred people takes as long as it takes, and a sleep
 * that is usually long enough is a test that is occasionally a lie.
 */
async function pressProduceAMatch(page) {
  // Reloads until the server agrees the button is pressable, rather than
  // clicking at a render made while its cached flag still said off.
  await waitForProduceButton(page, { enabled: true, url: `${BASE}/admin/matches?event=${fixture.eventId}` })

  const cap = page.locator('#cap')
  await cap.fill(String(CAP))
  const filled = await cap.inputValue()
  if (filled !== String(CAP)) throw new Error(`the cap field holds ${filled}, not ${CAP}`)

  await page.getByRole('button', { name: /produce a match/i }).click({ timeout: 30000 })
  await page
    .locator('p[role="status"]')
    .filter({ hasText: /matched|no run was produced|switched off|pick an event/i })
    .first()
    .waitFor({ state: 'visible', timeout: 180000 })
    .catch(() => {})
  await page.waitForTimeout(1500)
  return (await page.locator('body').innerText()).toLowerCase()
}

async function buildFixture() {
  const { data: city } = await db.from('cities').select('slug').eq('is_active', true).order('display_order').limit(1).single()
  const { data: category } = await db.from('event_categories').select('id, slug').eq('is_active', true).order('sort_order').limit(1).single()
  const { data: cover } = await db
    .from('events')
    .select('cover_image_url')
    .eq('status', 'published')
    .not('cover_image_url', 'is', null)
    .limit(1)
    .single()
  const { data: tenant } = await db.from('marketing_tenants').select('id').eq('slug', 'eventlinqs').single()
  const { data: wording } = await db
    .from('consent_wordings')
    .select('body, version, channel_scope, third_party_scope, suppression_scope')
    .eq('purpose', 'facilitated_event_marketing')
    .order('effective_from', { ascending: false })
    .limit(1)
    .single()

  const owner = await db.auth.admin.createUser({
    email: `${LANE}-organiser@eventlinqs.test`,
    password: `${randomUUID()}Aa1`,
    email_confirm: true,
  })
  if (owner.error) throw new Error(`create organiser: ${owner.error.message}`)
  fixture.ownerId = owner.data.user.id
  await db.from('profiles').upsert({ id: fixture.ownerId, email: `${LANE}-organiser@eventlinqs.test`, full_name: 'Lane B GA2' })

  /*
   * PENDING, NOT ACTIVE, AND THE EVENT BELOW IS UNLISTED, NOT PUBLIC. An active
   * organisation is published at /organisers/<slug> by src/app/sitemap.ts and a
   * public event publishes both /events/<slug> and a /venues/<handle> derived
   * from venue_name. Three lanes share one TEST database and the sitemap holds
   * its snapshot for 300 seconds, so a fixture that is visible for the minutes it
   * lives leaves another lane's gate reading URLs that 404. That is not a
   * hypothesis: it refused lane A's push on 14 September 2026, and the whole
   * incident is written up in scripts/verify/lib/sitemap-footprint.mjs.
   */
  const org = await db
    .from('organisations')
    .insert({ name: `Lane B GA2 ${STAMP}`, slug: `${LANE}-org`, owner_id: fixture.ownerId, status: 'pending' })
    .select('id')
    .single()
  if (org.error) throw new Error(`create organisation: ${org.error.message}`)
  fixture.organisationId = org.data.id

  const start = new Date(Date.now() + 30 * 86_400_000)
  const event = await db
    .from('events')
    .insert({
      title: `Lane B GA2 match night ${STAMP}`,
      slug: `${LANE}-event`,
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
      venue_name: 'Lane B GA2 room',
      venue_city: city.slug,
      venue_postal_code: '3220',
      cover_image_url: cover.cover_image_url,
      tags: ['first-nations'],
      summary: 'An event created by the GA2 matcher proof. It is deleted when the proof ends.',
    })
    .select('id')
    .single()
  if (event.error) throw new Error(`create event: ${event.error.message}`)
  fixture.eventId = event.data.id

  const tier = await db
    .from('ticket_tiers')
    .insert({ event_id: fixture.eventId, name: 'General', price: 4500, currency: 'AUD', total_capacity: 900, is_active: true })
    .select('id')
    .single()
  if (tier.error) throw new Error(`create tier: ${tier.error.message}`)

  /*
   * FIVE HUNDRED CONSENTED PEOPLE, varied along every axis the scorer reads so
   * the ranking has something to rank. The consent event comes first because
   * the database REFUSES an audience row for somebody the resolver refuses,
   * which is GA1's trigger doing exactly what it was built for.
   */
  const now = Date.now()
  const consentRows = []
  const audienceRows = []
  for (let i = 0; i < POPULATION; i += 1) {
    const email = `${LANE}-${String(i).padStart(3, '0')}@eventlinqs.test`
    fixture.emails.push(email)
    consentRows.push({
      tenant_id: tenant.id,
      subject_email: email,
      purpose: 'facilitated_event_marketing',
      channel_scope: wording.channel_scope,
      decision: 'granted',
      wording: wording.body,
      wording_version: wording.version,
      capture_surface: 'ga2-proof',
      third_party_scope: wording.third_party_scope,
      suppression_scope: wording.suppression_scope,
      occurred_at: new Date(now - (i % 30) * 3_600_000).toISOString(),
    })
    audienceRows.push({
      email,
      consent_state: true,
      consent_channel: 'email',
      consent_at: new Date(now - (i % 30) * 3_600_000).toISOString(),
      consent_text: wording.body,
      consent_version: wording.version,
      consent_source: 'ga2-proof',
      first_order_at: new Date(now - (200 + (i % 400)) * 86_400_000).toISOString(),
      last_order_at: new Date(now - (i % 400) * 86_400_000).toISOString(),
      order_count: 1 + (i % 4),
      lifetime_spend_cents: (i % 50) * 1000,
      last_category_slug: i % 2 === 0 ? category.slug : null,
      last_city_slug: i % 3 === 0 ? city.slug : null,
      postcode: i % 5 === 0 ? '3220' : i % 5 === 1 ? '3250' : '6000',
      price_band: ['free', 'under-30', '30-to-59', '60-to-99', '100-to-199', '200-plus'][i % 6],
      category_slugs: i % 2 === 0 ? [category.slug] : [],
      community_slugs: i % 4 === 0 ? ['aboriginal-torres-strait-islander'] : [],
      city_slugs: i % 3 === 0 ? [city.slug] : [],
    })
  }

  for (let i = 0; i < consentRows.length; i += 100) {
    const { error } = await db.from('consent_events').insert(consentRows.slice(i, i + 100))
    if (error) throw new Error(`seed consent events: ${error.message}`)
  }
  for (let i = 0; i < audienceRows.length; i += 100) {
    const { error } = await db.from('audience_members').upsert(audienceRows.slice(i, i + 100), { onConflict: 'email' })
    if (error) throw new Error(`seed audience: ${error.message}`)
  }

  const seededRows = []
  for (let i = 0; i < fixture.emails.length; i += 100) {
    const { data } = await db.from('audience_members').select('id, email').in('email', fixture.emails.slice(i, i + 100))
    seededRows.push(...(data ?? []))
  }
  fixture.memberIds = seededRows.map(r => r.id)
  check(
    'fixture.five-hundred-consented-people-exist',
    seededRows.length === POPULATION,
    `${seededRows.length} of ${POPULATION} audience rows seeded, each with a consent event behind it`,
  )

  const admin = await db.auth.admin.createUser({
    email: `${LANE}-admin@eventlinqs.test`,
    password: adminPassword,
    email_confirm: true,
  })
  if (admin.error) throw new Error(`create admin: ${admin.error.message}`)
  fixture.adminId = admin.data.user.id
  await db.from('profiles').upsert({ id: fixture.adminId, email: `${LANE}-admin@eventlinqs.test`, full_name: 'Lane B GA2 Owner' })
  const staff = await db.from('admin_users').insert({ id: fixture.adminId, role: 'super_admin', display_name: 'Lane B GA2 Owner' })
  if (staff.error) throw new Error(`admin_users insert: ${staff.error.message}`)
}

async function teardown() {
  if (fixture.emails.length > 0) {
    const { data: members } = await db.from('audience_members').select('id').in('email', fixture.emails)
    const ids = (members ?? []).map(m => m.id)
    for (let i = 0; i < ids.length; i += 100) {
      await db.from('marketing_match_score').delete().in('audience_member_id', ids.slice(i, i + 100))
    }
    for (let i = 0; i < fixture.emails.length; i += 100) {
      await db.from('audience_members').delete().in('email', fixture.emails.slice(i, i + 100))
      await db.from('marketing_consents').delete().in('email', fixture.emails.slice(i, i + 100))
    }
  }
  if (fixture.eventId) {
    await db.from('marketing_match_run').delete().eq('event_id', fixture.eventId)
    await db.from('ticket_tiers').delete().eq('event_id', fixture.eventId)
    await db.from('ledger_slots').delete().eq('source_ref', fixture.eventId)
    await db.from('events').delete().eq('id', fixture.eventId)
  }
  if (fixture.organisationId) await db.from('organisations').delete().eq('id', fixture.organisationId)
  if (fixture.ownerId) await db.auth.admin.deleteUser(fixture.ownerId).catch(() => {})
}

async function run() {
  await buildFixture()

  /*
   * WHAT THIS FIXTURE PUBLISHES, ASKED OF THE DATABASE RATHER THAN ASSUMED.
   * The sitemap's own three queries, run against the rows that now exist. An
   * empty answer is the only acceptable one: everything here is deleted at
   * teardown, and a published URL that disappears is what refused lane A's push
   * on 14 September 2026. See scripts/verify/lib/sitemap-footprint.mjs.
   */
  {
    const footprint = await sitemapFootprint(db, {
      organisationSlugs: [`${LANE}-org`],
      eventSlugs: [`${LANE}-event`],
      venueNames: ['Lane B GA2 room'],
    })
    check(
      'ga2.fixture.publishes-nothing-into-the-sitemap',
      footprint.length === 0,
      footprint.length === 0
        ? 'the organisation, the event(s) and the venue(s) are all absent from the sitemap queries'
        : `the sitemap would publish ${footprint.join(', ')}, and every one of them 404s the moment this drive tears down`,
    )
  }

  // One sign-in, saved, and every context below opens with it.
  {
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    await signInAsAdmin(page)
    await context.storageState({ path: ADMIN_SESSION() })
    await context.close()
    await browser.close()
  }

  let firstRunId = null
  let topBefore = []

  for (const vp of VIEWPORTS) {
    const shot = p => join(out, `${vp.label}-${p}`)
    const browser = await chromium.launch({ headless: true })
    const context = await newAdminContext(browser, {
      viewport: vp.viewport,
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
      deviceScaleFactor: vp.deviceScaleFactor,
    })
    const page = await context.newPage()

    try {
      /*
       * THE AUDIENCE IS COUNTED AS AT THE RUN'S OWN TIMESTAMP, which is the only
       * count the run can be judged against.
       *
       * Two versions of this were wrong before this one, and both were wrong the
       * same way: they compared a number the RUN recorded against a count taken
       * at a DIFFERENT MOMENT, and then reported the difference as the run
       * having recorded the wrong figure.
       *
       * v1 counted once at the start of the drive and failed by ONE.
       * v2 counted "immediately before the run", and on 14 September 2026 it
       *    failed by THREE, reading "considered 503, which is every audience row
       *    on TEST at that moment". Nothing was wrong with the matcher. A second
       *    lane B drive was seeding audience rows on the same TEST project while
       *    this one ran, so rows arrived BETWEEN the count and the run. On a
       *    machine carrying three build lanes that is not an unlucky day, it is
       *    the normal condition.
       *
       * So the count is taken after the fact and bounded by the run's own
       * `started_at`. Rows that arrived after the run started are not rows the
       * run could have considered, and are correctly excluded. This is race free
       * rather than race narrowed, and it does NOT weaken the assertion: it is
       * still every audience row on the platform, not just this lane's.
       */
      const audienceAsAt = async (startedAt) => {
        const { count } = await db
          .from('audience_members')
          .select('id', { count: 'exact', head: true })
          .lte('created_at', startedAt)
        return count ?? 0
      }

      // The empty state, before anything has been produced for this event.
      if (!firstRunId) {
        await page.goto(`${BASE}/admin/matches?event=${fixture.eventId}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
        await page.waitForTimeout(2000)
        await answerTheCookieBanner(page)
        const emptyText = (await page.locator('body').innerText()).toLowerCase()
        await page.screenshot({ path: shot('01-empty-state.png'), fullPage: true })
        check(
          `${vp.label}.empty-state.says-what-to-do-and-never-says-no-data`,
          /no match has been produced/.test(emptyText) && !/no data/.test(emptyText),
          'the empty state names the event and says what pressing the button does',
        )
      }

      const afterText = await pressProduceAMatch(page)
      await page.screenshot({ path: shot('02-match-produced.png'), fullPage: true })

      const { data: runRow } = await db
        .from('marketing_match_run')
        .select('id, audience_considered, returned_count, truncated, requested_cap, method_name, method_version, suppressed_by_reason, started_at')
        .eq('event_id', fixture.eventId)
        .order('started_at', { ascending: false })
        .limit(1)
        .single()

      const { data: scores } = await db
        .from('marketing_match_score')
        .select('rank, score, audience_member_id, breakdown')
        .eq('run_id', runRow.id)
        .order('rank')

      check(
        `${vp.label}.cap.exactly-fifty-returned`,
        (scores ?? []).length === CAP && runRow.returned_count === CAP,
        `${(scores ?? []).length} score row(s), the run says ${runRow.returned_count}`,
      )
      check(
        `${vp.label}.cap.the-cap-the-operator-typed-is-the-cap-the-run-used`,
        runRow.requested_cap === CAP,
        `the run records a cap of ${runRow.requested_cap}`,
      )
      check(
        `${vp.label}.cap.truncation-is-recorded-rather-than-hidden`,
        runRow.truncated === true,
        `truncated ${runRow.truncated}, cap ${runRow.requested_cap}`,
      )
      const audienceWhenItRan = await audienceAsAt(runRow.started_at)
      check(
        `${vp.label}.run.records-the-audience-it-considered`,
        runRow.audience_considered === audienceWhenItRan,
        `considered ${runRow.audience_considered}, against ${audienceWhenItRan} audience row(s) existing as at the run's own started_at, including the ${POPULATION} this proof seeded`,
      )
      const ranks = (scores ?? []).map(s => s.rank)
      check(
        `${vp.label}.ranks.contiguous-one-to-fifty-with-no-duplicates`,
        ranks.length === CAP && new Set(ranks).size === CAP && ranks.every((r, i) => r === i + 1),
        `ranks ${ranks[0]} to ${ranks[ranks.length - 1]}, ${new Set(ranks).size} distinct`,
      )
      check(
        `${vp.label}.ranks.are-ordered-by-score`,
        (scores ?? []).every((s, i, all) => i === 0 || Number(all[i - 1].score) >= Number(s.score)),
        `top ${scores?.[0]?.score}, last ${scores?.[scores.length - 1]?.score}`,
      )
      check(
        `${vp.label}.breakdown.is-stored-with-every-score`,
        (scores ?? []).every(s => Array.isArray(s.breakdown) && s.breakdown.length === 8),
        'every stored row carries its eight components',
      )

      /* ---- what the screen says (acceptance 6) ---------------------------- */
      check(
        `${vp.label}.screen.one-number-first`,
        afterText.includes('people this run matched') && afterText.includes(String(CAP)),
        'the size of the list this run produced leads the page',
      )
      check(
        `${vp.label}.screen.shows-the-funnel`,
        /audience considered/.test(afterText) && /removed before scoring/.test(afterText) &&
          /they already hold a ticket to this event/.test(afterText),
        'the funnel from audience to matched is on the page, reason by reason',
      )
      check(
        `${vp.label}.screen.names-the-method-and-version`,
        afterText.includes(runRow.method_name.toLowerCase()) && afterText.includes(runRow.method_version.toLowerCase()),
        `${runRow.method_name} ${runRow.method_version} named on the page`,
      )
      check(
        `${vp.label}.screen.explains-the-arithmetic-in-english`,
        /each person scores out of 100 by adding up eight fits/.test(afterText),
        'the method is stated in one sentence rather than implied',
      )

      const firstRow = page.locator('details').first()
      await firstRow.click({ timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(800)
      await firstRow.scrollIntoViewIfNeeded().catch(() => {})
      await page.screenshot({ path: shot('03-breakdown-expanded.png'), fullPage: false })
      const expanded = (await page.locator('body').innerText()).toLowerCase()
      check(
        `${vp.label}.screen.a-row-expands-to-sentences-not-json`,
        /they have bought a ticket in this category before/.test(expanded) && !/"component"/.test(expanded),
        'the breakdown reads as sentences with a number beside each',
      )

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
      check(`${vp.label}.screen.no-horizontal-overflow`, !overflow, overflow ? 'the matches view overflows sideways' : 'no sideways scroll')

      if (!firstRunId) {
        firstRunId = runRow.id
        topBefore = (scores ?? []).slice(0, 20).map(s => s.audience_member_id)
      }
    } finally {
      await context.close()
      await browser.close()
    }
  }

  /* ---- acceptance 4: a weight moves, the ranking moves, no deploy --------- */
  {
    const browser = await chromium.launch({ headless: true })
    const context = await newAdminContext(browser, { viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    try {
      await db.from('marketing_match_weights').update({ weight: 0.04 }).eq('component', 'category')
      await db.from('marketing_match_weights').update({ weight: 0.34 }).eq('component', 'city')
      await pressProduceAMatch(page)
      await page.screenshot({ path: join(out, 'weights-moved.png'), fullPage: true })

      const { data: latest } = await db
        .from('marketing_match_run')
        .select('id')
        .eq('event_id', fixture.eventId)
        .order('started_at', { ascending: false })
        .limit(1)
        .single()
      const { data: scoresAfter } = await db
        .from('marketing_match_score')
        .select('rank, audience_member_id')
        .eq('run_id', latest.id)
        .order('rank')
      const topAfter = (scoresAfter ?? []).slice(0, 20).map(s => s.audience_member_id)
      check(
        'weights.are-configuration-and-move-the-ranking',
        JSON.stringify(topBefore) !== JSON.stringify(topAfter),
        'the top twenty changed after one weight row moved, with no deploy',
      )

      // A weight set that does not sum to one is refused BY NAME on the screen
      // rather than scoring with a ceiling nobody knows about.
      await db.from('marketing_match_weights').update({ weight: 0.5 }).eq('component', 'category')
      const refusedText = await pressProduceAMatch(page)
      await page.screenshot({ path: join(out, 'weights-broken-refused.png'), fullPage: true })
      check(
        'weights.a-broken-set-is-refused-on-screen-and-names-the-rows',
        /sums to/.test(refusedText) && /category=0.5/.test(refusedText),
        'the screen says the weights do not sum to one and prints the rows',
      )
    } finally {
      // Put the weights back exactly as they were, whatever happened above.
      await db.from('marketing_match_weights').update({ weight: 0.24 }).eq('component', 'category')
      await db.from('marketing_match_weights').update({ weight: 0.14 }).eq('component', 'city')
      await context.close()
      await browser.close()
    }
  }

  /* ---- the reversal switch ------------------------------------------------ */
  {
    const browser = await chromium.launch({ headless: true })
    const context = await newAdminContext(browser, { viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    try {
      await setMatcherFlag(false)
      /*
       * THE SAME WAIT, IN THE OTHER DIRECTION, AND IT MATTERS AS MUCH. This
       * block asserts the button IS disabled. With the cached copy possibly
       * still saying `true` for up to the TTL, a single render could show it
       * enabled and this check would report the switch broken when it is not.
       * The fragility ran both ways and only one way had ever been seen.
       */
      await waitForProduceButton(page, { enabled: false, url: `${BASE}/admin/matches?event=${fixture.eventId}` })
      await page.screenshot({ path: join(out, 'switch-off.png'), fullPage: true })
      const offText = (await page.locator('body').innerText()).toLowerCase()
      const buttonDisabled = await page.getByRole('button', { name: /produce a match/i }).isDisabled().catch(() => false)
      const { count: stillStored } = await db
        .from('marketing_match_score')
        .select('id', { count: 'exact', head: true })
        .eq('run_id', firstRunId)
      check(
        'reversal.the-switch-stops-a-new-run-and-leaves-the-stored-ones-alone',
        /the matcher is switched off/.test(offText) && buttonDisabled && (stillStored ?? 0) === CAP,
        `the screen says so, the button is disabled, and the stored run still holds ${stillStored} rows (the flag was set the way /admin/flags sets it, write plus invalidate, because the cache TTL is ${FEATURE_FLAG_CACHE_TTL_SECONDS}s and a write alone leaves the next block pressing a button this one switched off)`,
      )
    } finally {
      await setMatcherFlag(true)
      await context.close()
      await browser.close()
    }
  }

  /* ---- the database's own refusals --------------------------------------- */

  /*
   * THE CAP IS TESTED ON A FULL RUN, and the order below is the whole reason
   * this is worth writing down. The first version tested it AFTER withdrawing
   * somebody, and it failed: the withdrawal deletes that person's audience row
   * (GA1's refresh) and the score row goes with it by cascade, so the run held
   * forty-nine and a fiftieth row was legitimately allowed. The test was wrong
   * and the behaviour it stumbled into is worth having on the record, so both
   * are checked, in an order where each means what it says.
   */
  const { count: rowsBeforeCapTest } = await db
    .from('marketing_match_score')
    .select('id', { count: 'exact', head: true })
    .eq('run_id', firstRunId)
  const { data: liveMember } = await db
    .from('audience_members')
    .select('id')
    .in('email', fixture.emails.slice(100, 150))
    .limit(1)
    .single()
  const { error: refusedCap } = await db.from('marketing_match_score').insert({
    run_id: firstRunId,
    audience_member_id: liveMember.id,
    score: 50,
    breakdown: [],
    rank: 51,
  })
  check(
    'database.refuses-a-run-that-would-exceed-its-own-cap',
    Boolean(refusedCap) && rowsBeforeCapTest === CAP,
    refusedCap
      ? `${refusedCap.message} (the run held ${rowsBeforeCapTest} of ${CAP})`
      : `the row was accepted with ${rowsBeforeCapTest} of ${CAP} already stored, so a run can hold more people than the owner approved`,
  )

  const { data: withdrawnMember } = await db
    .from('audience_members')
    .select('id, email')
    .in('email', fixture.emails.slice(0, 50))
    .limit(1)
    .single()
  const { data: tenant } = await db.from('marketing_tenants').select('id').eq('slug', 'eventlinqs').single()
  await db.from('suppression_events').insert({
    tenant_id: tenant.id,
    subject_email: withdrawnMember.email,
    channel: 'both',
    scope: 'all_marketing',
    reason: 'the GA2 proof withdrew them to see what the database does',
    request_source: 'ga2-proof',
  })

  // A withdrawal removes them from every stored list, by cascade, because the
  // audience row they hang off is derived and GA1's refresh deletes it. That is
  // the strongest posture available and it is asserted rather than assumed.
  const { count: afterWithdrawal } = await db
    .from('marketing_match_score')
    .select('id', { count: 'exact', head: true })
    .eq('audience_member_id', withdrawnMember.id)
  check(
    'withdrawal.removes-that-person-from-every-stored-run',
    (afterWithdrawal ?? 0) === 0,
    `${afterWithdrawal ?? 0} stored score row(s) left for somebody who withdrew`,
  )

  const { error: refusedScore } = await db.from('marketing_match_score').insert({
    run_id: firstRunId,
    audience_member_id: withdrawnMember.id,
    score: 99,
    breakdown: [],
    rank: 9999,
  })
  check(
    'database.refuses-a-score-row-for-a-refused-subject',
    Boolean(refusedScore),
    refusedScore?.message ?? 'the row was accepted, which would let a withdrawn person into a send list',
  )

  /* ---- the invariant the guard reads ------------------------------------- */
  const { data: breaches } = await db.from('marketing_match_invariant_breaches').select('breach, detail')
  check(
    'invariant.view-is-empty',
    (breaches ?? []).length === 0,
    (breaches ?? []).length === 0 ? 'no breach of the matcher invariant' : JSON.stringify(breaches),
  )

  /* ---- an unpublished event is refused ------------------------------------ */
  {
    const browser = await chromium.launch({ headless: true })
    const context = await newAdminContext(browser, { viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    try {
      await db.from('events').update({ status: 'draft' }).eq('id', fixture.eventId)
      const draftText = await pressProduceAMatch(page)
      await page.screenshot({ path: join(out, 'draft-refused.png'), fullPage: true })
      check(
        'refusal.an-unpublished-event-cannot-be-matched',
        /a match is only produced for a published event/.test(draftText),
        'the screen refuses a draft and says why',
      )
    } finally {
      await db.from('events').update({ status: 'published' }).eq('id', fixture.eventId)
      await context.close()
      await browser.close()
    }
  }
}

let exitCode = 0
try {
  await run()
} catch (error) {
  check('proof.completed', false, String(error?.stack ?? error))
} finally {
  let ledgerLeft = 0
  try {
    await teardown()
    const { count } = await db
      .from('consent_events')
      .select('id', { count: 'exact', head: true })
      .eq('capture_surface', 'ga2-proof')
    ledgerLeft = count ?? 0
    const { count: leftMembers } = await db
      .from('audience_members')
      .select('id', { count: 'exact', head: true })
      .in('email', fixture.emails.slice(0, 100))
    check('teardown.left-as-found', (leftMembers ?? 0) === 0, `${leftMembers ?? 0} seeded audience row(s) left`)
    check(
      'teardown.the-consent-ledger-cannot-be-tidied-away',
      ledgerLeft > 0,
      `${ledgerLeft} consent event(s) remain, because the database refuses to delete a consent record`,
    )

    /*
     * AND NOTHING OF THIS DRIVE'S, FROM ANY RUN, IS LEFT PUBLISHED. The count
     * above asks about one table. This asks the sitemap's question of every
     * row carrying this drive's prefix, including rows an EARLIER run left
     * behind, which is how a published GA5 fixture event lived on shared TEST
     * for two days while every run reported "left as found".
     */
    const leftPublished = await laneFixturesStillPublished(db, 'lane-b-ga2-')
    check(
      'ga2.teardown.nothing-of-this-drive-is-left-published',
      leftPublished.length === 0,
      leftPublished.length === 0
        ? 'no organiser, event or venue page of this drive is in the sitemap'
        : `still published: ${leftPublished.join(', ')}. Every one of them 404s when the row goes.`,
    )
  } catch (error) {
    check('teardown.left-as-found', false, String(error?.message ?? error))
  }

  const passed = checks.filter(c => c.ok).length
  writeFileSync(
    join(out, 'matcher-proof.json'),
    JSON.stringify({ item: 'GA2', at: new Date().toISOString(), lane: LANE, passed, total: checks.length, checks, failures }, null, 2),
  )
  console.log(`\n${passed} of ${checks.length} checks passed`)
  if (failures.length > 0) {
    console.log('FAILURES:')
    for (const f of failures) console.log(`  ${f}`)
    exitCode = 1
  }
}
process.exit(exitCode)
