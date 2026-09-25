/**
 * MONEY FIX, ACCEPTANCE LINE 8, ONE WIDTH. An event cannot be published for an
 * organiser without an enabled connected account.
 *
 * THE CONTROL IS THE PROOF. A Publish button that refuses proves nothing on its
 * own: a missing cover, a past end date, an absent venue and a tier with no
 * price all refuse too, and all of them look identical through a screenshot. So
 * this PUBLISHES FIRST with a charge-ready organiser, on the same build, at the
 * same width, and only then takes the connected account away and publishes
 * again. One fixture, one width, two states, and the only thing that changed
 * between them is the organiser's Stripe posture.
 *
 * WHY THE EVENT STATUS IS READ BACK OUT OF THE DATABASE. A refusal on screen is
 * a sentence; the fact that matters is whether the event went live. The proof
 * asserts the row, not the toast, because a page that says no while the row
 * says published is the defect, not the fix.
 *
 * TEST ONLY. Driven by money-publish-needs-an-account-drive.mjs, which owns the
 * server and the environment. Run that, not this.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { proofSession } from './lib/proof-session.mjs'

const TAG = '[a8-proof]'
const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? null : args[i + 1]
}

const OUT = (flag('out') ?? 'C:/dev/EVIDENCE/MONEY-A8/a8').replace(/\\/g, '/')
mkdirSync(OUT, { recursive: true })

const BASE = process.env.BASE
const VIEWPORT = process.env.JOURNEY_VIEWPORT ?? 'desktop-1440'
const SIZES = {
  'mobile-390': { width: 390, height: 844, isMobile: true },
  'tablet-768': { width: 768, height: 1024, isMobile: false },
  'desktop-1440': { width: 1440, height: 900, isMobile: false },
}
const size = SIZES[VIEWPORT]
if (!BASE) throw new Error(`${TAG} BASE is not set; run money-publish-needs-an-account-drive.mjs`)
if (!size) throw new Error(`${TAG} unknown viewport ${VIEWPORT}`)

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
if (!SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(`${TAG} the TEST Supabase credentials are not in the environment`)
}
if (/gndnldyfudbytbboxesk/.test(SUPABASE_URL)) {
  throw new Error(`${TAG} REFUSING: that is the PRODUCTION project. This proof writes fixtures.`)
}
const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const checks = []
const shots = {}
const check = (name, pass, detail) => {
  checks.push({ name, pass, detail })
  console.log(`${TAG} ${pass ? 'OK  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`)
}


/*
 * THE FIXTURE AND THE SIGN-IN BELONG TO THE DRIVE, NOT TO EACH WIDTH.
 *
 * The first version built a fresh organiser per viewport and signed in three
 * times in two minutes. Two widths passed and the third timed out on /login,
 * which is GoTrue's own per-IP limit doing its job and has nothing to do with
 * what this proves. proof-session.mjs records the same lesson for the same
 * reason. So the drive passes the fixture in and the session is cached on disk.
 */
const FIXTURE = JSON.parse(process.env.A8_FIXTURE ?? 'null')
if (!FIXTURE) throw new Error(`${TAG} A8_FIXTURE is not set; run money-publish-needs-an-account-drive.mjs`)

