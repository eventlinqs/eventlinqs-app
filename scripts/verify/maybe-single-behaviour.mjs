/**
 * Establish what `maybeSingle()` ACTUALLY does when a user owns several
 * organisations, against the real TEST database rather than from reading source.
 *
 * WHY THIS SCRIPT EXISTS. The whole multi-organisation defect rests on one claim:
 * that `.eq('owner_id', user.id).maybeSingle()` does not return the first row when
 * several match, but errors. That claim was made from reading postgrest-js. Reading
 * source is not the same as running it, and the founder's brief says to establish
 * what it actually does before fixing anything. So this runs all three shapes
 * against a real owner with several organisations and prints exactly what each
 * returns.
 *
 * TEST ONLY. It refuses to run against the production project id, and it only ever
 * reads.
 *
 * Usage: node --env-file=.env.test scripts/verify/maybe-single-behaviour.mjs
 */
import { createClient } from '@supabase/supabase-js'

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

console.log('Project:', url.replace(/https:\/\/([a-z]+).*/, '$1'))
console.log('postgrest-js:', (await import('@supabase/postgrest-js/package.json', { with: { type: 'json' } })).default.version)
console.log('')

// Find an owner_id that holds more than one organisation.
const { data: all, error: allError } = await db
  .from('organisations')
  .select('id, name, owner_id, created_at')
  .order('created_at', { ascending: true })

if (allError) {
  console.error('Could not list organisations:', allError)
  process.exit(1)
}

const byOwner = new Map()
for (const row of all ?? []) {
  if (!row.owner_id) continue
  if (!byOwner.has(row.owner_id)) byOwner.set(row.owner_id, [])
  byOwner.get(row.owner_id).push(row)
}

const multi = [...byOwner.entries()].filter(([, rows]) => rows.length > 1)
const single = [...byOwner.entries()].filter(([, rows]) => rows.length === 1)

console.log(`Owners on TEST: ${byOwner.size}`)
console.log(`  with exactly one organisation: ${single.length}`)
console.log(`  with two or more:              ${multi.length}`)
if (multi.length > 0) {
  console.log(`  largest holding:               ${Math.max(...multi.map(([, r]) => r.length))} organisations`)
}
console.log('')

async function probe(label, ownerId, build) {
  const res = await build(db.from('organisations').select('id, name').eq('owner_id', ownerId))
  console.log(`  ${label}`)
  console.log(`    status : ${res.status} ${res.statusText ?? ''}`)
  console.log(`    data   : ${JSON.stringify(res.data)}`)
  console.log(`    error  : ${res.error ? `${res.error.code} ${JSON.stringify(res.error.message)}` : 'null'}`)
  if (res.error?.details) console.log(`    details: ${res.error.details}`)
}

if (multi.length === 0) {
  console.log('No owner on TEST holds two organisations yet, so the multi-row case')
  console.log('cannot be probed here. Run the seeding step first.')
} else {
  const [ownerId, rows] = multi[0]
  console.log(`OWNER WITH ${rows.length} ORGANISATIONS: ${ownerId}`)
  rows.forEach((r) => console.log(`    - ${r.name} (${r.id})`))
  console.log('')
  console.log('  The three shapes the codebase uses, against that owner:')
  await probe('.maybeSingle()  <- the shape resolveOrganiserScope used', ownerId, (q) => q.maybeSingle())
  await probe('.single()       <- the shape the events and venues pages use', ownerId, (q) => q.single())
  await probe('.limit(1).maybeSingle()', ownerId, (q) => q.limit(1).maybeSingle())
  await probe('plain list      <- the shape the fix uses', ownerId, (q) => q)
}

if (single.length > 0) {
  const [ownerId, rows] = single[0]
  console.log('')
  console.log(`OWNER WITH 1 ORGANISATION (the control): ${ownerId}`)
  rows.forEach((r) => console.log(`    - ${r.name} (${r.id})`))
  console.log('')
  await probe('.maybeSingle()', ownerId, (q) => q.maybeSingle())
  await probe('.single()', ownerId, (q) => q.single())
}
