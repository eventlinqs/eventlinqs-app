/**
 * GUARD: the database this build will run against already carries every schema
 * object the code reads by name. A build whose schema is behind its code is
 * refused before it deploys.
 *
 * THE INVARIANT, and why a guard rather than a runbook line.
 *
 * Scope v5 3.11 (item A2 of the completion build, 3 to 4 September 2026) added
 * ticket_tiers.access_mode, events.stream_geo_allow, the stream_messages table
 * and the event_stream_links vault, in migrations 20260903000001 and
 * 20260903000002. The bearer ticket page (src/app/t/[code]/page.tsx), the order
 * confirmation page and the organiser create and edit actions SELECT or WRITE
 * those columns BY NAME. PostgREST answers a named column that does not exist
 * with 42703 and fails the whole query, so on a production database without the
 * migration every ticket page and every order confirmation would 500, and no
 * organiser could save an event.
 *
 * Applying a migration to production is the founder's step, reserved by the
 * constitution (Verification and gates, Migrations; Law 10 leaves it reserved).
 * Merging code is not. Those two things are done by different people at
 * different times, and the ORDER between them is the invariant: schema first,
 * then code. Nothing in the repository could see that order until this file.
 * A merge before the push would have passed lint, typecheck, build and the
 * whole suite, because none of them reads a database, and would have broken
 * the ticket page for every holder on the live site.
 *
 * WHAT IT DOES. It probes the database the build's own credentials point at
 * (the same NEXT_PUBLIC_SUPABASE_URL and key `npm run build` refuses to start
 * without), READ ONLY, one GET with limit=0 per object, and fails the build if
 * any object is absent, naming the migration that creates it and the founder's
 * command. On a Vercel preview build the store is the TEST project, where the
 * migrations are applied, so previews keep building. On a production build the
 * store is production, and the build is refused until the schema is there.
 * That is the guard doing the one thing it is for.
 *
 * WHAT IT CANNOT SEE, said plainly: only the objects listed below. It is a
 * reviewed list, added to when an item ships code that names a new column, not
 * a derivation from src/types/database.ts, because the types file describes
 * the TEST schema and would make the guard agree with the code by definition.
 *
 * PROVEN both ways on 4 September 2026 (C:\dev\EVIDENCE\A2\guard-schema-ahead-proof.txt):
 * red against production (all four absent), green against TEST (all present).
 *
 * The probe and its calibration live in scripts/guards/lib/schema-probe.mjs.
 */
import { existsSync, readFileSync } from 'node:fs'
import { probeSchemaObject, projectRefOf } from './lib/schema-probe.mjs'
import { SCHEMA_THE_CODE_NAMES } from './lib/schema-manifest.mjs'

const TAG = '[schema-ahead-of-code]'

/*
 * CREDENTIALS, the same shape as curated-categories-exist: prebuild always has
 * them because the build refuses to start without the URL; a bare
 * `npm run guards` may not, so .env.test is read as a fallback before giving up.
 */
if (!process.env.NEXT_PUBLIC_SUPABASE_URL && existsSync('.env.test')) {
  for (const line of readFileSync('.env.test', 'utf8').split(String.fromCharCode(10))) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

// `||`, not `??`: a pulled Vercel env file lists a sensitive variable as an
// EMPTY string rather than omitting it, and an empty key must fall through to
// the anon key rather than be carried as a credential.
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const keyKind = process.env.SUPABASE_SERVICE_ROLE_KEY ? 'service role' : 'anon'

/*
 * CI's typecheck build uses a placeholder URL by design (there is no database
 * behind it and there is not meant to be), exactly as curated-categories-exist
 * records. A deployable build always carries a real URL, so nothing that ships
 * can reach this skip.
 */
const REAL_PROJECT = /^https:\/\/[a-z0-9]{20,}\.supabase\.co\/?$/
if (url && !REAL_PROJECT.test(url)) {
  console.log(`${TAG} SKIP: NEXT_PUBLIC_SUPABASE_URL is not a real Supabase project URL (${url.length} characters),`)
  console.log(`${TAG}       so there is no schema to check. This is the CI typecheck build, which uses placeholders by design.`)
  console.log(`${TAG}       A build that deploys carries real values and is checked.`)
  process.exit(0)
}

if (!url || !key) {
  console.error(`${TAG} FAIL: no database to check. NEXT_PUBLIC_SUPABASE_URL and a key are both required,`)
  console.error(`${TAG}       from the environment or from .env.test. A guard that cannot look does not pass.`)
  process.exit(1)
}

const ref = projectRefOf(url) ?? 'unknown'
console.log(`${TAG} checking ${SCHEMA_THE_CODE_NAMES.length} schema object(s) on project ${ref} with the ${keyKind} key (read only)`)

const absent = []
const unknown = []
for (const item of SCHEMA_THE_CODE_NAMES) {
  const r = await probeSchemaObject({ url, key, table: item.table, column: item.column })
  const name = `${item.table}.${item.column}`.padEnd(34)
  if (r.state === 'present') {
    console.log(`${TAG}   PRESENT  ${name} (${r.status}${r.code ? ` ${r.code}` : ''})`)
  } else if (r.state === 'absent') {
    console.log(`${TAG}   ABSENT   ${name} (${r.status} ${r.code}) needs ${item.migration}`)
    absent.push(item)
  } else {
    console.log(`${TAG}   UNKNOWN  ${name} (${r.status} ${r.code || 'no code'}${r.message ? `: ${r.message}` : ''})`)
    unknown.push({ item, r })
  }
}

if (unknown.length > 0) {
  console.error('')
  console.error(`${TAG} FAIL: could not look at ${unknown.length} object(s) on ${ref}. That is an outage or a credential`)
  console.error(`${TAG}       problem, not a verdict on the schema, and the build is refused until it can be answered.`)
  process.exit(1)
}

if (absent.length > 0) {
  const migrations = [...new Set(absent.map((a) => a.migration))]
  console.error('')
  console.error(`${TAG} FAIL: the schema on ${ref} is BEHIND the code. ${absent.length} object(s) the code names by`)
  console.error(`${TAG}       name do not exist there, so this build would break the surfaces that read them:`)
  for (const a of absent) console.error(`${TAG}         ${a.table}.${a.column}: read by ${a.readBy}`)
  console.error('')
  console.error(`${TAG}       Apply the migration(s) first, then build again. Applying to production is the founder's`)
  console.error(`${TAG}       step (CLAUDE.md, Verification and gates, Migrations). In PowerShell, from the repo:`)
  console.error(`${TAG}         supabase link --project-ref ${ref}`)
  console.error(`${TAG}         Get-Content supabase\\.temp\\project-ref     # read the ref back before pushing`)
  console.error(`${TAG}         supabase db push --linked`)
  console.error(`${TAG}         node scripts/ops/verify-production-schema.mjs  # proves the push landed, read only`)
  console.error(`${TAG}       Migration(s): ${migrations.join(', ')}`)
  process.exit(1)
}

console.log(`${TAG} PASS: every schema object the code names exists on ${ref}.`)
