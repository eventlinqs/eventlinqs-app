/**
 * GUARD: a refund that SUCCEEDS has every door Stripe says it needs, and two
 * deliveries of the same refund can only ever be answered once.
 *
 * WHY THIS GUARD EXISTS, and the alarm that produced it was WRONG about the
 * platform and right about the design. Both halves are recorded, because a guard
 * whose stated reason is false gets deleted by the next person who checks it.
 *
 * THE ALARM. On 14 September 2026, driving D2's last leg, a refund was issued
 * outside the application against a real payment intent on API version
 * 2026-02-25.clover. The route's own log recorded:
 *
 *     [stripe-webhook] unhandled event type: refund.created
 *     [stripe-webhook] unhandled event type: charge.refund.updated
 *
 * and no mention of `charge.refunded`, which was the only event this route
 * reached its successful-refund handler from. The conclusion drawn was that a
 * refund made from the Stripe Dashboard was being dropped in silence.
 *
 * WHAT DRIVING IT ESTABLISHED, asked of Stripe rather than of a log. Stripe DID
 * send `charge.refunded` and the route DID handle it; that branch simply printed
 * nothing naming itself, so its silence was identical to its absence. Stripe's
 * own account event record for that one refund carries FOUR events:
 * refund.created, charge.refunded, refund.updated, and the deprecated
 * charge.refund.updated. The platform was not losing dashboard refunds.
 *
 * WHAT SURVIVES THE CORRECTION, and it is why this guard is registered rather
 * than withdrawn:
 *
 *   - the successful-refund path rested entirely on the ONE refund event
 *     Stripe's own documentation points AWAY from ("Listen to refund.created for
 *     information about the refund"), with nothing anywhere noticing if that
 *     delivery ever stopped;
 *   - the reconcile failure threw a plain Error while the route answered 200, so
 *     the retry its own comment promised could not happen. That defect was real,
 *     was found by reading the catch, and is clause E below;
 *   - two doors to one reconcile is only safe if it is idempotent, and that is
 *     now measured rather than assumed: the drive observes `reconciled` then
 *     `already_done` for one refund across two real deliveries.
 *
 * WHAT STRIPE PUBLISHES (https://docs.stripe.com/refunds, "Refund events",
 * fetched 14 September 2026): "At a minimum, Stripe recommends that you listen
 * for the `refund.created` event." `charge.refunded` is documented and NOT
 * deprecated, and says of itself "Listen to refund.created for information about
 * the refund". `charge.refund.updated` is marked Deprecated.
 *
 * WHAT THIS GUARD CHECKS. It cannot issue a refund at build time, so it does not
 * try to; the drive does that (scripts/verify/r1-out-of-app-refund-drive.mjs).
 * What it CAN pin is the structure, because every version of this defect is
 * structural: a success path reachable from fewer events than Stripe sends.
 *
 *   A. The declared set still contains the event Stripe names as the minimum. A
 *      set that shrinks below `refund.created` is the original defect returning,
 *      and it shrank silently once already.
 *   B. Every event in that set has its own `case` in the webhook route, and each
 *      of those cases reaches `reconcile_refund` through its handler chain,
 *      followed in the file rather than assumed from a name.
 *   C. No event in the set routes to the NOT-COMPLETED handler, which is the
 *      alert path for a refund that failed or was cancelled. Sending a success
 *      there marks a completed refund failed and emails the owner a debt that
 *      does not exist.
 *   D. No deprecated event reaches the success path. Stripe is winding them down
 *      and an integration that depends on one is counting on a delivery that
 *      will stop.
 *   E. The reconcile failure throws a RETRYABLE error. Until 14 September 2026
 *      it threw a plain Error while the route's outer catch mapped only
 *      WebhookProcessingError to HTTP 500, so the comment promising "Stripe
 *      retries" was answered 200 and Stripe never asked again.
 *   F. The endpoint subscription probe requires every event in the set. Handling
 *      an event the endpoint does not subscribe to is code that cannot run, and
 *      that half is invisible from the application, which looks correct because
 *      it IS correct.
 *   G. The reconcile's side effects INVALIDATE the surfaces a refund changes.
 *      Found by driving on 14 September 2026: the place came back in the
 *      database, every assertion passed, and /events/<slug> went on saying SOLD
 *      OUT, because the refund was the one inventory movement on this platform
 *      that invalidated nothing. The waiting list is offered the freed place in
 *      the same function, and that offer links at that page. It must call the
 *      ROUTE-HANDLER revalidation form, never the server-action one, because
 *      `updateTag` throws outside a Server Action and a throw here becomes a
 *      Stripe retry loop.
 *
 * It prints what it scanned, every run, so a reader can see the basis of the
 * pass rather than trusting the exit code.
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const DECIDER = join(ROOT, 'src', 'lib', 'payments', 'refund-events.ts')
const WEBHOOK = join(ROOT, 'src', 'app', 'api', 'webhooks', 'stripe', 'route.ts')
const PROBE = join(ROOT, 'scripts', 'probe', 'webhook-subscription-check.mjs')

const failures = []
const scanned = []
const note = (s) => scanned.push(s)

/** The success handler must end here or it has not reconciled anything. */
const RECONCILE = 'reconcile_refund'
/** The alert path for a refund that did NOT complete. */
const NOT_COMPLETED_HANDLER = 'handleRefundNotCompleted'

