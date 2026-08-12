/**
 * THE BROWSER PROOF. Green tests are not evidence.
 *
 * An organiser stranded exactly as the founder was must recover entirely in the
 * browser, with no founder and no SQL. This script drives a real browser against a
 * real server against the real TEST database and the real Stripe test API, at 1440
 * and 390, and captures what a person actually sees.
 *
 * WHAT IS DELIBERATELY BROKEN BEFORE IT RUNS. scripts/verify/multi-org-fixture.mjs
 * --strand writes the founder's exact row: payout_status 'restricted',
 * stripe_charges_enabled false, stripe_payouts_enabled false,
 * stripe_onboarding_complete false, against a Stripe account that is fully enabled.
 * If the reproduction is not divergent when this starts, the script refuses to run,
 * because a recovery screenshot of something that was never broken proves nothing.
 *
 * Usage:
 *   PROOF_EMAIL=... PROOF_PASSWORD=... BASE_URL=http://localhost:3111 \
 *     node --env-file=.env.test scripts/verify/connect-recovery-proof.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const PRODUCTION_PROJECT = 'gndnldyfudbytbboxesk'
const BASE = process.env.BASE_URL ?? 'http://localhost:3111'
const OUT = 'docs/security/evidence/connect-lockout-2026-08-09'

const email = process.env.PROOF_EMAIL
const password = process.env.PROOF_PASSWORD
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!email || !password) {
  console.error('Set PROOF_EMAIL and PROOF_PASSWORD in the environment.')
  process.exit(1)
}
if (!url || url.includes(PRODUCTION_PROJECT)) {
  console.error('REFUSING: TEST project only.')
  process.exit(1)
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } })
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

fs.mkdirSync(OUT, { recursive: true })

const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n        ${detail}` : ''}`)
}

async function rows() {
  const { data } = await db
    .from('organisations')
    .select('id, name, slug, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_onboarding_complete, payout_status')
    .in('slug', ['proof-harbour-nights', 'proof-northside-comedy'])
  const byslug = {}
  for (const r of data ?? []) byslug[r.slug] = r
  return byslug
}

const before = await rows()
const A = before['proof-harbour-nights']
const B = before['proof-northside-comedy']
if (!A || !B) {
  console.error('Fixture missing. Run scripts/verify/multi-org-fixture.mjs first.')
  process.exit(1)
}

// The reproduction must actually be broken, or the proof is theatre.
const stripeA = await stripe.accounts.retrieve(A.stripe_account_id)
if (A.payout_status !== 'restricted' || A.stripe_payouts_enabled || !stripeA.payouts_enabled) {
  console.error('REFUSING: business A is not in the stranded state.')
  console.error(
    `  platform payout_status=${A.payout_status} payouts_enabled=${A.stripe_payouts_enabled}; Stripe payouts_enabled=${stripeA.payouts_enabled}`,
  )
  console.error('  Run: node --env-file=.env.test scripts/verify/multi-org-fixture.mjs --strand proof-harbour-nights')
  process.exit(1)
}
record(
  'reproduction is genuinely stranded before the browser opens',
  true,
  `platform: payout_status=${A.payout_status}, charges=${A.stripe_charges_enabled}, payouts=${A.stripe_payouts_enabled} | Stripe: charges=${stripeA.charges_enabled}, payouts=${stripeA.payouts_enabled}`,
)

const browser = await chromium.launch()

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: file, fullPage: false })
  return file
}

/**
 * Sign in ONCE and reuse the session across both viewports.
 *
 * Logging in per viewport burns the auth-login allowance (10 per IP per 10 minutes,
 * src/lib/rate-limit/policies.ts) and makes the second capture flaky for a reason
 * that has nothing to do with what is being proven.
 */
async function signInOnce() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.getByLabel(/email/i).first().fill(email)
  await page.getByLabel(/password/i).first().fill(password)
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45_000 }),
    page.getByRole('button', { name: /sign in|log in/i }).first().click(),
  ])
  const state = await context.storageState()
  await context.close()
  return state
}

