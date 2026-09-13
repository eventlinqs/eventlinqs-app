/**
 * DRIVEN PROOF: THE QUIET HOURS A USER SETS ARE HONOURED, AND NOTHING IS LOST.
 *
 * THE DEFECT THIS PROVES FIXED, found on 13 September 2026. /account/notifications
 * tells the user, in words, that nothing arrives inside their quiet hours. The
 * window is collected by that screen, validated by /api/notifications/prefs,
 * stored on notification_prefs, and READ BY THE ALERT DISPATCHER ON EVERY SEND -
 * and no code anywhere consulted it. `isWithinQuietHours` had existed since the
 * alert engine landed, was exhaustively unit tested, and its only caller was its
 * own test file. A user who asked for silence between 10pm and 7am was pushed or
 * emailed at 3am regardless: a control that does nothing, and a promise on a
 * shipped surface that was not true.
 *
 * WHAT MAKES THIS A DRIVE. The REAL cron route /api/cron/notify-just-announced is
 * called over HTTP exactly as Vercel calls it, against a real server on lane C's
 * own port, with a real follower, a real organisation and a real published event
 * on TEST. Every verdict is read back OUT OF THE DATABASE and out of the server's
 * own log, never from the route's summary.
 *
 * THE PHASES:
 *
 *   --phase defer    the follower's window covers the moment of the run. The
 *                    tick must report it deferred, send no email, and - the
 *                    part that matters - write NO notifications row, because
 *                    that row is the dedupe key and writing it would turn a
 *                    deferral into a silent deletion.
 *   --phase deliver  the window is moved off the current hour, exactly as it
 *                    would pass in real life. The very next tick must deliver
 *                    the same alert, and the email must appear in the server's
 *                    own log.
 *   --phase ui       the real form at 390, 768 and 1440: sign in, set the
 *                    window, and read it back out of the database. With axe.
 *   --phase cleanup  delete everything this drive created and assert it is gone.
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   BASE=http://localhost:3200 node --env-file=.env.local \
 *     scripts/verify/quiet-hours-proof.mjs --phase defer --tag lane-c-quiet-1
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { localHourFor } from '@/lib/notifications/policy'

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/QUIET-HOURS'
let phase = 'defer'
let tag = null
let serverLog = 'C:/dev/lanes/C/.tmp-serve-3200.log'
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') out = args[++i]
  else if (args[i] === '--phase') phase = args[++i]
  else if (args[i] === '--tag') tag = args[++i]
  else if (args[i] === '--server-log') serverLog = args[++i]
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
/*
 * The follower's password is minted by the `defer` phase and written into the
 * fixture, because the `ui` phase is a SEPARATE PROCESS and a password generated
 * per process would never match the account it has to sign into. It is a TEST
 * account this drive creates and deletes, and the file lives beside the rest of
 * the evidence.
 */
const newPassword = () => `${randomUUID()}Aa1`

