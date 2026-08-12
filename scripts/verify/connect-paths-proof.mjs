/**
 * The three evidence gaps the roast ledger exposed, closed in a real browser.
 *
 *   A. The payouts HISTORY TABLE was one of the two client leaks found on this
 *      branch: the server route learned `?org=`, the table never sent it, so the
 *      first filter or page click silently swapped in the caller's FIRST business's
 *      payout history under the second business's heading. The fix is asserted here
 *      by watching the actual outgoing request, not by reading the source.
 *
 *   B. RECONCILE ON RETURN FROM ONBOARDING. One of the four reconcile triggers. The
 *      route is driven with a genuinely stranded row and must both correct it and
 *      carry the business through in the redirect, because a person with several
 *      businesses who lands on the wrong one after onboarding is told a healthy
 *      story about the wrong company.
 *
 *   C. CONNECTING A SEPARATE STRIPE ACCOUNT TO A SECOND BUSINESS. The hosted Stripe
 *      onboarding form itself is Stripe's UI and cannot be completed headlessly, so
 *      what is proven here is the part that belongs to EventLinqs: pressing connect
 *      on a business with no account mints a NEW account for THAT business and
 *      attaches it to that row alone.
 *
 * Usage:
 *   PROOF_EMAIL=... PROOF_PASSWORD=... BASE_URL=http://localhost:3111 \
 *     node scripts/verify/connect-paths-proof.mjs
 */
import fs from 'node:fs'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { proofSession } from './lib/proof-session.mjs'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

// The inline refusal below catches the one known production ref. The shared
// preflight also refuses when it CANNOT TELL which project it has, which the
// inline check passes silently, so both stay.
assertNotProduction()

const PRODUCTION_PROJECT = 'gndnldyfudbytbboxesk'
const BASE = process.env.BASE_URL ?? 'http://localhost:3111'
const OUT = 'docs/security/evidence/connect-lockout-2026-08-09'

const email = process.env.PROOF_EMAIL
const password = process.env.PROOF_PASSWORD
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
if (!email || !password || !url || url.includes(PRODUCTION_PROJECT)) {
  console.error('TEST project only, and PROOF_EMAIL / PROOF_PASSWORD must be set.')
  process.exit(1)
}

const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
fs.mkdirSync(OUT, { recursive: true })

const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n        ${detail}` : ''}`)
}

const { data: owner } = await db.from('profiles').select('id').eq('email', email).maybeSingle()
const { data: orgs } = await db
  .from('organisations')
  .select('id, name, slug, stripe_account_id')
  .eq('owner_id', owner.id)
  .order('created_at', { ascending: true })
const A = orgs.find((o) => o.slug === 'proof-harbour-nights')
const B = orgs.find((o) => o.slug === 'proof-northside-comedy')

const browser = await chromium.launch()
const session = await proofSession(browser, BASE, email, password)
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, storageState: session })
const page = await context.newPage()

// ── A. the payouts history table must name its own business ──────────────────
{
  // The table only renders on the fully onboarded view, so make sure the row agrees
  // with Stripe first.
  await db
    .from('organisations')
    .update({
      payout_status: 'active',
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
      stripe_onboarding_complete: true,
    })
    .in('id', [A.id, B.id])

  const calls = []
  page.on('request', (r) => {
    if (r.url().includes('/api/payouts/list')) calls.push(r.url())
  })

  await page.goto(`${BASE}/dashboard/payouts?org=${B.id}`, { waitUntil: 'networkidle' })

  // Touch the status filter. This is the exact interaction that used to swap the
  // business out from under the heading: the table refetches, and before the fix
  // that refetch went out with no organisation named.
  const filter = page.locator('#payouts-status-filter')
  await filter.waitFor({ state: 'visible', timeout: 30_000 })
  await filter.selectOption('paid')
  await page.waitForTimeout(3000)

  record(
    'filtering the payout history keeps the business it is showing',
    calls.length > 0 && calls.every((u) => u.includes(`org=${B.id}`)),
    calls.length
      ? calls.map((u) => u.replace(BASE, '')).join('\n        ')
      : 'no /api/payouts/list request captured (filter control not rendered)',
  )
  record(
    'and never silently requests the FIRST business instead',
    !calls.some((u) => u.includes(`org=${A.id}`)),
    `business A is ${A.id}`,
  )
}

