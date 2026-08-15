/**
 * Does the payout_status CHECK constraint accept 'unset' on TEST yet?
 *
 * WHY THIS MATTERS AND WHY IT IS A DEPLOY-ORDER QUESTION, NOT A CURIOSITY.
 * The code on this branch writes payout_status = 'unset' whenever an organisation
 * disconnects (DISCONNECTED_STATE in src/lib/stripe/reconcile-connect.ts). The
 * column's CHECK constraint, written in 20260428000001_m6_connect_schema.sql, only
 * permits 'active', 'on_hold' and 'restricted'. Migration 20260809000001 widens it.
 *
 * So if the CODE ships before the MIGRATION is applied, every disconnect fails on a
 * check violation. This script establishes which side of that the database is on,
 * by attempting the write against a throwaway row and then removing it, rather than
 * by reading the migration folder and assuming.
 *
 * TEST ONLY, refuses the production project, and cleans up after itself.
 *
 * Usage: node --env-file=.env.test scripts/verify/payout-status-domain.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

// The inline refusal below catches the one known production ref. The shared
// preflight also refuses when it CANNOT TELL which project it has, which the
// inline check passes silently, so both stay.
assertNotProduction()

const PRODUCTION_PROJECT = 'gndnldyfudbytbboxesk'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}
if (url.includes(PRODUCTION_PROJECT)) {
  console.error('REFUSING: that is the production project. This script is TEST only.')
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false } })

// Any existing owner will do; the row is deleted at the end either way.
const { data: anyOrg } = await db.from('organisations').select('owner_id').limit(1).single()
if (!anyOrg) {
  console.error('No organisation on TEST to borrow an owner_id from.')
  process.exit(1)
}

const slug = 'zz-payout-status-domain-probe'
await db.from('organisations').delete().eq('slug', slug)

const { data: probe, error: insertError } = await db
  .from('organisations')
  .insert({ name: 'Domain probe', slug, owner_id: anyOrg.owner_id, status: 'active' })
  .select('id, payout_status')
  .single()

if (insertError || !probe) {
  console.error('Could not create the probe row:', insertError)
  process.exit(1)
}

console.log(`Probe row ${probe.id}, payout_status defaults to '${probe.payout_status}'.`)
console.log('')

for (const value of ['active', 'on_hold', 'restricted', 'unset']) {
  const { error } = await db.from('organisations').update({ payout_status: value }).eq('id', probe.id)
  if (error) {
    console.log(`  '${value}'  REJECTED  ${error.code} ${error.message}`)
  } else {
    console.log(`  '${value}'  accepted`)
  }
}

await db.from('organisations').delete().eq('id', probe.id)
const { data: gone } = await db.from('organisations').select('id').eq('id', probe.id).maybeSingle()
console.log('')
console.log(gone ? 'WARNING: probe row was NOT removed.' : 'Probe row removed.')
