/**
 * Verifier for migrations 20260808000001 and 20260808000002.
 *
 * READ ONLY except for one scratch share_links row that proves the widened
 * channel constraint and is deleted in the same run. Touches no payment,
 * order, ticket or payout table. Refuses to run against anything but TEST.
 *
 * Run it BEFORE the push to capture the baseline, and AFTER to prove the
 * repair. Same command both times.
 *
 *   node scripts/verify/city-primary-backfill-verify.mjs
 *
 * What it proves, in the founder's words:
 *   a. how many published events could not reach their own city, before and
 *      after;
 *   b. that NO event was filed under a city the organiser never chose, by
 *      re-deriving every city_primary from venue_city with the same exact
 *      match rule the migration used and failing on any row that disagrees;
 *   c. what was deliberately left null, listed by locality, so a residual is
 *      a decision you can see rather than a silence;
 *   d. that the share_links channel constraint now accepts 'digest'.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.test', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)

const URL = env.NEXT_PUBLIC_SUPABASE_URL
if (!URL?.includes('vkapkibzokmfaxqogypq')) {
  console.error(`REFUSING TO RUN: ${URL} is not the TEST project.`)
  process.exit(1)
}
const db = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const failures = []
function check(ok, label, detail) {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail === undefined ? '' : ` -> ${detail}`}`)
  if (!ok) failures.push(label)
}

const norm = (s) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

console.log(`project: ${URL}\n`)

// ---------------------------------------------------------------------------
console.log('--- a. how many published events can reach their own city ---')
const { data: cities } = await db.from('cities').select('slug, name')
const cityBySlug = new Map(cities.map((c) => [c.slug, c]))

const { count: publishedTotal } = await db
  .from('events')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'published')
const { count: publishedNull } = await db
  .from('events')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'published')
  .is('city_primary', null)

const reachable = publishedTotal - publishedNull
const pct = publishedTotal ? ((reachable / publishedTotal) * 100).toFixed(1) : '0.0'
console.log(`  published events           : ${publishedTotal}`)
console.log(`  with a city claim          : ${reachable} (${pct} percent)`)
console.log(`  still unclaimed            : ${publishedNull}`)

// ---------------------------------------------------------------------------
console.log('\n--- b. no event filed under a city the organiser never chose ---')
const claimed = []
for (let from = 0; ; from += 1000) {
  const { data } = await db
    .from('events')
    .select('id, slug, title, venue_city, city_primary')
    .not('city_primary', 'is', null)
    .range(from, from + 999)
  if (!data?.length) break
  claimed.push(...data)
  if (data.length < 1000) break
}
console.log(`  rows carrying a city_primary: ${claimed.length}`)

const mismatched = claimed.filter((e) => {
  const city = cityBySlug.get(e.city_primary)
  if (!city) return true
  const typed = norm((e.venue_city ?? '').split(',')[0])
  return typed !== norm(city.name) && typed !== norm(city.slug)
})
check(
  mismatched.length === 0,
  'every city claim is an exact match on the locality the organiser typed',
  `${mismatched.length} disagree`,
)
if (mismatched.length) {
  console.log('  rows that disagree (these are the ones to look at):')
  for (const e of mismatched.slice(0, 25)) {
    console.log(`    ${e.slug}: venue_city="${e.venue_city}" but city_primary="${e.city_primary}"`)
  }
  if (mismatched.length > 25) console.log(`    ... and ${mismatched.length - 25} more`)
}

// ---------------------------------------------------------------------------
console.log('\n--- c. what was deliberately left unclaimed, by locality ---')
const residual = []
for (let from = 0; ; from += 1000) {
  const { data } = await db
    .from('events')
    .select('slug, venue_city')
    .eq('status', 'published')
    .is('city_primary', null)
    .range(from, from + 999)
  if (!data?.length) break
  residual.push(...data)
  if (data.length < 1000) break
}
const byLocality = {}
for (const r of residual) byLocality[r.venue_city ?? '(no locality typed)'] = (byLocality[r.venue_city ?? '(no locality typed)'] ?? 0) + 1
if (residual.length === 0) {
  console.log('  none')
} else {
  for (const [locality, n] of Object.entries(byLocality).sort((a, b) => b[1] - a[1])) {
    const resolvable = cities.some((c) => norm(c.name) === norm(locality) || norm(c.slug) === norm(locality))
    console.log(`  ${String(n).padStart(4)}  ${locality}${resolvable ? '   <-- RESOLVABLE, the backfill should have caught this' : ''}`)
  }
}
check(
  !Object.keys(byLocality).some((l) =>
    cities.some((c) => norm(c.name) === norm(l) || norm(c.slug) === norm(l)),
  ),
  'nothing resolvable was left behind by the backfill',
)

// ---------------------------------------------------------------------------
console.log('\n--- d. the share_links channel constraint accepts digest ---')
const { data: anyEvent } = await db.from('events').select('id').limit(1).maybeSingle()
if (!anyEvent) {
  check(false, 'an event exists to test the constraint against')
} else {
  const scratch = `zzVERIFY${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`
  const { data: inserted, error } = await db
    .from('share_links')
    .insert({ event_id: anyEvent.id, channel: 'digest', code: scratch })
    .select('id')
    .maybeSingle()
  check(
    !error && !!inserted,
    "a share_link with channel 'digest' can be written",
    error ? error.message : 'ok',
  )
  if (inserted) {
    await db.from('share_links').delete().eq('id', inserted.id)
    const { count: leftover } = await db
      .from('share_links')
      .select('id', { count: 'exact', head: true })
      .eq('code', scratch)
    check((leftover ?? 0) === 0, 'the scratch row was cleaned up')
  }
}

console.log(`\n===== ${failures.length === 0 ? 'ALL GREEN' : `${failures.length} FAILED`} =====`)
for (const f of failures) console.log(`  FAILED: ${f}`)
process.exit(failures.length === 0 ? 0 : 1)
