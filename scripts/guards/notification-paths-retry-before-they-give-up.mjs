/**
 * GUARD: NO DELIVERY PATH IN THE OWNER'S NOTIFICATION ROUTER GIVES UP ON ONE TRY.
 *
 * THE DEFECT, found on 13 September 2026 by reading the two paths side by side.
 * `dispatchPendingPlatformNotifications` tried the first channel
 * PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS times before escalating. `sendHeldDigest`
 * did not: ONE refusal from the mail vendor escalated it straight to push, and
 * if no admin device had armed push, the rows were written `failed` on that
 * single attempt. A `failed` row is neither `pending` nor `held_for_digest`, so
 * nothing in this module ever reads it again. The one email that can carry two
 * hundred orders was the one email with no second chance.
 *
 * Close-out UX3.2 is explicit: "Every notification is recorded as sent or
 * failed, A FAILURE IS RETRIED, and a PERSISTENT failure raises through the
 * second channel." A first failure is not a persistent one.
 *
 * WHAT IT CHECKS. Every top-level function in
 * src/lib/notifications/platform-send.ts that writes a TERMINAL delivery state
 * (`failed`, the end of the road, or `escalated`, the second channel) must also
 * consult PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS in the same function. A path that
 * can give up without counting is the defect above, whoever writes it next.
 *
 * AND IT REFUSES TO BE VACUOUS. It fails if it finds fewer than
 * MIN_TERMINAL_FUNCTIONS of them. Renaming or splitting the two paths so the
 * scan matches nothing would otherwise turn the guard off in silence, which is
 * the failure mode every guard in this directory is written against.
 *
 * HOW IT READS THE FILE, stated because it is an approximation and an
 * approximation nobody declared is a lie. It splits the source at top-level
 * `function` declarations rather than parsing it, which is exact for this file
 * because every function in it is declared at the top level, in sequence, and
 * the SPLIT-COUNT is printed so a reader can see it found them all. If this file
 * ever grows nested function declarations that write delivery states, the count
 * will not match the declarations and that is the moment to reach for a parser.
 *
 * Proven red in scripts/verify/guard-failure-drills.mjs, which removes the
 * attempts comparison from the digest exactly as it stood before the fix.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const TAG = '[notification-paths-retry]'

export const SOURCE = 'src/lib/notifications/platform-send.ts'
export const BOUND = 'PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS'
/** The two paths that exist today: the individual dispatcher and the digest. */
export const MIN_TERMINAL_FUNCTIONS = 2

/** A write that ends a notification's life, or hands it to the second channel. */
const TERMINAL = [/delivery_state:\s*'failed'/, /delivery_state:\s*'escalated'/]

const DECLARATION = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/

/** Split the source into top-level functions. Pure, so the drill can call it. */
export function splitTopLevelFunctions(source) {
  const lines = source.split(/\r?\n/)
  const found = []
  for (let i = 0; i < lines.length; i += 1) {
    const m = DECLARATION.exec(lines[i])
    if (m) found.push({ name: m[1], start: i })
  }
  return found.map((f, i) => ({
    name: f.name,
    body: lines.slice(f.start, i + 1 < found.length ? found[i + 1].start : lines.length).join('\n'),
  }))
}

/** The judgement, pure. Returns { failures, judged, terminal }. */
export function judgeRetryDiscipline(functions) {
  const failures = []
  const terminal = []
  for (const fn of functions) {
    const states = TERMINAL.filter((re) => re.test(fn.body)).length
    if (states === 0) continue
    terminal.push(fn.name)
    if (!fn.body.includes(BOUND)) {
      failures.push(
        `${fn.name}() writes a terminal delivery state and never consults ${BOUND}: ` +
          'it can escalate or give up on a single failure, which is what threw away a digest of up to two hundred orders before 13 September 2026.',
      )
    }
  }
  if (terminal.length < MIN_TERMINAL_FUNCTIONS) {
    failures.push(
      `only ${terminal.length} function(s) in ${SOURCE} write a terminal delivery state, fewer than the ${MIN_TERMINAL_FUNCTIONS} this guard must judge. ` +
        'Either a delivery path was removed, or it was renamed or nested past this scan. A guard that matches nothing is not a guard.',
    )
  }
  return { failures, judged: functions.length, terminal }
}

const isMain =
  process.argv[1] && /notification-paths-retry-before-they-give-up\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))
if (isMain) {
  const source = readFileSync(join(ROOT, SOURCE), 'utf8')
  const functions = splitTopLevelFunctions(source)
  const { failures, judged, terminal } = judgeRetryDiscipline(functions)
  declareWork('notification-paths-retry-before-they-give-up', {
    did: {
      'top-level function read': judged,
      'delivery path judged': terminal.length,
    },
    found: { 'path that can give up without counting': failures.length },
  })
  console.log(`${TAG} delivery paths: ${terminal.join(', ') || 'NONE'}`)
  if (failures.length > 0) {
    console.error(`\n${TAG} FAILED\n`)
    for (const f of failures) console.error(`    ${f}`)
    console.error('')
    process.exit(1)
  }
  console.log(
    `${TAG} PASS - every one of the ${terminal.length} delivery path(s) that can end a notification's life counts its attempts against ${BOUND} first`,
  )
}
