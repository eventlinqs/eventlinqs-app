// Test user seed (Batch 9.2.1).
//
// Idempotent: re-running does not error or create duplicates. The script
// checks for an existing user by email before inserting, and treats a
// 422 "already registered" response as success.
//
// Run from PowerShell:
//   node --env-file=.env.local scripts/seed-test-user.mjs
//
// Required env vars (in .env.local):
//   - NEXT_PUBLIC_SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//
// Credentials are documented in
// docs/redesign/batch-9-2-1-evidence/test-user-credentials.md (gitignored).
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.local scripts/seed-test-user.mjs')
  process.exit(1)
}

const TEST_EMAIL    = 'test-user@eventlinqs.com'
const TEST_PASSWORD = 'TestUser2026!Secure'
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
