/**
 * LB-LEDGERDATE DRIVEN PROOF. The consent ledger renders the day it happened in
 * Australia, on the page a person actually opens, at 390, 768 and 1440.
 *
 * WHAT MAKES THIS DRIVE HONEST, and it is the whole design of it.
 *
 * The defect only shows when the UTC calendar date and the Australian calendar
 * date DIFFER. That is true for fourteen hours of every day, so a drive that
 * simply captures consent "now" would pass or fail depending on the hour it was
 * run, and would prove nothing when run in the morning. The bug was in fact
 * found at 07:20 local, where they do differ, which is luck rather than method.
 *
 * So this drive does not depend on the clock. It writes consent events at
 * CHOSEN instants, each one picked so the two calendars disagree, and one
 * control instant where they agree:
 *
 *   2026-09-18T21:20:02Z   19 Sep in Sydney, 18 Sep in UTC   (AEST, UTC+10)
 *                          the exact instant LB-ONECLICK pressed one-click
 *   2026-03-15T14:30:00Z   16 Mar in Sydney, 15 Mar in UTC   (AEDT, UTC+11)
 *                          a fixed +10 offset would still be wrong here
 *   2026-12-31T13:05:00Z    1 Jan 2027 in Sydney, 31 Dec 2026 in UTC
 *                          the year rolls over, not just the day
 *   2026-09-19T01:00:00Z   19 Sep in both                    (the control)
 *
 * For each, the page must print the Australian date and must NOT print the UTC
 * one. The control is what catches a "fix" that shifts every date by a day.
 *
 * WHY IT WRITES THE LEDGER DIRECTLY rather than through a product surface. The
 * consent ledger is append-only and refuses UPDATE by design (GA1 v3), and the
 * capture endpoints stamp `occurred_at` with now(). An instant cannot be chosen
 * through the product, so it is inserted with the service role, tagged lane-b,
 * and the rows are reported at the end rather than deleted, because the ledger
 * refuses DELETE as well.
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   BASE=http://localhost:3100 node --env-file=.env.local \
 *     --import ./scripts/lib/src-alias-loader.mjs \
 *     scripts/verify/lb-ledgerdate-drive.mjs --out C:/dev/EVIDENCE/LB-LEDGERDATE
 *
 * Start the server first: node scripts/dev/lane-b-serve-with-stripe.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { chromium, BASE } from '../journeys/harness.mjs'
import { PLATFORM_TIME_ZONE } from '../../src/lib/dates/event-time.ts'
import { answerTheCookieBanner as answerTheBanner } from './lib/cookie-banner.mjs'

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
out = join(out, 'drive')
mkdirSync(out, { recursive: true })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`FAIL: this drive only runs against TEST vkapkibzokmfaxqogypq, not ${url}`)
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

/** Independently computed, zone-pinned, so the expectation is not the code under test. */
function dateIn(zone, iso) {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: zone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso))
}

const STAMP = Date.now().toString(36)
const LANE = `lane-b-ledgerdate-${STAMP}`
const EMAIL = `${LANE}@example.com`
const TOKEN = randomUUID()

const INSTANTS = [
  { iso: '2026-09-18T21:20:02Z', why: 'AEST, UTC+10: the instant LB-ONECLICK pressed one-click' },
  { iso: '2026-03-15T14:30:00Z', why: 'AEDT, UTC+11: a fixed +10 offset would still be wrong' },
  { iso: '2026-12-31T13:05:00Z', why: 'the YEAR rolls over, not only the day' },
  { iso: '2026-09-19T01:00:00Z', why: 'THE CONTROL: the same calendar day in both zones' },
]

let browser = null

