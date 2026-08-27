/**
 * GUARD: every curated homepage category slug exists in `event_categories`.
 *
 * FOUNDER RULING, 26 August 2026:
 *
 *   "Validate every curated slug against event_categories AT BUILD TIME so a
 *   slug can never vanish or drift silently again."
 *
 * THE TWO FAILURES THIS CLOSES, which are opposite directions of one class.
 *
 * DRIFT, which had already happened. The homepage carried `{ slug, name }`
 * pairs typed by hand. Five of the nine names had wandered away from the
 * database with nothing anywhere comparing them: "Arts and theatre" against
 * "Arts & Community", "Sport" against "Sports", "Business" against
 * "Business & Networking", "Festivals" against "Festival", "Food and drink"
 * against "Food & Drink". A category renamed in the database changed on
 * /events and stayed frozen on the homepage. That half is now structurally
 * impossible: the name is read from the database at render time and there is
 * no second copy to drift.
 *
 * DISAPPEARANCE, which had not happened yet and is why this guard exists. With
 * the name derived, a curated slug that no longer matches any row renders
 * NOTHING: the tile is dropped and the homepage quietly shows eight tiles where
 * it showed nine. That is the same silent-subtraction shape as the ten rails
 * that vanished when the demo events were deleted, and it would be found the
 * same way, by the founder looking at his own homepage.
 *
 * WHAT IT READS. The curated list out of src/lib/categories/homepage-curation.ts
 * and the live `event_categories` table. Both, every run, so it cannot pass by
 * comparing a file to itself.
 *
 * WHY IT CAN ACTUALLY RUN ON PREBUILD. `npm run build` already refuses to start
 * without NEXT_PUBLIC_SUPABASE_URL and a key, enforced by the public-env guard,
 * so a build that reaches this point has a reachable database by construction.
 * If the credentials are genuinely absent this guard says so and FAILS rather
 * than skipping: a check that cannot look is not a check that passed.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const CURATION_FILE = 'src/lib/categories/homepage-curation.ts'
const TABLE = 'event_categories'

/** The curated slugs, parsed from the one file that declares them. */
function curatedSlugs() {
  const src = readFileSync(CURATION_FILE, 'utf8')
  const block = /CURATED_HOMEPAGE_CATEGORY_SLUGS[^=]*=\s*\[([\s\S]*?)\]/.exec(src)
  if (!block) {
    console.error(`FAIL: could not find CURATED_HOMEPAGE_CATEGORY_SLUGS in ${CURATION_FILE}.`)
    process.exit(1)
  }
  return [...block[1].matchAll(/'([^']+)'/g)].map(m => m[1])
}

/*
 * CREDENTIALS. prebuild always has them, because `npm run build` refuses to
 * start without NEXT_PUBLIC_SUPABASE_URL. A bare `npm run guards` or the drill
 * harness may not, so a local .env.test is read as a fallback BEFORE giving up.
 * That is not a bypass: with neither the environment nor the file, this still
 * fails rather than skipping.
 */
if (!process.env.NEXT_PUBLIC_SUPABASE_URL && existsSync('.env.test')) {
  for (const line of readFileSync('.env.test', 'utf8').split(String.fromCharCode(10))) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/**
 * IS THERE A DATABASE TO CHECK AGAINST AT ALL?
 *
 * CI's `lint · typecheck · build` job builds with PLACEHOLDER Supabase values on
 * purpose: it is a compile and type check, not a data check, and its own env
 * guard reports the stub as "27 characters, below the 30-character minimum".
 * There is no database behind it and there is not meant to be.
 *
 * This guard failed that job on 27 August 2026 with "could not read
 * event_categories: TypeError: fetch failed", which is not drift. It is the
 * guard reporting the absence of a database as though it were a finding.
 *
 * So the distinction is drawn explicitly, and it is narrow:
 *
 *   no real project URL   -> SKIP, loudly, naming why. There is nothing to
 *                            compare against, and saying "drift" would be false.
 *   real project URL      -> CHECK, and FAIL on an unreachable database, because
 *                            that IS "could not look" on a build that has one.
 *
 * A deployable build always carries real values (the public-env guard refuses to
 * start otherwise), so nothing that ships can reach the skip.
 */
const REAL_PROJECT = /^https:\/\/[a-z0-9]{20,}\.supabase\.co\/?$/
const hasRealProject = typeof url === 'string' && REAL_PROJECT.test(url.trim())

const curated = curatedSlugs()
console.log(`curated-categories-exist: ${curated.length} curated slug(s) read from ${CURATION_FILE}`)

if (url && !hasRealProject) {
  console.log('')
  console.log('SKIP: NEXT_PUBLIC_SUPABASE_URL is not a real Supabase project URL')
  console.log(`      (${url.length} characters), so there is no taxonomy to compare against.`)
  console.log('      This is the CI typecheck build, which uses placeholders by design.')
  console.log('      A build that deploys carries real values and is checked.')
  process.exit(0)
}

if (!url || !key) {
  console.error('')
  console.error('FAIL: no Supabase URL or key in the environment, so the curated slugs')
  console.error('      could not be checked against the database.')
  console.error('')
  console.error('This guard FAILS rather than skipping. A build that cannot see the')
  console.error('taxonomy cannot know whether the homepage is about to drop a tile, and')
  console.error('"could not look" reported as a pass is the shape this repository has')
  console.error('spent a week removing.')
  process.exit(1)
}

const supabase = createClient(url, key)
const { data, error } = await supabase.from(TABLE).select('slug, name')

if (error) {
  console.error('')
  console.error(`FAIL: could not read ${TABLE}: ${error.message}`)
  process.exit(1)
}

const live = new Map((data ?? []).map(c => [c.slug, c.name]))
console.log(`  ${live.size} row(s) in ${TABLE}`)

const missing = curated.filter(s => !live.has(s))
for (const s of curated) {
  console.log(`    ${live.has(s) ? 'ok     ' : 'MISSING'} ${s.padEnd(22)} ${live.get(s) ?? ''}`)
}

if (missing.length > 0) {
  console.error('')
  console.error(`FAIL: ${missing.length} curated homepage slug(s) do not exist in ${TABLE}:`)
  for (const s of missing) console.error(`  ${s}`)
  console.error('')
  console.error('The homepage derives its tile NAMES from that table, so each of these')
  console.error('would render nothing at all: the rail would silently show fewer tiles')
  console.error('than it is meant to, and nobody would be told.')
  console.error(`Fix the slug in ${CURATION_FILE}, or add the row.`)
  process.exit(1)
}

console.log('')
console.log(`PASS: all ${curated.length} curated homepage categories exist in ${TABLE}.`)
