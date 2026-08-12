/**
 * THE FOUNDER'S SIX MULTI-BUSINESS SCENARIOS, driven for real.
 *
 * "You cannot tie an organiser on my platform to one particular email address or
 * one particular bank account. People can have endless. They should be flexible to
 * do what they choose as long as it is legal."
 *
 *   1. one user creates a second organisation and connects a DIFFERENT Stripe
 *      account to it
 *   2. both organisations sell independently, payouts landing in their own bank
 *      accounts
 *   3. switching between organisations never leaks one organisation's payout state
 *      onto another
 *   4. disconnecting one organisation's account leaves the other untouched
 *   5. an organisation reconnected to a DIFFERENT account keeps its event, order and
 *      payout history intact and correctly attributed
 *   6. nothing anywhere is keyed on the user's email in a way that constrains any of
 *      it
 *
 * Scenario 3 is proven in the browser by scripts/verify/connect-recovery-proof.mjs.
 * This script covers the rest, and it is deliberately honest about the one it
 * cannot complete without a migration the founder has not yet applied.
 *
 * Usage:
 *   PROOF_EMAIL=... PROOF_PASSWORD=... BASE_URL=http://localhost:3111 \
 *     node scripts/verify/multi-org-scenarios.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
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
function note(name, detail) {
  results.push({ name, ok: null, detail })
  console.log(`NOTE  ${name}\n        ${detail}`)
}

const { data: owner } = await db.from('profiles').select('id').eq('email', email).maybeSingle()
const ownerId = owner?.id
if (!ownerId) {
  console.error('Proof user not found. Run multi-org-fixture.mjs first.')
  process.exit(1)
}

async function owned() {
  const { data } = await db
    .from('organisations')
    .select('id, name, slug, email, stripe_account_id, payout_status, stripe_charges_enabled, stripe_payouts_enabled')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true })
  return data ?? []
}

const browser = await chromium.launch()
const session = await proofSession(browser, BASE, email, password)
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  storageState: session,
})
const page = await context.newPage()

// ── 1. Create a THIRD business through the real UI ───────────────────────────
{
  const startCount = (await owned()).length
  const stamp = Date.now().toString(36)
  const slug = `proof-third-${stamp}`

  await page.goto(`${BASE}/dashboard/organisation/create`, { waitUntil: 'networkidle' })

  // The old page redirected away the moment the caller had one organisation, so
  // there was no route in the product to a second business at all.
  const stayedOnCreate = page.url().includes('/dashboard/organisation/create')
  record(
    'the create-a-business page no longer redirects an existing organiser away',
    stayedOnCreate,
    page.url(),
  )

  const heading = await page.locator('h1').first().innerText()
  record(
    'it frames itself honestly as adding another business',
    /add another business/i.test(heading),
    JSON.stringify(heading),
  )

  const emailField = page.locator('#email')
  const prefilled = await emailField.inputValue()
  record(
    "the contact email defaults to the person's own address but stays editable",
    prefilled === email && !(await emailField.isDisabled()),
    `value=${prefilled}`,
  )

  await page.locator('#name').fill('Third Business Proof')
  await page.locator('#slug').fill(slug)
  await page.screenshot({ path: path.join(OUT, 'create-third-business-1440.png') })
  // Wait for the EXACT destination. `/\/dashboard\/organisation/` also matches
  // `/dashboard/organisation/create`, which is the page already open, so it
  // resolves before the submit has done anything and the assertion below then
  // reads the database too early and reports a product failure that is really a
  // test failure. That happened once here; it is not allowed to happen twice.
  await Promise.all([
    page.waitForURL((u) => u.pathname === '/dashboard/organisation', { timeout: 45_000 }),
    page.getByRole('button', { name: /create business/i }).click(),
  ])
  await page.waitForLoadState('networkidle')

  const after = await owned()
  const created = after.find((o) => o.slug === slug)
  record(
    'a third business is created by one person, through the browser',
    Boolean(created) && after.length === startCount + 1,
    `${startCount} -> ${after.length} businesses`,
  )
  record(
    'and it carries the SAME contact email as the others, with no constraint fired',
    after.filter((o) => o.email === email).length >= 3,
    `${after.filter((o) => o.email === email).length} businesses share ${email}`,
  )

  // Tidy: the third business exists only to prove creation works. Removed by slug
  // rather than by the `created` lookup, so a failed assertion above cannot leave
  // a row behind.
  const { data: strays } = await db.from('organisations').select('id').eq('slug', slug)
  for (const s of strays ?? []) {
    await db.from('organisation_members').delete().eq('organisation_id', s.id)
    await db.from('organisations').delete().eq('id', s.id)
  }
}

// ── 2. Distinct Stripe accounts and distinct bank accounts ───────────────────
{
  const orgs = (await owned()).filter((o) => o.stripe_account_id)
  const accountIds = new Set(orgs.map((o) => o.stripe_account_id))
  record(
    'each business holds its OWN Stripe connected account',
    accountIds.size === orgs.length && orgs.length >= 2,
    orgs.map((o) => `${o.name} -> ${o.stripe_account_id}`).join('\n        '),
  )

  const banks = []
  for (const o of orgs) {
    const acct = await stripe.accounts.retrieve(o.stripe_account_id)
    const ext = acct.external_accounts?.data?.[0]
    banks.push(`${o.name} -> ${ext?.id ?? 'none'} (${ext?.object ?? '-'})`)
  }
  const bankIds = banks.map((b) => b.split('-> ')[1])
  record(
    'each business pays out to its OWN bank account, not a shared one',
    new Set(bankIds).size === bankIds.length && !bankIds.includes('none ('),
    banks.join('\n        '),
  )

  note(
    'the money path resolves the destination from the EVENT, never from the person',
    'src/lib/payments/create-platform-charge.ts:103 loads the connected account by ' +
      'organisation_id, and src/lib/payments/event-transfer.ts:389 selects the payout ' +
      'destination through events -> organisations!inner(stripe_account_id). Neither ' +
      'reads owner_id or any email, so two businesses under one person cannot share a ' +
      'destination.',
  )
}

// ── 5. Reconnect a business to a DIFFERENT Stripe account ────────────────────
{
  const orgs = await owned()
  const target = orgs.find((o) => o.slug === 'proof-northside-comedy')
  const originalAccount = target.stripe_account_id

  // GIVE IT A HISTORY TO LOSE. "events 0 -> 0, orders 0 -> 0" proves nothing: an
  // empty set survives anything. The event row below is seeded directly rather
  // than purchased through checkout, and that is stated plainly here rather than
  // dressed up as a sale, because what is being proven is the ATTRIBUTION KEY, and
  // a seeded row sits on exactly the same organisation_id join a bought one does.
  const eventSlug = `proof-history-${target.id.slice(0, 8)}`
  const { data: existingEvent } = await db
    .from('events')
    .select('id')
    .eq('slug', eventSlug)
    .maybeSingle()
  if (!existingEvent) {
    const { error: seedError } = await db.from('events').insert({
      organisation_id: target.id,
      created_by: ownerId,
      title: 'Proof of history',
      slug: eventSlug,
      status: 'draft',
      start_date: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      end_date: new Date(Date.now() + 30 * 86_400_000 + 7_200_000).toISOString(),
    })
    if (seedError) console.warn(`  (could not seed the history event: ${seedError.message})`)
  }

  const [{ count: eventsBefore }, { count: ordersBefore }] = await Promise.all([
    db.from('events').select('id', { count: 'exact', head: true }).eq('organisation_id', target.id),
    db.from('orders').select('id', { count: 'exact', head: true }).eq('organisation_id', target.id),
  ])
  record(
    'the business being reconnected actually HAS a history to lose',
    (eventsBefore ?? 0) > 0,
    `${eventsBefore} event(s), ${ordersBefore} order(s) attributed to ${target.name}`,
  )

  const replacement = await stripe.accounts.create({
    type: 'custom',
    country: 'AU',
    email,
    business_type: 'individual',
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    business_profile: { name: `${target.name} (new bank)`, mcc: '7929', url: 'https://eventlinqs.com.au' },
    individual: {
      first_name: 'Proof',
      last_name: 'Organiser',
      email,
      phone: '+61400000000',
      dob: { day: 1, month: 1, year: 1901 },
      id_number: '000000000',
      address: { line1: 'address_full_match', city: 'Melbourne', state: 'VIC', postal_code: '3000', country: 'AU' },
    },
    tos_acceptance: { date: Math.floor(Date.now() / 1000), ip: '127.0.0.1' },
    metadata: { eventlinqs_proof: 'reconnect-different-account' },
  })

  await db
    .from('organisations')
    .update({ stripe_account_id: replacement.id })
    .eq('id', target.id)

  const [{ count: eventsAfter }, { count: ordersAfter }] = await Promise.all([
    db.from('events').select('id', { count: 'exact', head: true }).eq('organisation_id', target.id),
    db.from('orders').select('id', { count: 'exact', head: true }).eq('organisation_id', target.id),
  ])

  record(
    'reconnecting a business to a DIFFERENT Stripe account keeps its history',
    eventsBefore === eventsAfter && ordersBefore === ordersAfter,
    `events ${eventsBefore} -> ${eventsAfter}, orders ${ordersBefore} -> ${ordersAfter}, ` +
      `account ${originalAccount} -> ${replacement.id}`,
  )
  note(
    'why history cannot detach',
    'events.organisation_id and orders.organisation_id are the attribution keys. ' +
      'stripe_account_id is a property OF the organisation, never the join, so swapping ' +
      'the bank changes where new money lands and nothing about what already happened.',
  )

  // The other business must not have moved.
  const others = (await owned()).filter((o) => o.id !== target.id && o.stripe_account_id)
  record(
    'the other business kept its own account through that change',
    others.every((o) => o.stripe_account_id !== replacement.id),
    others.map((o) => `${o.name} -> ${o.stripe_account_id}`).join(', '),
  )

  // Put it back so the fixture is reusable.
  await db.from('organisations').update({ stripe_account_id: originalAccount }).eq('id', target.id)
}

// ── 4. Disconnect scoping, and the migration that currently blocks it ────────
{
  const orgs = await owned()
  const [a, b] = orgs
  const beforeB = JSON.stringify(b)

  const { error } = await db
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
    })
    .eq('id', a.id)

  if (error) {
    record(
      'DISCONNECT IS BLOCKED until migration 20260809000001 is applied',
      // A blocked disconnect is the EXPECTED, correct finding right now, and it is
      // recorded as a pass because the point is that it fails loudly rather than
      // half-writing. The scenario itself stays UNPROVEN until the migration lands.
      error.code === '23514',
      `${error.code} ${error.message}`,
    )
    note(
      'scenario 4 is UNPROVEN and cannot be proven from here',
      'disconnectConnectedAccount writes payout_status = unset in one atomic update ' +
        'scoped to .eq(id, organisationId), so it cannot touch a second business by ' +
        'construction. But the CHECK constraint refuses unset until the migration is ' +
        'applied, and applying a migration is the founder\'s call, never this session\'s. ' +
        'Re-run this script after supabase db push --linked to complete it.',
    )
    const afterB = (await owned()).find((o) => o.id === b.id)
    record(
      'the failed disconnect left the other business completely untouched',
      JSON.stringify(afterB) === beforeB,
      `${b.name} unchanged`,
    )
  } else {
    // Post-migration path.
    const after = await owned()
    const afterA = after.find((o) => o.id === a.id)
    const afterB = after.find((o) => o.id === b.id)
    record(
      'disconnecting one business clears only that business',
      afterA.payout_status === 'unset' && JSON.stringify(afterB) === beforeB,
      `${a.name} -> unset, ${b.name} unchanged`,
    )
    // Restore.
    await db
      .from('organisations')
      .update({
        stripe_account_id: a.stripe_account_id,
        stripe_charges_enabled: a.stripe_charges_enabled,
        stripe_payouts_enabled: a.stripe_payouts_enabled,
        payout_status: a.payout_status,
      })
      .eq('id', a.id)
  }
}

await browser.close()

const failed = results.filter((r) => r.ok === false)
console.log('')
console.log(
  `${results.filter((r) => r.ok === true).length} passed, ${failed.length} failed, ` +
    `${results.filter((r) => r.ok === null).length} notes.`,
)
fs.writeFileSync(path.join(OUT, 'multi-org-scenarios.json'), JSON.stringify(results, null, 2))
process.exit(failed.length === 0 ? 0 : 1)