const session = await signInOnce()
record('the proof organiser can sign in', true, email)

// ── 1440: the recovery ───────────────────────────────────────────────────────
{
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    storageState: session,
  })
  const page = await context.newPage()

  await page.goto(`${BASE}/dashboard/payouts?org=${A.id}`, { waitUntil: 'networkidle' })

  const switcherVisible = await page.getByRole('navigation', { name: /switch business/i }).isVisible()
  record(
    'the switcher renders for an owner of two businesses',
    switcherVisible,
    'nav[aria-label="Switch business"] on /dashboard/payouts',
  )

  const bothNamed =
    (await page.getByRole('button', { name: new RegExp(A.name, 'i') }).count()) > 0 &&
    (await page.getByRole('button', { name: new RegExp(B.name, 'i') }).count()) > 0
  record('both businesses are named in the switcher', bothNamed)

  const refreshControl = page.getByRole('button', { name: /refresh stripe status/i })
  const controlVisible = await refreshControl.isVisible()
  record('the Refresh Stripe status control is on the stranded screen', controlVisible)

  const beforeShot = await shot(page, 'payouts-1440-stranded-before')
  console.log(`        ${beforeShot}`)

  await refreshControl.click()
  await page.getByRole('status').waitFor({ state: 'visible', timeout: 30_000 })
  const message = (await page.getByRole('status').first().innerText()).trim()
  record(
    'pressing it reports a correction rather than a Stripe problem',
    /corrected|up to date|can publish/i.test(message),
    JSON.stringify(message),
  )

  // The database is the verdict, not the toast.
  const afterA = (await rows())['proof-harbour-nights']
  const recovered =
    afterA.payout_status === 'active' &&
    afterA.stripe_charges_enabled === true &&
    afterA.stripe_payouts_enabled === true
  record(
    'the DATABASE moved: restricted -> active, with no SQL and no founder',
    recovered,
    `payout_status=${afterA.payout_status}, charges=${afterA.stripe_charges_enabled}, payouts=${afterA.stripe_payouts_enabled}`,
  )

  await page.waitForTimeout(1500)
  await page.goto(`${BASE}/dashboard/payouts?org=${A.id}`, { waitUntil: 'networkidle' })
  const afterShot = await shot(page, 'payouts-1440-recovered-after')
  console.log(`        ${afterShot}`)

  // ── the second business must be untouched by the first's recovery ──────────
  const beforeB = before['proof-northside-comedy']
  const afterB = (await rows())['proof-northside-comedy']
  record(
    "recovering business A changed NOTHING on business B's row",
    JSON.stringify(beforeB) === JSON.stringify(afterB),
    `B payout_status ${beforeB.payout_status} -> ${afterB.payout_status}`,
  )

  // ── switching must not leak one business's state onto the other ────────────
  const apiCalls = []
  page.on('request', (r) => {
    if (r.url().includes('/api/payouts/')) apiCalls.push(r.url())
  })

  // Wait for B's id specifically. `/org=/` matches the URL the page is ALREADY on,
  // so it returns before the switch has happened and the assertion reads the old
  // page. That is a test bug that reports a product failure, which is worse than no
  // test at all.
  await page.getByRole('button', { name: new RegExp(B.name, 'i') }).first().click()
  await page.waitForURL((u) => u.searchParams.get('org') === B.id, { timeout: 20_000 })
  await page.waitForLoadState('networkidle')
  const switchedUrl = page.url()
  record(
    'switching puts the chosen business in the URL, so a tab is pinned to it',
    switchedUrl.includes(B.id),
    switchedUrl,
  )

  // And it is remembered, so the sidebar does not drop them back onto business A.
  const cookies = await context.cookies()
  const remembered = cookies.find((c) => c.name === 'el_active_org')
  record(
    'the switch is remembered, so the rest of the dashboard follows',
    remembered?.value === B.id,
    `el_active_org=${remembered?.value ?? 'not set'} httpOnly=${remembered?.httpOnly}`,
  )

  await page.goto(`${BASE}/dashboard/events`, { waitUntil: 'networkidle' })
  const eventsText = await page.locator('body').innerText()
  record(
    'a DIFFERENT dashboard page follows the switch instead of showing business A',
    !eventsText.includes('Set up your organisation first'),
    'events list resolved an organisation rather than claiming there is none',
  )
  await page.goto(`${BASE}/dashboard/payouts`, { waitUntil: 'networkidle' })
  const followed = await page.locator('body').innerText()
  record(
    'payouts with NO ?org= follows the remembered business, not the first',
    followed.includes(B.name),
    `page names ${B.name}`,
  )
  await page.goto(`${BASE}/dashboard/payouts?org=${B.id}`, { waitUntil: 'networkidle' })

  const heading = await page.locator('main, body').first().innerText()
  record(
    "the page now names business B and not business A",
    heading.includes(B.name) && !heading.includes(`for ${A.name}`),
    `contains "${B.name}"`,
  )

  // The Stripe dashboard link is the sharpest leak: it mints an authenticated
  // session into a Stripe account. It must name the business being viewed.
  const dashButton = page.getByRole('button', { name: /open stripe dashboard/i })
  if (await dashButton.isVisible()) {
    await dashButton.click().catch(() => {})
    await page.waitForTimeout(2500)
  }
  const linkCall = apiCalls.find((u) => u.includes('/api/payouts/stripe-dashboard-link'))
  record(
    'the Stripe dashboard link names business B, not the first business',
    Boolean(linkCall && linkCall.includes(B.id)),
    linkCall ?? 'no call captured (button not shown on this state)',
  )

  const switchShot = await shot(page, 'payouts-1440-switched-to-b')
  console.log(`        ${switchShot}`)

  await context.close()
}

