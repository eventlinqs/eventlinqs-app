#!/usr/bin/env node
// Seeds N test users on the preview Supabase project and captures their
// session cookies into tests/load/fixtures/test-users.json. The
// checkout profile reads this file via SharedArray.
//
// IMPORTANT: this script writes to Supabase. Only run it against the
// preview project (gndnldyfudbytbboxesk-preview, NOT prod). It refuses
// to run against the production ref.
//
// Approach: create users via Supabase Admin API using SUPABASE_SERVICE_ROLE_KEY,
// then perform a password-grant sign-in to capture the session
// access/refresh tokens. We persist the session cookie that the Next
// app's middleware expects (sb-<ref>-auth-token).
//
// Why password grant and not OTP: OTP would burn Resend quota and
// Resend has a low test-mode rate limit. Password grant works because
// these are throwaway accounts created inline.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   node tests/load/scripts/seed-test-users.mjs --count 200

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures')
const OUT = path.join(FIXTURES_DIR, 'test-users.json')

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const count = parseInt(arg('--count', '200'), 10)
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

function randomPassword() {
  return `Lt-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
}

async function createUser(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE,
      'Authorization': `Bearer ${SERVICE_ROLE}`,
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { loadtest: true },
    }),
  })
  if (!res.ok) throw new Error(`create user failed: ${res.status} ${await res.text()}`)
  return await res.json()
}

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE,
    },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`sign in failed: ${res.status} ${await res.text()}`)
  return await res.json()
}

async function main() {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true })
  const users = []
  const cookieName = `sb-${ref}-auth-token`

  for (let i = 0; i < count; i++) {
    const email = `loadtest+u${Date.now()}-${i}@eventlinqs-test.invalid`
    const password = randomPassword()
    try {
      await createUser(email, password)
      const session = await signIn(email, password)
      const cookieValue = JSON.stringify([
        session.access_token,
        session.refresh_token,
        null,
        null,
        null,
      ])
      const sessionCookie = `${cookieName}=${encodeURIComponent(cookieValue)}`
      users.push({ email, sessionCookie })
      if ((i + 1) % 25 === 0) console.log(`seeded ${i + 1}/${count}`)
    } catch (err) {
      console.warn(`user ${i} failed: ${err.message}`)
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(users, null, 2))
  console.log(`wrote ${OUT} with ${users.length} users`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
