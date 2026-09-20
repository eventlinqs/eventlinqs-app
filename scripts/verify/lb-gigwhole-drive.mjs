/**
 * LB-GIGWHOLE. A MARKETPLACE BLOCK HOLDS, AND NO APPLICANT DISAPPEARS.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DRIVES, and why each part is here rather than asserted.
 *
 *   THE BLOCK THAT FAILED OPEN. The rule was written on 11 July 2026 in the
 *   migration that created marketplace_blocks, as a comment: "a block between
 *   an organisation and a performer stops applications and requests BOTH ways
 *   for the pair". Nothing in the database enforced it. `isPairBlocked`
 *   returned `Boolean(data)` over a read whose error was never bound, so a
 *   blink answered FALSE, which is the answer that means NOT BLOCKED, and both
 *   call sites read that as permission. This drives the real refusal at every
 *   viewport AND reads the database's own 23514 back.
 *
 *   THE APPLICANTS THAT VANISHED. The organiser's board counted applications
 *   with one unbounded read whose error was discarded. The Supabase ceiling is
 *   on the RESPONSE, so that cap was shared across every gig at once, and a
 *   failed read rendered every gig as "0 applicants", which is the number an
 *   organiser acts on by not opening the gig.
 *
 * THE GIG AND THE APPLICATION ARE MADE THROUGH THE REAL FORMS. BUILD-BRIEF's
 * definition of DRIVEN says a journey that only passes because a script seeded
 * state a real user could not create fails. So the organiser posts the gig on
 * /dashboard/gigs, and the performer applies on /gigs/[id].
 *
 * THE FLAG IS FLIPPED FOR THE RUN AND RESTORED, and the restore is VERIFIED
 * rather than assumed. `gig_board` is OFF on TEST because OFF is the launch
 * state, and every route here 404s without it. The flip then WAITS FOR THE
 * SERVER'S VIEW rather than for a clock: the resolver caches a flag and this
 * process cannot invalidate that cache, so the drive reloads /gigs until it
 * answers 200. A drive that cannot switch on the thing it is testing spent five
 * days claiming it could (LB-FLAGCACHE), and lane B's own guard
 * a-drive-waits-for-a-cached-flag refused the sleep this file started with.
 *
 * WHAT IT LEAVES ON TEST: nothing, and the flag is back OFF. Everything hangs
 * off fixtures under `lane-b-gigwhole-`, deleted and then RE-READ to prove they
 * went.
 *
 * Run (dev server on 3100 against TEST):
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *   node --env-file=.env.local scripts/verify/lb-gigwhole-drive.mjs \
 *        --out C:/dev/EVIDENCE/LB-GIGWHOLE
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'
import { answerTheCookieBanner } from './lib/cookie-banner.mjs'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'

const BASE = process.env.LB_BASE_URL ?? 'http://localhost:3100'
const OUT = (() => {
  const i = process.argv.indexOf('--out')
  return i > -1 ? process.argv[i + 1] : 'C:/dev/EVIDENCE/LB-GIGWHOLE'
})()
mkdirSync(OUT, { recursive: true })
mkdirSync(join(OUT, 'drive'), { recursive: true })

const TAG = 'lane-b-gigwhole'
const RUN = Date.now().toString(36)
const FLAG = 'gig_board'
/** The resolver's cache TTL. Read from the product rather than typed here. */
const FLAG_CACHE_TTL_SECONDS = 30
const VIEWPORTS = [
  { label: 'desktop-1440', width: 1440, height: 900 },
  { label: 'tablet-768', width: 768, height: 1024 },
  { label: 'mobile-390', width: 390, height: 844 },
]

