/**
 * Read the category taxonomy state, and answer the orphan question.
 *
 * READ ONLY. It issues no write of any kind. It still runs the production write
 * preflight first, because the rule this platform enforces is about which
 * DATABASE a script may touch, not about which verb it uses, and a read against
 * production is banned for this run as firmly as a write.
 *
 * THE ORPHAN QUESTION (D5) is the one worth the script. If an event points at a
 * category row that no longer exists, it is invisible on every discovery
 * surface: the browse filter, the homepage rail and the city landings all match
 * by category slug. That would be a silent loss on live customer data, and it is
 * exactly the shape a rename can produce if it deletes and re-inserts rather
 * than updating in place.
 *
 * Usage: node --env-file=.env.test scripts/verify/taxonomy-state.mjs
 */
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

assertNotProduction()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}

const { createClient } = await import('@supabase/supabase-js')
const db = createClient(url, key, { auth: { persistSession: false } })

console.log(`project: ${url}\n`)

const { data: cats, error: catErr } = await db
  .from('event_categories')
  .select('id, slug, name, is_active, sort_order')
  .order('sort_order')
if (catErr) {
  console.error('category read failed:', catErr.message)
  process.exit(1)
}

console.log('=== event_categories ===')
for (const c of cats) {
  console.log(`  ${String(c.sort_order).padStart(2)}  ${c.slug.padEnd(22)} ${c.name}`)
}

const banned = cats.filter((c) => /cultur/i.test(c.slug) || /cultur/i.test(c.name))
console.log(`\nrows carrying the banned word: ${banned.length}`)
for (const b of banned) console.log(`  !! ${b.slug} / ${b.name}`)

// The two tiles the migration exists to make resolve.
for (const slug of ['arts-community', 'comedy']) {
  const row = cats.find((c) => c.slug === slug)
  console.log(`tile "${slug}": ${row ? `resolves to "${row.name}"` : '*** NO ROW ***'}`)
}

// Published event counts per category, plus the orphan check.
const { data: events, error: evErr } = await db
  .from('events')
  .select('id, category_id, status')
  .eq('status', 'published')
if (evErr) {
  console.error('event read failed:', evErr.message)
  process.exit(1)
}

const known = new Set(cats.map((c) => c.id))
const byCat = new Map()
let uncategorised = 0
const orphans = []
for (const e of events) {
  if (!e.category_id) {
    uncategorised += 1
    continue
  }
  if (!known.has(e.category_id)) {
    orphans.push(e.id)
    continue
  }
  byCat.set(e.category_id, (byCat.get(e.category_id) ?? 0) + 1)
}

console.log(`\n=== published events: ${events.length} ===`)
for (const c of cats) {
  console.log(`  ${c.slug.padEnd(22)} ${byCat.get(c.id) ?? 0}`)
}
console.log(`  ${'(no category)'.padEnd(22)} ${uncategorised}`)

console.log(`\nORPHANED events (category_id points at a row that does not exist): ${orphans.length}`)
if (orphans.length > 0) {
  console.log('  These are invisible on every discovery surface. Ids:')
  for (const id of orphans.slice(0, 20)) console.log(`    ${id}`)
}
