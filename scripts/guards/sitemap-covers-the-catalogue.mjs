/**
 * GUARD: THE SITEMAP AND THE CATALOGUE AGREE, IN BOTH DIRECTIONS.
 *
 * THE INVARIANT (close-out SEO2, 14 September 2026; the artist family added
 * 19 September 2026). Every published event, every organiser profile that is a
 * page, every venue profile that resolves and every artist a live lineup still
 * reaches is IN the sitemap; and every row-derived URL the sitemap publishes has
 * a row behind it that would answer 200. A build whose sitemap disagrees with its own
 * database does not fail, does not warn, and is invisible to lint, typecheck,
 * the build and every unit test. It is visible only by asking both.
 *
 * WHY THE INVARIANT IS WORTH A BLOCKING GUARD. Three sitemap defects are on
 * record in this repository and every one of them was SILENT:
 *
 *   - the venue block queried `venues.slug`, a column that has never existed.
 *     Postgres answered 42703, a bare `catch {}` threw it away, and the block
 *     published NOTHING for its whole life while looking exactly like a platform
 *     with no venues.
 *   - the organiser block had no `status` predicate and advertised eight
 *     'pending' organisations to Google, each of which answered 404.
 *   - 545 of 550 URLs were templated pages holding nothing, and Search Console
 *     reported them back as duplicates of one another (C19.3).
 *   - the artist block had no predicate at all and advertised every `artists`
 *     row whether or not any page on the site reached it. On 19 September 2026
 *     the reachability crawl caught it: `/artists/aurora-skies-wrejiu` answered
 *     200 and nothing linked to it, because the only internal link to an artist
 *     is a confirmed lineup on an event page and all four such events had ended.
 *     THAT IS THE ONE THIS GUARD DID NOT CATCH, and the reason it now judges a
 *     fourth family: the family was published by a reader no guard compared
 *     against the database, so it was governed by nothing.
 *
 * A missing page is the quiet failure: nothing breaks, the platform is simply
 * never found. An orphaned URL is the loud one: it is one of the five exclusion
 * reasons Search Console reported against this platform on 6 September 2026.
 *
 * HOW IT LOOKS. `src/app/sitemap.ts` cannot be executed outside Next, because it
 * reaches `next/cache` through the discovery counts, so no build-time check can
 * call it. Its four row-derived families were therefore moved into
 * `src/lib/seo/sitemap-catalogue.ts`, which CAN be executed anywhere, and which
 * the sitemap itself calls. `scripts/guards/lib/sitemap-catalogue-probe.mjs`
 * runs that module (the PUBLISHED side) and asks the same four questions again
 * over raw paged PostgREST with the predicate in the query string (the EXPECTED
 * side), sharing no query code at all, and prints both. Everything below is pure
 * over what it printed.
 *
 * THE ARTIST FAMILY CARRIES A FLAG, AND THE FLAG IS REPORTED RATHER THAN
 * SILENTLY OBEYED. `/artists/[slug]` 404s unless `broadcast_artists` is on, and
 * the sitemap block asks the same question before publishing. The flag is TRUE
 * on TEST and FALSE on production, so with it off both sides are empty BY
 * DESIGN and this guard is checking nothing about artists. It says so on the
 * PASS line instead of printing a zero that reads like a healthy platform with
 * no artists. The reader itself still runs on every build, so a broken artist
 * query fails here rather than on the day the owner flips the switch.
 *
 * THE DECISIONS:
 *
 *   PASS   both sides name the same URLs for all four families
 *   FAIL   a family MISSING a URL the database says is a page
 *   FAIL   a family publishing an ORPHANED URL with no row behind it
 *   FAIL   a reader returned an error. The sitemap logs that error and serves
 *          what it has, because a sitemap must never 500; a BUILD must refuse,
 *          because it would ship a sitemap advertising an empty catalogue. That
 *          split is the whole lesson of the 42703.
 *   FAIL   the read was truncated at the row cap, so neither side can be trusted
 *   SKIP   no real project URL (CI's typecheck build uses a placeholder), or no
 *          service key to ask with, each stated by name, because a guard that
 *          cannot look must say so rather than pass by silence
 *
 * WHAT IT CANNOT SEE, stated rather than implied. Whether a URL in the sitemap
 * actually answers 200 over HTTP. This guard determines it from the row: a
 * `/events/{slug}` whose event is published and public is a page, and one whose
 * event is not is a 404 waiting to happen. The FETCHED half is driven by
 * `scripts/verify/indexing-drive.mjs`, which requests every URL in the sitemap
 * against a running build and is a step of the pre-push gate. The two cover each
 * other: this one runs on every build with no server, that one runs once with a
 * server and no guesswork.
 *
 * Drilled red and green in scripts/verify/guard-failure-drills.mjs.
 *
 * Run standalone:
 *   node --env-file=.env.local scripts/guards/sitemap-covers-the-catalogue.mjs
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[sitemap-covers-the-catalogue]'
const ROOT = process.cwd()
const REAL_PROJECT = /^https:\/\/[a-z0-9]{20,}\.supabase\.co\/?$/

/**
 * The four families this guard judges, in the order a reader wants them.
 *
 * `artists` joined on 19 September 2026. It is last because it is the only one
 * that can legitimately be empty on a healthy platform: it is gated on the
 * `broadcast_artists` flag, which is off on production.
 */
