/**
 * A DROPPED SOCKET MAY NOT BE READ AS SOMETHING A PERSON CHOSE, AND IT MAY NOT
 * BE READ AS A MESSAGE ALREADY SENT.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DRIVES, and every one of the three was live on this tree on
 * 21 September 2026, in `src/lib/notifications/dispatch.ts`, which is the one
 * function every lifecycle alert on this platform goes through.
 *
 *   1. THE PREFERENCES. `loadPrefs` read `notification_prefs` and discarded the
 *      error, so a blinked read fell through to `DEFAULT_PREFS`, and
 *      DEFAULT_PREFS is `push_enabled: true, email_enabled: true`. A person who
 *      had switched EVERY channel off was therefore indistinguishable from a
 *      person who had never opened the page, and the platform mailed them.
 *
 *   2. THE QUIET HOURS, which is the same read and a separate promise.
 *      /account/notifications tells the person in its own words that nothing is
 *      sent inside their quiet hours. DEFAULT_PREFS carries
 *      `quiet_hours_start: null`, and a null window is never quiet, so the one
 *      blinked read took the window away and the alert went out inside it.
 *      The module's own comment, nine lines above the read, quotes that promise.
 *
 *   3. THE DEDUPE. `dispatchAlert` opens by reading `notifications` for a row
 *      that says this person has already had this alert, and discarded that
 *      error too. A blink answers "no row", which is "not sent yet", so the
 *      alert is sent AGAIN. The unique index on (user_id, event_id, type) does
 *      not save it: the row is written AFTER the send, so the constraint stops
 *      the second ROW and not the second MESSAGE, and this cron runs every
 *      quarter of an hour.
 *
 * THE FIX IS NOT "RETRY HARDER", IT IS "DEFER RATHER THAN DECIDE". Every one of
 * these paths re-runs on its own within fifteen minutes and writes nothing when
 * it defers, so a read that cannot be read costs a delay. Deciding costs a
 * message to somebody who switched it off, at an hour they asked to be left
 * alone, or twice. Only one of those is undoable.
 *
 * ---------------------------------------------------------------------------
 * TWO HALVES, AND THE SEAM IS STATED RATHER THAN GLOSSED.
 *
 *   THE BLINK, in THIS process, against the real TEST project, calling the real
 *   `dispatchAlert` with `globalThis.fetch` wrapped so one table's reads fail
 *   exactly as a dropped keep-alive socket fails. Every interception is COUNTED
 *   and asserted, because a wrapper that never fired reads as a pass over
 *   nothing. The count is itself evidence: after the fix the prefs read
 *   intercepts FOUR times, one call and three retries through `readOrThrow`,
 *   where before it intercepted ONCE and believed the answer.
 *
 *   THE SURFACE, in a real browser at 390, 768 and 1440: the page that carries
 *   the promise. /account/notifications is where the person sets the quiet
 *   hours and the channel switches this drive then blinks, so the screenshots
 *   are the promise and the assertions are whether the router kept it.
 *
 *   The blink is not driven THROUGH the browser because it has to be injected
 *   inside the process that reads the database, and the dev server was started
 *   separately. So it is injected where it can be injected honestly and counted.
 *
 * BLAST RADIUS. Three lanes build against this same TEST project. Every row
 * this drive creates carries `lane-c-blinkpref` in its address or its title,
 * the event it needs is created by this drive and is left UNLISTED so no
 * discovery surface can read it, and the teardown runs in a finally and
 * VERIFIES rather than trusting its own delete.
 *
 * RUN IT, and every flag on this line is load-bearing:
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     node --import ./scripts/lib/server-only-shim.mjs \
 *          --import ./scripts/lib/next-headers-shim.mjs \
 *          --import ./scripts/lib/src-alias-loader.mjs \
 *          --env-file=.env.local scripts/verify/a-blink-is-not-a-preference-drive.mjs
 *
 *   env -u ...          this shell can carry the PRODUCTION Supabase URL, so
 *                       without it the drive reads and writes the live database.
 *                       The refusal at the top is the backstop, not the plan.
 *   server-only-shim    `dispatch.ts` is a `server-only` module and fails at
 *                       IMPORT without it, which reads as a product defect.
 *   next-headers-shim   the email sender reaches `next/headers` two modules
 *                       down and cannot be LOADED outside Next without it.
 *   src-alias-loader    they import through `@/`, which node does not resolve.
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { dispatchAlert } from '@/lib/notifications/dispatch'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'

const BASE = process.env.LC_BASE_URL ?? 'http://localhost:3200'
const EVIDENCE = 'C:/dev/EVIDENCE/LC-BLINK'
const SHOTS = join(EVIDENCE, 'drive')
mkdirSync(SHOTS, { recursive: true })
const READING = process.env.LC_READING ?? 'reading'
const LOG = join(EVIDENCE, READING + '.txt')
writeFileSync(LOG, '')

const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 900 },
]

const LANE = 'lane-c-blinkpref'
const STAMP = randomUUID().slice(0, 8)

function log(line) {
  console.log(line)
  appendFileSync(LOG, line + '\n')
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) throw new Error('no Supabase URL or service key in the environment')
if (!url.includes('vkapkibzokmfaxqogypq')) {
  throw new Error('refusing to run against ' + url + '; this drive writes, and only TEST is writable')
}
process.env.EMAIL_TRANSPORT = 'console'

const db = createClient(url, serviceKey, { auth: { persistSession: false } })

/**
 * One table's READS fail exactly as a dropped keep-alive socket fails, and the
 * interceptions are counted.
 *
 * ONLY THE READS. A GET to `/rest/v1/<table>?` is a select; the INSERT that
 * records a delivered alert is a POST to the same path. Blinking both would
 * prove nothing, because an alert whose row was never written cannot tell "the
 * router deferred" from "the write was blocked too".
 */
