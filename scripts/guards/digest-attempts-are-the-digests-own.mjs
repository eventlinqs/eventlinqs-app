/**
 * GUARD: THE DIGEST NEVER INHERITS ATTEMPTS IT DID NOT MAKE.
 *
 * THE DEFECT, found on 13 September 2026 by following the one rule the digest
 * fix of the same morning left standing. `sendHeldDigest` counts a batch by its
 * HIGHEST `attempts`, which is correct while every attempt on a held row was
 * spent ON THE DIGEST. It was not. A row that failed as an INDIVIDUAL email
 * stays `pending` with its counter incremented, and when the day's ceiling is
 * crossed before the next tick reaches it, the dispatcher held it with that
 * counter intact, writing the held state as a bare literal and nothing else.
 *
 * So a batch could arrive already at PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS - 1 and
 * give up on its FIRST refusal, escalating to push or - with no admin device
 * armed - writing every row `failed`. A `failed` row is neither `pending` nor
 * `held_for_digest`, so nothing reads it again. That is exactly the loss fixed
 * earlier the same day, reached through a different door, and the message it
 * throws away carries up to two hundred paid orders.
 *
 * WHAT IT CHECKS, in two clauses, because either one alone is defeatable.
 *
 * 1. THE DECISION, EXECUTED. It loads the REAL exported `holdForDigestPatch`
 *    through the same alias loader the scripts use and runs it across a sweep of
 *    attempt counts either side of the bound. Every answer must leave the digest
 *    the WHOLE budget (`attempts` 0, so MAX attempts remain), and where a count
 *    was spent the answer must still CARRY THE HISTORY, because a feed reading
 *    "attempt 2 failed" beside a counter of 0 is the kind of half-truth that
 *    teaches an operator to distrust the screen.
 *
 * 2. THE CALLER, INSTALLED. A perfect pure function nothing calls is worth
 *    nothing, which is a failure mode this repository has been bitten by before.
 *    The dispatcher must hold rows THROUGH that function and must not contain a
 *    hand-written held-for-digest state literal, which is the shape the defect
 *    shipped in.
 *
 * AND IT REFUSES TO BE VACUOUS. It fails if it cannot find the dispatcher by
 * name, if the sweep judged fewer than MIN_JUDGED counts, or if the sweep never
 * reaches the bound: a sweep of nothing but zero would pass against the broken
 * code.
 *
 * WHAT IT COSTS. Under a second: one module load through the loader, then
 * arithmetic.
 *
 * Proven red as well as green in scripts/verify/guard-failure-drills.mjs: one
 * drill restores the literal the defect shipped as, the other returns the spent
 * count from the pure function.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'
import { splitTopLevelFunctions } from './notification-paths-retry-before-they-give-up.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const TAG = '[digest-attempts]'

export const POLICY = 'src/lib/notifications/platform-policy.ts'
export const SENDER = 'src/lib/notifications/platform-send.ts'
/** The function that must produce every hold, and the one that must call it. */
export const PATCH_FN = 'holdForDigestPatch'
export const DISPATCHER = 'dispatchPendingPlatformNotifications'
/** The literal shape the defect shipped in, which must never come back. */
export const FORBIDDEN_LITERAL = "delivery_state: 'held_for_digest'"
/** How far the sweep runs, and the floor it must clear to count as a sweep. */
export const SWEEP_TO = 12
export const MIN_JUDGED = 8

/** Ask the application's own module what a hold writes. Real code, not a regex. */
function loadUnderTest() {
  const script = [
    "import { holdForDigestPatch, PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS } from '@/lib/notifications/platform-policy'",
    'const answers = []',
    `for (let n = 0; n <= ${SWEEP_TO}; n += 1) {`,
    "  const last_error = n > 0 ? 'email attempt ' + n + ': Resend refused' : null",
    '  answers.push({ n, patch: holdForDigestPatch({ attempts: n, last_error }) })',
    '}',
    'console.log(JSON.stringify({ bound: PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS, answers }))',
  ].join('\n')
  const r = spawnSync(
    process.execPath,
    [
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
      '--import',
      './scripts/lib/src-alias-loader.mjs',
      '--input-type=module',
      '-e',
      script,
    ],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  )
  if (r.status !== 0) {
    throw new Error(
      `could not load the notification policy through the alias loader: ${(r.stderr || r.stdout).trim().slice(0, 400)}`,
    )
  }
  const line = r.stdout.trim().split('\n').find((l) => l.startsWith('{'))
  if (!line) throw new Error(`the notification policy printed no answers: ${r.stdout.slice(0, 200)}`)
  return JSON.parse(line)
}

