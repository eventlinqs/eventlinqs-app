/**
 * DRIVEN PROOF: AN UNSUBSCRIBE STOPS THE ABANDONED-CHECKOUT REMINDER.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT PROVES, by pressing the button a person presses and then asking the
 * database and the product, never the code.
 *
 *   1. the preferences surface renders and is accessible at 390, 768 and 1440
 *   2. pressing "Unsubscribe from everything" records an all_marketing stop
 *   3. pressing "Stop using my details for other organisers" records a
 *      facilitation_by_others stop, which ALSO stops recovery mail
 *   4. THE DEFECT: the abandoned-checkout sender's own list does not contain
 *      either of them, so before this fix both would have gone on being mailed
 *   5. the real cron route reconciles them in, and says so in its own response
 *   6. the engine's suppression set then contains both addresses
 *   7. it is idempotent: a second run adds nothing
 *   8. a person nobody has suppressed is NOT swept up by any of it
 *
 * ---------------------------------------------------------------------------
 * USAGE. Four things have to be in the command and each missing one fails as a
 * PRODUCT defect rather than as a setup error, which is the part that costs the
 * time. The server must be up first:
 *
 *   node scripts/dev/lane-b-serve-with-stripe.mjs
 *
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     BASE=http://localhost:3100 \
 *     UPSTASH_REDIS_REST_URL=http://127.0.0.1:8179 UPSTASH_REDIS_REST_TOKEN=local \
 *     node --import ./scripts/lib/server-only-shim.mjs \
 *          --import ./scripts/lib/src-alias-loader.mjs \
 *          --env-file=.env.local scripts/verify/lb-recoverystop-drive.mjs \
 *          --out C:/dev/EVIDENCE/LB-RECOVERYSTOP
 *
 *   -u NEXT_PUBLIC_SUPABASE_*   this shell carries the PRODUCTION url, which
 *                               overrides .env.local. The drive refuses to run
 *                               against anything but TEST, so without this it
 *                               stops on its own rather than touching production.
 *   --env-file=.env.local       the service key, and CRON_SECRET for the route
 *   --import server-only-shim   src/ modules open with `import 'server-only'`
 *   --import src-alias-loader   so `@/...` resolves outside Next
 *
 * TEST IS LEFT AS FOUND. Every row is tagged `lane-b-recoverystop-` and removed
 * in the teardown, except `consent_events` and `suppression_events`, which
 * refuse DELETE by design (close-out GA1 v3, acceptance 13) and are reported by
 * count instead.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { AxeBuilder } from '@axe-core/playwright'
import { answerTheCookieBanner as answerTheBanner } from './lib/cookie-banner.mjs'

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

const STAMP = Date.now().toString(36)
const LANE = `lane-b-recoverystop-${STAMP}`
/** Three addresses: one stops everything, one stops facilitation, one says nothing. */
const STOPPER = `${LANE}-all@example.com`
const FACILITATION = `${LANE}-facil@example.com`
const BYSTANDER = `${LANE}-bystander@example.com`
const ALL = [STOPPER, FACILITATION, BYSTANDER]

const SOURCE_SYSTEM = 'eventlinqs'

/**
 * SEEDED THROUGH THE PRODUCT, AND THE PRODUCT'S LIMITER IS OBEYED RATHER THAN
 * DEFEATED.
 *
 * `newsletter-subscribe` is 5 per IP per 10 minutes
 * (src/lib/rate-limit/policies.ts). Two runs of this drive inside one window
 * exhausted it and the sixth signup came back 429, which read in the report as
 * the product failing to record a consent. It was the limiter working.
 *
 * The temptation was to flush the local rate-limit shim between runs. That is
 * the wrong instinct: the shim is standing in for a real store, and a drive
 * that can only pass with the limiter switched off is not evidence about a
 * platform that ships with it on. So this WAITS, visibly and with a bound, and
 * still reports a genuine refusal as a failure.
 */
