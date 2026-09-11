/**
 * UX3.2 DRIVEN PROOF: a persistent email failure raises through the SECOND
 * CHANNEL, and a real device receives it.
 *
 * WHAT WAS MISSING, AND WHY IT WAS NOT ACTUALLY BLOCKED. Session 58 closed
 * UX3.2 as PARTIAL with this reason: "the escalation DECISION and the failure of
 * both channels are driven; the push channel's success path is unit-driven only,
 * because the VAPID keys are empty on this machine." The keys being empty is a
 * fact about a file, not a blocker: a VAPID keypair is generated in one line and
 * belongs to whoever generates it. What made the leg look impossible was two
 * genuine properties of headless browsers, both found by driving rather than by
 * reading, and both fixed here:
 *
 *   1. Playwright's BUNDLED Chromium has no push service. `pushManager.subscribe`
 *      answers `AbortError: Registration failed - push service not available`.
 *      Google Chrome, launched by channel, has one. So this drive uses Chrome.
 *   2. Playwright's default context is INCOGNITO, and Chrome refuses the Push API
 *      there. The browser says so itself: "Chrome currently does not support the
 *      Push API in incognito mode (https://crbug.com/41124656)." So this drive
 *      uses `launchPersistentContext` with a throwaway profile directory.
 *
 * With those two, headless Chrome subscribes against fcm.googleapis.com, accepts
 * a real Web Push Protocol delivery signed with our own VAPID keys, runs the
 * REAL public/push-sw.js, and shows the notification. This script then reads that
 * notification back off `registration.getNotifications()`, so the assertion is on
 * what the browser DISPLAYED, not on what the server believed it sent.
 *
 * HOW THE EMAIL IS MADE TO FAIL, honestly. It is not stubbed and no code is
 * modified: this machine has no `RESEND_API_KEY`, so `getResend()` throws
 * `RESEND_API_KEY is not configured` on every attempt. The drive serves the
 * build with `mail: 'real'` (see startGateServer) so the console transport is
 * NOT in the way, and then runs the real cron route three times. Attempts one and
 * two must retry; the third must escalate, because
 * PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS is 3.
 *
 * WHAT IS A FIXTURE AND WHAT IS DRIVEN, stated so nothing is over-claimed. The
 * two ACCOUNTS are fixtures created with the service role, exactly as
 * ux3-admin-feed-proof.mjs already does, because neither account is the thing
 * under test and /signup cannot complete on a machine whose mail transport is
 * deliberately broken. Everything that IS under test is driven through the real
 * interface: the organiser signs in at /login and creates their organisation
 * through the real form, which is the state change the database trigger watches;
 * the admin signs in at /admin/login and arms the backup channel by pressing the
 * real button on /admin/notifications; and the notification row, its retries, its
 * escalation and its delivery are all read back rather than asserted.
 *
 * Usage (through the wrapper, which serves the build and hands over the env):
 *   node scripts/verify/ux3-push-escalation-drive.mjs
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/UX3'
let only = null
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') out = args[++i]
  else if (args[i] === '--only') only = args[++i]
}
out = join(out, 'push-escalation')
mkdirSync(out, { recursive: true })

const BASE = process.env.BASE ?? 'http://localhost:3311'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const CRON_SECRET = process.env.CRON_SECRET ?? ''
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

if (/gndnldyfudbytbboxesk/.test(SUPABASE_URL)) {
  console.error('refusing to run against production')
  process.exit(1)
}
for (const [name, value] of [
  ['NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL],
  ['SUPABASE_SERVICE_ROLE_KEY', SERVICE_KEY],
  ['CRON_SECRET', CRON_SECRET],
  ['NEXT_PUBLIC_VAPID_PUBLIC_KEY', VAPID_PUBLIC],
]) {
  if (!value) {
    console.error(`FAIL: ${name} is required and is empty`)
    if (name === 'NEXT_PUBLIC_VAPID_PUBLIC_KEY') {
      console.error('      Generate a pair once with: npx web-push generate-vapid-keys')
      console.error('      then put both halves plus VAPID_SUBJECT in .env.local and rebuild,')
      console.error('      because the public half is inlined into the client bundle at build time.')
    }
    process.exit(1)
  }
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const VIEWPORTS = [
  { label: '390', width: 390, height: 844 },
  { label: '768', width: 768, height: 1024 },
  { label: '1440', width: 1440, height: 1000 },
]

const checks = []
const failures = []
function check(id, ok, detail) {
  checks.push({ id, ok, detail })
  if (!ok) failures.push(`${id}: ${detail}`)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}

/** One tick of the REAL cron route, with the real secret. Never the library. */
async function cronTick() {
  const res = await fetch(`${BASE}/api/cron/platform-notify`, {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
    signal: AbortSignal.timeout(60000),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

/** Wait for the row the DATABASE writes, so a slow transaction is not a failure. */
async function waitForNotification(organisationId, timeoutMs = 25000) {
  const started = Date.now()
  for (;;) {
    const { data, error } = await db
      .from('platform_notifications')
      .select('*')
      .eq('kind', 'organiser_created')
      .eq('organisation_id', organisationId)
      .limit(1)
    if (error) return { error: error.message }
    if (data && data.length > 0) return { row: data[0] }
    if (Date.now() - started > timeoutMs) return { row: null }
    await new Promise((r) => setTimeout(r, 1000))
  }
}

/**
 * The admin sign-in, through the real form.
 *
 * Lifted in shape from ux3-admin-feed-proof.mjs, including the reason it waits
 * for an alert WITH TEXT IN IT rather than for the element: an empty
 * `[role=alert]` is already on the login page, so racing on its existence
 * reports a working sign-in as refused.
 */
async function signInAsAdmin(page, email, password) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  const submit = page.locator('button[type="submit"]')
  await submit.waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForFunction(
    () => !document.querySelector('button[type="submit"]')?.disabled,
    undefined,
    { timeout: 30000 },
  )
  await submit.click()
  await Promise.race([
    page.waitForURL((u) => !u.pathname.endsWith('/admin/login'), { timeout: 60000 }).catch(() => {}),
    page
      .waitForFunction(
        () =>
          [...document.querySelectorAll('[role=alert]')].some(
            (e) => (e.textContent ?? '').trim().length > 0,
          ),
        undefined,
        { timeout: 60000 },
      )
      .catch(() => {}),
  ])
  if (new URL(page.url()).pathname.endsWith('/admin/login')) {
    const shown = await page.locator('[role=alert]').allInnerTexts().catch(() => [])
    return { ok: false, reason: shown.join(' // ') || 'NOTHING SHOWN' }
  }
  return { ok: true, reason: new URL(page.url()).pathname }
}

async function run() {
  for (const vp of VIEWPORTS) {
    if (only && vp.label !== only) continue
    console.log(`\n  === ${vp.label} ===`)
    const stamp = `${Date.now().toString(36)}${vp.label}`
    const adminEmail = `ux32-admin-${stamp}@eventlinqs.test`
    const organiserEmail = `ux32-org-${stamp}@eventlinqs.test`
    const password = `${randomUUID()}Aa1`
    const orgName = `Backup Channel Proof ${stamp}`
    const orgSlug = `backup-channel-proof-${stamp}`
    const profileDir = join('C:/dev/EVIDENCE/UX3/push-escalation', `.chrome-${stamp}`)

    let adminUserId = null
    let organiserUserId = null
    let organisationId = null
    let ctx = null
    let organiserBrowser = null

    try {
      // ---- the two fixture accounts -------------------------------------
      const madeAdmin = await db.auth.admin.createUser({
        email: adminEmail,
        password,
        email_confirm: true,
      })
      if (madeAdmin.error) throw new Error(`create admin: ${madeAdmin.error.message}`)
      adminUserId = madeAdmin.data.user.id
      await db.from('profiles').upsert({
        id: adminUserId,
        email: adminEmail,
        full_name: 'UX3.2 Escalation Proof',
        display_name: 'UX3.2 Escalation Proof',
        is_verified: true,
      })
      const insertedAdmin = await db
        .from('admin_users')
        .insert({ id: adminUserId, role: 'super_admin', display_name: 'UX3.2 Escalation Proof' })
      if (insertedAdmin.error) throw new Error(`admin_users insert: ${insertedAdmin.error.message}`)

      const madeOrganiser = await db.auth.admin.createUser({
        email: organiserEmail,
        password,
        email_confirm: true,
      })
      if (madeOrganiser.error) throw new Error(`create organiser: ${madeOrganiser.error.message}`)
      organiserUserId = madeOrganiser.data.user.id
      await db.from('profiles').upsert({
        id: organiserUserId,
        email: organiserEmail,
        full_name: 'Backup Channel Organiser',
        display_name: 'Backup Channel Organiser',
        is_verified: true,
      })

      // ---- the admin arms the second channel, in Chrome ------------------
      //
      // Persistent, and Chrome rather than Chromium: both are load-bearing and
      // the file header records what each one answers when it is wrong.
      ctx = await chromium.launchPersistentContext(profileDir, {
        channel: 'chrome',
        viewport: { width: vp.width, height: vp.height },
        locale: 'en-AU',
        isMobile: vp.width < 768,
        hasTouch: vp.width < 1024,
      })
      await ctx.grantPermissions(['notifications'], { origin: BASE })
      const page = ctx.pages()[0] ?? (await ctx.newPage())
      page.on('pageerror', (e) => console.log(`    pageerror ${String(e).slice(0, 200)}`))
      page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning') console.log(`    console.${m.type()} ${m.text().slice(0, 200)}`)
      })
      // The arming click is one POST. If it never happens, or answers anything
      // but 200, the button correctly stays as it was and the drive would
      // otherwise report only a timeout.
      page.on('response', (r) => {
        if (r.url().includes('/api/push/')) console.log(`    ${r.request().method()} ${r.status()} ${r.url().replace(BASE, '')}`)
      })

      const signedIn = await signInAsAdmin(page, adminEmail, password)
      check(`ux3.2.${vp.label}.admin.signin`, signedIn.ok, signedIn.ok ? `landed on ${signedIn.reason}` : `admin sign-in refused: ${signedIn.reason}`)
      if (!signedIn.ok) continue

      await page.goto(`${BASE}/admin/notifications`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {})

      // ENABLED, not merely present. An unconfigured build renders the identical
      // label on a DISABLED button, so testing the text alone would pass on a
      // build with no VAPID key in it and the whole drive would be worthless.
      const armButton = page.getByRole('button', { name: /Arm backup alerts on this device/i })
      const armEnabled = await armButton.isEnabled().catch(() => false)
      check(
        `ux3.2.${vp.label}.arm.offered`,
        armEnabled,
        armEnabled
          ? 'the arm control is on the screen and ENABLED, so this build carries a VAPID public key'
          : 'the arm control is present but disabled, which means the build has no VAPID public key inlined',
      )
      if (!armEnabled) continue
      await page.screenshot({ path: join(out, `01-before-arming-${vp.label}.png`), fullPage: true })

      await page.getByRole('button', { name: /Arm backup alerts on this device/i }).click()
      const armed = await page
        .waitForFunction(
          () =>
            [...document.querySelectorAll('button')].some((b) =>
              /Disarm this device/i.test(b.textContent ?? ''),
            ),
          undefined,
          { timeout: 60000 },
        )
        .then(() => true)
        .catch(() => false)
      if (!armed) {
        // Report what the SCREEN says, so a refusal is read rather than guessed.
        const labels = await page.evaluate(() =>
          [...document.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim()).filter(Boolean),
        )
        const shown = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
        await page.screenshot({ path: join(out, `02-arm-refused-${vp.label}.png`), fullPage: true })
        // ASK THE BROWSER WHY, rather than reporting a timeout.
        //
        // On a production build `reportClientError` queues the error against a
        // Sentry sink that is not installed here, so the reason the arming
        // failed reaches neither the screen nor any log. Re-running the same
        // three steps in the page is the only way to read it, and it is worth
        // keeping: every failure mode of this control (no push service, an
        // incognito profile, a denied permission, a rejected key) is a
        // different sentence here and they are indistinguishable on screen.
        const why = await page.evaluate(async (key) => {
          const steps = []
          try {
            const reg = await navigator.serviceWorker.register('/push-sw.js')
            steps.push(`register: ok (scope ${reg.scope})`)
            const permission = await Notification.requestPermission()
            steps.push(`permission: ${permission}`)
            const raw = atob(key.replace(/-/g, '+').replace(/_/g, '/'))
            const bytes = new Uint8Array(raw.length)
            for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
            const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes })
            steps.push(`subscribe: ok (${new URL(sub.endpoint).host})`)
          } catch (error) {
            steps.push(`THREW: ${String(error)}`)
          }
          return steps
        }, VAPID_PUBLIC)
        console.log(`    browser says: ${why.join(' | ')}`)
        check(
          `ux3.2.${vp.label}.arm.flipped`,
          false,
          `the control never became "Disarm this device". Buttons on screen: ${labels.join(' | ')}. Note on screen: ${(/Backup channel(.*?)(Arm backup|Disarm)/.exec(shown)?.[1] ?? '').trim().slice(0, 200)}`,
        )
        continue
      }
      await page.screenshot({ path: join(out, `02-armed-${vp.label}.png`), fullPage: true })

      const { data: subs, error: subErr } = await db
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', adminUserId)
      check(
        `ux3.2.${vp.label}.arm.persisted`,
        !subErr && (subs ?? []).length === 1,
        subErr
          ? `push_subscriptions read failed: ${subErr.message}`
          : `${(subs ?? []).length} real subscription row for this admin`,
      )
      if ((subs ?? []).length === 1) {
        check(
          `ux3.2.${vp.label}.arm.endpoint`,
          /^https:\/\//.test(subs[0].endpoint),
          `the endpoint is a real push service: ${new URL(subs[0].endpoint).host}`,
        )
      }

      // ---- drain the backlog before measuring anything -------------------
      //
      // TEST carries pending notifications from every earlier drive, and the
      // dispatcher takes the OLDEST fifty first. The first run of this script
      // asserted on a row that sat behind fifty of them, so its own row was
      // never considered and every retry assertion read the untouched row while
      // fifty OTHER notifications escalated and arrived on the device. It looked
      // like the product ignoring a row; it was the queue doing exactly what it
      // says it does.
      //
      // Drained through the REAL cron route rather than by writing to the
      // database, so the queue is emptied the way the platform empties it.
      let drained = 0
      for (let i = 0; i < 40; i += 1) {
        const tick = await cronTick()
        const considered = tick.body?.dispatched?.considered ?? 0
        if (considered === 0) break
        drained += considered
      }
      check(
        `ux3.2.${vp.label}.queue.drained`,
        true,
        `${drained} notification(s) left over from earlier drives cleared through the real cron, so the queue under test holds only this run`,
      )
      // And clear what those deliveries displayed, so the assertion below reads
      // this run's message rather than one of theirs.
      await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration('/')
        for (const n of (await reg?.getNotifications()) ?? []) n.close()
      })

      // ---- a real state change writes a real notification ---------------
      organiserBrowser = await chromium.launch()
      const orgCtx = await organiserBrowser.newContext({
        viewport: { width: vp.width, height: vp.height },
        locale: 'en-AU',
      })
      const orgPage = await orgCtx.newPage()
      await orgPage.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 })
      await orgPage.fill('input[type="email"]', organiserEmail)
      await orgPage.fill('input[type="password"]', password)
      await orgPage.click('button[type="submit"]')
      await orgPage.waitForTimeout(6000)
      check(
        `ux3.2.${vp.label}.organiser.signin`,
        !new URL(orgPage.url()).pathname.startsWith('/login'),
        `organiser landed on ${new URL(orgPage.url()).pathname}`,
      )

      await orgPage.goto(`${BASE}/dashboard/organisation/create`, { waitUntil: 'networkidle', timeout: 60000 })
      await orgPage.fill('input#name', orgName)
      await orgPage.fill('input#slug', orgSlug)
      const description = orgPage.locator('textarea#description')
      if (await description.count()) await description.fill('Proving the backup alert channel end to end.')
      await orgPage.getByRole('button', { name: /Create Organisation/i }).click()
      await orgPage.waitForTimeout(8000)

      const { data: org } = await db
        .from('organisations')
        .select('id, name')
        .eq('slug', orgSlug)
        .maybeSingle()
      organisationId = org?.id ?? null
      check(
        `ux3.2.${vp.label}.organisation.created`,
        Boolean(organisationId),
        organisationId ? `organisation ${organisationId} created through the real form` : 'the organisation was never created, so there is no state change to notify about',
      )
      await orgCtx.close()
      if (!organisationId) continue

      const found = await waitForNotification(organisationId)
      check(
        `ux3.2.${vp.label}.notification.recorded`,
        Boolean(found.row) && !found.error,
        found.row
          ? `the trigger wrote it: "${found.row.summary}" -> ${found.row.admin_path}`
          : `NO ROW: the state change completed in silence (${found.error ?? 'nothing written'})`,
      )
      if (!found.row) continue
      const notificationId = found.row.id
      check(
        `ux3.2.${vp.label}.notification.pending`,
        found.row.delivery_state === 'pending' && found.row.attempts === 0,
        `queued as ${found.row.delivery_state} with ${found.row.attempts} attempt(s)`,
      )

      // ---- email fails, twice, and the row is RETRIED -------------------
      const ticks = []
      for (let i = 1; i <= 3; i += 1) {
        const tick = await cronTick()
        ticks.push(tick)
        const { data: after } = await db
          .from('platform_notifications')
          .select('delivery_state, attempts, channel, last_error, sent_at')
          .eq('id', notificationId)
          .maybeSingle()
        console.log(
          `    tick ${i}: HTTP ${tick.status} ${JSON.stringify(tick.body?.dispatched ?? {})} -> row ${after?.delivery_state} attempts ${after?.attempts}`,
        )
        if (i < 3) {
          check(
            `ux3.2.${vp.label}.retry.${i}`,
            after?.delivery_state === 'pending' && after?.attempts === i,
            `attempt ${i} failed and the row stayed pending with attempts ${after?.attempts}: ${String(after?.last_error).slice(0, 90)}`,
          )
        }
      }

      const { data: finalRow } = await db
        .from('platform_notifications')
        .select('*')
        .eq('id', notificationId)
        .maybeSingle()
      check(
        `ux3.2.${vp.label}.escalated`,
        finalRow?.delivery_state === 'escalated' && finalRow?.channel === 'push',
        `after ${finalRow?.attempts} email attempts the row reads ${finalRow?.delivery_state} on channel ${finalRow?.channel}`,
      )
      check(
        `ux3.2.${vp.label}.escalated.reason`,
        typeof finalRow?.last_error === 'string' && /email failed 3 time\(s\)/.test(finalRow.last_error),
        `the row keeps why it escalated: ${String(finalRow?.last_error).slice(0, 110)}`,
      )
      check(
        `ux3.2.${vp.label}.escalated.sent_at`,
        Boolean(finalRow?.sent_at),
        `and when the second channel carried it: ${finalRow?.sent_at}`,
      )

      // ---- THE DEVICE ACTUALLY RECEIVED IT -------------------------------
      //
      // Read off registration.getNotifications(), which is what the REAL
      // public/push-sw.js displayed. Nothing here trusts the sender's own
      // report: a 201 from a push service says the message was accepted for
      // delivery, not that a service worker ran.
      const wantedTag = `platform-${notificationId}`
      const deadline = Date.now() + 30000
      let shown = []
      let mine = null
      while (Date.now() < deadline) {
        shown = await page.evaluate(async () => {
          const reg = await navigator.serviceWorker.getRegistration('/')
          if (!reg) return []
          const list = await reg.getNotifications()
          return list.map((n) => ({ title: n.title, body: n.body, tag: n.tag, url: n.data?.url }))
        })
        // BY TAG, never `shown[0]`. The tag is the row's own id, so this can
        // only ever match the notification this run produced.
        mine = shown.find((n) => n.tag === wantedTag) ?? null
        if (mine) break
        await new Promise((r) => setTimeout(r, 1000))
      }
      writeFileSync(
        join(out, `notifications-shown-${vp.label}.json`),
        JSON.stringify({ wantedTag, shown }, null, 2),
      )
      check(
        `ux3.2.${vp.label}.push.displayed`,
        Boolean(mine),
        mine
          ? `the real service worker showed it: "${mine.title}" (${shown.length} notification(s) on the device)`
          : `no notification tagged ${wantedTag} reached the device inside 30s (${shown.length} other(s) present)`,
      )
      if (mine) {
        const n = mine
        check(
          `ux3.2.${vp.label}.push.title`,
          n.title === 'New organiser',
          `titled by kind, so the owner reads what happened before opening anything: "${n.title}"`,
        )
        check(
          `ux3.2.${vp.label}.push.body`,
          n.body === finalRow.summary,
          `the body a person reads is the row's own summary: "${String(n.body).slice(0, 80)}"`,
        )
        check(
          `ux3.2.${vp.label}.push.url`,
          n.url === finalRow.admin_path,
          `tapping it opens the record itself: ${n.url}`,
        )
        check(
          `ux3.2.${vp.label}.push.tag`,
          n.tag === wantedTag,
          `tagged to its own row, so a second delivery replaces rather than repeats: ${n.tag}`,
        )
      }

      // ---- and the admin feed says so ------------------------------------
      await page.goto(`${BASE}/admin/notifications`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {})
      await page.screenshot({ path: join(out, `03-escalated-in-the-feed-${vp.label}.png`), fullPage: true })
      const feedText = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
      check(
        `ux3.2.${vp.label}.feed.shows.it`,
        feedText.includes(finalRow.summary),
        'the escalated notification is readable on the admin feed',
      )
      check(
        `ux3.2.${vp.label}.feed.no.overflow`,
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        'nothing on the screen is clipped off the right edge at this width',
      )

      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      writeFileSync(
        join(out, `axe-${vp.label}.json`),
        JSON.stringify({ url: page.url(), violations: axe.violations }, null, 2),
      )
      check(
        `ux3.2.${vp.label}.axe`,
        axe.violations.length === 0,
        axe.violations.length === 0
          ? 'axe: 0 violations at every impact level'
          : `axe: ${axe.violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length})`).join(', ')}`,
      )
    } catch (err) {
      check(`ux3.2.${vp.label}.run`, false, `the drive threw: ${String(err).slice(0, 200)}`)
    } finally {
      if (ctx) await ctx.close().catch(() => {})
      if (organiserBrowser) await organiserBrowser.close().catch(() => {})
      // Every fixture removed, in dependency order, so a re-run starts clean.
      if (organisationId) await db.from('organisations').delete().eq('id', organisationId)
      if (adminUserId) {
        await db.from('push_subscriptions').delete().eq('user_id', adminUserId)
        await db.from('admin_users').delete().eq('id', adminUserId)
        await db.auth.admin.deleteUser(adminUserId).catch(() => {})
      }
      if (organiserUserId) await db.auth.admin.deleteUser(organiserUserId).catch(() => {})
      rmSync(profileDir, { recursive: true, force: true })
    }
  }
}

await run()

writeFileSync(
  join(out, 'ux3-push-escalation-report.json'),
  JSON.stringify({ base: BASE, checks, failures }, null, 2),
)
console.log(`\n  ${checks.filter((c) => c.ok).length} of ${checks.length} checks pass`)
if (failures.length > 0) {
  console.log('\n  FAILURES')
  for (const f of failures) console.log(`    ${f}`)
}
process.exit(failures.length === 0 ? 0 : 1)
