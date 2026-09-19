/**
 * A DRIVE THAT FLIPS A FEATURE FLAG MUST WAIT FOR THE SERVER TO AGREE.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS EXISTS TO STOP, measured on 19 September 2026.
 *
 * `scripts/verify/ga2-matcher-drive.mjs` failed three consecutive runs on
 *
 *     proof.completed: locator.click: Timeout 30000ms exceeded
 *     locator resolved to <button disabled ...>Produce a match</button>
 *
 * while `feature_flags.enabled` read TRUE for that flag and the cache key read
 * null. Four readings of the source each looked sufficient and each was a
 * guess; opening the page in a real session settled it in one run.
 *
 * THE CAUSE IS TWO PROCESSES AND TWO STORES.
 *
 *   .env.local   UPSTASH_REDIS_REST_URL   EMPTY
 *   the server   UPSTASH_REDIS_REST_URL   http://127.0.0.1:8179, the local shim
 *
 * `invalidateFeatureFlag` opens `const redis = getRedisClient(); if (!redis)
 * return`, so in a drive process it returns having done nothing, silently,
 * while the SERVER holds the cached value for FEATURE_FLAG_CACHE_TTL_SECONDS.
 * The drive had been given that invalidation on 14 September precisely to fix
 * this failure, and its header said so. It could never have worked here, and it
 * looked as though it had because whether a run straddles a TTL expiry depends
 * on when the run happens.
 *
 * AND THE FRAGILITY RUNS BOTH WAYS, which is the half nobody had seen: a block
 * asserting a button IS disabled after switching a flag off can read a render
 * made from a cached `true` and report the switch broken when it is not.
 *
 * ---------------------------------------------------------------------------
 * THE RULE. A file under scripts/verify that WRITES public.feature_flags and
 * then drives a browser must wait for the server's OBSERVABLE view - reloading
 * until the page agrees - rather than asserting on one render. It is evidenced
 * by a call to a waiter whose name is declared below, because a guard cannot
 * judge whether a loop is the right loop, only whether the decision was taken
 * in a place somebody named.
 *
 * A file that writes a flag and drives NO browser is not judged: with no
 * rendered page there is no stale render to read.
 *
 * WHAT IT CANNOT SEE, said plainly. It cannot tell a correct waiter from a
 * broken one, and it cannot see a drive that flips a flag through some third
 * spelling neither matcher knows. The second is why it carries a calibration
 * probe and refuses rather than reporting a pass when its own matchers go
 * blind.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripComments, lineAt } from '../lib/js-source.mjs'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const DIR = join(ROOT, 'scripts', 'verify')
export const TAG = '[a-drive-waits-for-a-cached-flag]'

/**
 * The waiters. A drive satisfies this guard by calling one of these, which is a
 * name somebody chose rather than a loop shape a regex guessed at.
 *
 * Spelled as an explicit list so a second waiter is added here deliberately.
 */
export const WAITERS = ['waitForProduceButton', 'waitForFlagToLand']

