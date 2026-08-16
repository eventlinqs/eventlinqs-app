// Test user seed (Batch 9.2.1).
//
// Idempotent: re-running does not error or create duplicates. The script
// checks for an existing user by email before inserting, and treats a
// 422 "already registered" response as success.
//
// Run from PowerShell (TEST is the documented target; .env.local points at
// PRODUCTION and the preflight refuses it without explicit founder approval):
//   node --env-file=.env.test scripts/seed-test-user.mjs
//
// Required env vars:
//   - NEXT_PUBLIC_SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//
// Credentials are documented in
// docs/redesign/batch-9-2-1-evidence/test-user-credentials.md (gitignored).
import { assertNotProduction } from './lib/production-write-preflight.mjs'
import { createClient } from '@supabase/supabase-js'

// CREDENTIALS COME FROM THE ENVIRONMENT, NEVER FROM THIS FILE.
// GitGuardian flagged plaintext account passwords committed to this repository
// on 2026-08-08. A drive script is committed, pushed and indexed, so it is not a
// safe place for one. Fail closed rather than fall back to a literal.
function requireEnv(name) {
  const v = process.env[name]
  if (!v) {
    console.error(`[drive] ${name} is not set. Export it for this shell; it is deliberately not in the repo.`)
    process.exit(2)
  }
  return v
}

// The two guards answer different questions and both are needed: requireEnv asks
// whether a credential was supplied, assertNotProduction asks which database it
// opens. A script can pass the first and still be pointed at production.
assertNotProduction()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.test scripts/seed-test-user.mjs')
  process.exit(1)
}

const TEST_EMAIL    = 'test-user@eventlinqs.com'
const TEST_PASSWORD = requireEnv('EL_TEST_PASSWORD')
const TEST_NAME     = 'Test User'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function findExisting() {
  const { data, error } = await supabase.auth.admin.listUsers()
  if (error) throw error
  return data?.users?.find(u => u.email?.toLowerCase() === TEST_EMAIL) ?? null
}

async function main() {
  const existing = await findExisting()
  if (existing) {
    console.log(`Test user already exists: ${existing.id} (${existing.email})`)
    return
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: TEST_NAME },
  })
  if (error) {
    // Treat already-registered as success.
    if (String(error.message ?? '').toLowerCase().includes('already')) {
      console.log('Test user already registered (race or pre-existing).')
      return
    }
    throw error
  }
  console.log(`Test user created: ${data.user.id} (${data.user.email})`)
}

main().catch(err => {
  console.error('seed-test-user failed:', err.message ?? err)
  process.exit(1)
})
