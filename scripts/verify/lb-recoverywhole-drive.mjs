/**
 * DRIVEN PROOF: THE ROW CEILING IS REAL, AND THE ORGANISER'S RECOVERY PANEL
 * COUNTS EVERY MESSAGE RATHER THAN THE FIRST THOUSAND.
 *
 * ---------------------------------------------------------------------------
 * READ THIS BEFORE CHANGING ANYTHING HERE: `recovery_sends` IS APPEND ONLY AND
 * THIS DRIVE MAY NOT WRITE TO IT.
 *
 * The first version of this drive inserted 1,200 rows of its own so it could
 * demonstrate the ceiling on real data, and then could not remove them. The
 * database refuses, by a trigger somebody wrote deliberately and with a
 * sentence explaining itself:
 *
 *     public.recovery_sends is append only: a DELETE was attempted on row 453.
 *     What was sent cannot be unsent.
 *
 * Both DELETE and UPDATE are blocked, for every role including the owner. So
 * those 1,200 rows are on TEST for ever, they inflate the denominator of
 * `sendingRates` from 452 to 1,652, and that denominator is the engine's own
 * reversal condition: the brake that stops the sender when too many people
 * unsubscribe now needs about 3.7 times as many unsubscribes to fire on TEST.
 * The full account, and the one thing the owner could do about it, is in
 * REVIEW-QUEUE-B.md under LB-RECOVERYWHOLE.
 *
 * THE RULE THAT COMES OUT OF IT, and it is general: FIND OUT WHETHER A FIXTURE
 * CAN BE REMOVED BEFORE WRITING TWELVE HUNDRED OF IT. One probe row, deleted
 * again, would have cost one row instead of 1,200. This drive takes the
 * stronger form of the same rule and writes NOTHING to `recovery_sends` at all:
 * it proves the ceiling out of the rows that are already there.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT PROVES, out of the rows that already exist rather than by making more.
 *
 *   1. the ceiling is REAL on this server: the read as it was written before
 *      this item returns exactly 1,000 of the 1,200 rows that exist, HTTP 200,
 *      `error` null, and nothing in the response says the rest are there
 *   2. `factsFor`, as this item leaves it, returns all 1,200
 *   3. exactly 200 people are invisible to the old read, and each one is
 *      somebody who would have been sent the same abandoned-checkout message a
 *      second time
 *   4. the organiser's own recovery panel counts all 1,200, at 390, 768 and
 *      1440, with zero axe violations at any impact level
 *
 * HOW IT REACHES A PANEL FOR ROWS WHOSE EVENT IS GONE. The 1,200 permanent rows
 * hang off one permanent slot whose organisation and event were removed. This
 * drive creates a throwaway organiser, organisation and event, points that slot
 * at them for the length of the run, and puts the slot back exactly as it found
 * it in the teardown, byte for byte on every column it touched. Net permanent
 * change per run: nothing.
 *
 * USAGE. The server must be up first:
 *
 *   node scripts/dev/lane-b-serve-with-stripe.mjs
 *
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     BASE=http://localhost:3100 \
 *     node --import ./scripts/lib/server-only-shim.mjs \
 *          --import ./scripts/lib/src-alias-loader.mjs \
 *          --env-file=.env.local scripts/verify/lb-recoverywhole-drive.mjs \
 *          --out C:/dev/EVIDENCE/LB-RECOVERYWHOLE
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { AxeBuilder } from '@axe-core/playwright'
import { factsFor } from '@/lib/fillrate/read'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'
import { answerTheCookieBanner } from './lib/cookie-banner.mjs'

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const BASE = (process.env.BASE ?? 'http://localhost:3100').replace(/\/$/, '')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`FAIL: this drive only runs against TEST vkapkibzokmfaxqogypq, not ${url || '(no url)'}`)
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

const VIEWPORTS = [
  { label: 'mobile-390', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { label: 'tablet-768', viewport: { width: 768, height: 1024 }, isMobile: false, hasTouch: true, deviceScaleFactor: 1 },
  { label: 'desktop-1440', viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
]

const STAMP = Date.now()
const TAG = `lane-b-recoverywhole-${STAMP}`
const ORG_NAME = `Lane B RECOVERYWHOLE ${STAMP}`
const OWNER_EMAIL = `${TAG}-owner@eventlinqs.test`
// MINTED, NEVER WRITTEN DOWN. no-plaintext-credential refuses a
// credential-named identifier assigned a literal, and it is right to: a
// password in a tracked file is in git for ever even after it is edited out.
const OWNER_PASSWORD = `lane-b-${randomBytes(18).toString('base64url')}`

/** The read the engine used to do, reproduced exactly. */
async function unboundedSends(slotId) {
  return db.from('recovery_sends').select('contact_email, message_number').eq('slot_id', slotId)
}

