/**
 * GUARD: the push channel can be armed, and a press that fails says so.
 *
 * WHY (11 September 2026, close-out UX3.2, found by driving and not by reading).
 * The owner's backup alert channel and the attendee's alert opt-in share one
 * hook. In a fresh Chrome profile every FIRST press of either failed, and the
 * screen said nothing at all. Two independent defects, one press:
 *
 *   THE RACE. `register()` resolves when the REGISTRATION exists, not when its
 *   worker is running, so on a device that has never armed before the worker is
 *   still installing. `pushManager.subscribe()` then throws, and Chrome names
 *   it: "Subscription failed - no active Service Worker". A SECOND press
 *   succeeded, because by then the worker had activated on its own, which is
 *   why nothing had ever noticed: anybody debugging it presses twice.
 *
 *   THE SILENCE. The catch set the status to 'idle' - the state the control
 *   shows before anybody presses anything - and sent the error to
 *   `reportClientError`, which on a production build with no Sentry sink queues
 *   it in memory where nobody reads it. A press that failed and a press that
 *   never happened were indistinguishable on screen and in every log. That is
 *   precisely the silent failure UX3.2 exists to forbid, in the control that
 *   arms the channel UX3.2 exists to provide.
 *
 * THE FIVE CLAUSES.
 *
 *   1. ONE DOOR. Exactly one module in src/ calls `pushManager.subscribe`. A
 *      second copy is a second place the race can be reintroduced, and the
 *      hook's own header says it exists to prevent exactly that.
 *   2. THAT CALL WAITS. The registration it subscribes on comes through
 *      `withActiveWorker`, so the race cannot come back by deleting one call.
 *   3. THE WAIT IS A REAL WAIT. `withActiveWorker` settles on 'activated' and
 *      also on 'redundant', because a worker that will never activate must not
 *      hang the button for ever.
 *   4. NOTHING ELSE TAKES SCOPE '/'. Every other `serviceWorker.register` in
 *      src/ passes an explicit scope. This clause is here because the near-miss
 *      was measured, not imagined: registering a second worker at the DEFAULT
 *      scope replaces the push registration outright, and the failure is
 *      completely silent in both directions. Driven in Chrome on 11 September
 *      2026 with two workers at scope '/':
 *
 *          registrations now: 1 -> / active=scan-sw.js
 *          push subscription after the scanner registered: STILL THERE
 *          send after scanner registered: 201
 *          displayed: / -> 0 notification(s)
 *
 *      The push service accepts the message, the server records a delivery, and
 *      the person is told nothing, for ever. The door scanner is safe only
 *      because it passes `{ scope: DOOR_SERVICE_WORKER_SCOPE }`, and nothing
 *      anywhere said that line was load-bearing. Now something does.
 *   5. THE REFUSAL IS RENDERED. Every component that consumes the hook reads
 *      the failure state and shows the reason, so the silence cannot return by
 *      a surface quietly dropping it.
 *
 * AND THE PREMISE IS CHECKED RATHER THAN REMEMBERED. Clause 4 protects the push
 * worker's registration, so the guard confirms `public/push-sw.js` still handles
 * a `push` event at all. If it ever stops, this clause is guarding nothing and
 * should say so instead of standing there looking busy.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HOOK = 'src/components/notifications/use-push-subscription.ts'
const WAITER = 'withActiveWorker'
const PUSH_WORKER = 'public/push-sw.js'
const SUBSCRIBE = 'pushManager.subscribe'

/** Every .ts/.tsx file under a directory, recursively. */
export function sourceFiles(root, dir) {
  const out = []
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (/\.tsx?$/.test(entry)) out.push(relative(root, full).replace(/\\/g, '/'))
    }
  }
  walk(dir)
  return out
}

/**
 * Every SERVICE WORKER registration, with whether the same call passes a scope.
 *
 * Narrow on purpose. The first draft matched any `.register(` and accused four
 * innocent lines: `store.register()` in a React context, and three COMMENTS
 * mentioning `instrumentation.register()`. A guard that cries wolf on a comment
 * is a guard somebody switches off, so the match requires the receiver to be
 * `serviceWorker` - on the same line, or on the line above, which is where a
 * formatter puts it - and comment lines are skipped outright.
 *
 * The scope is looked for across the following lines as well, because
 * `register(\n  URL,\n  { scope },\n)` is one call and four lines.
 */
export function registerCalls(text) {
  const lines = text.split(/\r?\n/)
  const out = []
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*(\/\/|\*|\/\*)/.test(lines[i])) continue
    if (!/\.register\(/.test(lines[i])) continue
    const receiver = `${i > 0 ? lines[i - 1] : ''}\n${lines[i]}`
    if (!/serviceWorker\s*\)?\s*\.?\s*$|serviceWorker\s*\.\s*register\(/.test(receiver)) continue
    const window = lines.slice(i, i + 4).join('\n')
    out.push({ line: i + 1, scoped: /scope\s*:/.test(window), text: lines[i].trim() })
  }
  return out
}

/**
 * The body of one `const NAME = useCallback(async () => { ... }, [deps])`.
 *
 * Needed because `disable()` legitimately sets 'idle' - a disarmed device IS
 * idle - so a whole-file search for that string accuses the correct code. The
 * clause is only about `enable()`.
 */
