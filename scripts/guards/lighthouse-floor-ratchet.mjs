/**
 * GUARD: a Lighthouse floor only ever RISES, and no assertion is ever weakened.
 *
 * WHY THIS EXISTS. Close-out P0 and H5 say the same thing four times over, which
 * is how you can tell it is the thing that keeps happening:
 *
 *   "The gate stays at minScore 0.80 and above. Never lower a threshold, never
 *    move an assertion from error to warn, never add a waiver, never make a
 *    check non-blocking. The platform rises to meet the gate."   (P0)
 *   "The floor only ever RISES ... so the gain can never be given back."  (P0.7)
 *   "Never make a failing check non blocking, never lower a threshold."  (C16.5)
 *
 * Every one of those sentences is prose in a document, and prose does not fail a
 * build. On 8 September 2026 the platform finally cleared the 0.80 floor with
 * real headroom (medians 88 to 94 on the local gate, 93 to 98 on the runner) and
 * the floors were ratcheted per URL to just under the measured medians. That
 * gain is now one small JSON edit away from being handed back, and the edit that
 * hands it back looks exactly like the edit that earned it: a number in
 * lighthouserc.json going from 0.91 to 0.85, in a commit about something else,
 * to make a red push go green.
 *
 * So the high-water mark lives HERE, in code, beside the rule it enforces.
 *
 * WHAT IT REFUSES. Every assertion in lighthouserc.json's assertMatrix is
 * compared against HIGH_WATER below, and the build fails when any of these is
 * true:
 *
 *   - a minScore is BELOW its high-water mark          (a floor lowered)
 *   - a maxNumericValue is ABOVE its high-water mark   (a budget loosened)
 *   - an assertion level moves error -> warn or off    (a check made advisory)
 *   - an assertion in HIGH_WATER is gone from the file (a check deleted)
 *   - an assertion in the file is not in HIGH_WATER    (a check added undeclared)
 *   - a minScore is ABOVE its mark, or a cap BELOW it  (a RISE, not yet recorded)
 *
 * The last one is not pedantry and it is not a failure to celebrate an
 * improvement. It is what keeps the mark from rotting: a high-water mark that
 * silently trails the file is a mark nobody can trust, and the ratchet is only
 * worth something if the number in here IS the number in force. The failure
 * message prints the exact line to paste, so recording a rise costs one line.
 *
 * WHAT IT CANNOT DO, said plainly rather than implied. HIGH_WATER is source, and
 * source can be edited. Nothing in a repository can stop somebody lowering both
 * the config and the mark in the same commit. What this makes impossible is
 * doing it BY ACCIDENT or QUIETLY: the lowering stops being a one-character
 * change inside a JSON file nobody reads and becomes a deliberate edit to a file
 * whose header says, in the founder's own words, that it must never happen, plus
 * an edit to tests/unit/ci/lighthouse-floor-ratchet.test.ts, which pins the same
 * numbers as literals. Two files and a header, exactly the two-layer shape Law 8
 * uses for the same reason.
 *
 * WHAT THE NUMBERS MEAN. See lighthouserc.json's own _derivation note: each
 * performance floor is the LOWER of two independent local median-of-five
 * collections, minus 3 points, minus 1 more where that URL's run spread exceeded
 * 5 points. The local gate is the binding environment because it measures 4 to 8
 * points below the runner on the same commit.
 *
 * Run standalone:  node scripts/guards/lighthouse-floor-ratchet.mjs
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = process.cwd()
const CONFIG = join(ROOT, 'lighthouserc.json')

/**
 * THE HIGH-WATER MARK. Set from the measured medians on 8 September 2026
 * (close-out P0.7 and L3), at commits 6824d3dc and 2ef19246.
 *
 * THESE NUMBERS ONLY EVER MOVE IN THE DIRECTION OF A STRICTER GATE: a minScore
 * up, a maxNumericValue down, a level from warn to error. Moving one the other
 * way to make a build green is the exact move close-out H5 forbids and this file
 * exists to stop.
 *
 * Key is `${matchingUrlPattern} :: ${assertion}`.
 */