/** Writing the flag table, in both spellings this tree uses. */
const SUPABASE_WRITE = /\.from\(\s*['"]feature_flags['"]\s*\)[\s\S]{0,200}?\.(update|insert|upsert|delete)\s*\(/g
const POSTGREST_WRITE = /['"`][^'"`]*feature_flags\?[^'"`]*['"`]/g

/** Driving a browser: a page this drive could read a stale render from. */
const DRIVES_A_BROWSER = /\bpage\.(goto|getByRole|locator)\s*\(/

/**
 * THE REGISTER OF DRIVES THAT ARE EXPOSED AND ARE NOT LANE B's TO CHANGE.
 *
 * Printed on every run with what is true of each, and an entry that stops
 * matching is reported as STALE, so the list cannot rot into something nobody
 * re-reads. A debt nobody can see is a debt nobody pays.
 */
export const REGISTER = [
  {
    file: 'scripts/verify/marketplace-gate.mjs',
    since: '2026-09-19',
    why:
      'setFlag() writes the row through PostgREST and does not invalidate at all, then drives the UI ' +
      'immediately. Exposed to the same window. Not lane B’s file.',
  },
  {
    file: 'scripts/verify/waitlist-bridge-e2e.mjs',
    since: '2026-09-19',
    why:
      'enables broadcast_digest and proceeds to the next step without waiting for the server’s view. ' +
      'Exposed to the same window. Not lane B’s file.',
  },
  {
    file: 'scripts/verify/seo5-states-drive.mjs',
    since: '2026-09-19',
    why:
      'close-out SEO5, lane C. It is the one that had ALREADY thought about this: setReversalFlag writes ' +
      'the row and calls its own deleteFlagCache(). That helper opens ' +
      '"const url = process.env.UPSTASH_REDIS_REST_URL; if (!url || !token) return", and in a drive ' +
      'process that value is EMPTY, so it returns having done nothing - the third spelling of the same ' +
      'silent no-op. Registered rather than changed because it is lane C’s file; the answer is the ' +
      'same as ga2’s, which is to wait for the observable state instead of invalidating and hoping.',
  },
]

/** @returns {{writes: number[], drives: boolean, waits: boolean}} */
export function judgeSource(src) {
  const code = stripComments(src)
  const writes = []
  for (const m of code.matchAll(SUPABASE_WRITE)) writes.push(lineAt(src, m.index))
  for (const m of code.matchAll(POSTGREST_WRITE)) {
    // A read of the table is a select, never a write; only a write verb counts.
    const around = code.slice(Math.max(0, m.index - 120), m.index + m[0].length + 40)
    if (/\b(patch|post|put|del|delete)\s*\(/i.test(around)) writes.push(lineAt(src, m.index))
  }
  /*
   * A WAITER MUST BE BOTH NAMED SOMEWHERE AND CALLED, AND THE FIRST DRILL IS
   * WHY BOTH ARE REQUIRED.
   *
   * The first version of this asked only whether the file CALLED a declared
   * waiter, and a regex for `name(` matches the function's own declaration as
   * happily as a call. The drill that renames the declaration therefore left a
   * file whose waiter did not exist, and the guard reported PASS over it.
   *
   * So the decision has to be taken in a place somebody named: the file either
   * DECLARES the waiter or IMPORTS it, and calls it somewhere other than its
   * own declaration.
   */
  const declares = WAITERS.some(w =>
    new RegExp(`(?:async\\s+)?function\\s+${w}\\s*\\(|(?:const|let)\\s+${w}\\s*=`).test(code),
  )
  const imports = WAITERS.some(w => new RegExp(`import[^\\n]*\\b${w}\\b[^\\n]*from`).test(code))
  const callsElsewhere = WAITERS.some(w => {
    const calls = [...code.matchAll(new RegExp(`\\b${w}\\s*\\(`, 'g'))]
    const declarations = [...code.matchAll(new RegExp(`(?:async\\s+)?function\\s+${w}\\s*\\(`, 'g'))]
    return calls.length > declarations.length
  })

  return {
    writes,
    drives: DRIVES_A_BROWSER.test(code),
    waits: (declares || imports) && callsElsewhere,
  }
}

/**
 * The matcher is asked a question it knows the answer to before it is trusted
 * with the tree, for the reason in the header: a blind matcher has no symptom.
 */
export const CALIBRATION_PROBE = [
  "await db.from('feature_flags').update({ enabled: true }).eq('flag', 'x')",
  "await patch(`feature_flags?flag=eq.${flag}`, { enabled })",
  'await page.goto(url)',
  'async function waitForProduceButton(page, opts) { return opts }',
  'await waitForProduceButton(page, { enabled: true, url })',
].join('\n')

/** The same probe with the waiter DECLARED and never called. */
const PROBE_DECLARED_NOT_CALLED = CALIBRATION_PROBE.split('\n').slice(0, 4).join('\n')
/** The same probe with the waiter CALLED and never declared or imported. */
const PROBE_CALLED_NOT_DECLARED = [
  ...CALIBRATION_PROBE.split('\n').slice(0, 3),
  CALIBRATION_PROBE.split('\n')[4],
].join('\n')

export function calibrationFault() {
  const judged = judgeSource(CALIBRATION_PROBE)
  if (judged.writes.length !== 2) return `it saw ${judged.writes.length} of the 2 flag writes in its own probe`
  if (!judged.drives) return 'it cannot see a drive that opens a page'
  if (!judged.waits) return 'it cannot see a waiter that is both declared and called'
  if (judgeSource(PROBE_DECLARED_NOT_CALLED).waits) return 'it accepts a waiter that is declared and never called'
  if (judgeSource(PROBE_CALLED_NOT_DECLARED).waits) return 'it accepts a call to a waiter that is nowhere declared or imported'
  return null
}

function main() {
  const fault = calibrationFault()
  if (fault) {
    console.error(`${TAG} REFUSING: the calibration probe was not read correctly - ${fault}.`)
    console.error(`${TAG} A matcher that cannot see its own probe reports the absence of what it never looked at.`)
    process.exit(1)
  }

  if (!existsSync(DIR)) {
    console.error(`${TAG} scripts/verify is gone and this guard exists for it. A scope that scans nothing reports a pass.`)
    process.exit(1)
  }

  const registered = new Set(REGISTER.map(r => r.file))
  const matchedRegister = new Set()
  const problems = []
  let scanned = 0
  let writers = 0
  let waiting = 0

  for (const entry of readdirSync(DIR).sort()) {
    if (!entry.endsWith('.mjs')) continue
    const name = relative(ROOT, join(DIR, entry)).split(sep).join('/')
    scanned += 1
    const judged = judgeSource(readFileSync(join(DIR, entry), 'utf8'))
    if (judged.writes.length === 0) continue
    writers += 1
    if (judged.waits) waiting += 1
    if (!judged.drives) continue
    if (registered.has(name)) {
      matchedRegister.add(name)
      continue
    }
    if (judged.waits) continue
    problems.push(
      `${name}:${judged.writes[0]} writes public.feature_flags and drives a browser, and calls none of ` +
        `${WAITERS.join(', ')}. The server caches a flag for FEATURE_FLAG_CACHE_TTL_SECONDS and a drive ` +
        'process cannot invalidate that cache, so one render can be made from the old value. Wait for the ' +
        'observable state by reloading, or add this file to the register with a reason.',
    )
  }

  console.log(`${TAG} the register of drives that are exposed and are not being changed, ${REGISTER.length}:`)
  for (const entry of REGISTER) {
    const state = matchedRegister.has(entry.file) ? 'still writes a flag and drives a browser' : 'STALE, it no longer matches'
    console.log(`${TAG}   ${entry.file} (since ${entry.since}, ${state})`)
    console.log(`${TAG}     ${entry.why}`)
  }

  /*
   * THE FINDING IS PRINTED BEFORE THE WORK REPORT, and the order is not
   * cosmetic. `declareWork` refuses a counter that came back zero and exits
   * where it stands, which is correct in general and wrong here: taking the
   * waiter out of the one drive that has it makes "script that waits" zero AND
   * makes this guard's own finding true, and the reader needs the finding, not
   * a note about a counter. The drill caught this by reporting WRONG REASON.
   */
  const staleRegister = REGISTER.filter(entry => !matchedRegister.has(entry.file))
  if (problems.length > 0) {
    console.error(`${TAG} a drive can read a render made from a flag value the server has not caught up with:`)
    for (const p of problems) console.error(`${TAG}   ${p}`)
  }
  if (staleRegister.length > 0) {
    console.error(`${TAG} a register entry no longer matches. Delete it or correct its path.`)
  }

  declareWork('a-drive-waits-for-a-cached-flag', {
    did: { 'drive script read': scanned, 'script that writes a feature flag': writers, 'script that waits for the flag to land': waiting },
    found: { 'drive that flips a flag and reads one render': problems.length, 'registered exposure': REGISTER.length },
  })

  if (problems.length > 0 || staleRegister.length > 0) process.exit(1)

  console.log(
    `${TAG} PASS: ${scanned} drive script(s), ${writers} write a feature flag, ${waiting} wait for it to land, ` +
      `${REGISTER.length} registered exposure(s)`,
  )
}

if (process.argv[1] && process.argv[1].endsWith('a-drive-waits-for-a-cached-flag.mjs')) main()