function blinkReadsOf(table) {
  const real = globalThis.fetch
  let injected = 0
  globalThis.fetch = async function blink(input, init) {
    const href = typeof input === 'string' ? input : (input?.url ?? String(input))
    const method = (init?.method ?? input?.method ?? 'GET').toUpperCase()
    if (method === 'GET' && href.includes('/rest/v1/' + table + '?')) {
      injected += 1
      const cause = new Error('other side closed')
      cause.code = 'UND_ERR_SOCKET'
      cause.name = 'SocketError'
      throw new TypeError('fetch failed', { cause })
    }
    return real.call(globalThis, input, init)
  }
  return () => {
    globalThis.fetch = real
    return injected
  }
}

const checks = []
function check(name, pass, detail) {
  checks.push({ name, pass })
  log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? ' :: ' + detail : ''))
}

const fixture = { userId: null, eventId: null, organisationId: null, email: null, password: null }

/**
 * A CLICK THAT LANDS BEFORE REACT HYDRATES DOES NOTHING, AND READS AS A PRODUCT
 * FAILURE. Recorded by this lane on 21 September 2026 against a sign-in that sat
 * on /login and was blamed on rate limiting: there was no POST at all.
 */
async function waitForHydration(page, selector = 'button[type="submit"]') {
  await page.waitForSelector(selector, { state: 'visible', timeout: 30_000 })
  await page.waitForFunction(
    (sel) => {
      const node = document.querySelector(sel)
      return !!node && Object.keys(node).some((key) => key.startsWith('__react'))
    },
    selector,
    { timeout: 30_000 },
  )
}

/** Sign in as this drive's own fixture person. A refusal is raised, never retried past. */
async function signIn(page) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.goto(BASE + '/login?next=/account/notifications', { waitUntil: 'domcontentloaded' })
    await waitForHydration(page)
    await page.fill('input[type="email"]', fixture.email)
    await page.fill('input[type="password"]', fixture.password)
    await page.click('button[type="submit"]')
    try {
      await page.waitForURL((u) => u.pathname !== '/login', { timeout: 25_000 })
      return
    } catch {
      const refusal = (await page.locator('[role="alert"]').allTextContents().catch(() => [])).filter(Boolean)
      if (refusal.length > 0) throw new Error('sign-in refused: ' + refusal.join(' '))
    }
  }
  throw new Error('sign-in never left /login after three attempts')
}

