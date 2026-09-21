/**
 * DRIVEN PROOF: EVERY FOLLOWER IS ALERTED, AND A RUN DOES NOT RESPEND ITS BUDGET.
 *
 * ---------------------------------------------------------------------------
 * THE THREE DEFECTS THIS PROVES FIXED, found on 21 September 2026 and reproduced
 * in tests/unit/cron/notify-just-announced.test.ts before anything was changed.
 *
 *   1. The cron read `saved_organisers` and `follows` with NO BOUND, so a
 *      Supabase project's row ceiling silently removed every follower past the
 *      first thousand. HTTP 200, `error` null, a full-looking array.
 *   2. Its `.in()` lists were not chunked: 200 organisation ids is about 7.4 KB
 *      of UUIDs against a 4 KB budget, and that failure is `TypeError: fetch
 *      failed` rather than a short answer.
 *   3. It counted its dispatch budget against every recipient it LOOKED at,
 *      including ones already alerted and ones with no channel at all. Events are
 *      read newest first, so every run walked the same sequence, spent the whole
 *      budget re-confirming delivered alerts, and stopped at the same index. A
 *      livelock, which a newly announced event made worse rather than better.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DRIVE PROVES THAT A UNIT TEST CANNOT, stated plainly so it is not
 * credited with more than it earns.
 *
 * The unit tests own the ARITHMETIC: the ceiling, the livelock, the recession,
 * the quiet-hours and opted-out starvation, all against a fake whose ceiling the
 * test sets. What no fake can check is whether the rewritten reads are VALID
 * against a real PostgREST: a column that does not exist, an `.order()` on the
 * wrong name, a boolean filter spelled the way the client does not accept. Every
 * one of those passes a fake and fails in production.
 *
 * So this drives the REAL route over HTTP exactly as Vercel calls it, against a
 * real server on lane C's own port and real rows on TEST, and reads every verdict
 * back OUT OF THE DATABASE rather than out of the route's own summary.
 *
 * IT DOES NOT SEED PAST THE REAL 1,000-ROW CEILING, and the reason is written
 * here rather than left as an omission: `saved_organisers.user_id` references
 * `auth.users`, so forcing a real page boundary means minting more than a
 * thousand real accounts on TEST. The pager itself already has that proof on
 * record (9,490 real rows read as 1,000, measured 19 September 2026 and cited in
 * src/lib/supabase/read-every-row.ts), and the composition is unit tested. What
 * was unproven, and is what this drive is for, is the shapes.
 *
 * THE PHASES:
 *
 *   --phase seed     one organisation, one published event, and fourteen
 *                    followers of three kinds: ten who can be reached, two who
 *                    have switched both channels off, and two who allow push and
 *                    have never armed a device. The last pair is the case a
 *                    preferences row alone cannot answer.
 *   --phase alert    one tick. Every reachable follower must have a
 *                    notifications row; neither unreachable kind may have one;
 *                    and `dispatches` must equal the REACHABLE count, which is
 *                    the live proof that the budget was not spent on people the
 *                    run could never deliver to.
 *   --phase settle   a second tick, immediately. It must dispatch NOTHING and
 *                    report every follower as settled. On the old code this tick
 *                    spent one slot per follower re-confirming what it had
 *                    already sent, which is the livelock itself.
 *   --phase ui       /account/notifications at 390, 768 and 1440, signed in as
 *                    one of this drive's own followers: the surface that makes
 *                    the promise this fix makes true. With axe.
 *   --phase cleanup  delete everything this drive created and assert it is gone.
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   BASE=http://localhost:3200 node --env-file=.env.local \
 *     scripts/verify/every-follower-is-alerted-drive.mjs --phase seed --tag lane-c-reach-1
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/EVERY-FOLLOWER'
let phase = 'seed'
let tag = null
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') out = args[++i]
  else if (args[i] === '--phase') phase = args[++i]
  else if (args[i] === '--tag') tag = args[++i]
}
mkdirSync(out, { recursive: true })
if (!tag) {
  console.error('FAIL: --tag is required, so the phases share the rows they created')
  process.exit(1)
}

const BASE = process.env.BASE ?? 'http://localhost:3200'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const CRON_SECRET = process.env.CRON_SECRET ?? ''
if (/gndnldyfudbytbboxesk/.test(SUPABASE_URL)) {
  console.error('refusing to run against production')
  process.exit(1)
}
if (!SUPABASE_URL || !SERVICE_KEY || !CRON_SECRET) {
  console.error('FAIL: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and CRON_SECRET are required')
  process.exit(1)
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const LEDGER = join(out, `${tag}-checks.json`)
const STATE = join(out, `${tag}-fixture.json`)
const checks = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : []
const failures = []
function check(id, ok, detail) {
  checks.push({ phase, id, ok, detail })
  if (!ok) failures.push(`${id}: ${detail}`)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}
function finish() {
  writeFileSync(LEDGER, JSON.stringify(checks, null, 2))
  const mine = checks.filter((c) => c.phase === phase)
  console.log(`\n  phase ${phase}: ${mine.filter((c) => c.ok).length} of ${mine.length} checks pass`)
  if (failures.length > 0) {
    console.log('\n  FAILURES')
    for (const f of failures) console.log(`    ${f}`)
  }
  process.exit(failures.length === 0 ? 0 : 1)
}

const ZONE = 'Australia/Sydney'
const REACHABLE = 10
const BOTH_OFF = 2
const PUSH_ON_NO_DEVICE = 2
const newPassword = () => `${randomUUID()}Aa1`

function readFixture() {
  if (!existsSync(STATE)) throw new Error(`no fixture for ${tag}: run --phase seed first`)
  return JSON.parse(readFileSync(STATE, 'utf8'))
}

/** One tick of the real alert cron, over HTTP, as Vercel Cron calls it. */
async function tick() {
  const res = await fetch(`${BASE}/api/cron/notify-just-announced`, {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

/** The just-announced rows for this drive's event, read back from the database. */
async function alertedUserIds(eventId) {
  const { data, error } = await db
    .from('notifications')
    .select('user_id')
    .eq('event_id', eventId)
    .eq('type', 'just_announced')
  if (error) throw new Error(`notifications read failed: ${error.message}`)
  return new Set((data ?? []).map((r) => r.user_id))
}

if (phase === 'seed') {
  const stamp = Date.now().toString(36)
  const owner = { email: `reach.${tag}.owner.${stamp}@eventlinqs.test`, password: newPassword() }

  const createdOwner = await db.auth.admin.createUser({
    email: owner.email,
    password: owner.password,
    email_confirm: true,
  })
  if (createdOwner.error) throw new Error(`create owner: ${createdOwner.error.message}`)
  const ownerId = createdOwner.data.user.id
  await db.from('profiles').upsert({
    id: ownerId,
    email: owner.email,
    full_name: 'Lane C Reach Owner',
    display_name: 'Lane C Reach Owner',
    is_verified: true,
  })

  const { data: cat } = await db.from('event_categories').select('id').limit(1).maybeSingle()
  // A published event must carry a real cover: the database enforces it
  // (events_published_real_cover). Borrow one rather than invent a URL the
  // constraint would refuse.
  const { data: coverDonor } = await db
    .from('events')
    .select('cover_image_url')
    .eq('status', 'published')
    .not('cover_image_url', 'is', null)
    .not('cover_image_url', 'ilike', 'https://picsum.photos/%')
    .limit(1)
    .maybeSingle()

  const { data: org, error: orgErr } = await db
    .from('organisations')
    .insert({
      name: `Lane C Reach ${stamp}`,
      slug: `${tag}-org-${stamp}`,
      owner_id: ownerId,
      email: owner.email,
      /*
       * `pending`, NOT `active`. An active organisation is published into the
       * sitemap three lanes read and one lane deletes, and this drive needs no
       * such thing: the cron reads organisations only for a display name and
       * filters on nothing. scripts/guards/fixtures-are-not-published.mjs.
       */
      status: 'pending',
      payout_status: 'active',
    })
    .select('id')
    .single()
  if (orgErr) throw new Error(`create organisation: ${orgErr.message}`)

  const start = new Date(Date.now() + 21 * 864e5)
  const { data: event, error: evErr } = await db
    .from('events')
    .insert({
      title: `Lane C Reach Showcase ${stamp}`,
      slug: `${tag}-event-${stamp}`,
      description: 'Lane C every-follower-is-alerted drive.',
      summary: 'Lane C reach drive',
      organisation_id: org.id,
      created_by: ownerId,
      category_id: cat?.id ?? null,
      start_date: start.toISOString(),
      end_date: new Date(start.getTime() + 3 * 36e5).toISOString(),
      timezone: ZONE,
      event_type: 'in_person',
      venue_name: 'Hall',
      venue_address: '1 Little Malop Street',
      venue_city: 'Geelong',
      venue_state: 'VIC',
      venue_country: 'Australia',
      status: 'published',
      visibility: 'public',
      published_at: new Date().toISOString(),
      cover_image_url: coverDonor?.cover_image_url ?? null,
      is_age_restricted: false,
      max_capacity: 50,
      is_free: true,
      fee_pass_type: 'pass_to_buyer',
    })
    .select('id, slug')
    .single()
  if (evErr) throw new Error(`create event: ${evErr.message}`)

  /*
   * THE THREE KINDS OF FOLLOWER. `bothOff` and `pushOnNoDevice` are BOTH
   * unreachable and they are separated on purpose: the first is answerable from
   * the preferences row alone, the second is not, and conflating them is how a
   * bulk eligibility filter ends up wrong in the direction that mails nobody.
   */
  const followers = []
  const kinds = [
    ...Array(REACHABLE).fill('reachable'),
    ...Array(BOTH_OFF).fill('bothOff'),
    ...Array(PUSH_ON_NO_DEVICE).fill('pushOnNoDevice'),
  ]
  for (const [index, kind] of kinds.entries()) {
    const email = `reach.${tag}.f${index}.${stamp}@eventlinqs.test`
    const password = newPassword()
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true })
    if (created.error) throw new Error(`create follower ${index}: ${created.error.message}`)
    const userId = created.data.user.id
    await db.from('profiles').upsert({
      id: userId,
      email,
      full_name: `Lane C Follower ${index}`,
      display_name: `Lane C Follower ${index}`,
      is_verified: true,
    })
    const { error: followErr } = await db
      .from('saved_organisers')
      .insert({ user_id: userId, organisation_id: org.id })
    if (followErr) throw new Error(`create follow ${index}: ${followErr.message}`)

    const prefs =
      kind === 'reachable'
        ? { push_enabled: true, email_enabled: true }
        : kind === 'bothOff'
          ? { push_enabled: false, email_enabled: false }
          : { push_enabled: true, email_enabled: false }
    const { error: prefErr } = await db.from('notification_prefs').upsert(
      {
        user_id: userId,
        timezone: ZONE,
        quiet_hours_start: null,
        quiet_hours_end: null,
        ...prefs,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    if (prefErr) throw new Error(`create prefs ${index}: ${prefErr.message}`)
    followers.push({ index, kind, userId, email, password })
  }

  writeFileSync(
    STATE,
    JSON.stringify({ ownerId, owner, orgId: org.id, eventId: event.id, eventSlug: event.slug, followers }, null, 2),
  )

  check(
    'seed.the-event-is-announced-and-followed',
    true,
    `${followers.length} followers of ${org.id}: ${REACHABLE} reachable, ${BOTH_OFF} with both channels off, ${PUSH_ON_NO_DEVICE} allowing push with no device`,
  )
  check(
    'seed.nobody-has-been-alerted-yet',
    (await alertedUserIds(event.id)).size === 0,
    'no just_announced rows exist for this event before the first tick',
  )
  finish()
}

if (phase === 'alert') {
  const fx = readFixture()
  const before = await alertedUserIds(fx.eventId)
  const { status, body } = await tick()
  check('alert.the-cron-answered', status === 200 && body.ok === true, `HTTP ${status}, ok=${body.ok}`)

  const after = await alertedUserIds(fx.eventId)
  const reachable = fx.followers.filter((f) => f.kind === 'reachable')
  const unreachable = fx.followers.filter((f) => f.kind !== 'reachable')

  const missed = reachable.filter((f) => !after.has(f.userId))
  check(
    'alert.every-reachable-follower-has-an-alert',
    missed.length === 0,
    missed.length === 0
      ? `all ${reachable.length} reachable followers carry a just_announced row, read back from the database`
      : `${missed.length} were not alerted: ${missed.map((f) => f.index).join(', ')}`,
  )

  const wronglyAlerted = unreachable.filter((f) => after.has(f.userId))
  check(
    'alert.nobody-without-a-channel-was-written-a-dedupe-row',
    wronglyAlerted.length === 0,
    wronglyAlerted.length === 0
      ? `neither kind of unreachable follower has a row, so switching a channel back on still reaches them`
      : `${wronglyAlerted.length} unreachable followers were given a row: ${wronglyAlerted.map((f) => f.index).join(', ')}`,
  )

  /*
   * THE LIVE PROOF OF THE ELIGIBILITY FILTER. `dispatches` counts the recipients
   * the run actually attempted. If the four unreachable followers had been
   * attempted it would read fourteen, and those four attempts would have been
   * spent again on the next run, and the one after that, for ever.
   */
  check(
    'alert.the-budget-was-spent-only-on-people-who-could-be-reached',
    body.dispatches === reachable.length,
    `dispatches=${body.dispatches} against ${reachable.length} reachable and ${fx.followers.length} followers in total`,
  )
  check(
    'alert.the-run-says-how-many-it-did-not-have-to-consider',
    typeof body.settled === 'number' && body.settled >= unreachable.length,
    `settled=${body.settled}, at least the ${unreachable.length} with no channel`,
  )
  check(
    'alert.the-reads-are-valid-against-a-real-postgrest',
    after.size >= before.size + reachable.length,
    `${after.size - before.size} rows written by one tick; no read raised, which is what a wrong column or a wrong order would have done`,
  )
  finish()
}

if (phase === 'settle') {
  const fx = readFixture()
  const before = await alertedUserIds(fx.eventId)
  const { status, body } = await tick()
  check('settle.the-cron-answered', status === 200 && body.ok === true, `HTTP ${status}, ok=${body.ok}`)

  /*
   * THE LIVELOCK, MEASURED. On the old code this tick reported dispatches equal
   * to the follower count and sent nothing, because every slot went on
   * re-confirming an alert it had already delivered. Once the work in the
   * fourteen-day window passed the cap that was every run, for ever.
   */
  check(
    'settle.a-second-tick-spends-nothing',
    body.dispatches === 0,
    `dispatches=${body.dispatches} on a tick where every follower is either alerted or unreachable`,
  )
  check('settle.and-sends-nothing', body.sent === 0, `sent=${body.sent}`)
  check(
    'settle.and-says-the-work-is-settled-rather-than-absent',
    body.settled >= fx.followers.length,
    `settled=${body.settled} against ${fx.followers.length} followers`,
  )

  const after = await alertedUserIds(fx.eventId)
  check(
    'settle.no-duplicate-row-was-written',
    after.size === before.size,
    `${before.size} rows before, ${after.size} after`,
  )
  finish()
}

if (phase === 'ui') {
  const fx = readFixture()
  const follower = fx.followers.find((f) => f.kind === 'reachable')
  const browser = await chromium.launch()

  /*
   * SIGN IN ONCE AND REUSE THE SESSION, and CLICK UNTIL THE HANDLER RUNS.
   *
   * THE FIRST EXPLANATION WRITTEN HERE WAS WRONG AND IS REPLACED BY A
   * MEASUREMENT. When the second viewport sat on the login form while the first
   * had sailed through, this comment said the platform's own rate limiting had
   * refused it. That was an inference. A probe of six sign-ins settled it: four
   * failed, and the FOURTH succeeded after three failures, which no rate limit
   * does. On every failing attempt there was NO POST AT ALL - only the initial
   * GET of /login - and the button still read "Sign in" rather than its loading
   * text. The submit handler never ran: the click landed on a button React had
   * not hydrated yet, and Playwright's auto-waiting does not cover hydration.
   *
   * So the click is retried, and the two outcomes are told apart rather than
   * conflated: if the form has put a message on the screen it has REFUSED us and
   * that is raised, because a drive that silently retries past a real refusal is
   * a drive that reports a success it did not have. If nothing happened at all,
   * the click simply had not landed yet.
   *
   * AND THE `next` PARAMETER IS NOT THE WAY THERE. The first version went to
   * `/login?next=/account/notifications` and waited for a URL matching
   * `/account/notifications` - which the login page's own QUERY STRING satisfies
   * immediately. The wait returned while the browser was still on the form, and
   * the photograph was taken wherever the app drifted to a moment later: the
   * dashboard twice and the login form once, all three reported PASS. Reading
   * the picture is what caught it. Every URL is matched on the PATHNAME now.
   */
  const signIn = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const gate = await signIn.newPage()
  await gate.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await gate.fill('input[type="email"]', follower.email)
  await gate.fill('input[type="password"]', follower.password)

  let signedIn = false
  for (let attempt = 1; attempt <= 5 && !signedIn; attempt += 1) {
    await gate.click('button[type="submit"]')
    try {
      await gate.waitForURL((url) => url.pathname !== '/login', { timeout: 20_000 })
      signedIn = true
    } catch {
      const refusal = (
        await gate.locator('[role="alert"], .text-red-600, .text-red-700').allTextContents().catch(() => [])
      ).filter(Boolean)
      if (refusal.length > 0) throw new Error(`sign-in refused: ${refusal.join(' ')}`)
    }
  }
  if (!signedIn) throw new Error('sign-in never completed after five clicks, and the form said nothing')

  const session = await signIn.storageState()
  await signIn.close()

  for (const [label, width, height] of [
    ['mobile-390', 390, 844],
    ['tablet-768', 768, 1024],
    ['desktop-1440', 1440, 900],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, storageState: session })
    const page = await context.newPage()
    await page.goto(`${BASE}/account/notifications`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')

    /*
     * THE PAGE IS IDENTIFIED BEFORE IT IS PHOTOGRAPHED, and this clause exists
     * because the first version of this phase did not have it. `waitForURL`
     * matched, the screenshot was taken after a later client-side navigation,
     * and three green checks were taken of the ORGANISER DASHBOARD. Reading the
     * picture is what caught it; the report said PASS three times.
     *
     * So the URL is re-read at the moment of the photograph, and the screen has
     * to carry the control this whole item is about.
     */
    const landed = page.url()
    const promise = page.getByText(/quiet hours/i).first()
    const carriesTheControl = await promise.isVisible().catch(() => false)

    const file = join(out, `${tag}-${label}-notifications.png`)
    await page.screenshot({ path: file, fullPage: true })

    const axe = await new AxeBuilder({ page }).analyze()
    const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    check(
      `ui.${label}.the-photograph-is-of-the-right-screen`,
      new URL(landed).pathname === '/account/notifications' && carriesTheControl,
      `url at the moment of the photograph was ${landed}; quiet-hours control visible: ${carriesTheControl}`,
    )
    check(
      `ui.${label}.the-promise-is-on-the-screen-and-accessible`,
      serious.length === 0,
      `${file}; ${serious.length} serious or critical axe violations`,
    )
    await context.close()
  }
  await browser.close()
  finish()
}

if (phase === 'cleanup') {
  const fx = readFixture()
  await db.from('notifications').delete().eq('event_id', fx.eventId)
  await db.from('saved_organisers').delete().eq('organisation_id', fx.orgId)
  for (const f of fx.followers) {
    await db.from('notification_prefs').delete().eq('user_id', f.userId)
  }
  await db.from('events').delete().eq('id', fx.eventId)
  await db.from('organisations').delete().eq('id', fx.orgId)
  /*
   * ONE PLACE DELETES AN ACCOUNT, because it is the only one that can tell an
   * account that was already gone from a deletion that was REFUSED. A bare
   * deleteUser().catch(() => {}) reports a success it does not have.
   */
  for (const f of [...fx.followers, { userId: fx.ownerId }]) {
    await db.from('profiles').delete().eq('id', f.userId)
    await tearDownAccountOrFailTheRun(db, f.userId)
  }

  // VERIFIED BY OBSERVING THE RESULT, never by trusting the delete call.
  const { data: eventLeft } = await db.from('events').select('id').eq('id', fx.eventId)
  const { data: orgLeft } = await db.from('organisations').select('id').eq('id', fx.orgId)
  check('cleanup.the-event-is-gone', (eventLeft ?? []).length === 0, `${(eventLeft ?? []).length} rows left`)
  check('cleanup.the-organisation-is-gone', (orgLeft ?? []).length === 0, `${(orgLeft ?? []).length} rows left`)
  check(
    'cleanup.the-alerts-are-gone',
    (await alertedUserIds(fx.eventId)).size === 0,
    'no just_announced rows remain for this drive',
  )
  finish()
}

console.error(`unknown phase ${phase}`)
process.exit(1)
