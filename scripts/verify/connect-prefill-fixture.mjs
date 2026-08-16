// Fixture for the Stripe Connect prefill proof.
//
// Creates a SECOND organisation on TEST with a deliberately distinctive name,
// owned by a dedicated proof user, so the onboarding walk can show Stripe's
// hosted form arriving with that exact name already in it. The name is chosen
// to be impossible to confuse with the platform's own: if "Thunderbird Freight
// Sessions" appears in Stripe's form, the platform put it there.
//
// Idempotent. Re-running reuses the user and the organisation, and clears any
// stripe_account_id so the walk always exercises the CREATE path (the prefill
// only happens at account creation; Stripe forbids setting these fields once an
// AccountLink has started onboarding).
//
// Run from PowerShell:
//   node --env-file=.env.test scripts/verify/connect-prefill-fixture.mjs
//
// Required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from '@supabase/supabase-js'

// Fail closed rather than fall back to a literal. A fixture script is committed,
// pushed and indexed, so a password written here is a password published, even
// when the account it opens only exists on TEST.
function requireEnv(name) {
  const v = process.env[name]
  if (!v) {
    console.error(`[fixture] ${name} is not set. Export it for this shell; it is deliberately not in the repo.`)
    process.exit(2)
  }
  return v
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing env. Run: node --env-file=.env.test scripts/verify/connect-prefill-fixture.mjs')
  process.exit(1)
}
if (!SUPABASE_URL.includes('vkapkibzokmfaxqogypq')) {
  console.error(`Refusing to run: ${SUPABASE_URL} is not the TEST project. This fixture must never touch production.`)
  process.exit(1)
}

export const PROOF_EMAIL = 'connect-prefill-proof@eventlinqs.com'
export const PROOF_PASSWORD = requireEnv('EL_CONNECT_PROOF_PASSWORD')
export const PROOF_ORG_NAME = 'Thunderbird Freight Sessions'
export const PROOF_ORG_SLUG = 'thunderbird-freight-sessions'
export const PROOF_ORG_EMAIL = 'payouts@thunderbirdfreight.com.au'
export const PROOF_ORG_PHONE = '+61390000111'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function ensureUser() {
  const { data, error } = await supabase.auth.admin.listUsers()
  if (error) throw error
  const existing = data?.users?.find(u => u.email?.toLowerCase() === PROOF_EMAIL)
  if (existing) {
    // Force the password so a stale fixture never blocks the walk.
    await supabase.auth.admin.updateUserById(existing.id, { password: PROOF_PASSWORD, email_confirm: true })
    return existing.id
  }
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: PROOF_EMAIL,
    password: PROOF_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Connect Prefill Proof' },
  })
  if (createError) throw createError
  return created.user.id
}

async function ensureOrg(userId) {
  const { data: existing } = await supabase
    .from('organisations')
    .select('id, name, slug, stripe_account_id')
    .eq('slug', PROOF_ORG_SLUG)
    .maybeSingle()

  if (existing) {
    // Clear the Stripe account so the walk re-enters the CREATE path, which is
    // the only path where the prefill applies.
    const { error } = await supabase
      .from('organisations')
      .update({
        name: PROOF_ORG_NAME,
        email: PROOF_ORG_EMAIL,
        phone: PROOF_ORG_PHONE,
        owner_id: userId,
        status: 'active',
        stripe_account_id: null,
        stripe_account_country: null,
        stripe_charges_enabled: false,
        stripe_payouts_enabled: false,
        stripe_onboarding_complete: false,
      })
      .eq('id', existing.id)
    if (error) throw error
    return existing.id
  }

  const { data: created, error } = await supabase
    .from('organisations')
    .insert({
      name: PROOF_ORG_NAME,
      slug: PROOF_ORG_SLUG,
      email: PROOF_ORG_EMAIL,
      phone: PROOF_ORG_PHONE,
      owner_id: userId,
      status: 'active',
    })
    .select('id')
    .single()
  if (error) throw error
  return created.id
}

async function main() {
  const userId = await ensureUser()
  const orgId = await ensureOrg(userId)

  await supabase
    .from('organisation_members')
    .upsert({ organisation_id: orgId, user_id: userId, role: 'owner' }, { onConflict: 'organisation_id,user_id' })
  await supabase.from('profiles').update({ role: 'organiser' }).eq('id', userId)

  console.log(JSON.stringify({
    user_id: userId,
    organisation_id: orgId,
    name: PROOF_ORG_NAME,
    slug: PROOF_ORG_SLUG,
    email: PROOF_EMAIL,
    password: PROOF_PASSWORD,
    stripe_account_id: null,
  }, null, 2))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