/**
 * The alert this drive dispatches needs a real event row, because dispatchAlert
 * writes `event_id` into `notifications` and that column is a foreign key. It is
 * created here rather than borrowed: borrowing another lane's event would make
 * this drive's teardown a delete of somebody else's row.
 */
async function seed() {
  fixture.email = LANE + '-' + STAMP + '@eventlinqs.test'
  fixture.password = randomUUID() + 'Aa1'
  const user = await db.auth.admin.createUser({
    email: fixture.email,
    password: fixture.password,
    email_confirm: true,
  })
  if (user.error) throw new Error('create user: ' + user.error.message)
  fixture.userId = user.data.user.id
  const profile = await db
    .from('profiles')
    .upsert({ id: fixture.userId, email: fixture.email, full_name: 'Lane C blinkpref', role: 'attendee' })
  if (profile.error) throw new Error('seed profile: ' + profile.error.message)

  const org = await db
    .from('organisations')
    .insert({ name: 'Lane C blinkpref ' + STAMP, slug: LANE + '-' + STAMP, owner_id: fixture.userId })
    .select('id')
    .single()
  if (org.error) throw new Error('seed organisation: ' + org.error.message)
  fixture.organisationId = org.data.id

  const starts = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  const ends = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString()
  const event = await db
    .from('events')
    .insert({
      title: 'Lane C blinkpref ' + STAMP,
      slug: LANE + '-' + STAMP,
      organisation_id: fixture.organisationId,
      created_by: fixture.userId,
      status: 'published',
      visibility: 'unlisted',
      start_date: starts,
      end_date: ends,
    })
    .select('id')
    .single()
  if (event.error) throw new Error('seed event: ' + event.error.message)
  fixture.eventId = event.data.id
  log('SEEDED user ' + fixture.userId + ', event ' + fixture.eventId + ' (unlisted)')
}

async function setPrefs(prefs) {
  const res = await db.from('notification_prefs').upsert({ user_id: fixture.userId, ...prefs })
  if (res.error) throw new Error('set prefs: ' + res.error.message)
}

async function clearNotifications() {
  const res = await db.from('notifications').delete().eq('user_id', fixture.userId)
  if (res.error) throw new Error('clear notifications: ' + res.error.message)
}

async function notificationRows() {
  const res = await db.from('notifications').select('id, channel, type').eq('user_id', fixture.userId)
  if (res.error) throw new Error('read notifications: ' + res.error.message)
  return res.data
}

const ctx = () => ({
  eventTitle: 'Lane C blinkpref ' + STAMP,
  eventCity: 'Geelong',
  organiserName: 'Lane C',
  url: BASE + '/events/' + LANE + '-' + STAMP,
  recipientEmail: fixture.email,
})

async function dispatch(now) {
  return dispatchAlert({
    admin: db,
    userId: fixture.userId,
    eventId: fixture.eventId,
    type: 'just_announced',
    ctx: ctx(),
    now,
  })
}

/**
 * `dispatchAlert` is allowed to THROW after the fix, because the caller's job is
 * to defer that one recipient. Before the fix it never threw, so this reports
 * the outcome either way rather than letting a throw read as a crashed drive.
 */
async function outcomeOf(now) {
  try {
    const result = await dispatch(now)
    return { threw: false, result }
  } catch (err) {
    return { threw: true, name: err?.name ?? 'Error', message: String(err?.message ?? err) }
  }
}

function describe(outcome) {
  return outcome.threw ? 'threw ' + outcome.name : JSON.stringify(outcome.result)
}