async function seedConsent(email, city = 'geelong', { budgetMs = 700_000 } = {}) {
  const deadline = Date.now() + budgetMs
  for (;;) {
    const res = await fetch(`${BASE}/api/newsletter/subscribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, source: 'city', city }),
    })
    const body = await res.json().catch(() => ({}))
    if (res.status !== 429) return { ok: res.status === 200 && body.ok === true, status: res.status, body }
    if (Date.now() > deadline) {
      return { ok: false, status: 429, body, note: 'the limiter refused for the whole budget' }
    }
    const left = Math.round((deadline - Date.now()) / 1000)
    console.log(`      ... newsletter-subscribe is rate limited (5 per IP per 10 min). Waiting 30s, ${left}s of budget left.`)
    await new Promise(resolve => setTimeout(resolve, 30_000))
  }
}

async function tokenFor(email) {
  const { data } = await db
    .from('marketing_consents')
    .select('unsubscribe_token, status')
    .eq('email', email)
    .maybeSingle()
  return data ?? null
}

/** The engine's own suppression rows for our addresses. The thing that decides. */
async function engineSuppressions() {
  const { data, error } = await db
    .from('recovery_suppressions')
    .select('contact_email, reason')
    .eq('source_system', SOURCE_SYSTEM)
    .in('contact_email', ALL)
  if (error) throw new Error(`could not read recovery_suppressions: ${error.message}`)
  return new Map((data ?? []).map(r => [r.contact_email, r.reason]))
}

/**
 * WAIT FOR THE OUTCOME, NEVER FOR `networkidle`.
 *
 * The first version of this drive clicked, awaited `waitForLoadState('networkidle')`
 * and then read the ledger. It reported "scopes on file: NONE" for the
 * facilitation refuser, and the row was in the table two seconds later, written
 * at 16:54:39.103. `networkidle` resolved on a page that was already idle,
 * before the server action's own round trip had finished, so the drive accused
 * the product of losing a withdrawal it had recorded correctly.
 *
 * This POLLS, and the poll is bounded, so the check it feeds can still fail: a
 * scope the product never writes times out and the check goes red. What it
 * removes is the race, not the assertion.
 */
async function waitForLedgerScope(email, scope, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const { data } = await db
      .from('suppression_events')
      .select('scope')
      .eq('subject_email', email)
    if ((data ?? []).some(r => r.scope === scope)) return true
    if (Date.now() > deadline) return false
    await new Promise(resolve => setTimeout(resolve, 500))
  }
}

/** The consent ledger's own suppression rows. What the person was promised. */
async function ledgerSuppressions() {
  const { data, error } = await db
    .from('suppression_events')
    .select('subject_email, channel, scope, occurred_at')
    .in('subject_email', ALL)
  if (error) throw new Error(`could not read suppression_events: ${error.message}`)
  return data ?? []
}

async function runTheSweep() {
  const secret = process.env.CRON_SECRET ?? ''
  const res = await fetch(`${BASE}/api/cron/recovery-sweep`, {
    headers: { authorization: `Bearer ${secret}` },
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

let exitCode = 0
let browser = null

try {
  // ------------------------------------------------------------------ setup
  const secret = process.env.CRON_SECRET ?? ''
  check(
    'recoverystop.setup.a-cron-secret-is-present-so-the-route-can-be-driven',
    secret.length > 0,
    secret ? 'present' : 'MISSING: the sweep cannot be driven without it',
  )

  /*
   * ONLY THE TWO WHO WILL PRESS SOMETHING GET A CONSENT ROW, and that is a
   * correction rather than a saving. The bystander's job is to be an address
   * the recovery engine knows and the consent ledger has NEVER HEARD OF, which
   * is the stronger version of the test: the bridge must not invent a
   * suppression for somebody who has no record at all.
   *
   * It also stops the drive fighting its own limiter. `newsletter-subscribe` is
   * 5 per IP per 10 minutes (src/lib/rate-limit/policies.ts), and three signups
   * a run meant a second run inside the window was refused a 429 on the sixth.
   * That was the limiter working correctly and the drive accusing the product.
   */
  for (const email of [STOPPER, FACILITATION]) {
    const seeded = await seedConsent(email)
    check(
      `recoverystop.setup.${email.split('-').pop()}-has-a-real-consent-row`,
      seeded.ok,
      `HTTP ${seeded.status} for ${email}`,
    )
  }

  const { count: bystanderRecords } = await db
    .from('consent_events')
    .select('id', { count: 'exact', head: true })
    .eq('subject_email', BYSTANDER)
  check(
    'recoverystop.setup.the-bystander-is-unknown-to-the-consent-ledger',
    (bystanderRecords ?? 0) === 0,
    `${bystanderRecords ?? 0} consent event(s) on file for an address that has never been asked anything`,
  )

  const stopperRow = await tokenFor(STOPPER)
  const facilRow = await tokenFor(FACILITATION)
  check(
    'recoverystop.setup.both-rows-carry-an-unsubscribe-token-and-are-granted',
    Boolean(stopperRow?.unsubscribe_token && facilRow?.unsubscribe_token) &&
      stopperRow?.status === 'granted' &&
      facilRow?.status === 'granted',
    `stopper ${stopperRow?.status}, facilitation ${facilRow?.status}`,
  )
  if (!stopperRow?.unsubscribe_token || !facilRow?.unsubscribe_token) {
    throw new Error('no unsubscribe token was minted, so nothing below can be driven')
  }

  /*
   * ALL THREE BECOME KNOWN TO THE RECOVERY ENGINE. `recovery_contacts` is the
   * engine's own table and a row here is exactly what "this address is
   * mailable by the recovery sender" means: the engine mints one the first
   * time it writes to somebody. Inserted rather than driven through a real
   * abandoned checkout, because what is being proved is the SUPPRESSION
   * decision, and a checkout would add a slot ledger dependency without adding
   * anything to the proof.
   */
  const { error: contactError } = await db
    .from('recovery_contacts')
    .upsert(
      ALL.map(email => ({ source_system: SOURCE_SYSTEM, contact_email: email })),
      { onConflict: 'source_system,contact_email' },
    )
  check(
    'recoverystop.setup.all-three-are-mailable-by-the-recovery-sender',
    !contactError,
    contactError ? contactError.message : `${ALL.length} recovery_contacts rows for this lane`,
  )

  const before = await engineSuppressions()
  check(
    'recoverystop.setup.none-of-them-is-suppressed-yet',
    before.size === 0,
    `${before.size} engine suppression(s) for these addresses at the start`,
  )

  // ------------------------------------------------- the surface, three ways
  browser = await chromium.launch({ headless: true })

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: vp.viewport,
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
      deviceScaleFactor: vp.deviceScaleFactor,
    })
    const page = await context.newPage()
    const target = `${BASE}/marketing/preferences/${stopperRow.unsubscribe_token}`
    const res = await page.goto(target, { waitUntil: 'networkidle', timeout: 90_000 })
    await answerTheBanner(page).catch(() => {})

    check(
      `recoverystop.${vp.label}.the-preferences-surface-answers-200`,
      res?.status() === 200,
      `HTTP ${res?.status()} at ${target.replace(BASE, '')}`,
    )

    const stopEverything = page.getByRole('button', { name: 'Unsubscribe from everything' })
    const stopFacilitation = page.getByRole('button', { name: 'Stop using my details for other organisers' })
    const bothVisible = (await stopEverything.count()) === 1 && (await stopFacilitation.count()) === 1
    const box = bothVisible ? await stopEverything.boundingBox() : null
    check(
      `recoverystop.${vp.label}.both-stop-controls-are-present-and-reachable`,
      bothVisible && Boolean(box) && box.height >= 44,
      bothVisible ? `the "stop everything" control is ${Math.round(box?.height ?? 0)}px tall` : 'a stop control is missing',
    )

    await page.screenshot({ path: join(out, `${vp.label}-1-preferences.png`), fullPage: false })

    /*
     * ACCESSIBILITY ON THE SURFACE THIS ITEM DRIVES. The Definition of Done
     * asks for zero serious or critical violations on every surface, and this
     * one carries two destructive buttons and a record of somebody's own data.
     */
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    const bad = axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
    check(
      `recoverystop.${vp.label}.the-preferences-surface-has-no-serious-axe-violation`,
      bad.length === 0,
      bad.length === 0
        ? `0 serious or critical of ${axe.violations.length} total violation(s)`
        : bad.map(v => `${v.id} x${v.nodes.length}`).join(', '),
    )

    await context.close()
  }

  // --------------------------------------------- press the two real buttons
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const page = await context.newPage()

    await page.goto(`${BASE}/marketing/preferences/${stopperRow.unsubscribe_token}`, { waitUntil: 'networkidle' })
    await answerTheBanner(page).catch(() => {})
    await page.getByRole('button', { name: 'Unsubscribe from everything' }).click()
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: join(out, 'mobile-390-2-stopped-everything.png') })

    await page.goto(`${BASE}/marketing/preferences/${facilRow.unsubscribe_token}`, { waitUntil: 'networkidle' })
    await answerTheBanner(page).catch(() => {})
    await page.getByRole('button', { name: 'Stop using my details for other organisers' }).click()
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: join(out, 'mobile-390-3-stopped-facilitation.png') })

    await context.close()
  }

  const sawAllMarketing = await waitForLedgerScope(STOPPER, 'all_marketing')
  const sawFacilitation = await waitForLedgerScope(FACILITATION, 'facilitation_by_others')
  const ledger = await ledgerSuppressions()
  const stopperScopes = ledger.filter(r => r.subject_email === STOPPER).map(r => r.scope)
  const facilScopes = ledger.filter(r => r.subject_email === FACILITATION).map(r => r.scope)
  check(
    'recoverystop.the-ledger-recorded-an-all_marketing-stop',
    sawAllMarketing,
    `scopes on file for the stopper: ${stopperScopes.join(', ') || 'NONE'}`,
  )
  check(
    'recoverystop.the-ledger-recorded-a-facilitation_by_others-stop',
    sawFacilitation,
    `scopes on file for the facilitation refuser: ${facilScopes.join(', ') || 'NONE'}`,
  )
  check(
    'recoverystop.the-bystander-still-has-no-stop',
    ledger.filter(r => r.subject_email === BYSTANDER).length === 0,
    `${ledger.filter(r => r.subject_email === BYSTANDER).length} stop(s) on file for the bystander`,
  )

  /*
   * THE DEFECT ITSELF, MEASURED. Two people have just pressed unsubscribe and
   * been told in writing that it covers "every EventLinqs facilitated message
   * on every channel". On the tree before this fix, the abandoned-checkout
   * sender's own list stays empty for ever, so both keep being written to.
   */
  const afterPressing = await engineSuppressions()
  check(
    'recoverystop.THE-DEFECT-the-senders-own-list-still-does-not-know',
    afterPressing.size === 0,
    `${afterPressing.size} of 2 withdrawals had reached recovery_suppressions before the sweep ran; ` +
      'on the tree before this fix that number never changes',
  )

  // ------------------------------------------------------- the product runs
  const first = await runTheSweep()
  writeFileSync(join(out, 'sweep-response-1.json'), JSON.stringify(first, null, 2))
  check(
    'recoverystop.the-real-cron-route-runs-and-answers-200',
    first.status === 200,
    `HTTP ${first.status} from /api/cron/recovery-sweep`,
  )

  const afterSweep = await engineSuppressions()
  check(
    'recoverystop.the-all_marketing-stop-now-reaches-the-sender',
    afterSweep.get(STOPPER) === 'unsubscribed',
    `recovery_suppressions reason for the stopper: ${afterSweep.get(STOPPER) ?? 'STILL ABSENT'}`,
  )
  check(
    'recoverystop.the-facilitation-stop-reaches-the-sender-too',
    afterSweep.get(FACILITATION) === 'unsubscribed',
    `recovery_suppressions reason for the facilitation refuser: ${afterSweep.get(FACILITATION) ?? 'STILL ABSENT'}`,
  )
  check(
    'recoverystop.the-bystander-is-NOT-swept-up-by-any-of-it',
    !afterSweep.has(BYSTANDER),
    afterSweep.has(BYSTANDER)
      ? 'the bystander was suppressed and said nothing, which would be a worse defect than the one being fixed'
      : 'the bystander is still mailable, which is correct: they never asked to stop',
  )

  // ------------------------------------------------------------ idempotence
  const second = await runTheSweep()
  writeFileSync(join(out, 'sweep-response-2.json'), JSON.stringify(second, null, 2))
  const secondRows = await engineSuppressions()
  /*
   * `size === size` ALONE PASSES ON ZERO, which the red run proved: with the
   * reconciliation removed this read "0 after the second against 0 after the
   * first" and went green. A check that cannot fail is not a check, so it now
   * also requires that there was something to be idempotent about.
   */
  check(
    'recoverystop.a-second-run-changes-nothing',
    second.status === 200 && secondRows.size === afterSweep.size && secondRows.size === 2,
    `HTTP ${second.status}; ${secondRows.size} suppression(s) after the second run against ${afterSweep.size} after the first, of an expected 2`,
  )

  /*
   * THE REASON MATTERS. `sendingRates` counts `unsubscribed` and `complained`
   * on this table to decide whether the sequence is cut or stopped. A reason of
   * its own would have hidden every consent withdrawal from that brake.
   */
  /*
   * `.every()` IS TRUE OF AN EMPTY LIST. On the red tree this printed "reasons
   * written: none" and passed, which is the shape of a check that reports the
   * absence of the thing it is testing as success. It now requires both
   * reasons to be present and both to be the right one.
   */
  const reasons = [...afterSweep.values()]
  check(
    'recoverystop.the-reason-written-is-one-the-reversal-condition-counts',
    reasons.length === 2 && reasons.every(reason => reason === 'unsubscribed'),
    `reasons written: ${[...new Set(reasons)].join(', ') || 'none'} across ${reasons.length} row(s), of an expected 2`,
  )
} catch (err) {
  check('recoverystop.the-drive-ran-to-the-end', false, String(err && err.stack ? err.stack.split('\n')[0] : err))
  exitCode = 1
} finally {
  if (browser) await browser.close().catch(() => {})

  // ------------------------------------------------------------- teardown
  let removed = { contacts: 0, suppressions: 0, consents: 0 }
  try {
    const { count: c1 } = await db
      .from('recovery_suppressions')
      .delete({ count: 'exact' })
      .eq('source_system', SOURCE_SYSTEM)
      .in('contact_email', ALL)
    removed.suppressions = c1 ?? 0
    const { count: c2 } = await db
      .from('recovery_contacts')
      .delete({ count: 'exact' })
      .eq('source_system', SOURCE_SYSTEM)
      .in('contact_email', ALL)
    removed.contacts = c2 ?? 0
    const { count: c3 } = await db.from('marketing_consents').delete({ count: 'exact' }).in('email', ALL)
    removed.consents = c3 ?? 0
  } catch (err) {
    console.error(`teardown could not finish: ${err}`)
  }

  const { count: keptConsentEvents } = await db
    .from('consent_events')
    .select('id', { count: 'exact', head: true })
    .in('subject_email', ALL)
  const { count: keptSuppressionEvents } = await db
    .from('suppression_events')
    .select('id', { count: 'exact', head: true })
    .in('subject_email', ALL)

  const leftovers = await db
    .from('recovery_suppressions')
    .select('contact_email', { count: 'exact', head: true })
    .in('contact_email', ALL)

  check(
    'recoverystop.teardown.left-as-found',
    (leftovers.count ?? 0) === 0 && removed.consents > 0,
    `removed ${removed.suppressions} engine suppression(s), ${removed.contacts} contact(s), ` +
      `${removed.consents} of 2 consent row(s); KEPT by design ${keptConsentEvents ?? 0} consent_event(s) and ` +
      `${keptSuppressionEvents ?? 0} suppression_event(s), which refuse DELETE (GA1 v3, acceptance 13)`,
  )

  const passed = checks.filter(c => c.ok).length
  writeFileSync(
    join(out, 'drive.json'),
    JSON.stringify({ base: BASE, lane: LANE, passed, total: checks.length, checks }, null, 2),
  )
  console.log('')
  console.log(`${passed} of ${checks.length} checks passed`)
  if (failures.length > 0) {
    for (const f of failures) console.log(`  FAILED  ${f}`)
    exitCode = 1
  } else {
    console.log('PASS - an unsubscribe stops the abandoned-checkout reminder, and the list is read whole.')
  }
  process.exit(exitCode)
}