export const FAMILIES = ['events', 'organisers', 'venues', 'artists']

/** How many differing URLs are named before the list is summarised. */
export const NAMED_LIMIT = 12

/**
 * One family, as the probe reports it: what the shipped readers published, what
 * the database says should be there, and the reader's own error if it had one.
 *
 * @typedef {{ publishedError: string | null, published: string[], expected: string[] }} FamilySide
 *
 * How many URLs each family published, expected, and differed by in each
 * direction. Declared rather than inferred because the caller reads it: without
 * this TypeScript infers the empty object literal it starts life as, and a test
 * that reads `counts.events` cannot compile.
 *
 * @typedef {Record<string, { published: number, expected: number, missing: number, orphaned: number }>} Counts
 */

/**
 * The verdict, pure over the probe's payload, so every row of the table above
 * is testable with no database and no network.
 *
 * @param {{ url?: string, serviceKey?: string, probe?: any }} input
 * @returns {{ verdict: 'PASS' | 'FAIL' | 'SKIP', reasons: string[], counts?: Counts }}
 */
export function decide({ url, serviceKey, probe }) {
  if (!url || !REAL_PROJECT.test(url)) {
    return { verdict: 'SKIP', reasons: ['no real Supabase project URL in this build (CI typecheck uses a placeholder), nothing to ask'] }
  }
  if (!serviceKey) {
    return { verdict: 'SKIP', reasons: ['no SUPABASE_SERVICE_ROLE_KEY in this build, and these tables are not readable by anon'] }
  }
  if (!probe || probe.looked !== true) {
    return { verdict: 'FAIL', reasons: [`the catalogue could not be read: ${probe?.reason ?? 'the probe printed nothing usable'}`] }
  }
  if (probe.truncated) {
    return {
      verdict: 'FAIL',
      reasons: [
        'the raw read hit the row cap, so neither side of this comparison describes the whole catalogue. ' +
          'Raise CATALOGUE_ROW_CAP in src/lib/seo/sitemap-catalogue.ts and the cap in the probe together.',
      ],
    }
  }

  const reasons = []
  /** @type {Counts} */
  const counts = {}
  for (const family of FAMILIES) {
    const side = probe.families?.[family]
    if (!side) {
      reasons.push(`the probe returned nothing for the ${family} family`)
      continue
    }
    if (side.publishedError) {
      // The 42703 case, restated for whoever reads the build log: the sitemap
      // would have served a page with this family silently missing.
      reasons.push(
        `the ${family} reader in src/lib/seo/sitemap-catalogue.ts returned an error, so the sitemap would ` +
          `publish NO ${family} URL at all and say nothing about it: ${side.publishedError}`,
      )
      continue
    }
    const published = new Set(side.published ?? [])
    const expected = new Set(side.expected ?? [])
    const missing = [...expected].filter(p => !published.has(p)).sort()
    const orphaned = [...published].filter(p => !expected.has(p)).sort()
    counts[family] = { published: published.size, expected: expected.size, missing: missing.length, orphaned: orphaned.length }
    if (missing.length > 0) {
      reasons.push(
        `${missing.length} ${family} page(s) the database holds are ABSENT from the sitemap, so Google is never ` +
          `told they exist: ${summarise(missing)}`,
      )
    }
    if (orphaned.length > 0) {
      reasons.push(
        `${orphaned.length} ${family} URL(s) in the sitemap have no row behind them and would answer 404 to ` +
          `Googlebot: ${summarise(orphaned)}`,
      )
    }
  }

  if (reasons.length > 0) return { verdict: 'FAIL', reasons, counts }
  return {
    verdict: 'PASS',
    reasons: FAMILIES.map(f => passLine(f, counts[f]?.published ?? 0, probe.artistsFlag)),
    counts,
  }
}