export function callbackBody(text, name) {
  const start = text.indexOf(`const ${name} = useCallback(`)
  if (start === -1) return null
  const end = text.indexOf('}, [', start)
  return end === -1 ? text.slice(start) : text.slice(start, end)
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const tag = '[push-arming-cannot-fail-silently]'
  const problems = []

  const files = sourceFiles(root, join(root, 'src'))
  // Read once. Three separate passes over a thousand files is three times the
  // disk for no more truth.
  const text = new Map(files.map((f) => [f, readFileSync(join(root, f), 'utf8')]))

  /* ---- clause 1: one door ---- */
  const subscribers = files.filter((f) => text.get(f).includes(SUBSCRIBE))
  console.log(`${tag} ${subscribers.length} module(s) call ${SUBSCRIBE}: ${subscribers.join(', ') || 'none'}`)
  if (subscribers.length === 0) {
    problems.push(
      `nothing in src/ calls ${SUBSCRIBE}. Either the push opt-in was removed, or this guard can no longer see it; both need a person.`,
    )
  }
  for (const file of subscribers) {
    if (file !== HOOK) {
      problems.push(
        `${file} calls ${SUBSCRIBE} as well as ${HOOK}. One door only: a second copy is a second place the activation race comes back, and the two cannot be kept in step by anyone remembering.`,
      )
    }
  }

  /* ---- clauses 2 and 3: the call waits, and the wait is real ---- */
  const hook = text.get(HOOK) ?? ''
  if (!hook) {
    problems.push(`${HOOK} is missing or unreadable, so nothing below could be checked.`)
  }
  if (hook) {
    if (!new RegExp(`${WAITER}\\(await navigator\\.serviceWorker\\.register\\(`).test(hook)) {
      problems.push(
        `${HOOK} does not subscribe on a registration that came through ${WAITER}(). ` +
          `Chrome throws "Subscription failed - no active Service Worker" on a registration whose worker is still installing, ` +
          `which is every device arming for the first time.`,
      )
    }
    if (!new RegExp(`function ${WAITER}`).test(hook)) {
      problems.push(`${HOOK} no longer defines ${WAITER}().`)
    } else {
      for (const state of ['activated', 'redundant']) {
        if (!hook.includes(`'${state}'`)) {
          problems.push(
            `${WAITER}() in ${HOOK} does not mention '${state}'. It must settle on BOTH: 'activated' is the success, and 'redundant' is the worker that will never activate and would otherwise hang the button for ever.`,
          )
        }
      }
    }
    const enable = callbackBody(hook, 'enable')
    if (!enable) {
      problems.push(`${HOOK} no longer defines an \`enable\` callback, so this guard cannot see how a press is handled.`)
    } else if (!enable.includes("setStatus('error')")) {
      problems.push(
        `the \`enable\` callback in ${HOOK} never sets 'error'. A press that fails must not land in the same state as a press that never happened, because the only other record of it is reportClientError, which on a production build queues into memory nobody reads.`,
      )
    }
  }

  /* ---- clause 4: nothing else takes the default scope ---- */
  let scopedChecked = 0
  for (const file of files) {
    for (const call of registerCalls(text.get(file))) {
      scopedChecked += 1
      // The push hook is the one entitled to '/': that IS the push registration.
      if (file === HOOK) continue
      if (!call.scoped) {
        problems.push(
          `${file}:${call.line} registers a service worker with no explicit scope, so it takes '/' and REPLACES the push registration. ` +
            `Measured in Chrome: the push service still answers 201 and nothing is ever displayed, so the platform records a delivery that did not happen. ` +
            `Pass an explicit narrower scope. (${call.text.slice(0, 90)})`,
        )
      }
    }
  }

  /* ---- clause 5: the refusal is rendered ---- */
  const consumers = files.filter((f) => f !== HOOK && text.get(f).includes('usePushSubscription('))
  console.log(`${tag} ${consumers.length} surface(s) consume the hook: ${consumers.join(', ') || 'none'}`)
  for (const file of consumers) {
    const body = text.get(file)
    if (!/reason/.test(body) || !/status === 'error'/.test(body)) {
      problems.push(
        `${file} consumes usePushSubscription but never renders the failure. A press that fails must not look like a press that never happened; read \`reason\` and show it when \`status === 'error'\`.`,
      )
    }
  }

  /* ---- the premise, checked rather than remembered ---- */
  try {
    const worker = readFileSync(join(root, PUSH_WORKER), 'utf8')
    if (!/addEventListener\(\s*['"]push['"]/.test(worker)) {
      problems.push(
        `${PUSH_WORKER} no longer handles a 'push' event, so clause 4 is protecting a registration that could not display anything anyway. This guard is no longer telling the truth about what it defends.`,
      )
    }
  } catch (error) {
    problems.push(`${PUSH_WORKER} is unreadable (${error.message}), so the premise could not be checked.`)
  }

  declareWork('push-arming-cannot-fail-silently', {
    did: {
      'source file scanned': files.length,
      'service worker registration judged': scopedChecked,
      'hook consumer judged': consumers.length,
      'clause checked': 5,
    },
    found: { 'silent-failure path in the push channel': problems.length },
  })

  if (problems.length > 0) {
    console.error('')
    console.error(`${tag} FAIL - ${problems.length} problem(s):`)
    for (const p of problems) console.error(`    ${p}`)
    console.error('')
    console.error('  The backup channel exists because email can fail quietly. A backup channel that')
    console.error('  fails quietly is worse than none, because the platform reports it as delivered.')
    process.exitCode = 1
    return
  }
  console.log(
    `${tag} PASS - one module subscribes, it waits for an active worker, every other worker takes a narrower scope, ` +
      `and ${consumers.length} surface(s) show a refusal instead of hiding it.`,
  )
}

const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) main()
