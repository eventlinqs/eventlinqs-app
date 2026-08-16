/**
 * Build the TEST fixture the browser proof drives, and prove three things while
 * building it that no unit test can prove:
 *
 *   1. One person really can hold two organisations with two SEPARATE Stripe
 *      accounts. Both are created here through the API, and the ids are printed.
 *   2. Nothing is keyed on the person's email. Both organisations, and both Stripe
 *      accounts, are created with the SAME contact email on purpose. If anything
 *      anywhere enforced one-email-one-business, this script fails here.
 *   3. The stranded state can be reproduced deliberately, so the recovery proof is
 *      a real recovery rather than a screenshot of something that was never broken.
 *
 * WHY THE STRANDED STATE IS BUILT WITH 'restricted' AND NOT 'unset'. Migration
 * 20260809000001 is written but NOT applied, and applying it is the founder's call,
 * never this session's. The column therefore still refuses 'unset' (proven:
 * scripts/verify/payout-status-domain.mjs). 'restricted' is the exact value the
 * founder's own row held during the lockout, so the reproduction is faithful to the
 * incident and needs no migration.
 *
 * TEST ONLY. Refuses the production project id outright.
 *
 * Credentials come from the environment, never from this file: a plaintext password
 * committed in an automation script is what GitGuardian flagged on 2026-08-08.
 *
 * Usage:
 *   PROOF_EMAIL=... PROOF_PASSWORD=... node --env-file=.env.test \
 *     scripts/verify/multi-org-fixture.mjs [--strand|--heal|--status]
 */
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

// The inline refusal below catches the one known production ref. The shared
// preflight also refuses when it CANNOT TELL which project it has, which the
// inline check passes silently, so both stay.
assertNotProduction()

const PRODUCTION_PROJECT = 'gndnldyfudbytbboxesk'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const stripeKey = process.env.STRIPE_SECRET_KEY
const email = process.env.PROOF_EMAIL
const password = process.env.PROOF_PASSWORD

if (!url || !serviceKey || !stripeKey) {
  console.error('Missing Supabase or Stripe environment. Run with --env-file=.env.test')
  process.exit(1)
}
if (url.includes(PRODUCTION_PROJECT)) {
  console.error('REFUSING: that is the production project. This script is TEST only.')
  process.exit(1)
}
if (!stripeKey.startsWith('sk_test_')) {
  console.error('REFUSING: STRIPE_SECRET_KEY is not a test key.')
  process.exit(1)
}
if (!email || !password) {
  console.error('Set PROOF_EMAIL and PROOF_PASSWORD in the environment. Never in this file.')
  process.exit(1)
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } })
const stripe = new Stripe(stripeKey)

const mode = process.argv[2] ?? '--build'

/** The two businesses one person runs. Same contact email, on purpose. */
const BUSINESSES = [
  { slug: 'proof-harbour-nights', name: 'Harbour Nights Presents' },
  { slug: 'proof-northside-comedy', name: 'Northside Comedy Room' },
]

async function findOrCreateUser() {
  // listUsers is paginated; the proof account is created by this script so it is
  // found on the first page in practice, and created when it is not.
  let page = 1
  for (;;) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`listUsers failed: ${error.message}`)
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (found) {
      // Reset the password so a re-run is always able to sign in.
      await db.auth.admin.updateUserById(found.id, { password, email_confirm: true })
      return { id: found.id, created: false }
    }
    if (data.users.length < 200) break
    page++
  }
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Multi Business Proof' },
  })
  if (error) throw new Error(`createUser failed: ${error.message}`)
  return { id: data.user.id, created: true }
}

/**
 * A connected account that Stripe reports as fully enabled, built from Stripe's own
 * documented test values (https://docs.stripe.com/connect/testing, fetched
 * 2026-08-09): personal id_number 000000000 and dob 1901-01-01 match successfully,
 * address line1 `address_full_match` enables both charges and payouts, business
 * tax id 000000000 matches, phone 0000000000 validates.
 *
 * A CUSTOM account is used rather than the product's Express account for one
 * reason: an Express account's terms of service must be accepted by the account
 * holder in Stripe's hosted flow, which a script cannot do and which is Stripe's
 * UI rather than ours. The platform code under test never branches on account type:
 * reconcileConnectedAccount reads charges_enabled, payouts_enabled,
 * details_submitted, capabilities, requirements and external_accounts, all of which
 * are identical fields on both. What is being proven here is the PLATFORM's
 * behaviour when Stripe says an account is healthy.
 */