let browser = null
const fixture = FIXTURE
try {

  /** Put the event back in draft so there is something to publish. */
  const toDraft = async () => {
    const { error } = await db
      .from('events')
      .update({ status: 'draft', published_at: null })
      .eq('id', fixture.event.id)
    if (error) throw new Error(`could not put the event back in draft: ${error.message}`)
  }
  const statusOf = async () => {
    const { data } = await db.from('events').select('status').eq('id', fixture.event.id).maybeSingle()
    return data?.status ?? null
  }

  await toDraft()

  browser = await chromium.launch()
  const storageState = await proofSession(browser, BASE, fixture.ownerEmail, fixture.password)
  const context = await browser.newContext({
    storageState,
    viewport: { width: size.width, height: size.height },
    isMobile: size.isMobile,
    hasTouch: size.isMobile,
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()


  const shot = async (name) => {
    const path = join(OUT, `${VIEWPORT}-${name}.png`)
    const buffer = await page.screenshot({ path, fullPage: true })
    shots[name] = createHash('sha256').update(buffer).digest('hex')
  }

  /** The row for this event on the organiser's own events list. */
  const openList = async () => {
    await page.goto(`${BASE}/dashboard/events`, { waitUntil: 'load', timeout: 120_000 })
    const deadline = Date.now() + 60_000
    for (;;) {
      const text = await page.evaluate(() => document.body.innerText)
      if (text.includes(fixture.event.title)) return text
      if (Date.now() > deadline) return text
      await page.waitForTimeout(250)
    }
  }
  const publish = async () => {
    const row = page.locator('tr', { hasText: fixture.event.title }).first()
    const button = row.getByRole('button', { name: /^publish$/i })
    await button.click()
    // The action is a transition; wait for either the row to change or an error
    // to appear beside it, bounded.
    await page.waitForTimeout(4_000)
    return (await row.innerText()).replace(/\s+/g, ' ')
  }

  /** Set the date the cached Stripe posture was last verified. */
  const setVerifiedAt = async (iso) => {
    const { error } = await db
      .from('organisations')
      .update({ stripe_status_verified_at: iso })
      .eq('id', fixture.org.id)
    if (error) throw new Error(`could not set stripe_status_verified_at: ${error.message}`)
  }
  const verifiedAtNow = async () => {
    const { data } = await db
      .from('organisations')
      .select('stripe_status_verified_at')
      .eq('id', fixture.org.id)
      .maybeSingle()
    return data?.stripe_status_verified_at ?? null
  }

  /*
   * RESTORE THE STARTING STATE FIRST. Three widths share one organiser and each
   * one disconnects it; without this, the second width measures the first
   * width's wreckage and reports it as a product failure.
   */
  {
    const { error } = await db
      .from('organisations')
      .update(fixture.chargeReadyPosture)
      .eq('id', fixture.org.id)
    if (error) throw new Error(`could not restore the charge-ready posture: ${error.message}`)
  }

  /* ── THE CONTROL: enabled, and verified a minute ago, publishes ──────── */

  // buildFixture INSERTS the organisation row, so it has never been verified.
  // The control is an organiser whose account.updated webhooks are arriving,
  // which is the ordinary state of a working organiser, and that is what this
  // stamp represents. Without it the control would exercise the STALE leg
  // below, which is a different thing entirely.
  await setVerifiedAt(new Date(Date.now() - 60_000).toISOString())

  const listBefore = await openList()
  check(
    'the organiser dashboard rendered rather than a loading shell',
    listBefore.length > 200 && listBefore.includes(fixture.event.title),
    `${listBefore.length} characters, title ${listBefore.includes(fixture.event.title) ? 'present' : 'ABSENT'}`,
  )
  await shot('1-control-draft')
  const controlRow = await publish()
  check(
    'the control publish reported no error beside the row',
    !/could not|cannot|connect stripe|not found/i.test(controlRow),
    controlRow.slice(0, 160),
  )
  const controlStatus = await statusOf()
  await shot('2-control-published')
  check(
    'with an enabled connected account the event PUBLISHES, read back from the database',
    controlStatus === 'published',
    `events.status = ${controlStatus}`,
  )

  /* ── THE STALE CACHE: enabled, but nobody can date the verification ──── */

  /*
   * MONEY FIX A3 LAYER TWO, DRIVEN. Nothing about the organiser changes here
   * except the DATE on the cached posture. Before this rule the gate would have
   * granted the publish from the row exactly as it did for the control above.
   *
   * THIS LEG WAS FOUND BY ACCIDENT AND IS THE BEST THING IN THE PROOF. The
   * first run had no stamp on the fixture at all and the CONTROL failed with
   * "We could not check your Stripe status just now", which is the gate
   * refusing to believe an undated cache and failing closed when it cannot
   * reach Stripe. That is the rule working, so it is now asserted on purpose.
   *
   * THE ASSERTION ALLOWS BOTH HONEST OUTCOMES, because whether Stripe is
   * reachable from this drive is not the subject. Either the gate reached
   * Stripe and the stamp MOVED FORWARD, or it tried and could not and said so.
   * What must never happen is a publish granted from the stale row in silence.
   */
  await toDraft()
  const staleAt = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString()
  await setVerifiedAt(staleAt)
  await openList()
  const staleRow = await publish()
  const staleStatus = await statusOf()
  const staleVerifiedAfter = await verifiedAtNow()
  await shot('3-stale-cache')

  const wentToStripe = staleVerifiedAfter !== staleAt
  const saidItCouldNotCheck = /could not check your Stripe status/i.test(staleRow)
  check(
    'a cached posture nobody can date is NOT believed: the gate went to Stripe, or said it could not',
    wentToStripe || saidItCouldNotCheck,
    `status=${staleStatus} stampMoved=${wentToStripe} saidCouldNotCheck=${saidItCouldNotCheck}`,
  )
  check(
    'and it never publishes silently on the stale row',
    !(staleStatus === 'published' && !wentToStripe),
    `status=${staleStatus} stampMoved=${wentToStripe}`,
  )

  /* ── THE CHANGE: one organiser loses the connected account ───────────── */

  await toDraft()
  const { error: stripErr } = await db
    .from('organisations')
    .update({
      stripe_account_id: null,
      stripe_onboarding_complete: false,
      stripe_charges_enabled: false,
      stripe_payouts_enabled: false,
      stripe_account_country: null,
      stripe_capabilities: {},
      stripe_requirements: {},
      payout_destination: null,
      payout_status: 'unset',
      stripe_status_verified_at: null,
    })
    .eq('id', fixture.org.id)
  if (stripErr) throw new Error(`could not remove the connected account: ${stripErr.message}`)

  const { data: after } = await db
    .from('organisations')
    .select('stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, payout_status, stripe_status_verified_at')
    .eq('id', fixture.org.id)
    .maybeSingle()
  check(
    'the organisation now genuinely has no connected account, read back from the database',
    after != null && after.stripe_account_id === null && after.stripe_payouts_enabled === false,
    `stripe_account_id=${JSON.stringify(after?.stripe_account_id)} payouts=${after?.stripe_payouts_enabled} verified_at=${JSON.stringify(after?.stripe_status_verified_at)}`,
  )

  await openList()
  await shot('4-refused-draft')
  const refusedRow = await publish()
  const refusedStatus = await statusOf()
  await shot('5-refused')

  check(
    'with no connected account the event does NOT publish, read back from the database',
    refusedStatus === 'draft',
    `events.status = ${refusedStatus}`,
  )
  check(
    'the organiser is told to connect Stripe rather than given a generic error',
    /connect stripe/i.test(refusedRow),
    refusedRow.slice(0, 200),
  )
  check(
    'the refusal does not blame a failed check or promise that waiting helps',
    !/could not check/i.test(refusedRow) && !/try again shortly/i.test(refusedRow),
    refusedRow.slice(0, 200),
  )
  check(
    'the control and the refusal are not the same picture',
    shots['2-control-published'] !== shots['5-refused'],
    `${(shots['2-control-published'] ?? '').slice(0, 8)} vs ${(shots['5-refused'] ?? '').slice(0, 8)}`,
  )
} finally {
  if (browser) await browser.close()
}

const failed = checks.filter((c) => !c.pass)
writeFileSync(
  join(OUT, `${VIEWPORT}-report.json`),
  JSON.stringify({ viewport: VIEWPORT, base: BASE, checks, shots }, null, 1),
)
console.log(`${TAG} ${checks.length - failed.length} of ${checks.length} checks passed at ${VIEWPORT}`)
process.exit(failed.length > 0 ? 1 : 0)
