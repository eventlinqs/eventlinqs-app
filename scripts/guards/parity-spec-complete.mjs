/**
 * GUARD: EVERY TABLE-STAKES LINE HAS A CHECK THAT ACTUALLY CHECKS SOMETHING.
 *
 * ============================================================================
 * THE INVARIANT, AS CLOSE-OUT PARITY1 STATES IT
 * ============================================================================
 *
 * "Every line in the table stakes list has a corresponding automated check, and
 * a line with no check fails the build."
 *
 * The item exists because "the structured data gap, the noindex discovery layer
 * and the undisclosed buyer total were all found because the owner asked a
 * question, not because the build noticed". A specification with a line nobody
 * wired up is the same failure in a new costume: it reads as coverage and
 * provides none.
 *
 * ============================================================================
 * THE SIX CLAUSES
 * ============================================================================
 *
 * CLAUSE 1. THE SPECIFICATION EXISTS AND IS NOT EMPTY. PARITY1's reversal
 *           condition is explicit: "the job can be disabled by configuration
 *           but the specification cannot be deleted, because the specification
 *           is the record of what the platform has promised itself." So the
 *           file is required to exist and to export the list, and the FLOOR on
 *           its length is the owner's own count.
 *
 * CLAUSE 2. EVERY ENTRY IS COMPLETE. An id, the owner's line verbatim, a `why`
 *           a reader can act on, and a check that is a function.
 *
 * CLAUSE 3. EVERY CHECK ACTUALLY CHECKS. This is the one that matters, and it
 *           is the only clause that can tell a real check from a decorative
 *           one. Each check is run against an EMPTY snapshot: a world where
 *           production served nothing at all. A check that returns `pass` there
 *           is passing on no evidence, which is precisely "a line with no
 *           check". A check that THROWS there is one that will throw in the
 *           field too, on the day production is down, and a crash is not a
 *           verdict.
 *
 * CLAUSE 4. EVERY LINE IS NAMED BY A TEST. Acceptance line 2 of the item is "a
 *           test proves the check fails when a known good page is altered to
 *           violate one line, ONCE PER LINE". A line whose id appears nowhere
 *           in that test file has no such proof.
 *
 * CLAUSE 5. THE IDS ARE UNIQUE, so a report cannot name two lines with one
 *           word and a test cannot think it covered a line it did not.
 *
 * CLAUSE 6. THE DISABLE SWITCH CANNOT REACH THE SPECIFICATION. The reversal
 *           condition allows the JOB to be switched off by configuration and
 *           forbids the LIST from being deleted. A `PARITY_CHECK_DISABLED` read
 *           inside the spec would collapse the two: turning the job off would
 *           silently empty the record of what the platform promised. So the
 *           switch is allowed in the runner and refused in the list.
 *
 * WHAT IT CANNOT SEE, said rather than implied: whether a check is judging the
 * RIGHT thing. Nothing static can. What answers that is the run itself against
 * production, and the first one is recorded in BUILD-LOG-C.md, including the
 * three false positives the alt-text line produced before it was corrected.
 *
 * Run: node scripts/guards/parity-spec-complete.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const TAG = '[parity-spec-complete]'

export const SPEC_FILE = 'scripts/lib/parity-spec.mjs'
export const TEST_FILE = 'tests/unit/parity/parity-spec.test.ts'

/**
 * The floor, which is the owner's own count in close-out PARITY1 step 1.
 *
 * A FLOOR rather than an exact number: adding a sixteenth table-stakes line is
 * a good thing and must not need this constant edited before it can land.
 * Losing one is not, and that is what this catches.
 */
export const MINIMUM_LINES = 15

/**
 * The empty world clause 3 runs every check against.
 *
 * Deliberately shaped like a snapshot and holding nothing: production answered
 * no sitemap, served no page, and every probe came back zero. Any honest check
 * reports `fail` or `blind` here. Only a check that is not looking at anything
 * can report `pass`.
 */
export function emptySnapshot() {
  return {
    site: 'https://example.invalid',
    at: new Date(0).toISOString(),
    sitemap: { status: 0, urls: [] },
    pages: {},
    probes: {},
    leafEventUrl: null,
    soldOutEventUrl: null,
    pastEventUrl: null,
  }
}