async function main() {
  await seed()

  /* ---------------------------------------------------------------------- */
  log('')
  log('1. EVERY CHANNEL SWITCHED OFF, with notification_prefs failing on cue.')
  log('   The person opened the page and turned push and email off. The only')
  log('   record of that decision is the row this drive is about to blink.')
  await setPrefs({ push_enabled: false, email_enabled: false, quiet_hours_start: null, quiet_hours_end: null })
  await clearNotifications()

  const honest = await outcomeOf(new Date())
  check(
    '1a with every read working, the router refuses: opted_out',
    !honest.threw && honest.result.status === 'skipped' && honest.result.reason === 'opted_out',
    describe(honest),
  )

  let stop = blinkReadsOf('notification_prefs')
  const blinked = await outcomeOf(new Date())
  const prefsIntercepts = stop()
  log('   notification_prefs reads intercepted: ' + prefsIntercepts)
  check(
    '1b a blinked preference read does NOT become a message to somebody who switched every channel off',
    blinked.threw || blinked.result.status !== 'sent',
    describe(blinked),
  )
  check(
    '1c and it is a RETRIED read, not a believed one (4 = one call and three retries)',
    prefsIntercepts === 4,
    prefsIntercepts + ' interception(s)',
  )
  const afterOne = await notificationRows()
  check(
    '1d nothing was written, so the next run of the cron considers them again',
    afterOne.length === 0,
    afterOne.length + ' notification row(s)',
  )

  /* ---------------------------------------------------------------------- */
  log('')
  log('2. INSIDE THE QUIET HOURS THE PAGE PROMISED, with the same read failing.')
  log('   Channels on, quiet hours covering the instant the run is judged at.')
  await clearNotifications()
  /*
   * The window is built AROUND the drive's own clock in the person's own zone,
   * so this asserts the promise rather than a time of day that happens to suit.
   * A window of [hour, hour+1) is quiet now by definition and is never empty.
   */
  const zone = 'Australia/Sydney'
  const now = new Date()
  const localHour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' }).format(now),
  )
  await setPrefs({
    push_enabled: true,
    email_enabled: true,
    quiet_hours_start: localHour,
    quiet_hours_end: (localHour + 1) % 24,
    timezone: zone,
  })
  log('   quiet hours ' + localHour + ':00 to ' + ((localHour + 1) % 24) + ':00 ' + zone + ', judged at ' + now.toISOString())

  const quietHonest = await outcomeOf(now)
  check(
    '2a with every read working, the router holds the alert: quiet_hours',
    !quietHonest.threw && quietHonest.result.status === 'skipped' && quietHonest.result.reason === 'quiet_hours',
    describe(quietHonest),
  )

  stop = blinkReadsOf('notification_prefs')
  const quietBlinked = await outcomeOf(now)
  const quietIntercepts = stop()
  log('   notification_prefs reads intercepted: ' + quietIntercepts)
  check(
    '2b a blinked preference read does NOT take the quiet hours away and send inside them',
    quietBlinked.threw || quietBlinked.result.status !== 'sent',
    describe(quietBlinked),
  )
  const afterTwo = await notificationRows()
  check(
    '2c nothing was written, so it is delivered when the window ends rather than lost',
    afterTwo.length === 0,
    afterTwo.length + ' notification row(s)',
  )

  /* ---------------------------------------------------------------------- */
  log('')
  log('3. AN ALERT ALREADY DELIVERED, with the dedupe read failing on cue.')
  log('   The row that says "this person has had this alert" is written by a')
  log('   real send, not by hand, so the dedupe is the real one.')
  await clearNotifications()
  await setPrefs({ push_enabled: false, email_enabled: true, quiet_hours_start: null, quiet_hours_end: null })
  const firstSend = await outcomeOf(new Date())
  check(
    '3a the first alert is genuinely sent, by email',
    !firstSend.threw && firstSend.result.status === 'sent' && firstSend.result.channel === 'email',
    describe(firstSend),
  )
  const afterFirst = await notificationRows()
  check('3b and it left exactly one row', afterFirst.length === 1, afterFirst.length + ' row(s)')

  const secondHonest = await outcomeOf(new Date())
  check(
    '3c with every read working, the second attempt is refused as a duplicate',
    !secondHonest.threw && secondHonest.result.status === 'skipped' && secondHonest.result.reason === 'duplicate',
    describe(secondHonest),
  )

  stop = blinkReadsOf('notifications')
  const secondBlinked = await outcomeOf(new Date())
  const dedupeIntercepts = stop()
  log('   notifications reads intercepted: ' + dedupeIntercepts)
  check(
    '3d a blinked dedupe read does NOT send the same alert to the same person a second time',
    secondBlinked.threw || secondBlinked.result.status !== 'sent',
    describe(secondBlinked),
  )
  const afterSecond = await notificationRows()
  check(
    '3e and the ledger still holds exactly the one delivery that happened',
    afterSecond.length === 1,
    afterSecond.length + ' row(s)',
  )

  /* ---------------------------------------------------------------------- */
  log('')
  log('4. THE PAGE THAT CARRIES THE PROMISE, at 390, 768 and 1440.')
  log('   The person whose preferences this drive blinked opens the page those')
  log('   preferences live on, and reads the promise the router has to keep.')
  const browser = await chromium.launch()
  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
      const page = await context.newPage()
      await signIn(page)
      const res = await page.goto(BASE + '/account/notifications', { waitUntil: 'domcontentloaded' })
      const status = res?.status() ?? 0
      /*
       * The channel card is a client component that fetches the person's own
       * preferences and renders a SKELETON until they arrive. Screenshotting on
       * `main` alone caught the skeleton on the first run of this drive and read
       * as the promise being absent, which is the harness and not the product.
       * Waiting for the settled heading is the honest wait.
       */
      await page.getByRole('heading', { name: 'Email alerts and quiet hours' }).waitFor({ timeout: 30_000 })
      const body = await page.locator('main').innerText()
      const promise = /Nothing arrives inside your quiet hours/i.test(body)
      await page.screenshot({ path: join(SHOTS, READING + '-' + vp.name + '.png'), fullPage: true })
      check(
        '4 ' + vp.name + ' the signed-in preference page answers 200 and carries the quiet-hours promise',
        status === 200 && promise,
        'status ' + status + ', quiet-hours promise on the page: ' + promise,
      )
      await context.close()
    }
  } finally {
    await browser.close()
  }
}