/**
 * One PASS line for one family.
 *
 * THE ARTIST ZERO IS EXPLAINED RATHER THAN PRINTED. "0 artists URL(s), and the
 * database agrees" is true with the flag off and it is also what a platform
 * whose artist query had silently broken would print. Those are different facts
 * and a guard that renders them identically has taught its reader to ignore the
 * line. With the flag off this says the flag is off and says the comparison did
 * not happen, which is the same discipline as the SKIP verdicts above: a guard
 * that cannot see must say so rather than pass by silence.
 *
 * @param {string} family
 * @param {number} published
 * @param {boolean | undefined} artistsFlag
 */
export function passLine(family, published, artistsFlag) {
  if (family === 'artists' && artistsFlag === false) {
    return 'the broadcast_artists flag is OFF, so the sitemap publishes no artist URL and /artists/[slug] answers 404; both sides are empty by design and no artist coverage was compared'
  }
  return `${published} ${family} URL(s), and the database agrees`
}

/**
 * A bounded, readable list. A guard that prints 400 URLs is a guard nobody reads.
 * @param {string[]} paths
 */
export function summarise(paths) {
  if (paths.length <= NAMED_LIMIT) return paths.join(', ')
  return `${paths.slice(0, NAMED_LIMIT).join(', ')} and ${paths.length - NAMED_LIMIT} more`
}

/**
 * Run the probe under the source alias loader and parse its one JSON line.
 *
 * THE SERVER-ONLY SHIM IS LOADED FIRST, AND IT IS NOT DECORATION. The probe
 * reads the `broadcast_artists` flag through the product's own resolver
 * (`src/lib/flags/broadcast.ts`), which reports its own failures through
 * `src/lib/observability/sentry.ts`, which imports `isInitialized` from
 * `@sentry/nextjs` - a name that package only exports through Next's own build.
 * Without the shim this probe dies at IMPORT and the guard reports
 * "the probe exited 1", which reads exactly like a broken database and is not
 * one. That misreading has cost this repository four drives in one day already.
 */
export function runProbe() {
  const result = spawnSync(
    process.execPath,
    [
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
      '--import',
      './scripts/lib/server-only-shim.mjs',
      '--import',
      './scripts/lib/src-alias-loader.mjs',
      join(ROOT, 'scripts', 'guards', 'lib', 'sitemap-catalogue-probe.mjs'),
    ],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  if (result.status !== 0) {
    return { looked: false, reason: `the probe exited ${result.status}: ${(result.stderr || result.stdout || '').trim().slice(0, 400)}` }
  }
  const line = (result.stdout || '').trim().split(/\r?\n/).find(l => l.startsWith('{'))
  if (!line) return { looked: false, reason: 'the probe printed no JSON' }
  try {
    return JSON.parse(line)
  } catch (e) {
    return { looked: false, reason: `the probe's answer did not parse: ${e instanceof Error ? e.message : String(e)}` }
  }
}

const invokedDirectly = process.argv[1] && /sitemap-covers-the-catalogue\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))
if (invokedDirectly) {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const canAsk = Boolean(url && REAL_PROJECT.test(url) && serviceKey)
  const probe = canAsk ? runProbe() : null
  const { verdict, reasons, counts } = decide({ url, serviceKey, probe })
  const ref = /^https:\/\/([a-z0-9]+)\./.exec(url)?.[1] ?? 'no project'
  declareWork('sitemap-covers-the-catalogue', {
    did: { 'catalogue probe run': canAsk ? 1 : 0, 'family compared': counts ? Object.keys(counts).length : 0 },
    found: {
      'URL published': counts ? FAMILIES.reduce((n, f) => n + (counts[f]?.published ?? 0), 0) : 0,
      'URL missing': counts ? FAMILIES.reduce((n, f) => n + (counts[f]?.missing ?? 0), 0) : 0,
      'URL orphaned': counts ? FAMILIES.reduce((n, f) => n + (counts[f]?.orphaned ?? 0), 0) : 0,
    },
    zeroIsFine: {
      'catalogue probe run': 'no real project URL or no service key in this build; the SKIP below names which',
      'family compared': 'either this build could not look, or a reader errored and the FAIL below names it',
    },
  })
  for (const reason of reasons) console.log(`${TAG} ${verdict} - project ${ref}: ${reason}`)
  // exitCode rather than exit(): on Windows a hard exit while a fetch socket is
  // still open reports a crash code instead of 1.
  if (verdict === 'FAIL') process.exitCode = 1
}
