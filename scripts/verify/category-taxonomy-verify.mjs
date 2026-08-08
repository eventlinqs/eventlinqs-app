/**
 * R1 CATEGORY TAXONOMY: does every category the platform merchandises exist,
 * and can every one of them reach an event? Read only. TEST only.
 *
 * WHY THIS CHECK IS SHAPED AROUND THE TILES, not around the table. The defect
 * was never "the table is wrong" in the abstract. It was that the homepage
 * renders nine category tiles and TWO of them matched no row, so both the tile
 * and the rail behind it could never render, and the tile linked to a URL that
 * resolved 200 to a permanently empty result. Nothing errored. The only way to
 * see it was to compare what the platform SHIPS with what the database HOLDS,
 * which is precisely what nobody had done.
 *
 * So the tile list is read from the component source rather than restated here.
 * A tenth tile added tomorrow is checked automatically; a list retyped into
 * this file would not be.
 *
 * Usage: node scripts/verify/category-taxonomy-verify.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const PROD_REF = 'gndnldyfudbytbboxesk'
const TEST_REF = 'vkapkibzokmfaxqogypq'
const env = Object.fromEntries(
  readFileSync('.env.test', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)
const URL_ = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
if (URL_.includes(PROD_REF)) throw new Error('SAFETY STOP: PRODUCTION')
if (!URL_.includes(TEST_REF)) throw new Error('SAFETY STOP: not TEST')
const db = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

/** The tiles the homepage actually renders, read from the component. */
function homepageTiles() {
  const src = readFileSync('src/components/features/home/category-nav-rail.tsx', 'utf8')
  const block = src.match(/const CATEGORIES[\s\S]*?\n\]/)?.[0] ?? ''
  return [...block.matchAll(/slug:\s*'([a-z0-9-]+)'/g)].map((m) => m[1])
}

