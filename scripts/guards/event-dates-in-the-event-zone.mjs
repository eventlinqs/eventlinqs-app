/**
 * GUARD: NO RENDERING SURFACE PINS A DATE TO UTC.
 *
 * ============================================================================
 * THE DEFECT, WHICH SHIPPED ON EIGHT SURFACES AT ONCE
 * ============================================================================
 *
 * Every reader of this platform is in Australia, between UTC+8 and UTC+11.
 * `src/lib/dates/event-time.ts` exists for exactly that reason and its comments
 * say so: `formatEventDateShort(iso, timezone)` renders "Fri 14 Aug" in the
 * EVENT's own zone, and `resolveZone` falls back to the platform zone "rather
 * than the runtime's, because the runtime's is the bug: it differs between the
 * server and every reader".
 *
 * Eight components ignored all of it and wrote their own:
 *
 *     new Date(iso).toLocaleDateString('en-AU', { ..., timeZone: 'UTC' })
 *
 * event-bento-tile, event-card, event-sold-out, featured-event-hero,
 * m5-events-map, this-week-card, FeaturedHero and home-hero. Any event starting
 * before 10:00 AEST (08:00 AWST) is on the previous day in UTC, so EVERY MORNING
 * EVENT IN AUSTRALIA SHOWED THE WRONG DAY on its card: markets, workshops,
 * family events, Saturday sport. Found on 19 September 2026 by reading a drive
 * screenshot rather than its report: a card read "FRI, 18 SEPT" for an event
 * that starts Saturday 19 September at 09:00 AEST.
 *
 * IT WAS ALREADY KNOWN, AND THAT IS THE PART THIS GUARD IS REALLY FOR.
 * `trending-events-bento.tsx` carries a comment describing this exact bug ("A
 * Perth event at 9pm therefore showed the NEXT DAY to a reader in Sydney, on the
 * homepage's most prominent rail") and was fixed on its own. One surface was
 * repaired and eight identical ones were left standing, because nothing looked
 * for the others. That is what a guard is for and a comment is not.
 *
 * ============================================================================
 * WHAT IT CHECKS
 * ============================================================================
 *
 *   CLAUSE 1. No file under src/components/ or src/app/ contains the literal
 *             `timeZone: 'UTC'`. Those two trees RENDER FOR A READER, and a
 *             reader is in Australia. Dates there go through
 *             src/lib/dates/event-time.ts.
 *
 *   CLAUSE 2. src/lib/dates/event-time.ts still exports the two formatters
 *             every surface is sent to. Without this, renaming one of them
 *             leaves clause 1 telling people to import something that is not
 *             there while this guard reports a pass.
 *
 * ============================================================================
 * WHAT IT DELIBERATELY DOES NOT CHECK
 * ============================================================================
 *
 * IT DOES NOT BAN UTC UNDER src/lib/. Two helpers there pin UTC and both are
 * CORRECT, which is why the boundary is drawn at the rendering trees rather than
 * at the whole of src/:
 *
 *   src/lib/events/generated-cover.ts   takes a LOCAL wall clock string, builds
 *                                       a Date from those same components as if
 *                                       they were UTC, and formats in UTC. That
 *                                       renders the organiser's typed time
 *                                       verbatim, which is the point.
 *   src/lib/community-moments/          parses a DATE-ONLY value as `...T00:00:00Z`.
 *   get-moments-ahead.ts                A date with no time has no zone, and
 *                                       formatting it in UTC renders it verbatim.
 *
 * IT IS EVADABLE BY NAMING A CONSTANT, and that is deliberate rather than an
 * oversight. `src/components/launch/draft-event-preview.tsx` writes
 * `const DRAFT_ZONE = 'UTC'` with a paragraph explaining that a draft preview
 * must look identical to every reader on every machine, and passes that. Naming
 * a constant and writing the reason down is the deliberate act this rule wants
 * people to perform; a copy-pasted literal is the accident it wants to stop.
 *
 * IT CANNOT SEE a surface that omits `timeZone` altogether, which falls back to
 * the RUNTIME zone and is the same bug without the literal. That is the shape
 * trending-events-bento had. Stating it here rather than implying coverage: the
 * defence against it is that every event-carrying type on these paths now
 * requires a `timezone` field, so a component has the right answer to hand.
 *
 * Drilled red and green in scripts/verify/guard-failure-drills.mjs.
 *
 * Run standalone:
 *   node scripts/guards/event-dates-in-the-event-zone.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[event-dates-in-the-event-zone]'
const ROOT = process.cwd()

/** The trees that render for a reader. */
export const RENDERING_TREES = ['src/components', 'src/app']

