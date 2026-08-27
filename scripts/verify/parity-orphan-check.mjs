/**
 * WHY THE PAYOUTS PARITY CAPTURE STALLED ON THE ORPHAN SIGN-IN. READ ONLY.
 *
 * The `after` run captured 12 of 15 responses and then timed out waiting for the
 * orphan user's sign-in to navigate away from /login. The `before` run captured
 * all 15 with the same fixture, so something about that account changed or the
 * login itself is refusing. This asks the question directly rather than retrying
 * the browser and hoping.
 *
 * TEST ONLY, guarded.
 */
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { readFileSync, existsSync } from 'node:fs'

assertNotProduction({ envFile: '.env.test' })

const STATE = 'docs/verification/payouts-read-parity-2026-08-19/fixture.json'
if (!existsSync(STATE)) { console.error('no fixture.json'); process.exit(2) }
const f = JSON.parse(readFileSync(STATE, 'utf8'))

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

console.log(`  fixture ${f.stamp}`)
console.log(`  owner   ${f.ownerEmail}`)
console.log(`  orphan  ${f.orphanEmail}`)

for (const [label, id, _email] of [['owner', f.ownerId, f.ownerEmail], ['orphan', f.orphanId, f.orphanEmail]]) {
  const { data, error } = await admin.auth.admin.getUserById(id)
  if (error || !data?.user) {
    console.log(`  ${label.padEnd(7)} MISSING from auth (${error?.message ?? 'no user'})`)
    continue
  }
  const u = data.user
  console.log(`  ${label.padEnd(7)} exists, email=${u.email}, confirmed=${Boolean(u.email_confirmed_at)}, banned_until=${u.banned_until ?? 'none'}`)

  const { data: prof } = await admin.from('profiles').select('id').eq('id', id).maybeSingle()
  console.log(`  ${label.padEnd(7)} profile row: ${prof ? 'present' : 'MISSING'}`)

  const { count } = await admin
    .from('organisations')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', id)
  console.log(`  ${label.padEnd(7)} organisations owned: ${count ?? 0}`)
}

/*
 * THE ACTUAL SIGN-IN, through GoTrue, with no browser in the way. If this
 * succeeds the fault is in the Playwright login flow (a selector, a redirect, a
 * rate limit at the app layer). If it fails, the account is the fault.
 */
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
for (const [label, email] of [['owner', f.ownerEmail], ['orphan', f.orphanEmail]]) {
  const { data, error } = await anon.auth.signInWithPassword({ email, password: f.password })
  if (error) {
    console.log(`  ${label.padEnd(7)} SIGN-IN FAILED: code=${error.code ?? '?'} status=${error.status ?? '?'} ${error.message}`)
  } else {
    console.log(`  ${label.padEnd(7)} SIGN-IN OK, session for ${data.user?.email}`)
  }
}