const HIGH_WATER = {
  // The SEO category is off on every entry that carries it, permanently and by
  // design: this gate measures a Vercel preview, which is noindex, so
  // is-crawlable can never pass. The nine per-audit SEO floors below hold the
  // same bar audit by audit, and scripts/ci/assert-seo-audits.mjs asserts
  // indexability against the host. Recorded here so "off" cannot spread.
  '^(?!.*/(login|signup)$).* :: categories:seo': { level: 'off' },
  '^(?!.*/(login|signup)$).* :: canonical': { level: 'error', minScore: 1 },
  '^(?!.*/(login|signup)$).* :: crawlable-anchors': { level: 'error', minScore: 1 },
  '^(?!.*/(login|signup)$).* :: document-title': { level: 'error', minScore: 1 },
  '^(?!.*/(login|signup)$).* :: hreflang': { level: 'error', minScore: 1 },
  '^(?!.*/(login|signup)$).* :: http-status-code': { level: 'error', minScore: 1 },
  '^(?!.*/(login|signup)$).* :: image-alt': { level: 'error', minScore: 1 },
  '^(?!.*/(login|signup)$).* :: link-text': { level: 'error', minScore: 1 },
  '^(?!.*/(login|signup)$).* :: meta-description': { level: 'error', minScore: 1 },
  '^(?!.*/(login|signup)$).* :: robots-txt': { level: 'error', minScore: 1 },

  // The platform-wide floor. Bound by the three event-detail pages, the slowest
  // gated URLs: local medians 88, 88, 88 and 88, 88, 89 across two collections.
  '^(?!.*/(login|signup)$)(?!https?://[^/]+/?$).* :: categories:performance': {
    level: 'error',
    minScore: 0.85,
  },
  '^(?!.*/(login|signup)$)(?!https?://[^/]+/?$).* :: categories:accessibility': {
    level: 'error',
    minScore: 1,
  },
  '^(?!.*/(login|signup)$)(?!https?://[^/]+/?$).* :: categories:best-practices': {
    level: 'error',
    minScore: 1,
  },
  '^(?!.*/(login|signup)$)(?!https?://[^/]+/?$).* :: largest-contentful-paint': {
    level: 'warn',
    maxNumericValue: 4000,
  },
  '^(?!.*/(login|signup)$)(?!https?://[^/]+/?$).* :: total-blocking-time': {
    level: 'warn',
    maxNumericValue: 600,
  },
  '^(?!.*/(login|signup)$)(?!https?://[^/]+/?$).* :: cumulative-layout-shift': {
    level: 'error',
    maxNumericValue: 0.1,
  },
  '^(?!.*/(login|signup)$)(?!https?://[^/]+/?$).* :: first-contentful-paint': {
    level: 'warn',
    maxNumericValue: 2000,
  },
  '^(?!.*/(login|signup)$)(?!https?://[^/]+/?$).* :: speed-index': {
    level: 'warn',
    maxNumericValue: 4500,
  },

  // The event-detail critical-path budget. These name WHICH cost regressed
  // instead of reporting one number that hides it.
  '/events/[^/]+$ :: total-blocking-time': { level: 'error', maxNumericValue: 600 },
  '/events/[^/]+$ :: largest-contentful-paint': { level: 'error', maxNumericValue: 4500 },
  '/events/[^/]+$ :: mainthread-work-breakdown': { level: 'error', maxNumericValue: 3000 },
  '/events/[^/]+$ :: resource-summary:script:size': { level: 'error', maxNumericValue: 491520 },

  // Auth pages. Local medians 90 and 90 on both collections, 96 on the runner.
  '/(login|signup)$ :: categories:performance': { level: 'error', minScore: 0.87 },
  '/(login|signup)$ :: categories:accessibility': { level: 'error', minScore: 1 },
  '/(login|signup)$ :: categories:best-practices': { level: 'error', minScore: 1 },
  '/(login|signup)$ :: categories:seo': { level: 'off' },
  '/(login|signup)$ :: largest-contentful-paint': { level: 'warn', maxNumericValue: 4000 },
  '/(login|signup)$ :: total-blocking-time': { level: 'warn', maxNumericValue: 600 },
  '/(login|signup)$ :: cumulative-layout-shift': { level: 'error', maxNumericValue: 0.1 },
  '/(login|signup)$ :: first-contentful-paint': { level: 'warn', maxNumericValue: 2000 },
  '/(login|signup)$ :: speed-index': { level: 'warn', maxNumericValue: 4500 },

  // The per-URL ratchet. Static content pages, local medians 94 on both runs.
  '/(help|pricing|legal/terms)$ :: categories:performance': { level: 'error', minScore: 0.91 },
  // Browse and the organiser landing, local medians 92 then 91, and 91 then 91.
  '/(events|organisers)$ :: categories:performance': { level: 'error', minScore: 0.88 },
  // Community landings, local medians 92 and 92 with an 8 point run spread.
  '/community/[^/]+$ :: categories:performance': { level: 'error', minScore: 0.88 },
  // City browse, local medians 90 then 89.
  '/events/browse/[^/]+$ :: categories:performance': { level: 'error', minScore: 0.86 },

  // The homepage, ENFORCED. The Issue #42 warn waiver was deleted on
  // 8 September 2026 once the real cause turned out to be 217.8 KB of
  // error-reporting SDK inside the paint window rather than the image optimiser.
  '^https?://[^/]+/?$ :: categories:performance': { level: 'error', minScore: 0.88 },
  '^https?://[^/]+/?$ :: categories:accessibility': { level: 'error', minScore: 1 },
  '^https?://[^/]+/?$ :: categories:best-practices': { level: 'error', minScore: 1 },
  '^https?://[^/]+/?$ :: largest-contentful-paint': { level: 'warn', maxNumericValue: 4000 },
  '^https?://[^/]+/?$ :: total-blocking-time': { level: 'warn', maxNumericValue: 600 },
  '^https?://[^/]+/?$ :: cumulative-layout-shift': { level: 'error', maxNumericValue: 0.1 },
  '^https?://[^/]+/?$ :: first-contentful-paint': { level: 'warn', maxNumericValue: 2000 },
  '^https?://[^/]+/?$ :: speed-index': { level: 'warn', maxNumericValue: 4500 },
}