/** Clause 1, pure, so the drill can substitute an answer set. */
export function judgeHoldPatches(bound, answers) {
  const failures = []
  let judged = 0
  let reachedBound = false

  for (const { n, patch } of answers) {
    judged += 1
    if (n >= bound - 1) reachedBound = true

    if (patch.delivery_state !== 'held_for_digest') {
      failures.push(
        `a hold of a row with ${n} attempt(s) wrote delivery_state ${JSON.stringify(patch.delivery_state)}, not the held state`,
      )
    }
    if (patch.attempts !== 0) {
      failures.push(
        `a row held with ${n} individual attempt(s) enters the digest queue carrying ${patch.attempts} of them, ` +
          `so the digest has ${Math.max(0, bound - patch.attempts)} attempt(s) left instead of ${bound}. ` +
          'At the bound that is a digest of up to two hundred paid orders given up on its first refusal.',
      )
    }
    if (n > 0 && !String(patch.last_error ?? '').includes(String(n))) {
      failures.push(
        `a row held after ${n} individual attempt(s) records last_error ${JSON.stringify(patch.last_error)}, ` +
          'which does not say how many attempts were spent. The counter may be reset; the history may not be dropped.',
      )
    }
    if (n > 0 && !String(patch.last_error ?? '').includes('Resend refused')) {
      failures.push(
        `a row held after ${n} individual attempt(s) discarded the reason the individual send failed. ` +
          'The operator reading the feed needs it, and nothing else keeps it.',
      )
    }
  }

  if (judged < MIN_JUDGED) {
    failures.push(
      `the sweep judged ${judged} attempt count(s), fewer than the ${MIN_JUDGED} this guard must judge. ` +
        'A guard that judges almost nothing is not a guard.',
    )
  }
  if (!reachedBound) {
    failures.push(
      `the sweep never reached ${bound - 1}, the count at which the shipped defect lost the whole digest on one refusal. ` +
        'A sweep that stops short of the bound would pass against the broken code.',
    )
  }
  return { failures, judged }
}

/** Clause 2, pure. The dispatcher must hold rows through the function. */
export function judgeInstallation(functions) {
  const dispatcher = functions.find((f) => f.name === DISPATCHER)
  if (!dispatcher) {
    return {
      failures: [
        `${SENDER} has no top-level function named ${DISPATCHER}(). It was renamed, removed or nested past this scan, ` +
          'and a guard that cannot find what it judges must say so rather than pass.',
      ],
      judged: 0,
    }
  }
  const failures = []
  if (!dispatcher.body.includes(`${PATCH_FN}(`)) {
    failures.push(
      `${DISPATCHER}() holds rows for the digest without calling ${PATCH_FN}(), ` +
        'so whatever it writes is not the decision this guard checks.',
    )
  }
  if (dispatcher.body.includes(FORBIDDEN_LITERAL)) {
    failures.push(
      `${DISPATCHER}() writes the held state as a literal. That is the exact shape the defect shipped in: ` +
        'it leaves the row carrying the attempts it spent as an individual email, and the digest inherits them.',
    )
  }
  return { failures, judged: 1 }
}

const isMain =
  process.argv[1] && /digest-attempts-are-the-digests-own\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))
if (isMain) {
  const { bound, answers } = loadUnderTest()
  const executed = judgeHoldPatches(bound, answers)
  const installed = judgeInstallation(splitTopLevelFunctions(readFileSync(join(ROOT, SENDER), 'utf8')))
  const failures = [...executed.failures, ...installed.failures]

  declareWork('digest-attempts-are-the-digests-own', {
    did: {
      'attempt count swept through the real hold': executed.judged,
      'delivery path read': installed.judged,
    },
    found: { 'hold carrying a spent attempt into the digest': failures.length },
  })
  console.log(`${TAG} bound ${bound}, swept 0 to ${SWEEP_TO} through ${PATCH_FN}() in ${POLICY}`)
  if (failures.length > 0) {
    console.error(`\n${TAG} FAILED\n`)
    for (const f of failures) console.error(`    ${f}`)
    console.error('')
    process.exit(1)
  }
  console.log(
    `${TAG} PASS - a row held for the digest hands it all ${bound} attempts, whatever it spent as an individual email, and keeps the history`,
  )
}