async function createHealthyAccount(organisationName) {
  const account = await stripe.accounts.create({
    type: 'custom',
    country: 'AU',
    email,
    business_type: 'individual',
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_profile: {
      name: organisationName,
      mcc: '7929',
      url: 'https://eventlinqs.com.au',
    },
    individual: {
      first_name: 'Proof',
      last_name: 'Organiser',
      email,
      phone: '+61400000000',
      dob: { day: 1, month: 1, year: 1901 },
      id_number: '000000000',
      address: {
        line1: 'address_full_match',
        city: 'Melbourne',
        state: 'VIC',
        postal_code: '3000',
        country: 'AU',
      },
    },
    tos_acceptance: { date: Math.floor(Date.now() / 1000), ip: '127.0.0.1' },
    metadata: { eventlinqs_proof: 'connect-lockout-2026-08-09' },
  })

  await stripe.accounts.createExternalAccount(account.id, {
    external_account: {
      object: 'bank_account',
      country: 'AU',
      currency: 'aud',
      account_holder_name: 'Proof Organiser',
      routing_number: '110000',
      account_number: '000123456',
    },
  })

  // Even with the documented matching id_number and dob, one of the two accounts
  // came back with disabled_reason 'requirements.pending_verification' and
  // pending_verification ['individual.verification.document'], so payouts_enabled
  // stayed false. Attaching an identity document clears it. The image is generated
  // here rather than committed: a binary in the repo for this would be noise, and
  // test mode does not inspect the pixels.
  const account_after = await stripe.accounts.retrieve(account.id)
  if (!account_after.payouts_enabled) {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAAT0lEQVR4nO3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHwbXQAAAV5F5xkAAAAASUVORK5CYII=',
      'base64',
    )
    const file = await stripe.files.create(
      { purpose: 'identity_document', file: { data: png, name: 'id.png', type: 'image/png' } },
      { stripeAccount: account.id },
    )
    await stripe.accounts.update(account.id, {
      individual: { verification: { document: { front: file.id } } },
    })
  }

  return stripe.accounts.retrieve(account.id)
}

async function status(userId) {
  const { data } = await db
    .from('organisations')
    .select('id, name, slug, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, payout_status')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
  console.log('')
  console.log(`OWNER ${userId} (${email})`)
  for (const o of data ?? []) {
    const live = o.stripe_account_id ? await stripe.accounts.retrieve(o.stripe_account_id) : null
    console.log(`  ${o.name}`)
    console.log(`    organisation  ${o.id}`)
    console.log(`    stripe        ${o.stripe_account_id ?? 'none'}`)
    console.log(
      `    PLATFORM says charges=${o.stripe_charges_enabled} payouts=${o.stripe_payouts_enabled} payout_status=${o.payout_status}`,
    )
    if (live) {
      console.log(
        `    STRIPE   says charges=${live.charges_enabled} payouts=${live.payouts_enabled} details_submitted=${live.details_submitted}`,
      )
      const diverges =
        Boolean(live.charges_enabled) !== Boolean(o.stripe_charges_enabled) ||
        Boolean(live.payouts_enabled) !== Boolean(o.stripe_payouts_enabled) ||
        (live.payouts_enabled ? 'active' : 'restricted') !== o.payout_status
      console.log(`    DIVERGENT?    ${diverges ? 'YES' : 'no'}`)
    }
  }
  return data ?? []
}

const user = await findOrCreateUser()
console.log(`User ${user.id} (${user.created ? 'created' : 'reused'}) ${email}`)

// createOrganisation() promotes the profile to 'organiser', and the dashboard
// sidebar keys off that role. Inserting organisations directly, as this fixture
// does, skips it, and the proof would then be driven through a buyer's chrome.
await db.from('profiles').update({ role: 'organiser' }).eq('id', user.id)

