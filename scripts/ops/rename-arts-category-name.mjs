/**
 * Apply the "Arts & Community" -> "Arts" display-name change to a live project.
 *
 * The migration file 20260827000001 is the reproducible record; this applies the
 * same single-column update to a running database so the change is live without
 * waiting for a migration push. Idempotent, and it reports what it found.
 *
 * COLUMN ONLY. No slug, no id, no other row. Founder ruling 27 August 2026, and
 * the reasoning for leaving the slug alone is in the migration header.
 *
 *   node --env-file=.env.test scripts/ops/rename-arts-category-name.mjs
 *   ALLOW_PRODUCTION_SUPABASE=1 node --env-file=<main>/.env.local scripts/ops/rename-arts-category-name.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

/*
 * THE SHARED PREFLIGHT, not a second copy of it.
 *
 * This script first carried its own hand-rolled "is this production" check.
 * scripts/guards/no-unguarded-production-write.mjs failed the build for it, and
 * it was right to: a second implementation of a refusal is a second thing that
 * can drift from the first, and this repository has spent the week removing
 * exactly that shape. The helper resolves the project this process will actually
 * use, refuses PRODUCTION unless ALLOW_PRODUCTION_SUPABASE=1 is set, and refuses
 * outright when it cannot tell which project it is talking to.
 */
assertNotProduction()

const SLUG = 'arts-community'
const WAS = 'Arts & Community'
const NOW = 'Arts'
const PRODUCTION_REF = 'gndnldyfudbytbboxesk'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('FAIL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}

const ref = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url)?.[1] ?? '(unparsed)'
const isProduction = ref === PRODUCTION_REF

console.log('rename-arts-category-name')
console.log(`  project : ${ref}${isProduction ? '  (PRODUCTION)' : ''}`)
console.log(`  change  : event_categories.name  "${WAS}" -> "${NOW}"  WHERE slug = '${SLUG}'`)
console.log('  scope   : one column, one row. The slug is NOT touched.')

const supabase = createClient(url, key)

const before = await supabase.from('event_categories').select('id, slug, name').eq('slug', SLUG).maybeSingle()
if (before.error) {
  console.error(`FAIL: could not read the row: ${before.error.message}`)
  process.exit(1)
}
if (!before.data) {
  console.error(`FAIL: no event_categories row with slug '${SLUG}'. Nothing was written.`)
  process.exit(1)
}
console.log(`  before  : ${JSON.stringify(before.data.name)}`)

if (before.data.name === NOW) {
  console.log('')
  console.log(`PASS: already "${NOW}". Nothing to do.`)
  process.exit(0)
}

const { error } = await supabase.from('event_categories').update({ name: NOW }).eq('slug', SLUG)
if (error) {
  console.error(`FAIL: update rejected: ${error.message}`)
  process.exit(1)
}

// Read it back rather than trusting the write, and confirm nothing else moved.
const after = await supabase.from('event_categories').select('id, slug, name').eq('slug', SLUG).maybeSingle()
console.log(`  after   : ${JSON.stringify(after.data?.name)}`)
console.log(`  slug    : ${JSON.stringify(after.data?.slug)}  (unchanged)`)
console.log(`  id      : ${after.data?.id === before.data.id ? 'unchanged' : 'CHANGED, which is wrong'}`)

const all = await supabase.from('event_categories').select('slug, name').order('sort_order')
const clash = (all.data ?? []).filter((c) => c.name === NOW)
console.log('')
console.log(`did 1 row updated, ${all.data?.length ?? 0} categories read back`)
console.log(`found ${clash.length} categor(y/ies) named "${NOW}"`)

if (after.data?.name !== NOW || after.data?.slug !== SLUG || after.data?.id !== before.data.id) {
  console.error('FAIL: the row did not end in the expected state.')
  process.exit(1)
}
if (clash.length !== 1) {
  console.error(`FAIL: ${clash.length} categories now share the name "${NOW}".`)
  process.exit(1)
}

console.log('')
console.log(`PASS: "${WAS}" is now "${NOW}" on ${ref}, slug untouched.`)