/** Every send on the slot, asked for by the drive itself, paged. */
async function everySend(slotId) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('recovery_sends')
      .select('contact_email')
      .eq('slot_id', slotId)
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (error) throw new Error(`the drive could not read recovery_sends: ${error.message}`)
    if (!data || data.length === 0) return rows
    rows.push(...data)
  }
}

let exitCode = 0
let browser = null
let ownerId = null
let orgId = null
let eventId = null
let slot = null

try {
  /*
   * THE SLOT IS ENUMERATED BY THE QUESTION IT HAS TO ANSWER, never hardcoded:
   * the one carrying more sends than the server will return in one response.
   */
  /*
   * AND THIS ENUMERATION IS PAGED, which it was not on the first run of this
   * drive. It asked for `.range(0, 4999)` in one request, the server returned
   * its thousand, and the drive concluded that the busiest slot carried 548
   * sends and that no slot on TEST was past the ceiling. The proof of the
   * defect was defeated by the defect, in its own setup, four lines in.
   */
  const bySlot = new Map()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('recovery_sends')
      .select('slot_id')
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (error) throw new Error(`could not enumerate slots: ${error.message}`)
    if (!data || data.length === 0) break
    for (const row of data) bySlot.set(row.slot_id, (bySlot.get(row.slot_id) ?? 0) + 1)
  }
  const busiest = [...bySlot.entries()].sort((a, b) => b[1] - a[1])[0] ?? null
  check(
    'recoverywhole.setup.a-slot-past-the-ceiling-was-enumerated-not-hardcoded',
    Boolean(busiest) && busiest[1] > 1000,
    busiest
      ? `slot ${busiest[0]} carries ${busiest[1]} sends, against a documented ceiling of 1,000`
      : 'no slot on TEST carries more sends than the ceiling, so this drive cannot prove anything about it',
  )
  if (!busiest || busiest[1] <= 1000) throw new Error('no slot past the ceiling to prove anything with')
  const slotId = busiest[0]

  const { data: slotRow, error: slotError } = await db
    .from('ledger_slots')
    .select('id, source_ref, organisation_id')
    .eq('id', slotId)
    .maybeSingle()
  if (slotError) throw new Error(`could not read the slot: ${slotError.message}`)
  slot = slotRow

  /* ====================================================================
   * 1. THE CEILING, ON THE REAL SERVER, WITH REAL ROWS.
   * ================================================================= */
  const { data: unbounded, error: unboundedError } = await unboundedSends(slotId)
  const truth = await everySend(slotId)
  check(
    'recoverywhole.ceiling.the-unbounded-read-stops-at-a-thousand-and-says-nothing',
    !unboundedError && (unbounded ?? []).length === 1000 && truth.length > 1000,
    unboundedError
      ? `the unbounded read errored: ${unboundedError.message}`
      : `${(unbounded ?? []).length} rows came back of ${truth.length} that exist, and \`error\` was null. This is the read as it was written before this item`,
  )

  const facts = await factsFor(slotId, db)
  check(
    'recoverywhole.ceiling.the-paged-read-returns-every-row',
    facts.alreadySent.size === truth.length,
    `factsFor() knows about ${facts.alreadySent.size} of ${truth.length} messages already sent`,
  )

  /*
   * WHICH thousand the unbounded read returns is undefined, because it carried
   * no `order by` either, so the missing people are counted rather than named
   * by position. Each one is a person who would be written to twice.
   */
  const seen = new Set((unbounded ?? []).map(r => r.contact_email))
  const invisible = truth.map(r => r.contact_email).filter(email => !seen.has(email))
  check(
    'recoverywhole.ceiling.the-people-the-old-read-could-not-see-are-counted',
    invisible.length === truth.length - 1000 && invisible.length > 0,
    `${invisible.length} people are in the database and not in the unbounded read, for example ${invisible[0]}. Each is somebody the sender would have written to a second time`,
  )

  /* ====================================================================
   * 2. THE PANEL THE ORGANISER READS.
   * ================================================================= */
  const { data: created, error: userError } = await db.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    email_confirm: true,
    user_metadata: { lane: 'lane-b', purpose: 'recovery proof panel' },
  })
  if (userError) throw new Error(`owner: ${userError.message}`)
  ownerId = created.user.id

  const { data: org, error: orgError } = await db
    .from('organisations')
    .insert({ name: ORG_NAME, slug: `${TAG}-org`, owner_id: ownerId, email: OWNER_EMAIL, status: 'pending' })
    .select('id')
    .single()
  if (orgError) throw new Error(`organisation: ${orgError.message}`)
  orgId = org.id

  const { data: category } = await db.from('event_categories').select('id').limit(1).maybeSingle()
  const start = new Date(Date.now() + 30 * 864e5)
  const { data: event, error: eventError } = await db
    .from('events')
    .insert({
      title: `${ORG_NAME} Night`,
      slug: `${TAG}-event`,
      description: 'Lane B RECOVERYWHOLE proof fixture.',
      summary: 'Lane B RECOVERYWHOLE proof fixture',
      organisation_id: orgId,
      created_by: ownerId,
      category_id: category?.id ?? null,
      start_date: start.toISOString(),
      end_date: new Date(start.getTime() + 3 * 36e5).toISOString(),
      timezone: 'Australia/Melbourne',
      event_type: 'in_person',
      venue_name: `Lane B RECOVERYWHOLE Hall ${STAMP}`,
      venue_city: 'Geelong',
      venue_country: 'Australia',
      status: 'draft',
      visibility: 'unlisted',
    })
    .select('id')
    .single()
  if (eventError) throw new Error(`event: ${eventError.message}`)
  eventId = event.id

  // Point the permanent slot at the throwaway event for the length of the run.
  const { error: repointError } = await db
    .from('ledger_slots')
    .update({ source_ref: eventId, organisation_id: orgId })
    .eq('id', slotId)
  if (repointError) throw new Error(`could not point the slot at the fixture event: ${repointError.message}`)
  check(
    'recoverywhole.setup.the-permanent-slot-is-borrowed-not-copied',
    true,
    `slot ${slotId} points at ${eventId} for this run; it was ${slot?.source_ref} and is put back in the teardown`,
  )

  browser = await chromium.launch({ headless: true })

  /*
   * ONE SIGN-IN, REUSED AT ALL THREE WIDTHS.
   *
   * Three sign-ins per run is three attempts against `auth-login`, which is 10
   * per IP per 10 minutes and FAIL-CLOSED (src/lib/rate-limit/policies.ts).
   * Iterating on this drive burned that window, and the refusals arrived as
   * "the organiser is still on /login", which reads exactly like a broken login
   * form on a tree where the form is fine. The limiter was working correctly
   * and the harness was the defect, for the third time in this one drive.
   *
   * THE BUTTON IS `disabled={loading || !hydrated}`, so the click waits for it
   * to enable rather than racing hydration. A form that never enables is
   * reported as itself, instead of as a missing panel three checks later.
   */
  const session = await browser.newContext({ locale: 'en-AU' })
  const gate = await session.newPage()
  await gate.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  /*
   * THE CONSENT BANNER SITS ACROSS THE BOTTOM OF EVERY PUBLIC PAGE AND EATS THE
   * CLICK. Six runs of this drive reported the organiser stuck on /login with no
   * error, and the server log settled it: the click produced NO POST at all, so
   * the submit handler never ran. The admin drives never met this because
   * /admin/login is not a public page. `answerTheCookieBanner` is the shared
   * helper that exists for exactly this and was written after five copies of it
   * disagreed.
   */
  await answerTheCookieBanner(gate)
  await gate.locator('input[name="email"], input[type="email"]').first().fill(OWNER_EMAIL)
  await gate.locator('input[name="password"], input[type="password"]').first().fill(OWNER_PASSWORD)
  const submit = gate.locator('button[type="submit"]').first()
  const enabled = await submit
    .waitFor({ state: 'visible', timeout: 60_000 })
    .then(async () => {
      for (let i = 0; i < 60; i += 1) {
        if (await submit.isEnabled()) return true
        await gate.waitForTimeout(1000)
      }
      return false
    })
    .catch(() => false)
  check(
    'recoverywhole.signin.the-form-hydrated-and-enabled',
    enabled,
    enabled ? 'the button is enabled' : 'the sign-in button never enabled',
  )
  await Promise.all([
    gate.waitForURL(u => !new URL(u).pathname.startsWith('/login'), { timeout: 90_000 }).catch(() => {}),
    submit.click(),
  ])
  await gate.waitForTimeout(2500)
  const signedIn = !new URL(gate.url()).pathname.startsWith('/login')
  const alerts = (await gate.locator('[role="alert"]').allInnerTexts().catch(() => [])).join(' | ').trim()
  check(
    'recoverywhole.signin.the-organiser-signed-in-once-for-all-three-widths',
    signedIn,
    signedIn ? gate.url() : `still on ${gate.url()}; every alert on the page: ${alerts || '(none)'}`,
  )
  const storageState = await session.storageState()
  await session.close()

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ ...vp, locale: 'en-AU', storageState })
    const page = await context.newPage()

    const res = await page.goto(`${BASE}/dashboard/events/${eventId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    })
    check(`recoverywhole.${vp.label}.the-organiser-reaches-their-own-event`, res?.status() === 200, `HTTP ${res?.status()}`)
    /*
     * WAIT FOR THE PANEL RATHER THAN FOR A CLOCK, AND FOR ATTACHED RATHER THAN
     * VISIBLE.
     *
     * A fixed three seconds found it at 390 and 1440 and missed it at 768 on
     * the same tree. Playwright's default state for waitForSelector is
     * `visible`, and the panel sits far below the fold on a long dashboard, so
     * waiting for visibility timed out at all three widths on a tree where the
     * panel was demonstrably rendering. The distinction is reported rather than
     * collapsed: in the DOM is the product's job, on the screen is the
     * viewport's.
     */
    const panel = await page
      .waitForSelector('[data-recovery-proof]', { state: 'attached', timeout: 60_000 })
      .catch(() => null)
    const bodySample = panel ? '' : (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200)
    check(
      `recoverywhole.${vp.label}.the-proof-panel-is-on-the-page`,
      Boolean(panel),
      panel ? 'in the DOM' : `not in the DOM; the page says: ${bodySample}`,
    )
    if (panel) {
      await panel.scrollIntoViewIfNeeded().catch(() => {})
      await page.waitForTimeout(500)
      /*
       * FIGURES BY THEIR LABELS, never by searching the panel's text for a
       * number: "1,200" would match a price, a date or a sentence, and a
       * substring match agrees with almost any panel.
       */
      const onScreen = await page.evaluate(() => {
        const el = document.querySelector('[data-recovery-proof]')
        if (!el) return null
        const box = el.getBoundingClientRect()
        const figures = {}
        for (const wrap of el.querySelectorAll('div')) {
          const ps = wrap.querySelectorAll(':scope > p')
          if (ps.length !== 2) continue
          const label = (ps[1].textContent ?? '').trim().toLowerCase()
          if (label) figures[label] = (ps[0].textContent ?? '').trim()
        }
        return { figures, left: Math.round(box.left), right: Math.round(box.right) }
      })
      /*
       * THE LABEL IS "written to", NOT "emailed", and this check first looked
       * for the word it expected rather than the word the panel uses. The
       * figure was correct and on the screen the whole time.
       */
      const emailed = Object.entries(onScreen?.figures ?? {}).find(([label]) => label === 'written to')
      check(
        `recoverywhole.${vp.label}.the-panel-counts-every-message-not-the-first-thousand`,
        Boolean(emailed) && emailed[1].replace(/[^0-9]/g, '') === String(truth.length),
        emailed
          ? `"${emailed[0]}" reads ${emailed[1]}, database ${truth.length}`
          : `no "written to" figure found: ${JSON.stringify(onScreen?.figures)}`,
      )
      check(
        `recoverywhole.${vp.label}.the-panel-fits-the-viewport`,
        Boolean(onScreen) && onScreen.right <= vp.viewport.width + 1 && onScreen.left >= -1,
        `left ${onScreen?.left} right ${onScreen?.right} against ${vp.viewport.width}`,
      )
      await page.screenshot({ path: join(out, `${vp.label}-proof-panel.png`), fullPage: false })
    }

    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    check(
      `recoverywhole.${vp.label}.no-axe-violation-at-any-impact-level`,
      axe.violations.length === 0,
      axe.violations.length === 0
        ? '0 violations at any impact level'
        : axe.violations.map(v => `${v.impact}: ${v.id} x${v.nodes.length}`).join(' | '),
    )

    await context.close()
  }
} catch (err) {
  check('recoverywhole.the-drive-ran-to-the-end', false, String(err && err.stack ? err.stack.split('\n')[0] : err))
  exitCode = 1
} finally {
  if (browser) await browser.close().catch(() => {})

  // -------------------------------------------- teardown, in reverse order
  const removed = { events: 0, orgs: 0, users: 0 }
  let slotRestored = false
  try {
    if (slot?.id) {
      const { error } = await db
        .from('ledger_slots')
        .update({ source_ref: slot.source_ref, organisation_id: slot.organisation_id })
        .eq('id', slot.id)
      if (error) console.error(`teardown could not put the slot back: ${error.message}`)
      const { data: after } = await db
        .from('ledger_slots')
        .select('source_ref, organisation_id')
        .eq('id', slot.id)
        .maybeSingle()
      slotRestored = after?.source_ref === slot.source_ref && after?.organisation_id === slot.organisation_id
    }
    if (eventId) {
      const { count, error } = await db.from('events').delete({ count: 'exact' }).eq('id', eventId)
      if (error) console.error(`teardown could not remove the event: ${error.message}`)
      removed.events = count ?? 0
    }
    if (orgId) {
      const { count, error } = await db.from('organisations').delete({ count: 'exact' }).eq('id', orgId)
      if (error) console.error(`teardown could not remove the organisation: ${error.message}`)
      removed.orgs = count ?? 0
    }
    if (ownerId) {
      /*
       * THROUGH THE ONE DOOR. `auth.admin.deleteUser` cannot tell an account
       * that was already gone from a deletion that was REFUSED, so a teardown
       * calling it directly can report a success it did not have.
       * `one-way-to-delete-an-account` caught this file doing exactly that.
       */
      const result = await tearDownAccountOrFailTheRun(db, ownerId)
      if (result.gone) removed.users = 1
      else console.error(`teardown could not remove the owner: ${result.detail}`)
    }
  } catch (err) {
    console.error(`teardown threw: ${err}`)
  }

  const { count: leftOrgs } = await db
    .from('organisations')
    .select('id', { count: 'exact', head: true })
    .like('slug', `${TAG}-%`)
  const { count: leftEvents } = await db
    .from('events')
    .select('id', { count: 'exact', head: true })
    .like('slug', `${TAG}-%`)
  check(
    'recoverywhole.teardown.test-is-left-as-found-observed-not-claimed',
    (leftOrgs ?? 0) === 0 && (leftEvents ?? 0) === 0 && removed.users === 1 && slotRestored,
    `slot put back: ${slotRestored}; removed ${removed.events} event(s), ${removed.orgs} organisation(s), ${removed.users} user(s); ` +
      `${leftEvents ?? 0} event(s) and ${leftOrgs ?? 0} organisation(s) remain. NOTHING was written to recovery_sends: it is append only`,
  )

  const passed = checks.filter(c => c.ok).length
  console.log(`\n${passed} of ${checks.length} checks passed`)
  for (const f of failures) console.log(`  FAILED: ${f}`)
  writeFileSync(
    join(out, 'recoverywhole-report.json'),
    JSON.stringify({ base: BASE, slot: slot?.id ?? null, passed, total: checks.length, checks }, null, 2),
  )
  process.exit(failures.length > 0 ? 1 : exitCode)
}