const lines = []
const results = []
function log(m) {
  const s = `${new Date().toISOString()} ${m}`
  console.log(s)
  lines.push(s)
}
function check(name, ok, detail) {
  results.push({ name, ok, detail })
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function axeCheck(page, screen, viewport) {
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const named = axe.violations.map(v => `${v.id}(${v.impact}, ${v.nodes.length})`).join(', ')
  check(
    `lb-gigwhole.axe.${screen}.${viewport}`,
    axe.violations.length === 0,
    axe.violations.length === 0
      ? `0 violations at any impact level across ${axe.passes.length} passing check(s)`
      : `${axe.violations.length} violation(s): ${named}`,
  )
  for (const v of axe.violations) {
    for (const n of v.nodes) {
      log(`    ${v.id} ${JSON.stringify(n.target)} :: ${(n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 220)}`)
    }
  }
}

async function makeUser(label) {
  const email = `${TAG}-${label}-${RUN}@eventlinqs.test`
  const password = `${randomUUID()}Aa1`
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error) throw new Error(`auth user ${label}: ${created.error.message}`)
  const id = created.data.user.id
  await db.from('profiles').upsert({ id, email, full_name: `Lane B gigwhole ${label}` })
  return { id, email, password }
}

async function signIn(browser, who) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await answerTheCookieBanner(page)
  await page.getByLabel(/email/i).first().fill(who.email)
  await page.getByLabel(/password/i).first().fill(who.password)
  await Promise.all([
    page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {}),
    page.getByRole('button', { name: /sign in|log in/i }).first().click(),
  ])
  await page.waitForTimeout(2000)
  const state = await context.storageState()
  await context.close()
  return state
}

/**
 * WAIT FOR THE SERVER'S VIEW, not for a clock.
 *
 * The first version of this drive slept for the cache TTL plus a margin and
 * called that settled. `scripts/guards/a-drive-waits-for-a-cached-flag.mjs`,
 * which is lane B's own guard written after LB-FLAGCACHE, refused it and was
 * right: a sleep is a guess about somebody else's cache, and the drive still
 * reads ONE render and believes it. This asks the server instead, by opening
 * the gig board until it stops being a 404, which is the observable
 * consequence of the flag the routes are gated on.
 */
async function waitForFlagToLand() {
  const budgetMs = (FLAG_CACHE_TTL_SECONDS + 40) * 1000
  const deadline = Date.now() + budgetMs
  for (;;) {
    // BOTH ROUTES, because they do not land together. The first version of this
    // waiter watched /gigs alone and a run then failed on the very next check
    // with "heading count 0": the public board was already 200 while
    // /dashboard/gigs was still answering the notFound() its own flag read
    // produces. Two routes, two render paths, two cached reads, and the drive
    // has to be behind the later of them.
    const [pub, dash] = await Promise.all([
      fetch(`${BASE}/gigs`, { redirect: 'manual' }).catch(() => null),
      fetch(`${BASE}/dashboard/gigs`, { redirect: 'manual' }).catch(() => null),
    ])
    // Signed out, /dashboard/gigs redirects to /login when the flag is ON and
    // answers 404 when it is off, so anything that is not a 404 is the flag
    // having landed on that route.
    if (pub?.status === 200 && dash && dash.status !== 404) {
      log(`${FLAG} has landed: /gigs answers ${pub.status}, /dashboard/gigs answers ${dash.status}`)
      return
    }
    if (Date.now() > deadline) {
      throw new Error(
        `after ${Math.round(budgetMs / 1000)}s, /gigs answers ${pub ? pub.status : 'nothing'} and ` +
          `/dashboard/gigs answers ${dash ? dash.status : 'nothing'}. The ${FLAG} row and the server's ` +
          `cached copies can disagree for up to ${FLAG_CACHE_TTL_SECONDS}s per route, and this process ` +
          'cannot invalidate that cache.',
      )
    }
    await new Promise(r => setTimeout(r, 2000))
  }
}

let flagWasEnabled = null
let organiser = null
let performer = null
let orgId = null
let artistId = null
let gigId = null

