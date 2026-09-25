/**
 * GUARD: THE AUDIT LOG SAYS WHEN IT COULD NOT WRITE.
 *
 * ---------------------------------------------------------------------------
 * THE TWO DEFECTS THIS EXISTS TO STOP, both found on 20 September 2026 in the
 * module that has written every admin action since the console was built.
 *
 * ONE. THE TRY/CATCH COULD NOT SEE THE FAILURE IT WAS WRITTEN FOR. Both writers
 * did this:
 *
 *     await createAdminClient().from('audit_log').insert({ ... })
 *
 * with no destructure at all. A PostgREST client REPORTS a refused write in
 * `error` and does not throw, so a refusal, an RLS denial, a constraint or a
 * bad column resolved normally and fell straight through the `try`. The catch
 * only ever guarded `headers()`.
 *
 * TWO. IN PRODUCTION IT SAID NOTHING AT ALL:
 *
 *     } catch (err) {
 *       // Sentry hook lands in Session 2 hardening. Until then, swallow.
 *       if (process.env.NODE_ENV !== 'production') { console.warn(...) }
 *     }
 *
 * The one environment where an audit trail is evidence is the one where its
 * absence left no trace. Session 2 was months earlier.
 *
 * WHY IT MATTERS MORE HERE THAN ALMOST ANYWHERE. This platform suspends
 * organisers, moves fee-free windows, holds payouts and refunds money through
 * these two functions. An entry nobody can find afterwards is indistinguishable
 * from an action nobody took, and the person who needs it is reading months
 * later with no way to tell the difference.
 *
 * ---------------------------------------------------------------------------
 * WHY A GUARD RATHER THAN THE TESTS ALONE. The tests pin the two functions as
 * they are written today. They cannot see a THIRD writer added next to them
 * with the same habits, and they cannot see somebody re-adding the NODE_ENV
 * gate to quieten a noisy log. Both are one-line regressions with no symptom:
 * every admin action still works, and the trail just thins out.
 *
 * FOUR CLAUSES.
 *   1. every insert into `audit_log` in this module binds its `error`.
 *   2. the failure path is never gated on the environment.
 *   3. both writers reach the error reporter.
 *   4. neither writer throws, because an audit failure must not fail the
 *      action that was already taken. That is the half of the original
 *      contract that was right and it is easy to lose while fixing the rest.
 *
 * Run standalone:  node scripts/guards/the-audit-log-says-when-it-could-not-write.mjs
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { readSource, lineAt } from './lib/source.mjs'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = resolve(import.meta.dirname, '..', '..')
const TAG = '[the-audit-log-says-when-it-could-not-write]'

/** The module that owns the audit trail. */
const WRITER = 'src/lib/admin/audit.ts'
/** The two functions that put a row in the table. */
const WRITERS = ['recordAuditEvent', 'recordAnonAuditEvent']
/** What a failure must reach. */
const REPORTER = 'captureException'

const failures = []
const notes = []
const work = { writers: 0, inserts: 0, clauses: 0 }

const absolute = resolve(ROOT, WRITER)
if (!existsSync(absolute)) {
  failures.push(
    `${WRITER} does not exist. Either the audit writer moved, in which case this guard now judges ` +
      'nothing and would report PASS, or it was deleted. Fix the path rather than the symptom.',
  )
} else {
  const { raw, withStrings } = readSource(absolute)

  // ---------------------------------------------------------------- clause 1
  /*
   * COMMENTS STRIPPED, because this file's own header quotes the defective line
   * as the thing being stopped, and a scanner that read comments would fail the
   * build on the explanation of the bug rather than on the bug.
   */
  for (const match of withStrings.matchAll(/\.from\(\s*['"]audit_log['"]\s*\)\s*\.?\s*\n?\s*\.insert\(/g)) {
    work.inserts += 1
    const line = lineAt(raw, match.index)
    /*
     * The binding sits BEFORE the chain, `const { error } = await ...`, so the
     * 200 characters before the `.from(` are what to read. A chain walker is
     * the wrong tool here: the question is about the assignment, not the query.
     */
    const preceding = withStrings.slice(Math.max(0, match.index - 200), match.index)
    if (!/const\s*\{[^}]*\berror\b[^}]*\}\s*=\s*await\b/.test(preceding)) {
      failures.push(
        `${WRITER}:${line} inserts into audit_log without binding \`error\`. A PostgREST client REPORTS ` +
          'a refused write and does not throw, so the surrounding try/catch cannot see it: the entry is ' +
          'simply never written and nothing anywhere says so.',
      )
    }
  }
  if (work.inserts === 0) {
    failures.push(
      `no insert into audit_log was found in ${WRITER} at all. Either the table was renamed and this ` +
        'guard now judges nothing, or the console has stopped recording what it does. Both are worse ' +
        'than the defect this guard was written for.',
    )
  } else {
    work.clauses += 1
    notes.push(`${work.inserts} insert(s) into audit_log, every one binding its error`)
  }

  // ---------------------------------------------------------------- clause 2
  if (/NODE_ENV\s*!==?\s*['"]production['"]/.test(withStrings)) {
    failures.push(
      `${WRITER} gates something on NODE_ENV !== 'production'. That is how this module went silent in ` +
        'the one environment where a missing audit entry is evidence of nothing having happened. ' +
        'Report the failure everywhere; noise in a log is cheaper than an absent trail.',
    )
  } else {
    work.clauses += 1
    notes.push('no failure path is gated on the environment')
  }

  // ------------------------------------------------------------- clauses 3, 4
  for (const name of WRITERS) {
    const start = withStrings.indexOf(`export async function ${name}(`)
    if (start < 0) {
      failures.push(
        `${WRITER} no longer exports ${name}. Either it was renamed, and this guard judges one writer ` +
          'fewer than it believes, or an audit writer was removed.',
      )
      continue
    }
    work.writers += 1
    /*
     * The body is taken to the next top-level `export ` or the end of the file.
     * Crude, and correct for this module: its exports are flat.
     */
    const rest = withStrings.slice(start + 1)
    const nextExport = rest.indexOf('\nexport ')
    const body = nextExport < 0 ? rest : rest.slice(0, nextExport)

    if (!body.includes(REPORTER) && !/auditCouldNotBeWritten/.test(body)) {
      failures.push(
        `${name} never reaches ${REPORTER}. A failure that is caught and not reported is a failure ` +
          'nobody finds out about, which is the defect this guard exists to stop.',
      )
    }
    if (/\bthrow\b/.test(body)) {
      failures.push(
        `${name} contains a \`throw\`. An audit write that fails must NOT fail the action that was ` +
          'already taken: the organiser really was suspended, the window really did move, and failing ' +
          'the caller now would leave the platform in a state its own error says did not happen.',
      )
    }
  }
  if (work.writers > 0) {
    work.clauses += 2
    notes.push(`${work.writers} writer(s) report through ${REPORTER} and neither throws`)
  }
}

// --------------------------------------------------------------------------
for (const note of notes) console.log(TAG + ' ' + note)

if (failures.length > 0) {
  console.error('')
  for (const f of failures) console.error(TAG + ' FAIL: ' + f)
  console.error(TAG + ' ' + failures.length + ' failure(s).')
}

declareWork('the-audit-log-says-when-it-could-not-write', {
  did: {
    'audit writer judged': work.writers,
    'audit_log insert judged': work.inserts,
    'clause satisfied': work.clauses,
  },
  found: { 'audit failure that nobody would hear about': failures.length },
})

if (failures.length > 0) process.exit(1)

console.log(TAG + ' OK - every audit failure is seen, reported, and never fails the action it records.')