/** Where a date is allowed to be formatted. */
export const FORMATTER_MODULE = 'src/lib/dates/event-time.ts'

/** The formatters clause 2 requires that module to keep offering. */
export const REQUIRED_EXPORTS = ['formatEventDate', 'formatEventDateShort']

/** The literal this guard refuses. Both quote styles. */
export const PINNED_UTC = /timeZone:\s*['"]UTC['"]/

/**
 * The verdict for one file, pure so the table is testable with no filesystem.
 *
 * @param {string} rel repo-relative path, forward slashes
 * @param {string} source
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function judgeFile(rel, source) {
  if (!PINNED_UTC.test(source)) return { ok: true }
  const line = source.split(/\r?\n/).findIndex(l => PINNED_UTC.test(l)) + 1
  return {
    ok: false,
    reason:
      `${rel}:${line} pins a date to UTC on a surface that renders for a reader. Every reader of this ` +
      `platform is between UTC+8 and UTC+11, so any event starting before 10:00 AEST is shown on the ` +
      `PREVIOUS DAY: that is every morning market, workshop and Saturday sport on the platform. Eight ` +
      `components shipped this at once. Use formatEventDateShort(iso, timezone) or ` +
      `formatEventDate(iso, timezone) from @/lib/dates/event-time, which format in the EVENT's own zone. ` +
      `If this really is a zone-less wall clock rather than an instant, say so in a named constant with ` +
      `the reason, as src/components/launch/draft-event-preview.tsx does.`,
  }
}

/**
 * Clause 2, pure.
 * @param {string} source
 * @returns {string[]} the missing export names
 */
export function missingExports(source) {
  return REQUIRED_EXPORTS.filter(name => !new RegExp(`export\\s+function\\s+${name}\\b`).test(source))
}

/** Every .ts/.tsx file under `dir`, repo-relative with forward slashes. */
export function sourceFiles(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      sourceFiles(full, out)
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue
    out.push(relative(ROOT, full).replace(/\\/g, '/'))
  }
  return out
}

const invokedDirectly =
  process.argv[1] && /event-dates-in-the-event-zone\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))
if (invokedDirectly) {
  const failures = []
  const files = RENDERING_TREES.flatMap(tree => sourceFiles(join(ROOT, tree)))

  for (const rel of files) {
    const verdict = judgeFile(rel, readFileSync(join(ROOT, rel), 'utf8'))
    if (!verdict.ok) failures.push(verdict.reason)
  }

  let formatterSource = ''
  try {
    formatterSource = readFileSync(join(ROOT, FORMATTER_MODULE), 'utf8')
  } catch (error) {
    failures.push(
      `${FORMATTER_MODULE} could not be read: ${error instanceof Error ? error.message : String(error)}. ` +
        `Every rendering surface is sent there for a date, so its absence makes this guard's own ` +
        `instruction impossible to follow.`,
    )
  }
  const gone = formatterSource ? missingExports(formatterSource) : []
  if (gone.length > 0) {
    failures.push(
      `${FORMATTER_MODULE} no longer exports ${gone.join(', ')}. This guard tells every surface to import ` +
        `those names, so a rename leaves it giving an impossible instruction while reporting a pass. ` +
        `Restore the name or update REQUIRED_EXPORTS here in the same commit.`,
    )
  }

  declareWork('event-dates-in-the-event-zone', {
    did: { 'rendering file read': files.length },
    found: { 'date pinned to UTC on a rendering surface': failures.length },
    zeroIsFine: {
      'date pinned to UTC on a rendering surface':
        'every date on a rendering surface goes through src/lib/dates/event-time.ts, which is the point',
    },
  })

  if (failures.length > 0) {
    console.error(`\n${TAG} FAIL - ${failures.length} problem(s):`)
    for (const f of failures) console.error(`  - ${f}`)
    process.exitCode = 1
  } else {
    console.log(
      `${TAG} PASS - ${files.length} file(s) under ${RENDERING_TREES.join(' and ')}, none pinning a date to ` +
        `UTC, and ${FORMATTER_MODULE} still exports ${REQUIRED_EXPORTS.join(', ')}.`,
    )
  }
}