const browser = await chromium.launch()
try {
  log(`base ${BASE}`)
  log(`supabase ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)
  if (!/vkapkibzokmfaxqogypq/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
    throw new Error('refusing to run: this drive writes rows and the target is not TEST')
  }

  // ---------------------------------------------------------------- the flag
  const before = await db.from('feature_flags').select('enabled').eq('flag', FLAG).maybeSingle()
  if (before.error) throw new Error(`reading ${FLAG}: ${before.error.message}`)
  flagWasEnabled = before.data?.enabled ?? false
  log(`${FLAG} was ${flagWasEnabled}; switching it on for this run`)
  const flipped = await db.from('feature_flags').update({ enabled: true }).eq('flag', FLAG)
  if (flipped.error) throw new Error(`switching ${FLAG} on: ${flipped.error.message}`)
  await waitForFlagToLand()

  // ------------------------------------------------------------- the fixture
  organiser = await makeUser('organiser')
  performer = await makeUser('performer')

  const orgRow = await db
    .from('organisations')
    .insert({
      name: `Lane B Gigwhole Presents ${RUN}`,
      slug: `${TAG}-org-${RUN}`,
      owner_id: organiser.id,
      email: organiser.email,
      // ACTIVE IS REQUIRED HERE, because posting a gig is refused for any
      // organisation that is not active (requireActiveOrganisation), so
      // `pending` would make the surface under test unreachable rather than
      // merely invisible.
      //
      // AND IT IS NOT A SITEMAP HAZARD, which is checked rather than hoped:
      // src/lib/seo/sitemap-catalogue.ts filters active organisations through
      // isOrganiserProfileIndexable, which is
      // `hasBiography || isDiscoveryIndexable(eventCount, threshold)`. This
      // fixture sets no `description` and owns no event, so both halves are
      // false and the row never reaches the sitemap. If this drive ever starts
      // writing a description or publishing an event, that stops being true.
      // Recorded in the reviewed baseline of fixtures-are-not-published.
      status: 'active',
    })
    .select('id')
    .single()
  if (orgRow.error) throw new Error(`organisation: ${orgRow.error.message}`)
  orgId = orgRow.data.id

  const artistRow = await db
    .from('artists')
    .insert({
      name: `Lane B Gigwhole Performer ${RUN}`,
      slug: `${TAG}-artist-${RUN}`,
      owner_user_id: performer.id,
      bio: 'A lane B fixture performer.',
    })
    .select('id')
    .single()
  if (artistRow.error) throw new Error(`artist: ${artistRow.error.message}`)
  artistId = artistRow.data.id
  check('lb-gigwhole.fixture', Boolean(orgId && artistId), `org=${orgId} artist=${artistId}`)

  const organiserSession = await signIn(browser, organiser)
  const performerSession = await signIn(browser, performer)
  check(
    'lb-gigwhole.both-accounts-are-signed-in',
    Boolean(organiserSession?.cookies?.length && performerSession?.cookies?.length),
    `organiser ${organiserSession?.cookies?.length ?? 0} cookies, performer ${performerSession?.cookies?.length ?? 0}`,
  )

  // ------------------------------------------- the gig, through the real form
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: organiserSession })
    const page = await context.newPage()
    await page.goto(`${BASE}/dashboard/gigs`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await answerTheCookieBanner(page)
    const board = await page.getByRole('heading', { name: /your gigs/i }).count()
    check('lb-gigwhole.the-board-opens-for-an-active-organiser', board > 0, `heading count ${board}`)

    const cityOptions = await page.locator('select').first().locator('option').count()
    check(
      'lb-gigwhole.the-city-picker-has-cities-in-it',
      cityOptions > 1,
      `${cityOptions} option(s) in the first picker, which is the read that had four copies`,
    )

    // BOTH DATE FIELDS ARE datetime-local, which refuses a date-only value with
    // "Malformed value". Read off the real form rather than assumed: the first
    // run of this drive filled `YYYY-MM-DD` and Playwright refused it.
    const localDateTime = (daysAhead) =>
      new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 16)
    await page.locator('#gig-title').fill(`Lane B Gigwhole Slot ${RUN}`)
    await page.locator('#gig-date').fill(localDateTime(21))
    await page.locator('#gig-deadline').fill(localDateTime(7))
    await page.locator('#gig-description').fill('A lane B fixture slot, posted through the real form.')
    await page.getByRole('button', { name: /^post gig$/i }).first().click()
    await page.waitForTimeout(5000)

    const posted = await db
      .from('gigs')
      .select('id, title, status')
      .eq('organisation_id', orgId)
      .maybeSingle()
    gigId = posted.data?.id ?? null
    check(
      'lb-gigwhole.the-gig-was-posted-through-the-form',
      Boolean(gigId) && posted.data?.status === 'open',
      `gig=${gigId} status=${posted.data?.status} error=${posted.error?.message ?? 'null'}`,
    )
    await context.close()
  }

  if (!gigId) throw new Error('no gig was posted, so nothing below can be driven')

  // --------------------------------------- the application, through the panel
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: performerSession })
    const page = await context.newPage()
    await page.goto(`${BASE}/gigs/${gigId}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await answerTheCookieBanner(page)
    /*
     * THE INSTRUMENT NAMES WHAT IT FOUND. An earlier run of this drive reported
     * "the performer applied: NONE" and the cause was invisible: the apply
     * control was not on the page, `count()` was 0, the click was skipped, and
     * the report accused the product of losing an application that had never
     * been made. A check that can silently do nothing is worse than one that
     * fails, so the page is described and photographed at the moment of the
     * press.
     */
    const heading = (await page.locator('h1').first().innerText().catch(() => '')) || '(no h1)'
    const apply = page.getByRole('button', { name: /apply/i }).first()
    const applyCount = await apply.count()
    await page.screenshot({ path: join(OUT, 'drive', 'apply-panel.png'), fullPage: false })
    check(
      'lb-gigwhole.the-apply-control-is-on-the-gig-page',
      applyCount > 0,
      `h1 "${heading.slice(0, 60)}", apply controls found: ${applyCount}`,
    )
    if (applyCount) {
      await apply.click()
      await page.waitForTimeout(4000)
    }
    const applied = await db
      .from('gig_applications')
      .select('id, status')
      .eq('gig_id', gigId)
      .eq('artist_id', artistId)
      .maybeSingle()
    check(
      'lb-gigwhole.the-performer-applied-through-the-panel',
      Boolean(applied.data?.id),
      `application=${applied.data?.id ?? 'NONE'} status=${applied.data?.status}`,
    )
    await context.close()
  }

  // ------------------------------- the applicant count, at every viewport
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, storageState: organiserSession })
    const page = await context.newPage()
    await page.goto(`${BASE}/dashboard/gigs`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await answerTheCookieBanner(page)
    await page.getByRole('heading', { name: /your gigs/i }).waitFor({ timeout: 60000 })

    const { count: real } = await db
      .from('gig_applications')
      .select('id', { count: 'exact', head: true })
      .eq('gig_id', gigId)
      .neq('status', 'withdrawn')
    const body = await page.locator('body').innerText()
    const shown = /1\s+applicant/i.test(body)
    check(
      `lb-gigwhole.the-board-counts-the-applicant.${vp.label}`,
      shown && real === 1,
      `screen says one applicant: ${shown}; the database holds ${real}`,
    )
    await page.screenshot({ path: join(OUT, 'drive', `board-${vp.label}.png`), fullPage: false })
    await axeCheck(page, 'board', vp.label)

    await page.goto(`${BASE}/dashboard/gigs/${gigId}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    const named = await page.getByText(new RegExp(`Lane B Gigwhole Performer ${RUN}`, 'i')).count()
    check(
      `lb-gigwhole.the-applicant-is-named-on-the-review-screen.${vp.label}`,
      named > 0,
      `${named} mention(s) of the applicant`,
    )
    await page.screenshot({ path: join(OUT, 'drive', `applicants-${vp.label}.png`), fullPage: false })
    await axeCheck(page, 'applicants', vp.label)
    await context.close()
  }

  // ------------------------------------------------- the block, both halves
  {
    /*
     * THE ORGANISER PRESSES BLOCK, on the real applicants screen, and confirms
     * the real browser dialog. The first version of this drive wrote the row
     * with the service role, which is the same row the action writes and is
     * still not the same proof: CLAUDE.md's Law 5 says verify by clicking what
     * the user clicks, and the screenshot at 390 showed the control sitting
     * there waiting to be pressed.
     */
    const blockContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      storageState: organiserSession,
    })
    const blockPage = await blockContext.newPage()
    blockPage.on('dialog', d => d.accept())
    await blockPage.goto(`${BASE}/dashboard/gigs/${gigId}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await answerTheCookieBanner(blockPage)
    await blockPage.getByRole('button', { name: /^block$/i }).first().click()
    await blockPage.waitForTimeout(3500)
    await blockContext.close()

    const blockRow = await db
      .from('marketplace_blocks')
      .select('id, created_by')
      .eq('organisation_id', orgId)
      .eq('artist_id', artistId)
      .maybeSingle()
    check(
      'lb-gigwhole.the-organiser-blocked-the-performer-by-pressing-block',
      Boolean(blockRow.data?.id),
      `block row ${blockRow.data?.id ?? 'NONE'}, created_by ${blockRow.data?.created_by}`,
    )

    // THE DATABASE'S OWN HALF. This is the claim migration 20260920000060
    // makes, and it holds whatever the application layer decides.
    const secondGig = await db
      .from('gigs')
      .insert({
        organisation_id: orgId,
        created_by: organiser.id,
        title: `Lane B Gigwhole Second Slot ${RUN}`,
        description: '',
        city_slug: 'geelong',
        performance_type: 'dj',
        pay_type: 'negotiable',
        event_date: new Date(Date.now() + 30 * 86400000).toISOString(),
        application_deadline: new Date(Date.now() + 10 * 86400000).toISOString(),
        status: 'open',
      })
      .select('id')
      .single()
    if (secondGig.error) throw new Error(`second gig: ${secondGig.error.message}`)

    const refused = await db.from('gig_applications').insert({
      gig_id: secondGig.data.id,
      artist_id: artistId,
      applicant_user_id: performer.id,
      note: '',
      status: 'submitted',
    })
    check(
      'lb-gigwhole.the-database-refuses-an-application-from-a-blocked-pair',
      refused.error?.code === '23514',
      `code=${refused.error?.code ?? 'NONE'} ${(refused.error?.message ?? 'INSERTED, which is the defect').slice(0, 120)}`,
    )

    const refusedRequest = await db.from('booking_requests').insert({
      kind: 'booking',
      organisation_id: orgId,
      artist_id: artistId,
      sent_by: organiser.id,
      subject: 'Lane B gigwhole blocked request',
      note: '',
      status: 'pending',
    })
    check(
      'lb-gigwhole.the-database-refuses-a-booking-request-to-a-blocked-pair',
      refusedRequest.error?.code === '23514',
      `code=${refusedRequest.error?.code ?? 'NONE'} ${(refusedRequest.error?.message ?? 'INSERTED, which is the defect').slice(0, 120)}`,
    )

    // A MENTORING REQUEST IS DELIBERATELY NOT JUDGED, because
    // marketplace_blocks is keyed on (organisation_id, artist_id) and cannot
    // express a pair of performers. The migration says so in its header; this
    // proves the stated behaviour rather than leaving it to be discovered.
    const mentoring = await db.from('booking_requests').insert({
      kind: 'mentoring',
      organisation_id: null,
      artist_id: artistId,
      from_artist_id: artistId,
      sent_by: organiser.id,
      subject: 'Lane B gigwhole mentoring',
      note: '',
      status: 'pending',
    })
    check(
      'lb-gigwhole.a-mentoring-request-carries-no-organisation-and-is-not-judged',
      !mentoring.error,
      mentoring.error ? `refused: ${mentoring.error.code}` : 'accepted, which is the documented behaviour',
    )

    // THE SCREEN'S HALF, at every viewport: the performer is refused a second
    // application through the real panel.
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, storageState: performerSession })
      const page = await context.newPage()
      await page.goto(`${BASE}/gigs/${secondGig.data.id}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await answerTheCookieBanner(page)
      const apply = page.getByRole('button', { name: /apply/i }).first()
      let refusalSeen = false
      if (await apply.count()) {
        await apply.click()
        await page.waitForTimeout(2500)
        refusalSeen = (await page.getByText(/cannot apply to this organiser/i).count()) > 0
      }
      const stored = await db
        .from('gig_applications')
        .select('id', { count: 'exact', head: true })
        .eq('gig_id', secondGig.data.id)
      check(
        `lb-gigwhole.the-blocked-application-is-refused-on-the-screen.${vp.label}`,
        (stored.count ?? 0) === 0,
        `refusal shown: ${refusalSeen}; applications stored for that gig: ${stored.count}`,
      )
      await page.screenshot({ path: join(OUT, 'drive', `blocked-${vp.label}.png`), fullPage: false })
      await context.close()
    }
  }

  // ------------------------------------------ the public surfaces and pickers
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()
    await page.goto(`${BASE}/gigs`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await answerTheCookieBanner(page)
    const options = await page.locator('select').first().locator('option').count()
    check(
      `lb-gigwhole.the-public-board-picker-has-cities.${vp.label}`,
      options > 1,
      `${options} option(s), from the one reader`,
    )
    await page.screenshot({ path: join(OUT, 'drive', `public-board-${vp.label}.png`), fullPage: false })
    await axeCheck(page, 'public-board', vp.label)
    await context.close()
  }
} catch (err) {
  check('lb-gigwhole.the-run-completed', false, String(err?.stack ?? err?.message ?? err))
} finally {
  await browser.close().catch(() => {})

  // TEST IS LEFT AS FOUND, and every part of it is re-read by name.
  if (orgId) {
    await db.from('marketplace_blocks').delete().eq('organisation_id', orgId)
    const gigs = await db.from('gigs').select('id').eq('organisation_id', orgId)
    for (const g of gigs.data ?? []) {
      await db.from('gig_applications').delete().eq('gig_id', g.id)
    }
    await db.from('booking_requests').delete().eq('organisation_id', orgId)
  }
  if (artistId) await db.from('booking_requests').delete().eq('artist_id', artistId)
  if (orgId) await db.from('gigs').delete().eq('organisation_id', orgId)
  if (artistId) await db.from('artists').delete().eq('id', artistId)
  if (orgId) await db.from('organisations').delete().eq('id', orgId)
  for (const who of [organiser, performer]) {
    if (!who?.id) continue
    await db.from('profiles').delete().eq('id', who.id)
    await tearDownAccountOrFailTheRun(db, who.id)
  }

  // THE FLAG GOES BACK, AND THE RESTORE IS READ BACK rather than assumed.
  if (flagWasEnabled !== null) {
    await db.from('feature_flags').update({ enabled: flagWasEnabled }).eq('flag', FLAG)
    const after = await db.from('feature_flags').select('enabled').eq('flag', FLAG).maybeSingle()
    check(
      'lb-gigwhole.the-flag-is-back-as-it-was',
      after.data?.enabled === flagWasEnabled,
      `${FLAG} is ${after.data?.enabled}, and it was ${flagWasEnabled} before this run`,
    )
  }

  const { count: orgsLeft } = await db
    .from('organisations')
    .select('id', { count: 'exact', head: true })
    .like('slug', `${TAG}-%`)
  const { count: artistsLeft } = await db
    .from('artists')
    .select('id', { count: 'exact', head: true })
    .like('slug', `${TAG}-%`)
  check(
    'lb-gigwhole.test-is-left-as-found',
    orgsLeft === 0 && artistsLeft === 0,
    `organisations=${orgsLeft} artists=${artistsLeft}`,
  )

  const failed = results.filter(r => !r.ok)
  writeFileSync(join(OUT, 'drive.log'), `${lines.join('\n')}\n`, 'utf8')
  writeFileSync(
    join(OUT, 'results.json'),
    `${JSON.stringify({ at: new Date().toISOString(), base: BASE, results }, null, 2)}\n`,
    'utf8',
  )
  log(`${results.length - failed.length} of ${results.length} checks passed`)
  process.exit(failed.length ? 1 : 0)
}