/** The category slugs the homepage builds a rail for. */
function homepageRails() {
  const src = readFileSync('src/app/page.tsx', 'utf8')
  return [...src.matchAll(/byCategory\(\s*'([a-z0-9-]+)'/g)].map((m) => m[1])
}

const { data: cats, error } = await db.from('event_categories').select('id, slug, name, is_active')
if (error) throw new Error(error.message)
const bySlug = new Map(cats.map((c) => [c.slug, c]))

const events = []
for (let from = 0; ; from += 1000) {
  const { data } = await db
    .from('events')
    .select('slug, tags, category_id')
    .eq('status', 'published')
    .range(from, from + 999)
  if (!data?.length) break
  events.push(...data)
  if (data.length < 1000) break
}
const countFor = (id) => events.filter((e) => e.category_id === id).length

console.log('CATEGORY TAXONOMY (R1)')
console.log(`target: TEST ${URL_}\n`)
const failures = []

// --- a. every merchandised slug exists ---------------------------------------
const merchandised = [...new Set([...homepageTiles(), ...homepageRails()])].sort()
console.log(`--- a. every category the homepage merchandises exists (${merchandised.length}) ---`)
const missing = merchandised.filter((s) => !bySlug.has(s))
for (const slug of merchandised) {
  const row = bySlug.get(slug)
  console.log(
    `  ${slug.padEnd(22)} ${row ? `EXISTS  ${String(countFor(row.id)).padStart(3)} published event(s)` : '*** NO SUCH CATEGORY ***'}`,
  )
}
if (missing.length) {
  console.log(`  [FAIL] ${missing.length} merchandised categor(ies) match no row: ${missing.join(', ')}`)
  failures.push(`${missing.length} merchandised categories do not exist: ${missing.join(', ')}`)
} else {
  console.log('  [PASS] every tile and every rail resolves to a real category')
}

// --- b. none of them is structurally empty -----------------------------------
console.log('\n--- b. none of them is a tile that can never show anything ---')
const empty = merchandised.filter((s) => bySlug.has(s) && countFor(bySlug.get(s).id) === 0)
if (empty.length) {
  console.log(`  ${empty.length} merchandised categor(ies) have 0 published events: ${empty.join(', ')}`)
  console.log('  That is a CONTENT GAP if the category is real, and a defect if it can never fill.')
} else {
  console.log('  [PASS] every merchandised category has at least one published event')
}

// --- c. the banned word is gone from the taxonomy ----------------------------
console.log('\n--- c. the banned word is gone from category slugs, names and tags ---')
const banned = /cultur/i
const badCats = cats.filter((c) => banned.test(c.slug) || banned.test(c.name))
const taggedBad = events.filter((e) => (e.tags ?? []).some((t) => banned.test(String(t))))
if (badCats.length) {
  console.log(`  [FAIL] ${badCats.length} categor(ies) still carry it: ${badCats.map((c) => `${c.slug} (${c.name})`).join(', ')}`)
  failures.push('the banned word survives in event_categories')
} else {
  console.log(`  [PASS] 0 of ${cats.length} categories carry it`)
}
/**
 * Proper nouns are NOT our taxonomy and are not ours to rewrite.
 *
 * The law bans the word across slugs, identifiers and data so that EventLinqs
 * never describes communities in the language it has rejected. It is not a
 * licence to rename somebody else's event. "Africultures Festival" is a real
 * Sydney festival and that is its actual name; renaming the tag would corrupt
 * an organiser's identity, break the term their audience types, and leave the
 * word in the event slug regardless.
 *
 * Each entry needs a reason on record, exactly like the copy-tell-gate
 * allowlist, so this can be overruled in one place instead of being an
 * unexplained exception buried in a regex.
 */
const PROPER_NOUNS = [
  {
    tag: 'africultures',
    reason: 'the registered name of the Africultures Festival, a real Sydney event, not our taxonomy',
  },
]
const properNounTags = new Set(PROPER_NOUNS.map((p) => p.tag))
const ours = taggedBad.filter((e) =>
  (e.tags ?? []).some((t) => banned.test(String(t)) && !properNounTags.has(String(t))),
)
const properNounEvents = taggedBad.filter((e) => !ours.includes(e))

if (ours.length) {
  const values = new Set()
  for (const e of ours) {
    for (const t of e.tags ?? []) if (banned.test(String(t)) && !properNounTags.has(String(t))) values.add(String(t))
  }
  console.log(`  [FAIL] ${ours.length} published event(s) carry it in OUR taxonomy: ${[...values].join(', ')}`)
  failures.push(`${ours.length} events carry the banned word in tags we control`)
} else {
  console.log(`  [PASS] 0 of ${events.length} published events carry it in tags we control`)
}
if (properNounEvents.length) {
  console.log(`  ${properNounEvents.length} event(s) carry it inside a PROPER NOUN, deliberately left alone:`)
  for (const p of PROPER_NOUNS) console.log(`      ${p.tag}: ${p.reason}`)
  console.log('      Overrule by removing the entry from PROPER_NOUNS in this file.')
}

// --- d. the comedy repair ----------------------------------------------------
console.log('\n--- d. comedy-tagged events can reach the comedy category ---')
const comedy = bySlug.get('comedy')
const comedyTagged = events.filter((e) => (e.tags ?? []).includes('comedy'))
if (!comedy) {
  console.log('  [FAIL] there is no comedy category')
  failures.push('no comedy category')
} else {
  const inComedy = comedyTagged.filter((e) => e.category_id === comedy.id).length
  const stranded = comedyTagged.filter((e) => e.category_id !== comedy.id)
  console.log(`  events tagged comedy      : ${comedyTagged.length}`)
  console.log(`  now in the comedy category: ${inComedy}`)
  if (stranded.length) {
    // Being in ANOTHER specific category is a legitimate organiser choice, so
    // only an uncategorised leftover is a failure of the repair.
    const uncategorised = stranded.filter((e) => !e.category_id)
    console.log(`  in a different category   : ${stranded.length - uncategorised.length} (an organiser choice, left alone)`)
    if (uncategorised.length) {
      console.log(`  [FAIL] ${uncategorised.length} comedy-tagged event(s) still have no category at all`)
      failures.push(`${uncategorised.length} comedy-tagged events left uncategorised`)
    }
  }
  if (inComedy > 0) console.log('  [PASS] the comedy tile and the comedy rail can render')
}

console.log(`\n===== ${failures.length ? `${failures.length} FAILED` : 'ALL GREEN'} =====`)
for (const f of failures) console.log(`  ${f}`)
process.exit(failures.length ? 1 : 0)