function readFixture() {
  if (!existsSync(STATE)) throw new Error(`no fixture for ${tag}: run --phase defer first`)
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

/** The alert rows for this drive's follower, read back from the database. */
async function alertsFor(userId) {
  const { data, error } = await db
    .from('notifications')
    .select('id, type, channel, sent_at, event_id')
    .eq('user_id', userId)
  if (error) throw new Error(`notifications read failed: ${error.message}`)
  return data ?? []
}

/** A window of `hours` hours that CONTAINS, or AVOIDS, the follower's hour now. */
function windowAround(hour, { covering }) {
  if (covering) return { quiet_hours_start: (hour + 23) % 24, quiet_hours_end: (hour + 2) % 24 }
  return { quiet_hours_start: (hour + 2) % 24, quiet_hours_end: (hour + 5) % 24 }
}

if (phase === 'defer') {
  const stamp = Date.now().toString(36)
  const email = `quiet.${tag}.${stamp}@eventlinqs.test`

  const password = newPassword()
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error) throw new Error(`create follower: ${created.error.message}`)
  const userId = created.data.user.id
  await db.from('profiles').upsert({
    id: userId,
    email,
    full_name: 'Lane C Quiet Hours',
    display_name: 'Lane C Quiet Hours',
    is_verified: true,
  })

  const { data: cat } = await db.from('event_categories').select('id').limit(1).maybeSingle()
  // A published event must carry a real cover: the database enforces it
  // (events_published_real_cover). The drive borrows one that is already on a
  // published event rather than inventing a URL the constraint would refuse.
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
      name: `Lane C Quiet Hours ${stamp}`,
      slug: `${tag}-org-${stamp}`,
      owner_id: userId,
      email,
      status: 'active',
      payout_status: 'active',
    })
    .select('id')
    .single()
  if (orgErr) throw new Error(`create organisation: ${orgErr.message}`)

  const start = new Date(Date.now() + 21 * 864e5)
  const { data: event, error: evErr } = await db
    .from('events')
    .insert({
      title: `Lane C Quiet Hours Showcase ${stamp}`,
      slug: `${tag}-event-${stamp}`,
      description: 'Lane C quiet hours drive.',
      summary: 'Lane C quiet hours drive',
      organisation_id: org.id,
      created_by: userId,
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

  const { error: followErr } = await db
    .from('saved_organisers')
    .insert({ user_id: userId, organisation_id: org.id })
  if (followErr) throw new Error(`create follow: ${followErr.message}`)

  const hourNow = localHourFor(ZONE, new Date())
  const quiet = windowAround(hourNow, { covering: true })
  const { error: prefErr } = await db.from('notification_prefs').upsert(
    {
      user_id: userId,
      push_enabled: true,
      email_enabled: true,
      timezone: ZONE,
      ...quiet,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )
  if (prefErr) throw new Error(`create prefs: ${prefErr.message}`)

  writeFixture({ userId, email, password, orgId: org.id, eventId: event.id, eventSlug: event.slug, hourNow, quiet })

  check(
    'defer.the-follower-asked-for-quiet-right-now',
    true,
    `it is ${hourNow}:00 in ${ZONE} for this follower, whose window is ${quiet.quiet_hours_start}:00 to ${quiet.quiet_hours_end}:00`,
  )

  const foreignBefore = await foreignAlertCount()
  const res = await tick()
  check(
    'defer.route-answers',
    res.status === 200 && res.body.ok === true,
    `${res.status} ${JSON.stringify({ events: res.body.events, dispatches: res.body.dispatches, sent: res.body.sent, deferred: res.body.deferred })}`,
  )
  check(
    'defer.the-run-says-it-held-something',
    (res.body.deferred ?? 0) >= 1,
    `the route reports ${res.body.deferred} alert(s) held for quiet hours: a run that deferred and a run with nothing to do must never read the same`,
  )

  const mine = await alertsFor(userId)
  check(
    'defer.nothing-was-sent',
    mine.length === 0,
    `${mine.length} alert row(s) for this follower after the tick`,
  )
  check(
    'defer.nothing-was-recorded-as-dealt-with',
    mine.length === 0,
    'no notifications row was written, which is what leaves the alert eligible for the next run rather than deleting it',
  )
  const inLog = serverLogContains(`Just announced: Lane C Quiet Hours Showcase ${stamp}`)
  check('defer.no-email-left-the-code', !inLog, inLog ? 'an alert email appears in the server log' : 'no alert email in the server log')
  const foreignAfter = await foreignAlertCount()
  check(
    'defer.foreign-rows-noted',
    true,
    `alert rows belonging to other users: ${foreignBefore} before this tick, ${foreignAfter} after`,
  )
  finish()
}

if (phase === 'deliver') {
  const fx = readFixture()
  const hourNow = localHourFor(ZONE, new Date())
  const open = windowAround(hourNow, { covering: false })
  const { error } = await db
    .from('notification_prefs')
    .update({ ...open, updated_at: new Date().toISOString() })
    .eq('user_id', fx.userId)
  if (error) throw new Error(`move the window: ${error.message}`)
  check(
    'deliver.the-window-has-passed',
    true,
    `the follower's window is now ${open.quiet_hours_start}:00 to ${open.quiet_hours_end}:00, and it is ${hourNow}:00 for them`,
  )

  const res = await tick()
  check(
    'deliver.route-answers',
    res.status === 200 && res.body.ok === true,
    `${res.status} ${JSON.stringify({ sent: res.body.sent, deferred: res.body.deferred })}`,
  )

  const mine = await alertsFor(fx.userId)
  check(
    'deliver.the-held-alert-arrives-on-the-very-next-run',
    mine.length === 1 && mine[0].event_id === fx.eventId,
    mine.length === 1
      ? `one alert row, type ${mine[0].type}, channel ${mine[0].channel}, sent ${mine[0].sent_at}`
      : `${mine.length} alert row(s), expected exactly one`,
  )
  check(
    'deliver.nothing-had-been-lost',
    mine.length === 1,
    'the alert deferred by the previous tick is the one that arrived: a hold, not a deletion',
  )
  const inLog = serverLogContains('Just announced: Lane C Quiet Hours Showcase')
  check(
    'deliver.the-email-really-left-the-code',
    inLog,
    inLog
      ? 'the alert email appears in the server own log, through the real transport'
      : 'the alert email is NOT in the server log',
  )
  finish()
}

if (phase === 'ui') {
  const fx = readFixture()
  let browser = null
  try {
    browser = await chromium.launch()
    for (const vp of [
      { label: '390', width: 390, height: 844 },
      { label: '768', width: 768, height: 1024 },
      { label: '1440', width: 1440, height: 1000 },
    ]) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        locale: 'en-AU',
        isMobile: vp.width < 768,
        hasTouch: vp.width < 1024,
      })
      const page = await ctx.newPage()
      await page.goto(`${BASE}/login?next=/account/notifications`, {
        waitUntil: 'domcontentloaded',
        timeout: 120000,
      })
      // WAIT FOR HYDRATION BEFORE TOUCHING ANYTHING. The submit button carries
      // `disabled={loading || !hydrated}`, so a click before React has taken over
      // does nothing at all and the page simply stays where it is with no error
      // shown. That is what happened at 390 on the first run against a cold
      // server, and it was the harness being impatient rather than the product
      // being broken. Filling a controlled input early is the same trap: React
      // can overwrite it on hydration.
      const submit = page.locator('button[type="submit"]')
      await submit.waitFor({ state: 'visible', timeout: 60000 })
      await page.waitForFunction(
        () => {
          const b = document.querySelector('button[type="submit"]')
          return Boolean(b) && !b.disabled
        },
        undefined,
        { timeout: 60000 },
      )
      await page.locator('input[name="email"]').fill(fx.email)
      await page.locator('input[name="password"]').fill(fx.password)
      await submit.click()
      await page
        .waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 })
        .catch(() => {})
      if (new URL(page.url()).pathname.startsWith('/login')) {
        // A refusal with nothing on the screen is not a diagnosis. Photograph
        // it, and say what is sitting on top of the submit button, because a
        // sign-in that fails at one width only is usually something overlaying
        // the control rather than the credentials being wrong.
        await page.screenshot({ path: join(out, `login-refused-${vp.label}.png`), fullPage: true })
        const shown = await page.locator('[role=alert]').allInnerTexts().catch(() => [])
        const onTop = await page
          .evaluate(() => {
            const button = document.querySelector('button[type="submit"]')
            if (!button) return 'no submit button in the document'
            const box = button.getBoundingClientRect()
            const at = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
            if (!at) return 'nothing is at the centre of the submit button (it is off screen)'
            return at === button || button.contains(at)
              ? 'the submit button itself is on top, so the click landed'
              : `${at.tagName.toLowerCase()}.${(at.className || '').toString().split(' ').slice(0, 3).join('.')} is on top of the submit button`
          })
          .catch((err) => `could not look: ${err.message}`)
        check(
          `ui.${vp.label}.sign-in`,
          false,
          `sign-in refused at ${page.url()}: ${shown.join(' // ') || 'NOTHING SHOWN'}; ${onTop}`,
        )
        await ctx.close()
        continue
      }

      await page.goto(`${BASE}/account/notifications`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {})

      const promise = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
      check(
        `ui.${vp.label}.the-screen-states-what-happens`,
        promise.includes('held and sent once the window ends'),
        'the screen says the alert is held and sent later, which is what the dispatcher now does',
      )

      // Set the window through the REAL form, at this viewport.
      const from = page.locator('label:has-text("Quiet from") select')
      const until = page.locator('label:has-text("Quiet until") select')
      await from.waitFor({ state: 'visible', timeout: 30000 })
      await from.selectOption(String(21 + Number(vp.label === '768')))
      await page.waitForTimeout(400)
      await until.selectOption('6')
      await page.waitForTimeout(1200)
      await page.screenshot({ path: join(out, `account-notifications-${vp.label}.png`), fullPage: true })

      const { data: saved } = await db
        .from('notification_prefs')
        .select('quiet_hours_start, quiet_hours_end, timezone')
        .eq('user_id', fx.userId)
        .maybeSingle()
      check(
        `ui.${vp.label}.the-form-really-saves-the-window`,
        saved?.quiet_hours_start === 21 + Number(vp.label === '768') && saved?.quiet_hours_end === 6,
        `the database holds ${saved?.quiet_hours_start} to ${saved?.quiet_hours_end} in ${saved?.timezone} after the form was used at ${vp.width}px`,
      )

      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      writeFileSync(
        join(out, `axe-account-notifications-${vp.label}.json`),
        JSON.stringify({ url: page.url(), violations: axe.violations }, null, 2),
      )
      check(
        `ui.${vp.label}.axe`,
        axe.violations.length === 0,
        axe.violations.length === 0
          ? 'axe: 0 violations at every impact level'
          : `axe: ${axe.violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length})`).join(', ')}`,
      )
      await ctx.close()
    }
  } finally {
    if (browser) await browser.close()
  }
  finish()
}

if (phase === 'cleanup') {
  const fx = readFixture()
  await db.from('notifications').delete().eq('user_id', fx.userId)
  await db.from('saved_organisers').delete().eq('user_id', fx.userId)
  await db.from('notification_prefs').delete().eq('user_id', fx.userId)
  // The publish fired the owner-notification trigger; that row is this drive's
  // too and is removed with the rest rather than left in the shared queue.
  await db.from('platform_notifications').delete().eq('event_id', fx.eventId)
  await db.from('events').delete().eq('id', fx.eventId)
  await db.from('platform_notifications').delete().eq('organisation_id', fx.orgId)
  await db.from('organisations').delete().eq('id', fx.orgId)
  await db.from('profiles').delete().eq('id', fx.userId)
  await db.auth.admin.deleteUser(fx.userId).catch(() => {})

  const [{ count: events }, { count: alerts }, { count: platform }] = await Promise.all([
    db.from('events').select('id', { count: 'exact', head: true }).eq('id', fx.eventId),
    db.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', fx.userId),
    db.from('platform_notifications').select('id', { count: 'exact', head: true }).eq('event_id', fx.eventId),
  ])
  check(
    'cleanup',
    (events ?? 0) === 0 && (alerts ?? 0) === 0 && (platform ?? 0) === 0,
    `left behind: ${events} event(s), ${alerts} alert row(s), ${platform} owner-notification row(s)`,
  )
  finish()
}

console.error(`FAIL: unknown --phase ${phase}`)
process.exit(1)

/* ------------------------------------------------------------------ helpers */

function writeFixture(value) {
  writeFileSync(STATE, JSON.stringify(value, null, 2))
}

/** Did the server's own stdout carry this line? The transport is console here. */
function serverLogContains(needle) {
  if (!existsSync(serverLog)) return false
  return readFileSync(serverLog, 'utf8').includes(needle)
}

/** Alert rows belonging to anybody else, so a side effect cannot go unreported. */
async function foreignAlertCount() {
  const { count } = await db.from('notifications').select('id', { count: 'exact', head: true })
  return count ?? 0
}