/** error is the strongest, then warn, then off. A move down this list is a weakening. */
const STRENGTH = { error: 2, warn: 1, off: 0 }

/**
 * Read every assertion out of the config as a flat, comparable shape.
 * Exported so the unit test reads the file the same way the guard does, rather
 * than restating the parse and drifting from it.
 */
export function readAssertions(config) {
  const found = new Map()
  for (const entry of config?.ci?.assert?.assertMatrix ?? []) {
    const pattern = entry.matchingUrlPattern
    if (!pattern) continue
    for (const [name, value] of Object.entries(entry.assertions ?? {})) {
      if (name.startsWith('_')) continue
      const key = `${pattern} :: ${name}`
      if (value === 'off') {
        found.set(key, { level: 'off' })
        continue
      }
      if (!Array.isArray(value)) continue
      const [level, options] = value
      const shape = { level }
      if (options && typeof options.minScore === 'number') shape.minScore = options.minScore
      if (options && typeof options.maxNumericValue === 'number') {
        shape.maxNumericValue = options.maxNumericValue
      }
      found.set(key, shape)
    }
  }
  return found
}

/**
 * The whole ruling, in one function, so the test can drive it without a build.
 * Returns a list of English faults; an empty list is the pass.
 */
export function judge(found, highWater = HIGH_WATER) {
  const faults = []

  for (const [key, mark] of Object.entries(highWater)) {
    const now = found.get(key)
    if (!now) {
      faults.push(
        `DELETED   ${key}\n` +
          `            is in the high-water mark and no longer in lighthouserc.json.\n` +
          `            A check that is gone protects nothing. Restore it, or if it was\n` +
          `            genuinely replaced, record the replacement here in the same commit.`,
      )
      continue
    }

    if (STRENGTH[now.level] < STRENGTH[mark.level]) {
      faults.push(
        `WEAKENED  ${key}\n` +
          `            level ${mark.level} -> ${now.level}. Close-out H5: "never move an\n` +
          `            assertion from error to warn". The platform rises to meet the gate.`,
      )
    } else if (STRENGTH[now.level] > STRENGTH[mark.level]) {
      faults.push(
        `RISEN     ${key}\n` +
          `            level ${mark.level} -> ${now.level}, which is the right direction and is\n` +
          `            not yet recorded. Set level to '${now.level}' in HIGH_WATER so the mark IS\n` +
          `            the gate in force.`,
      )
    }

    if (typeof mark.minScore === 'number') {
      if (typeof now.minScore !== 'number') {
        faults.push(
          `DELETED   ${key}\n            had a minScore of ${mark.minScore} and now has none.`,
        )
      } else if (now.minScore < mark.minScore) {
        faults.push(
          `LOWERED   ${key}\n` +
            `            minScore ${mark.minScore} -> ${now.minScore}. THE FLOOR ONLY EVER RISES\n` +
            `            (close-out P0.7). A gain that can be given back was never a gain.`,
        )
      } else if (now.minScore > mark.minScore) {
        faults.push(
          `RISEN     ${key}\n` +
            `            minScore ${mark.minScore} -> ${now.minScore}, which is the right\n` +
            `            direction and is not yet recorded. Paste this into HIGH_WATER:\n` +
            `              '${key}': { level: '${now.level}', minScore: ${now.minScore} },`,
        )
      }
    }

    if (typeof mark.maxNumericValue === 'number') {
      if (typeof now.maxNumericValue !== 'number') {
        faults.push(
          `DELETED   ${key}\n` +
            `            had a cap of ${mark.maxNumericValue} and now has none.`,
        )
      } else if (now.maxNumericValue > mark.maxNumericValue) {
        faults.push(
          `LOOSENED  ${key}\n` +
            `            maxNumericValue ${mark.maxNumericValue} -> ${now.maxNumericValue}. A budget\n` +
            `            that rises to meet the page is not a budget. Close-out P0: the platform\n` +
            `            rises to meet the gate, never the other way round.`,
        )
      } else if (now.maxNumericValue < mark.maxNumericValue) {
        faults.push(
          `TIGHTENED ${key}\n` +
            `            maxNumericValue ${mark.maxNumericValue} -> ${now.maxNumericValue}, which is\n` +
            `            the right direction and is not yet recorded. Paste this into HIGH_WATER:\n` +
            `              '${key}': { level: '${now.level}', maxNumericValue: ${now.maxNumericValue} },`,
        )
      }
    }
  }

  for (const key of found.keys()) {
    if (key in highWater) continue
    const now = found.get(key)
    const shape = [
      `level: '${now.level}'`,
      typeof now.minScore === 'number' ? `minScore: ${now.minScore}` : null,
      typeof now.maxNumericValue === 'number' ? `maxNumericValue: ${now.maxNumericValue}` : null,
    ]
      .filter(Boolean)
      .join(', ')
    faults.push(
      `UNDECLARED ${key}\n` +
        `            is asserted in lighthouserc.json and is not in the high-water mark, so\n` +
        `            nothing stops it being weakened tomorrow. Paste this into HIGH_WATER:\n` +
        `              '${key}': { ${shape} },`,
    )
  }

  return faults
}

