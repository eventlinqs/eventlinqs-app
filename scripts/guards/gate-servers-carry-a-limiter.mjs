/**
 * GUARD: every gate step that serves the production build starts it through ONE
 * function, and that function hands the server a rate-limit backend and proves
 * the backend answers.
 *
 * WHY (10 September 2026, found by the gate failing on itself). Three steps in
 * scripts/ops/pre-push-gate.mjs served the build, and each spawned `next start`
 * in its own near-identical block. Only the Lighthouse one pointed the server at
 * the in-memory Upstash stub, and it said why in its own comment: the money-path
 * limiter is `failClosed`, so a production build with no limiter backend refuses
 * the request rather than allowing it.
 *
 * That was on the step that never buys anything. The step that DOES buy a
 * ticket, the UX6 checkout drive, had no stub. Under `next start` the
 * `checkout-reserve` policy (`failClosed: true`, covering "reservation +
 * checkout + squad payment-intent creation") therefore refused every reservation
 * and every checkout submit before a line of product code ran. The drive
 * reported six faults across three widths:
 *
 *     FAIL: paid @ 390: "Checkout - AUD 53.73" did not reach checkout
 *     FAIL: free @ 390: after submitting, the buyer is on /checkout/... rather
 *                       than a confirmation
 *
 * and none of them was a product defect. `.tmp/gate-checkout-server.log` carried
 * the real answer fifty times over: `[redis] UPSTASH_REDIS_REST_URL or
 * UPSTASH_REDIS_REST_TOKEN not set - Redis disabled`.
 *
 * A gate that fails for its own reasons is worse than no gate, because somebody
 * spends a day on the product it accused, and the UX6 item this one gates is the
 * one holding paid advertising. So the decision now lives in `startGateServer`,
 * once, and this guard makes a fourth copy impossible.
 *
 * THE FOUR CLAUSES.
 *
 *   1. `next start` is spawned in exactly ONE place in the gate, and that place
 *      is inside `startGateServer`. Nothing else may serve the build.
 *   2. That spawn hands the server BOTH `UPSTASH_REDIS_REST_URL` and
 *      `UPSTASH_REDIS_REST_TOKEN`. One without the other disables Redis exactly
 *      as neither does (src/lib/redis/rate-limit.ts checks for both).
 *   3. `startGateServer` PROVES the stub answers before it hands back a base
 *      URL. A URL pointing at nothing fails closed identically to no URL at all,
 *      so "we passed a URL" is not the guarantee it reads like.
 *   4. The stub script the spawn names exists on disk. A rename would leave a
 *      URL pointing at a process that never started, which is clause 3's
 *      failure with none of clause 3's noise.
 *
 * AND THE PREMISE IS CHECKED RATHER THAN REMEMBERED. Clause 5 reads
 * src/lib/rate-limit/policies.ts and confirms at least one policy on the buyer's
 * money path is still `failClosed`. If that ever stops being true this guard is
 * protecting nothing, and it should say so rather than stand there looking busy.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const GATE = 'scripts/ops/pre-push-gate.mjs'
const POLICIES = 'src/lib/rate-limit/policies.ts'
const STUB = 'scripts/verify/upstash-local-stub.mjs'
const STARTER = 'startGateServer'
/** The money-path policy whose fail-closed posture is the whole reason for this. */
const MONEY_POLICY = 'checkout-reserve'

/**
 * Which function a line sits in, by scanning declarations above it. Crude on
 * purpose: this file has one nesting level of top-level functions and a parser
 * dependency for a four-clause guard would be a dependency somebody's bump
 * removes.
 */
export function enclosingFunction(lines, index) {
  for (let i = index; i >= 0; i -= 1) {
    const m = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/.exec(lines[i])
    if (m) return m[1]
  }
  return '(top level)'
}

/** Every line that spawns `next start`, with the function it sits in. */
export function nextStartSpawns(text) {
  const lines = text.split(/\r?\n/)
  const out = []
  for (let i = 0; i < lines.length; i += 1) {
    if (!/next\/dist\/bin\/next/.test(lines[i])) continue
    if (!/'start'/.test(lines[i]) && !/"start"/.test(lines[i])) continue
    out.push({ line: i + 1, inside: enclosingFunction(lines, i), text: lines[i].trim() })
  }
  return out
}

/**
 * The body of one top-level function, as text, or null when it is not there.
 *
 * It stops at the next top-level declaration OR at the doc comment that
 * introduces it, and the second half is not tidiness. The first version stopped
 * only at the declaration, so the body it returned carried the NEXT function's
 * JSDoc, and the drill for clause 3 stayed green: the guard was reading the word
 * PONG out of a comment describing a function the gate had stopped calling.
 */
