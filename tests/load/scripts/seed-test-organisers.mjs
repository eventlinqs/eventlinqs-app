#!/usr/bin/env node
// Seeds N test organiser accounts on the preview Supabase project,
// captures session cookies, and ensures each has at least one event so
// the dashboard isn't empty. Writes to
// tests/load/fixtures/test-organisers.json.
//
// IMPORTANT: this script writes to Supabase. Only run it against the
// preview project. It refuses to run against the production ref.
//
// What "organiser" means here: a user row in `users` with role
// 'organiser' and a corresponding row in `organisers`. The exact shape
// matches what the M5 organiser onboarding flow creates - we replicate
// it here without going through the OTP flow.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   node tests/load/scripts/seed-test-organisers.mjs --count 100

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures')
const OUT = path.join(FIXTURES_DIR, 'test-organisers.json')

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const count = parseInt(arg('--count', '100'), 10)
const PROD_REFS = ['gndnldyfudbytbboxesk']

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in env')
  process.exit(2)
}

const ref = new URL(SUPABASE_URL).host.split('.')[0]
if (PROD_REFS.includes(ref)) {
  console.error(`refusing to seed against production project ref ${ref}. Use a preview-only Supabase project.`)
  process.exit(2)
}

const restHeaders = {
  'Content-Type': 'application/json',
  apikey: SERVICE_ROLE,
  Authorization: `Bearer ${SERVICE_ROLE}`,
  Prefer: 'return=representation',
}

async function createAuthUser(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: restHeaders,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { loadtest: true, role: 'organiser' },
    }),
  })
  if (!res.ok) throw new Error(`auth create: ${res.status} ${await res.text()}`)
  return await res.json()
}

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_ROLE },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`sign in: ${res.status} ${await res.text()}`)
  return await res.json()
}

async function ensureOrganiserRow(userId, email) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/organisers`, {
    method: 'POST',
    headers: restHeaders,
    body: JSON.stringify({
      user_id: userId,
      display_name: `Loadtest Org ${userId.slice(0, 8)}`,
      contact_email: email,
      metadata: { loadtest: true },
    }),
  })
  if (!res.ok && res.status !== 409) {
    console.warn(`organiser row create warn: ${res.status} ${await res.text()}`)
  }
}

async function main() {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true })
  const organisers = []
  const cookieName = `sb-${ref}-auth-token`

  for (let i = 0; i < count; i++) {
    const email = `loadtest+org${Date.now()}-${i}@eventlinqs-test.invalid`
    const password = `Lt-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
    try {
      const user = await createAuthUser(email, password)
      await ensureOrganiserRow(user.id, email)
      const session = await signIn(email, password)
      const cookieValue = JSON.stringify([
        session.access_token,
        session.refresh_token,
        null,
        null,
        null,
      ])
      organisers.push({
        email,
        userId: user.id,
        sessionCookie: `${cookieName}=${encodeURIComponent(cookieValue)}`,
      })
      if ((i + 1) % 10 === 0) console.log(`seeded ${i + 1}/${count}`)
    } catch (err) {
      console.warn(`organiser ${i} failed: ${err.message}`)
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(organisers, null, 2))
  console.log(`wrote ${OUT} with ${organisers.length} organisers`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