// ── 390: the same recovery, on a phone ───────────────────────────────────────
{
  // Strand it again so the mobile capture is of a real stranded screen rather
  // than of an already-healed one.
  await db
    .from('organisations')
    .update({
      payout_status: 'restricted',
      stripe_charges_enabled: false,
      stripe_payouts_enabled: false,
      stripe_onboarding_complete: false,
    })
    .eq('id', A.id)

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    storageState: session,
  })
  const page = await context.newPage()
  await page.goto(`${BASE}/dashboard/payouts?org=${A.id}`, { waitUntil: 'networkidle' })

  const beforeShot = await shot(page, 'payouts-390-stranded-before')
  console.log(`        ${beforeShot}`)

  const control = page.getByRole('button', { name: /refresh stripe status/i })
  const box = await control.boundingBox()
  record(
    'the control meets the 44px touch target at 390',
    Boolean(box && box.height >= 44),
    box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'not found',
  )

  // Nothing may scroll the page sideways on a phone.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  record('no horizontal overflow at 390', overflow <= 0, `scrollWidth - clientWidth = ${overflow}`)

  await control.click()
  await page.getByRole('status').waitFor({ state: 'visible', timeout: 30_000 })
  const message = (await page.getByRole('status').first().innerText()).trim()
  const afterA = (await rows())['proof-harbour-nights']
  record(
    'the same recovery works on a phone, with no SQL and no founder',
    afterA.payout_status === 'active' && afterA.stripe_payouts_enabled === true,
    `${JSON.stringify(message)} | payout_status=${afterA.payout_status}`,
  )

  await page.waitForTimeout(1500)
  await page.goto(`${BASE}/dashboard/payouts?org=${A.id}`, { waitUntil: 'networkidle' })
  const afterShot = await shot(page, 'payouts-390-recovered-after')
  console.log(`        ${afterShot}`)

  await context.close()
}

await browser.close()

const failed = results.filter((r) => !r.ok)
console.log('')
console.log(`${results.length - failed.length}/${results.length} checks passed.`)
fs.writeFileSync(path.join(OUT, 'browser-proof.json'), JSON.stringify(results, null, 2))
process.exit(failed.length === 0 ? 0 : 1)