export function functionBody(text, name) {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((l) => new RegExp(`^(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\b`).test(l))
  if (start === -1) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^(?:export\s+)?(?:async\s+)?function\s/.test(lines[i])) {
      end = i
      break
    }
  }
  // Walk back over the doc comment and blank lines that belong to whatever
  // comes next, so they are never read as part of this function.
  while (end > start && (lines[end - 1].trim() === '' || /^\s*(\/\*\*|\*|\*\/|\/\/)/.test(lines[end - 1]))) end -= 1
  return lines.slice(start, end).join('\n')
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const problems = []
  const tag = '[gate-servers-carry-a-limiter]'

  let gate
  try {
    gate = readFileSync(join(root, GATE), 'utf8')
  } catch (error) {
    console.error(`${tag} FAIL - ${GATE} is unreadable (${error.message}); a gate this cannot read is one it cannot police.`)
    process.exitCode = 1
    return
  }

  /* ---- clause 1: one door ---- */
  const spawns = nextStartSpawns(gate)
  console.log(`${tag} ${spawns.length} place(s) spawn \`next start\` in ${GATE}`)
  for (const s of spawns) console.log(`${tag}   line ${s.line}, inside ${s.inside}()`)
  if (spawns.length === 0) {
    problems.push(`no \`next start\` spawn found in ${GATE}. Either the gate stopped serving the build, or this guard can no longer see how it does.`)
  }
  for (const s of spawns) {
    if (s.inside !== STARTER) {
      problems.push(
        `${GATE}:${s.line} spawns \`next start\` inside ${s.inside}() rather than ${STARTER}(). ` +
          'A step that starts its own server is a step that can forget the limiter, which is exactly what happened.',
      )
    }
  }

  /* ---- clauses 2 and 3: what the one door does ---- */
  const body = functionBody(gate, STARTER)
  if (!body) {
    problems.push(`${GATE} has no ${STARTER}() function, so nothing decides what a served-build step needs.`)
  } else {
    for (const key of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) {
      if (!body.includes(key)) {
        problems.push(
          `${STARTER}() does not set ${key} on the server it starts. Without both, Redis is disabled and the ` +
            `${MONEY_POLICY} policy refuses every reservation under NODE_ENV=production.`,
        )
      }
    }
    // The CALL, not the word. Clause 3's first version matched `PONG` anywhere
    // in the body and passed on a doc comment.
    if (!/pingUpstashStub\s*\(/.test(body)) {
      problems.push(
        `${STARTER}() never checks that the limiter backend answers. A URL pointing at a process that did not ` +
          'start fails closed identically to no URL at all, and the drive blames the product either way.',
      )
    }
    if (!body.includes(STUB.replace('scripts/', 'scripts/'))) {
      problems.push(`${STARTER}() does not name ${STUB}, so this guard cannot tell which backend it starts.`)
    }
  }

  /* ---- clause 4: the stub is really there ---- */
  const stubThere = existsSync(join(root, STUB))
  if (!stubThere) problems.push(`${STUB} does not exist, so the URL handed to the server points at nothing.`)

  /* ---- clause 5: the premise ---- */
  let failClosedOnTheMoneyPath = false
  try {
    const policies = readFileSync(join(root, POLICIES), 'utf8')
    /*
     * The DEFINITION, not the first mention. `PolicyName` is a union of the
     * same string literals declared above the table, so a plain indexOf finds
     * the type and slices a block that contains no fields at all - which this
     * guard's first run reported as "no longer failClosed" on a policy that has
     * never been anything else.
     */
    const at = policies.indexOf(`'${MONEY_POLICY}': {`)
    if (at === -1) {
      problems.push(`${POLICIES} no longer declares a '${MONEY_POLICY}' policy, so this guard's premise cannot be checked.`)
    } else {
      const block = policies.slice(at, policies.indexOf('\n  },', at) + 4)
      failClosedOnTheMoneyPath = /failClosed:\s*true/.test(block)
      if (!failClosedOnTheMoneyPath) {
        problems.push(
          `${POLICIES}: '${MONEY_POLICY}' is no longer failClosed. This guard exists because it was, so either the ` +
            'policy change is wrong or this guard should be retired deliberately rather than left protecting nothing.',
        )
      }
    }
  } catch (error) {
    problems.push(`${POLICIES} is unreadable (${error.message}), so the premise could not be checked.`)
  }

  declareWork('gate-servers-carry-a-limiter', {
    did: { 'next start spawn located': spawns.length, 'clause checked': 5 },
    found: { 'served-build step that could refuse its own drive': problems.length },
  })

  if (problems.length > 0) {
    console.error('')
    console.error(`${tag} FAIL - ${problems.length} problem(s):`)
    for (const p of problems) console.error(`    ${p}`)
    console.error('')
    console.error('  A gate that fails for its own reasons is worse than no gate: somebody spends a day on the')
    console.error('  product it accused. Serve the build through startGateServer() and nowhere else.')
    process.exitCode = 1
    return
  }
  console.log(
    `${tag} PASS - ${spawns.length} \`next start\` spawn, inside ${STARTER}(), with both Upstash variables, ` +
      `a proven stub, and '${MONEY_POLICY}' still failClosed.`,
  )
}

const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) main()
