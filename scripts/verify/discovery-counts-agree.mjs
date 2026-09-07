/**
 * THE IN-MEMORY MATCHERS AGREE WITH THE SQL THEY MIRROR (close-out C19).
 *
 * src/lib/seo/discovery-counts.ts decides whether a templated discovery page is
 * indexable, and both the page and the sitemap read it, so a mistake in a
 * matcher moves about 490 URLs at once. The matchers are pure functions written
 * to mirror SQL that already exists on the pages:
 *
 *   community   .or(buildCommunityTagOrFilter(slug))      -> tags contains a token
 *   city        .ilike('venue_city', `%${name}%`)          -> case-insensitive substring
 *   category    .in('category.slug', [slug, displayName])  -> category slug in the pair
 *   faith       .or(buildFaithTagOrFilter(slug))           -> tags contains a token
 *
 * Mirroring is the risk. This script runs BOTH sides against the linked database
 * for every community, city, category and faith and fails on a single
 * disagreement. It reads and never writes.
 *
 * Run: node --env-file=.env.local scripts/verify/discovery-counts-agree.mjs
 */
import { spawnSync } from 'node:child_process'

const ROOT = process.cwd()
const TAG = '[discovery-counts-agree]'

const script = `
import { createPublicClient } from '@/lib/supabase/public-client'
import { PUBLIC_EVENT_MATCH } from '@/lib/events/public-visibility'
import { listingWindowOrPredicate } from '@/lib/events/listing-window'
import { getAllCommunities } from '@/lib/communities/data'
import { buildCommunityTagOrFilter } from '@/lib/communities/tag-bridge'
import { getAllCities } from '@/lib/cities/data'
import { getAllFaiths, buildFaithTagOrFilter } from '@/lib/faiths/data'
import { getAllHeroCategories } from '@/lib/hero-categories'
import { countCity, countCommunity, countFaith, countCategory } from '@/lib/seo/discovery-matchers'

const supabase = createPublicClient()
const now = new Date()

// The rows the matchers work over, fetched exactly as loadDiscoveryRows does.
const { data, error } = await supabase
  .from('events')
  .select('tags, venue_city, suburb_primary, venue_latitude, venue_longitude, category:event_categories(slug)')
  .match(PUBLIC_EVENT_MATCH)
  .or(listingWindowOrPredicate(now))
  .limit(5000)
if (error) throw new Error('rows: ' + error.message)
const rows = (data ?? []).map((r) => {
  const category = Array.isArray(r.category) ? r.category[0] : r.category
  return {
    tags: Array.isArray(r.tags) ? r.tags.filter((t) => typeof t === 'string') : [],
    venue_city: r.venue_city,
    suburb_primary: r.suburb_primary,
    venue_latitude: r.venue_latitude,
    venue_longitude: r.venue_longitude,
    category_slug: category?.slug ?? null,
  }
})

const head = async (build) => {
  const { count, error } = await build(
    supabase.from('events').select('id', { count: 'exact', head: true }).match(PUBLIC_EVENT_MATCH).or(listingWindowOrPredicate(now)),
  )
  if (error) throw new Error('count: ' + error.message)
  return count ?? 0
}

const out = []
for (const c of getAllCommunities()) {
  const or = buildCommunityTagOrFilter(c.slug)
  const sql = or === null ? 0 : await head((q) => q.or(or))
  out.push({ kind: 'community', key: c.slug, sql, memory: countCommunity(rows, c.slug) })
}
for (const city of getAllCities()) {
  const sql = await head((q) => q.ilike('venue_city', '%' + city.name + '%'))
  out.push({ kind: 'city', key: city.slug, sql, memory: countCity(rows, city.name) })
}
for (const f of getAllFaiths()) {
  const or = buildFaithTagOrFilter(f.slug)
  const sql = or === null ? 0 : await head((q) => q.or(or))
  out.push({ kind: 'faith', key: f.slug, sql, memory: countFaith(rows, f.slug) })
}
for (const cat of getAllHeroCategories()) {
  const slugs = [cat.slug, cat.displayName.toLowerCase()]
  const { count, error } = await supabase
    .from('events')
    .select('id, category:event_categories!inner(slug)', { count: 'exact', head: true })
    .match(PUBLIC_EVENT_MATCH)
    .or(listingWindowOrPredicate(now))
    .in('category.slug', slugs)
  if (error) throw new Error('category count: ' + error.message)
  out.push({ kind: 'category', key: cat.slug, sql: count ?? 0, memory: countCategory(rows, slugs) })
}
console.log(JSON.stringify({ rows: rows.length, out }))
`

const run = spawnSync(
  process.execPath,
  ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--import', './scripts/lib/src-alias-loader.mjs', '--input-type=module', '-e', script],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
)
if (run.status !== 0) {
  console.error(`${TAG} could not run: ${(run.stderr || run.stdout).trim().slice(0, 1200)}`)
  process.exit(1)
}
const line = run.stdout.trim().split(/\r?\n/).find((l) => l.startsWith('{'))
if (!line) {
  console.error(`${TAG} no result printed: ${run.stdout.slice(0, 600)}`)
  process.exit(1)
}
const { rows, out } = JSON.parse(line)

const disagreements = out.filter((r) => r.sql !== r.memory)
const byKind = {}
for (const r of out) {
  byKind[r.kind] = byKind[r.kind] ?? { checked: 0, nonZero: 0 }
  byKind[r.kind].checked++
  if (r.sql > 0) byKind[r.kind].nonZero++
}

console.log(`${TAG} ${rows} publicly visible event row(s) on the linked database`)
for (const [kind, s] of Object.entries(byKind)) {
  console.log(`${TAG}   ${kind.padEnd(10)} ${s.checked} key(s) compared, ${s.nonZero} with a non-zero SQL count`)
}
for (const r of out.filter((x) => x.sql > 0)) {
  console.log(`${TAG}   ${r.kind}/${r.key}: SQL ${r.sql}, in memory ${r.memory}${r.sql === r.memory ? '' : '  <-- DISAGREES'}`)
}

/*
 * WHAT THIS RUN ACTUALLY PROVED, said plainly. A kind with no non-zero SQL count
 * was compared on zeroes only, which proves the two sides agree that nothing
 * matches and proves nothing about the matching itself. The shapes are held by
 * tests/unit/seo/discovery-counts.test.ts against the real token lists; this
 * line stops a green run being read as more than it is.
 */
const thin = Object.entries(byKind).filter(([, s]) => s.nonZero === 0).map(([k]) => k)
if (thin.length) {
  console.log(
    `${TAG} NOTE: ${thin.join(', ')} had no non-zero count on this database, so those keys were ` +
      'compared on zeroes only. The matcher shapes are held by tests/unit/seo/discovery-counts.test.ts.',
  )
}

if (disagreements.length) {
  console.error(`${TAG} FAIL: ${disagreements.length} key(s) where the matcher and the SQL disagree`)
  for (const d of disagreements) console.error(`${TAG}   ${d.kind}/${d.key}: SQL ${d.sql}, in memory ${d.memory}`)
  process.exit(1)
}
console.log(`${TAG} PASS: ${out.length} key(s), no disagreement`)