async function teardown() {
  log('')
  log('TEARDOWN, verified rather than trusted.')
  if (fixture.userId) {
    await db.from('notifications').delete().eq('user_id', fixture.userId)
    await db.from('notification_prefs').delete().eq('user_id', fixture.userId)
  }
  if (fixture.eventId) await db.from('events').delete().eq('id', fixture.eventId)
  if (fixture.organisationId) await db.from('organisations').delete().eq('id', fixture.organisationId)
  if (fixture.userId) {
    await db.from('profiles').delete().eq('id', fixture.userId)
    /*
     * THROUGH THE ONE DOOR, never `auth.admin.deleteUser` directly. That call
     * failed for every account on the platform for a day in September 2026 while
     * every drive printed a clean teardown, because each one swallowed the error
     * and then asked `profiles`, which the line above had already emptied.
     * `scripts/guards/one-way-to-delete-an-account.mjs` caught this drive doing
     * exactly that on its first run.
     */
    const removed = await tearDownAccountOrFailTheRun(db, fixture.userId)
    check('teardown removed the account itself', removed.gone, removed.detail)
  }
  const left = []
  for (const [table, column, value] of [
    ['notifications', 'user_id', fixture.userId],
    ['notification_prefs', 'user_id', fixture.userId],
    ['events', 'id', fixture.eventId],
    ['organisations', 'id', fixture.organisationId],
  ]) {
    if (!value) continue
    const res = await db.from(table).select('*', { count: 'exact', head: true }).eq(column, value)
    if (res.error) throw new Error('teardown verify ' + table + ': ' + res.error.message)
    if (res.count !== 0) left.push(table + '=' + res.count)
  }
  check('teardown left nothing behind', left.length === 0, left.join(', ') || 'every table empty of this run')
}

let failed = false
try {
  await main()
} catch (err) {
  failed = true
  log('DRIVE ERROR: ' + (err?.stack ?? err))
} finally {
  try {
    await teardown()
  } catch (err) {
    failed = true
    log('TEARDOWN ERROR: ' + (err?.stack ?? err))
  }
}

const passed = checks.filter((c) => c.pass).length
log('')
log(passed + ' of ' + checks.length + ' checks passed')
if (failed || passed !== checks.length) process.exit(1)