/**
 * RUN ONLY WHEN RUN. tests/unit/ci/lighthouse-floor-ratchet.test.ts imports judge()
 * and readAssertions() from this file; without this check the import would also
 * execute the guard, and a guard that sets process.exitCode inside a test run
 * turns a green suite red for a reason no test names. pathToFileURL, never a
 * hand-built file:// string: on Windows Node's own href is file:///C:/... and a
 * hand-built one is a slash short, so the check silently never matches.
 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = JSON.parse(readFileSync(CONFIG, 'utf8'))
  const found = readAssertions(config)
  const faults = judge(found)
  const marks = Object.keys(HIGH_WATER).length

  declareWork('lighthouse-floor-ratchet', {
    did: { 'assertion compared': found.size, 'high-water mark held': marks },
    found: { 'assertion weakened or left unrecorded': faults.length },
  })

  if (faults.length > 0) {
    console.error('[lighthouse-floor-ratchet] FAIL')
    for (const fault of faults) console.error(`  ${fault}`)
    console.error('')
    console.error('  The floor only ever rises. If this is a genuine improvement, record it in')
    console.error('  HIGH_WATER and in tests/unit/ci/lighthouse-floor-ratchet.test.ts in the same')
    console.error('  commit. If it is a lowering, it is refused: fix the page, not the gate.')
    process.exitCode = 1
  } else {
    console.log(
      `[lighthouse-floor-ratchet] PASS - ${found.size} assertions, all at or above their high-water mark.`,
    )
  }
}