if (mode === '--status') {
  await status(user.id)
  process.exit(0)
}

if (mode === '--strand' || mode === '--heal') {
  // Which business to act on, so the proof can strand a named one rather than
  // whichever happens to be first: --strand proof-northside-comedy
  const slug = process.argv[3] ?? BUSINESSES[0].slug
  const { data: orgs } = await db
    .from('organisations')
    .select('id, name, slug')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
  const target = orgs?.find((o) => o.slug === slug)
  if (!target) {
    console.error(`No organisation with slug ${slug}. Run without a flag first.`)
    process.exit(1)
  }
  if (mode === '--strand') {
    // EXACTLY the state the founder's row held: the platform says restricted and
    // disabled while Stripe says the account is fine.
    const { error } = await db
      .from('organisations')
      .update({
        payout_status: 'restricted',
        stripe_charges_enabled: false,
        stripe_payouts_enabled: false,
        stripe_onboarding_complete: false,
      })
      .eq('id', target.id)
    if (error) throw new Error(`strand failed: ${error.message}`)
    console.log(`STRANDED ${target.name} (${target.id}) exactly as the founder's row was.`)
  } else {
    const { error } = await db
      .from('organisations')
      .update({
        payout_status: 'active',
        stripe_charges_enabled: true,
        stripe_payouts_enabled: true,
        stripe_onboarding_complete: true,
      })
      .eq('id', target.id)
    if (error) throw new Error(`heal failed: ${error.message}`)
    console.log(`HEALED ${target.name} (${target.id}).`)
  }
  await status(user.id)
  process.exit(0)
}

// ── Build ────────────────────────────────────────────────────────────────────
for (const business of BUSINESSES) {
  const { data: existing } = await db
    .from('organisations')
    .select('id, name, stripe_account_id')
    .eq('slug', business.slug)
    .maybeSingle()

  let organisationId = existing?.id
  if (!organisationId) {
    const { data, error } = await db
      .from('organisations')
      .insert({
        name: business.name,
        slug: business.slug,
        owner_id: user.id,
        status: 'active',
        // THE SAME EMAIL ON BOTH, deliberately. If any constraint tied a business
        // to one address, this insert is where it would fail.
        email,
      })
      .select('id')
      .single()
    if (error) throw new Error(`organisation insert failed for ${business.slug}: ${error.message}`)
    organisationId = data.id
    console.log(`Created organisation ${business.name} ${organisationId}`)
  } else {
    console.log(`Reusing organisation ${business.name} ${organisationId}`)
  }

  await db
    .from('organisation_members')
    .upsert(
      { organisation_id: organisationId, user_id: user.id, role: 'owner' },
      { onConflict: 'organisation_id,user_id' },
    )

  let accountId = existing?.stripe_account_id
  if (!accountId) {
    const account = await createHealthyAccount(business.name)
    accountId = account.id
    console.log(
      `  Stripe account ${account.id}  charges=${account.charges_enabled} payouts=${account.payouts_enabled}`,
    )
    const { error } = await db
      .from('organisations')
      .update({
        stripe_account_id: account.id,
        stripe_account_country: account.country,
        stripe_charges_enabled: account.charges_enabled,
        stripe_payouts_enabled: account.payouts_enabled,
        stripe_onboarding_complete: Boolean(account.details_submitted),
        payout_status: account.payouts_enabled ? 'active' : 'restricted',
      })
      .eq('id', organisationId)
    if (error) throw new Error(`could not attach the Stripe account: ${error.message}`)
  } else {
    console.log(`  Reusing Stripe account ${accountId}`)
  }
}

const rows = await status(user.id)

console.log('')
const accounts = new Set(rows.map((r) => r.stripe_account_id))
console.log(`PROOF: ${rows.length} organisations, ${accounts.size} DISTINCT Stripe accounts.`)
console.log(`PROOF: both created with the identical contact email ${email}, and both succeeded,`)
console.log('       so nothing constrains a person to one business per email address.')