try {
  // ------------------------------------------------------------------ setup
  const { data: tenant, error: tenantError } = await db
    .from('marketing_tenants')
    .select('id')
    .limit(1)
    .maybeSingle()
  if (tenantError || !tenant) throw new Error(`no marketing tenant to write against: ${tenantError?.message}`)

  const { data: purpose } = await db
    .from('consent_purposes')
    .select('purpose')
    .eq('purpose', 'platform_local_digest')
    .maybeSingle()
  if (!purpose) throw new Error('the platform_local_digest purpose is not registered on TEST')

  // The token the page is opened with has to resolve to this address, and that
  // lookup is against marketing_consents, so the current-state row is written
  // as well as the events.
  const { error: consentError } = await db.from('marketing_consents').insert({
    email: EMAIL,
    status: 'granted',
    unsubscribe_token: TOKEN,
    city_slug: 'geelong',
    consent_text: 'Keep me posted about events near me.',
    consent_version: 'v1',
  })
  check('ledgerdate.setup.a-lane-b-subject-exists-with-a-token', !consentError, consentError?.message ?? `${EMAIL}`)

  const rows = INSTANTS.map((i) => ({
    tenant_id: tenant.id,
    subject_email: EMAIL,
    purpose: 'platform_local_digest',
    channel_scope: 'email',
    decision: 'granted',
    wording: 'Keep me posted about events near me.',
    wording_version: 'v1',
    capture_surface: 'city-newsletter-panel',
    third_party_scope: 'other_organisers',
    suppression_scope: 'all_marketing',
    city_slug: 'geelong',
    occurred_at: i.iso,
  }))
  const { error: eventsError } = await db.from('consent_events').insert(rows)
  check(
    'ledgerdate.setup.four-consent-events-written-at-chosen-instants',
    !eventsError,
    eventsError?.message ?? INSTANTS.map((i) => i.iso).join(', '),
  )
  if (eventsError) throw new Error('nothing below can be driven without the events')

  // The expectation, computed here rather than taken from the page.
  for (const i of INSTANTS) {
    i.australian = dateIn(PLATFORM_TIME_ZONE, i.iso)
    i.utc = dateIn('UTC', i.iso)
  }
  const differing = INSTANTS.filter((i) => i.australian !== i.utc)
  const control = INSTANTS.filter((i) => i.australian === i.utc)
  check(
    'ledgerdate.setup.three-instants-genuinely-disagree-between-the-two-calendars',
    differing.length === 3 && control.length === 1,
    `${differing.length} differing, ${control.length} control: ` +
      INSTANTS.map((i) => `${i.iso} -> AU ${i.australian} / UTC ${i.utc}`).join(' | '),
  )

  // ------------------------------------------- the page, at all three widths
  browser = await chromium.launch()
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext(vp)
    const page = await context.newPage()
    await page.goto(`${BASE}/marketing/preferences/${TOKEN}`, { waitUntil: 'domcontentloaded' })
    await answerTheBanner(page, { answer: 'decline' })
    await page.waitForLoadState('networkidle').catch(() => {})

    const body = await page.locator('body').innerText()

    for (const i of INSTANTS) {
      const isControl = i.australian === i.utc
      check(
        `ledgerdate.${vp.label}.shows-the-australian-date-for-${i.iso}`,
        body.includes(i.australian),
        `expected "${i.australian}" (${i.why})`,
      )
      if (!isControl) {
        check(
          `ledgerdate.${vp.label}.does-not-show-the-utc-date-for-${i.iso}`,
          !body.includes(i.utc),
          `must not print "${i.utc}", which is what the UTC getters produced`,
        )
      }
    }

    // The page is reached from an email, most often on a phone.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    check(`ledgerdate.${vp.label}.no-horizontal-overflow`, overflow <= 1, `${overflow}px of overflow`)

    await page.screenshot({ path: join(out, `ledger-dates-${vp.label}.png`), fullPage: true })
    await context.close()
  }
} catch (err) {
  failures.push(`the drive threw: ${err.message}`)
  console.error(`FAIL  the drive threw: ${err.stack ?? err.message}`)
} finally {
  if (browser) await browser.close().catch(() => {})
  try {
    await db.from('marketing_consents').delete().eq('email', EMAIL)
    const { data: left } = await db.from('consent_events').select('id').eq('subject_email', EMAIL)
    console.log(
      `\nTEST left as found, except what the ledger refuses to forget: the marketing_consents row ` +
        `for ${EMAIL} is deleted, and ${left?.length ?? 0} consent_events row(s) remain because the ` +
        'ledger refuses DELETE by design (GA1 v3).',
    )
  } catch (err) {
    console.log(`could not report or clean the lane-b rows: ${err.message}`)
  }
}

const passed = checks.filter((c) => c.ok).length
writeFileSync(
  join(out, 'report.json'),
  JSON.stringify({ base: BASE, lane: LANE, zone: PLATFORM_TIME_ZONE, passed, total: checks.length, checks, failures }, null, 2),
)
console.log(`\n${passed} of ${checks.length} checks passed`)
if (failures.length > 0) {
  console.error('\nFAILURES:')
  for (const f of failures) console.error(`  ${f}`)
  process.exit(1)
}
process.exit(0)