/** Pure judgement over the facts, so the unit test can drive it. */
export function judgeSpec({ lines, testSource, specSource, verdictsOnEmpty }) {
  const failures = []

  if (!Array.isArray(lines) || lines.length === 0) {
    failures.push(
      `${SPEC_FILE} exports no table-stakes list. PARITY1's reversal condition says the ` +
        'specification cannot be deleted: it is the record of what the platform has promised itself.',
    )
    return failures
  }

  if (lines.length < MINIMUM_LINES) {
    failures.push(
      `the table-stakes list holds ${lines.length} line(s), and the owner's own list in ` +
        `close-out PARITY1 has ${MINIMUM_LINES}. A line was removed rather than answered.`,
    )
  }

  const seen = new Set()
  for (const entry of lines) {
    const id = entry?.id ?? '(no id)'
    if (typeof entry?.id !== 'string' || entry.id.trim() === '') {
      failures.push(`a table-stakes entry has no id: ${JSON.stringify(entry?.line ?? entry)}`)
      continue
    }
    if (seen.has(entry.id)) failures.push(`two table-stakes entries share the id "${entry.id}"`)
    seen.add(entry.id)

    if (typeof entry.line !== 'string' || entry.line.trim() === '') {
      failures.push(`${id} carries no line. It must quote the owner's words, so a report says what he asked for.`)
    }
    if (typeof entry.why !== 'string' || entry.why.trim().length < 20) {
      failures.push(
        `${id} carries no usable "why". A P1 raised without one is a task nobody can prioritise.`,
      )
    }
    if (typeof entry.check !== 'function') {
      failures.push(`${id} HAS NO CHECK. A line with no check fails the build (PARITY1's guard clause).`)
    }
  }

  for (const [id, verdict] of Object.entries(verdictsOnEmpty ?? {})) {
    if (verdict.threw) {
      failures.push(
        `${id} THREW against an empty snapshot (${verdict.threw}). A check must answer when ` +
          'production served nothing, because that is the day it matters most, and a crash is not a verdict.',
      )
      continue
    }
    if (verdict.state === 'pass') {
      failures.push(
        `${id} reports PASS against an empty snapshot, where production served nothing at all. ` +
          'It is not looking at anything, which is what "a line with no check" looks like from outside.',
      )
    }
  }

  if (typeof specSource === 'string' && /PARITY_CHECK_DISABLED|process\.env/.test(specSource)) {
    failures.push(
      `${SPEC_FILE} reads configuration. The reversal condition switches off the JOB and never ` +
        'the list: a specification that can be emptied by an environment variable is not a record ' +
        'of anything. Keep the switch in scripts/ops/parity-check.mjs.',
    )
  }

  if (typeof testSource === 'string') {
    for (const entry of lines) {
      if (typeof entry?.id === 'string' && !testSource.includes(entry.id)) {
        failures.push(
          `${entry.id} is named nowhere in ${TEST_FILE}. Acceptance line 2 of PARITY1 is a test ` +
            'that breaks a known good page once per line; this line has no such proof.',
        )
      }
    }
  } else {
    failures.push(`${TEST_FILE} does not exist, so no line has a proof that its check goes red.`)
  }

  return failures
}

/** Gather the facts from the live tree. */
export async function collectSpecFacts() {
  const specPath = join(ROOT, SPEC_FILE)
  if (!existsSync(specPath)) {
    return { lines: [], testSource: null, specSource: null, verdictsOnEmpty: {} }
  }
  const specSource = readFileSync(specPath, 'utf8')
  const mod = await import(`file://${specPath.replace(/\\/g, '/')}`)
  const lines = mod.PARITY_LINES ?? []

  const testPath = join(ROOT, TEST_FILE)
  const testSource = existsSync(testPath) ? readFileSync(testPath, 'utf8') : null

  const empty = emptySnapshot()
  const verdictsOnEmpty = {}
  for (const entry of lines) {
    if (typeof entry?.check !== 'function' || typeof entry?.id !== 'string') continue
    try {
      verdictsOnEmpty[entry.id] = entry.check(empty)
    } catch (error) {
      verdictsOnEmpty[entry.id] = { threw: error.message }
    }
  }
  return { lines, testSource, specSource, verdictsOnEmpty }
}

const isMain = process.argv[1] && /parity-spec-complete\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))
if (isMain) {
  const facts = await collectSpecFacts()
  const failures = judgeSpec(facts)

  declareWork('parity-spec-complete', {
    did: {
      'table-stakes line judged': facts.lines.length,
      'check run against an empty world': Object.keys(facts.verdictsOnEmpty).length,
    },
    found: { 'specification defect': failures.length },
  })

  for (const entry of facts.lines) {
    const v = facts.verdictsOnEmpty[entry.id]
    console.log(`${TAG}   ${entry.id} -> ${v?.threw ? 'THREW' : (v?.state ?? 'no check')} on an empty world`)
  }

  if (failures.length > 0) {
    console.error(`\n${TAG} FAILED\n`)
    for (const f of failures) console.error(`    ${f}`)
    console.error('')
    process.exit(1)
  }
  console.log(
    `${TAG} PASS - ${facts.lines.length} table-stakes line(s), every one with a check that answers ` +
      'on no evidence rather than passing on it, and every one named by a test.',
  )
}