function read(path, label) {
  if (!existsSync(path)) {
    failures.push(`${label} does not exist at ${path.replace(ROOT, '')}, so this guard could not look`)
    return null
  }
  return readFileSync(path, 'utf8')
}

/**
 * The bodies of a TypeScript `switch` in source order, as { labels, body }.
 * Brace-counted rather than regexed, because a case body contains braces and a
 * lazy match would stop at the first one and miss the handler call.
 */
function switchCases(code) {
  const cases = []
  const labelRe = /case\s+'([^']+)'\s*:/g
  let m
  const hits = []
  while ((m = labelRe.exec(code)) !== null) hits.push({ type: m[1], at: m.index, end: labelRe.lastIndex })
  for (let i = 0; i < hits.length; i += 1) {
    // Fall-through labels stack: `case 'a': case 'b': { ... }`. Everything up to
    // the next label that is NOT immediately adjacent belongs to one body.
    const labels = [hits[i].type]
    let j = i
    while (j + 1 < hits.length && code.slice(hits[j].end, hits[j + 1].at).trim() === '') {
      labels.push(hits[j + 1].type)
      j += 1
    }
    const bodyStart = hits[j].end
    const bodyEnd = j + 1 < hits.length ? hits[j + 1].at : code.length
    cases.push({ labels, body: code.slice(bodyStart, bodyEnd) })
    i = j
  }
  return cases
}

/** Every `name(` called inside a chunk of code. */
function calledNames(chunk) {
  const names = new Set()
  const re = /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g
  let m
  while ((m = re.exec(chunk)) !== null) names.add(m[1])
  return names
}

/** The body of `async function name(...)`, brace-counted. */
function functionBody(code, name) {
  const start = code.indexOf(`async function ${name}(`)
  if (start === -1) return null
  const open = code.indexOf('{', start)
  if (open === -1) return null
  let depth = 0
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1
    else if (code[i] === '}') {
      depth -= 1
      if (depth === 0) return code.slice(open, i + 1)
    }
  }
  return null
}

/**
 * Does the handler chain starting at `name` reach `needle`? Follows the calls it
 * finds in the file, to a bounded depth, so a case that delegates to a handler
 * that delegates again is still judged on what it actually does.
 */