// ── B. reconcile on return from Stripe onboarding ────────────────────────────
{
  // Strand business B for real, then come back from Stripe the way an organiser does.
  await db
    .from('organisations')
    .update({
      payout_status: 'restricted',
      stripe_charges_enabled: false,
      stripe_payouts_enabled: false,
      stripe_onboarding_complete: false,
    })
    .eq('id', B.id)

  const before = await db
    .from('organisations')
    .select('payout_status')
    .eq('id', B.id)
    .maybeSingle()

  await page.goto(`${BASE}/api/stripe/connect/return?org=${B.id}`, { waitUntil: 'networkidle' })
  const landed = page.url()

  const { data: after } = await db
    .from('organisations')
    .select('payout_status, stripe_charges_enabled, stripe_payouts_enabled')
    .eq('id', B.id)
    .maybeSingle()

  record(
    'returning from Stripe onboarding reconciles the row by itself',
    before.data.payout_status === 'restricted' && after.payout_status === 'active',
    `payout_status ${before.data.payout_status} -> ${after.payout_status}, ` +
      `charges ${after.stripe_charges_enabled}, payouts ${after.stripe_payouts_enabled}`,
  )
  record(
    'and the redirect carries the business, so it cannot land on the wrong one',
    landed.includes(`org=${B.id}`),
    landed.replace(BASE, ''),
  )

  // Somebody else's organisation must not be reconcilable through this route.
  const { data: foreign } = await db
    .from('organisations')
    .select('id')
    .neq('owner_id', owner.id)
    .limit(1)
    .maybeSingle()
  if (foreign) {
    await page.goto(`${BASE}/api/stripe/connect/return?org=${foreign.id}`, { waitUntil: 'networkidle' })
    record(
      "the return route refuses somebody else's business",
      page.url().includes('status=not_found'),
      page.url().replace(BASE, ''),
    )
  }
}

// ── C. connecting a SEPARATE Stripe account to a second business ─────────────
{
  const slug = `proof-connect-${Date.now().toString(36)}`
  const { data: fresh } = await db
    .from('organisations')
    .insert({ name: 'Connect Proof Business', slug, owner_id: owner.id, status: 'active', email })
    .select('id')
    .single()
  await db
    .from('organisation_members')
    .upsert({ organisation_id: fresh.id, user_id: owner.id, role: 'owner' }, { onConflict: 'organisation_id,user_id' })

  const res = await page.request.post(`${BASE}/api/stripe/connect/onboard`, {
    data: { organisationId: fresh.id, country: 'AU' },
  })
  const body = await res.json().catch(() => ({}))

  const { data: connected } = await db
    .from('organisations')
    .select('stripe_account_id')
    .eq('id', fresh.id)
    .maybeSingle()

  record(
    'pressing connect on a THIRD business mints a NEW Stripe account for it',
    res.ok() && Boolean(connected?.stripe_account_id),
    `HTTP ${res.status()}, account ${connected?.stripe_account_id ?? 'none'}, ` +
      `onboarding link ${body.url ? 'returned' : 'absent'}`,
  )
  record(
    'and that account is its own, not either of the existing businesses',
    connected?.stripe_account_id !== A.stripe_account_id &&
      connected?.stripe_account_id !== B.stripe_account_id,
    `A=${A.stripe_account_id} B=${B.stripe_account_id} new=${connected?.stripe_account_id}`,
  )

  // The Stripe account must be stamped with the business it belongs to, or a
  // support question about "which business is this account" has no answer.
  if (connected?.stripe_account_id) {
    const acct = await stripe.accounts.retrieve(connected.stripe_account_id)
    record(
      'the Stripe account records which business it belongs to',
      acct.metadata?.organisation_id === fresh.id,
      `metadata.organisation_id=${acct.metadata?.organisation_id}`,
    )
  }

  // Another owner must not be able to start onboarding for a business that is not
  // theirs, or the whole per-business separation is decorative.
  const { data: foreign } = await db
    .from('organisations')
    .select('id')
    .neq('owner_id', owner.id)
    .limit(1)
    .maybeSingle()
  if (foreign) {
    const denied = await page.request.post(`${BASE}/api/stripe/connect/onboard`, {
      data: { organisationId: foreign.id, country: 'AU' },
    })
    record(
      "onboarding refuses somebody else's business",
      denied.status() === 403 || denied.status() === 404,
      `HTTP ${denied.status()}`,
    )
  }

  await db.from('organisation_members').delete().eq('organisation_id', fresh.id)
  await db.from('organisations').delete().eq('id', fresh.id)
}

await browser.close()

fs.writeFileSync(`${OUT}/connect-paths-proof.json`, JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log('')
console.log(`${results.length - failed.length}/${results.length} checks passed.`)
process.exit(failed.length === 0 ? 0 : 1)