function chainReaches(code, name, needle, depth = 4, seen = new Set()) {
  if (depth === 0 || seen.has(name)) return false
  seen.add(name)
  const body = functionBody(code, name)
  if (!body) return false
  if (body.includes(needle)) return true
  for (const called of calledNames(body)) {
    if (called === name) continue
    if (chainReaches(code, called, needle, depth - 1, seen)) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// A. The declared set, and Stripe's documented minimum inside it.
// ---------------------------------------------------------------------------
const decider = read(DECIDER, 'the refund event decider')
let successEvents = []
let deprecatedEvents = []
let minimumEvent = null
if (decider) {
  const list = (name) => {
    const m = decider.match(new RegExp(`${name}\\s*=\\s*\\[([^\\]]*)\\]`))
    return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : []
  }
  successEvents = list('REFUND_SUCCESS_EVENTS')
  deprecatedEvents = list('DEPRECATED_REFUND_EVENTS')
  const min = decider.match(/STRIPE_MINIMUM_REFUND_EVENT\s*=\s*'([^']+)'/)
  minimumEvent = min ? min[1] : null

  if (successEvents.length === 0) {
    failures.push(
      'REFUND_SUCCESS_EVENTS could not be read out of src/lib/payments/refund-events.ts. That set is '
      + 'what every other clause here is measured against, so an unreadable one is a failure and not a skip.',
    )
  }
  if (!minimumEvent) {
    failures.push(
      'STRIPE_MINIMUM_REFUND_EVENT is gone from src/lib/payments/refund-events.ts. It records, with its '
      + "source, the event Stripe's own page names as the minimum an integration must listen to.",
    )
  } else if (!successEvents.includes(minimumEvent)) {
    failures.push(
      `REFUND_SUCCESS_EVENTS does not contain ${minimumEvent}, the event Stripe names as the minimum `
      + '("At a minimum, Stripe recommends that you listen for the refund.created event", '
      + 'https://docs.stripe.com/refunds, fetched 14 September 2026). A set that drops it is the '
      + 'close-out R1 defect returning: a refund issued from the Dashboard is received and dropped.',
    )
  }
  note(
    `the declared sets: ${successEvents.length} success event(s) [${successEvents.join(', ')}], `
    + `${deprecatedEvents.length} deprecated [${deprecatedEvents.join(', ')}], minimum ${minimumEvent ?? 'MISSING'}`,
  )
}

// ---------------------------------------------------------------------------
// B, C, D, E. The route.
// ---------------------------------------------------------------------------
const code = read(WEBHOOK, 'the Stripe webhook route')
if (code) {
  const cases = switchCases(code)
  note(`${cases.length} case label group(s) in the webhook route's switch`)

  const caseFor = (type) => cases.find((c) => c.labels.includes(type)) ?? null

  for (const type of successEvents) {
    const branch = caseFor(type)
    if (!branch) {
      failures.push(
        `the webhook route has no \`case '${type}':\`, so a refund Stripe announces with that event is `
        + 'received and dropped: the ticket keeps admitting, the place stays unsellable and the queue is '
        + 'never offered it. That is close-out R1 exactly.',
      )
      continue
    }
    const handlers = [...calledNames(branch.body)]
    const reaching = handlers.filter((h) => chainReaches(code, h, RECONCILE))
    if (reaching.length === 0) {
      failures.push(
        `\`case '${type}':\` exists but nothing it calls reaches ${RECONCILE}(). Handling an event and `
        + 'then not reconciling it is the same silence with a case statement in front of it. '
        + `Calls found: ${handlers.join(', ') || 'none'}.`,
      )
    } else {
      note(`case '${type}' reaches ${RECONCILE} through ${reaching.join(' / ')}`)
    }
    if (handlers.includes(NOT_COMPLETED_HANDLER)) {
      failures.push(
        `\`case '${type}':\` routes to ${NOT_COMPLETED_HANDLER}, the path for a refund that FAILED or was `
        + 'cancelled. A successful refund sent there is marked failed and the owner is emailed a debt '
        + 'that does not exist.',
      )
    }
  }

  for (const type of deprecatedEvents) {
    const branch = caseFor(type)
    if (!branch) continue
    const reaching = [...calledNames(branch.body)].filter((h) => chainReaches(code, h, RECONCILE))
    if (reaching.length > 0) {
      failures.push(
        `\`case '${type}':\` reaches ${RECONCILE}(), and Stripe marks that event Deprecated on its own `
        + 'page. Depending on it means depending on a delivery Stripe is winding down.',
      )
    }
  }

  // E. The reconcile failure has to be retryable, or the retry is a comment.
  const reconcileFailure = code.match(/throw new (\w+)\(`reconcile_refund failed/)
  if (!reconcileFailure) {
    failures.push(
      'the reconcile failure in the webhook route no longer throws with the message '
      + '"reconcile_refund failed", so this guard cannot tell whether the delivery is retried. A '
      + 'reconcile that fails silently leaves the money moved and the seat sold.',
    )
  } else if (reconcileFailure[1] !== 'WebhookProcessingError') {
    failures.push(
      `the reconcile failure throws ${reconcileFailure[1]}, and the route's outer catch maps ONLY `
      + 'WebhookProcessingError to HTTP 500. Every other throw is answered 200, which tells Stripe the '
      + 'delivery succeeded and stops the redelivery the code says it wants. This was the state until '
      + '14 September 2026 and it was found by reading the catch, not by a failure.',
    )
  } else {
    note('the reconcile failure throws WebhookProcessingError, which the outer catch maps to HTTP 500')
  }
}

// ---------------------------------------------------------------------------
// F. The endpoint subscription probe cannot drift from the code.
// ---------------------------------------------------------------------------
const probe = read(PROBE, 'the webhook subscription probe')
if (probe && successEvents.length > 0) {
  const required = probe.match(/const REQUIRED\s*=\s*\{([\s\S]*?)\n\}/)
  if (!required) {
    failures.push(
      'the REQUIRED map could not be read out of scripts/probe/webhook-subscription-check.mjs, so the '
      + 'endpoint half of this law is unchecked.',
    )
  } else {
    /*
     * COMMENTS ARE STRIPPED FIRST, and this is not tidiness. Drilled on
     * 14 September 2026: commenting the `refund.created` line out of the REQUIRED
     * map left this clause GREEN, because a key inside `// 'refund.created': ...`
     * still matches a quoted key followed by a colon. A guard that reads a
     * disabled requirement as a live one is the false green this whole item is
     * about, reproduced inside the guard written to stop it.
     */
    const live = required[1]
      .split(/\r?\n/)
      .filter((line) => !/^\s*\/\//.test(line))
      .join('\n')
    const declared = [...live.matchAll(/'([^']+)'\s*:/g)].map((m) => m[1])
    const missing = successEvents.filter((e) => !declared.includes(e))
    if (missing.length > 0) {
      failures.push(
        `the subscription probe does not require ${missing.join(', ')}. The route handles ${missing.length > 1 ? 'those events' : 'that event'} `
        + 'but nothing checks that the Stripe endpoint SUBSCRIBES to it, and an unsubscribed event is a '
        + 'handler that can never run.',
      )
    } else {
      note(`the subscription probe requires all ${successEvents.length} success event(s)`)
    }
  }
}

// ---------------------------------------------------------------------------
// G. The freed place becomes visible again.
// ---------------------------------------------------------------------------
if (code) {
  const effects = functionBody(code, 'postReconcileSideEffects')
  if (!effects) {
    failures.push(
      'postReconcileSideEffects is gone from the webhook route, so this guard cannot tell whether a '
      + 'refund still makes the freed place visible again.',
    )
  } else {
    const called = calledNames(effects)
    if (!called.has('revalidateEventSurfacesFromRouteHandlerById')) {
      failures.push(
        'the refund side effects no longer call revalidateEventSurfacesFromRouteHandlerById, so a refund '
        + 'returns the place to inventory and leaves /events/<slug> saying SOLD OUT for the whole ISR '
        + 'window. The waiting list is offered that place in the same function and the offer email links '
        + 'straight at that page, so the person told a ticket opened up lands on a page saying the '
        + 'opposite. Found by driving on 14 September 2026, not by reading.',
      )
    }
    if (!called.has('refreshInventoryCache')) {
      failures.push(
        'the refund side effects no longer call refreshInventoryCache, so the ticket panel keeps serving '
        + 'the sold-out count from Redis however fresh the page around it is. Two cache layers, and this '
        + 'clause is the second one.',
      )
    }
    if (called.has('revalidateEventSurfacesById')) {
      failures.push(
        'the refund side effects call revalidateEventSurfacesById, the SERVER ACTION form. It reaches the '
        + 'data caches with `updateTag`, which throws outside a Server Action, so in a webhook it trades a '
        + 'stale page for a thrown handler and a Stripe retry loop. The route-handler form invalidates the '
        + 'same paths and expires the same tags with { expire: 0 }.',
      )
    }
    note(
      'the refund side effects invalidate the surfaces the refund changed '
      + `(${[...called].filter((c) => /revalidate|refreshInventoryCache/.test(c)).join(', ') || 'NOTHING'})`,
    )
  }
}

// ---------------------------------------------------------------------------
console.log('[refund-success-door] what this guard scanned:')
for (const s of scanned) console.log(`    - ${s}`)

if (failures.length > 0) {
  console.error('\n[refund-success-door] FAILED\n')
  for (const f of failures) console.error(`    ${f}\n`)
  console.error('    A refund that succeeds must be heard whichever event Stripe uses to announce it.')
  console.error('    The proof this guard protects is scripts/verify/r1-out-of-app-refund-drive.mjs,')
  console.error('    which refunds a real payment intent from outside the application and reads the')
  console.error("    outcome back out of the database and the route's own log.\n")
  process.exit(1)
}

declareWork('refund-success-door', {
  did: { 'refund door check': scanned.length, 'success event judged': successEvents.length },
  found: { 'refund success path with a missing or unreachable door': 0 },
})
console.log(
  `[refund-success-door] OK: ${successEvents.length} success event(s) each reach ${RECONCILE}, `
  + 'no deprecated event does, and the failure is retryable.',
)
