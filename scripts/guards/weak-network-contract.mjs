/**
 * THE PLATFORM'S CONTRACT WITH A WEAK NETWORK (close-out C8B.5, 15 September 2026).
 *
 * ============================================================================
 * WHAT IT PROTECTS AND WHY IT IS A GUARD RATHER THAN A TEST
 * ============================================================================
 *
 * Scope v5 section 10.3 requires "a PWA that functions offline" and a checkout
 * that "must not fail under poor network conditions". Close-out pulls both
 * forward out of the Africa deferral: "Australians on a phone at a venue with
 * bad reception are the same problem as anyone else on a weak network."
 *
 * `scripts/verify/scope-10-3-audit.mjs` proves the behaviour by cutting a real
 * network against a real build. It is the better evidence and it cannot run on
 * every commit: it needs a production build, a served port, a browser and a row
 * on TEST. This runs in `prebuild`, on every commit, in a few milliseconds, and
 * holds the four structural facts the drive would otherwise have to rediscover.
 *
 * ============================================================================
 * THE FOUR CLAUSES, AND WHY ONE ALONE WOULD NOT DO
 * ============================================================================
 *
 * 1. THE CHECKOUT SUBMIT CATCHES A THROWN ACTION. `processCheckout` is a Server
 *    Action, so calling it is a fetch and a fetch on a dead radio REJECTS. Before
 *    this item the call sat in `startTransition(async () => ...)` with no catch,
 *    React surfaced the rejection to src/app/checkout/error.tsx, and the buyer
 *    lost their name, their email and every attendee's details to a page that
 *    told them "Our team has been notified" while no report could leave the
 *    browser. Driven at 390, 768 and 1440: C:\dev\EVIDENCE\C8B\baseline.
 *
 * 2. THE ROOT WORKER NEVER CACHES ANYTHING BUT A CONTENT-HASHED ASSET. This is
 *    the clause that stops the offline story becoming a worse defect than the
 *    one it fixed. A cached event page carries a PRICE, a remaining count and a
 *    sale state; serving a buyer yesterday's total would quietly break the ACCC
 *    all-in display in a way nothing else in this repository could detect. Only
 *    /_next/static/ is safe to keep, because Next names those by content hash,
 *    so a cached copy can never be the wrong copy.
 *
 * 3. THE WORKER IS ACTUALLY REGISTERED, AND ONLY AFTER `load`. A worker nobody
 *    registers is a file, not a behaviour; a worker registered during the paint
 *    is a performance regression inside a performance item.
 *
 * 4. THE DOCUMENT THE WORKER PRECACHES IS A REAL ROUTE, CLASSIFIED `never`. The
 *    offline page must exist to be precached, and it must never be a search
 *    result: "You are offline" ranking for EventLinqs would be its own defect.
 *
 * Clause 1 alone would leave the worker free to cache a price. Clause 2 alone
 * would leave a worker nobody runs. Clause 3 alone would leave the fallback
 * pointing at a 404. They are four because each is defeatable on its own.
 *
 * ============================================================================
 * WHAT IT CANNOT SEE, SAID RATHER THAN IMPLIED
 * ============================================================================
 *
 * It reads source. It cannot tell you that the fetch handler actually answers a
 * dead network, that the precache actually landed, or that the checkout's catch
 * actually renders anything: those are the drive's, and the drive is named in
 * every message below so a reader is never left without the other half.
 *
 * Exit 1 naming every clause that failed, or exit 0 with the counts.
 * Drilled red and green in scripts/verify/guard-failure-drills.mjs.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const TAG = '[weak-network-contract]'

const CHECKOUT_FORM = 'src/app/checkout/[reservation_id]/checkout-form.tsx'
const APP_WORKER = 'public/app-sw.js'
const REGISTRAR = 'src/components/pwa/register-app-worker.tsx'
const LAYOUT = 'src/app/layout.tsx'
const POLICY = 'src/lib/seo/indexing-policy.ts'

const read = rel => {
  const abs = join(ROOT, rel)
  return existsSync(abs) ? readFileSync(abs, 'utf8') : null
}

/**
 * CLAUSE 1, pure so the drill can hand it a source string.
 *
 * It does not grep for the word "catch", which any refactor would satisfy while
 * deleting the behaviour. It finds the `await processCheckout(` call, walks back
 * to the nearest `try {` and forward to the nearest `catch`, and requires that
 * the call sits between them AND that the catch body names the module that
 * decides what the buyer is told. A catch that swallows silently fails here,
 * which is the case that would otherwise leave a buyer staring at a button that
 * did nothing.
 */
export function judgeCheckoutCatch(source) {
  const failures = []
  if (source === null) return { failures: ['the checkout form is missing entirely'], judged: 0 }

  const call = source.indexOf('await processCheckout(')
  if (call < 0) {
    return {
      failures: [
        `${CHECKOUT_FORM} no longer awaits processCheckout. If the submit moved, move this clause with it rather than deleting it.`,
      ],
      judged: 0,
    }
  }
  const tryAt = source.lastIndexOf('try {', call)
  const catchAt = source.indexOf('catch', call)
  if (tryAt < 0 || catchAt < 0) {
    failures.push(
      `${CHECKOUT_FORM}: the processCheckout call is not inside a try/catch. A Server Action call is a fetch, and a fetch on a dead radio rejects: without this the buyer is thrown to the checkout error boundary and loses every value they typed.`,
    )
    return { failures, judged: 1 }
  }
  // The catch BODY, bounded so a later unrelated catch in the file cannot satisfy this.
  const body = source.slice(catchAt, catchAt + 600)
  if (!body.includes('describeCheckoutSubmitFailure')) {
    failures.push(
      `${CHECKOUT_FORM}: the catch around processCheckout does not call describeCheckoutSubmitFailure. A silent catch leaves the buyer pressing a button that does nothing, which is a different defect rather than a fix.`,
    )
  }
  if (!source.includes("from '@/lib/checkout/network-failure'")) {
    failures.push(`${CHECKOUT_FORM}: the network-failure copy module is not imported.`)
  }
  return { failures, judged: 1 }
}

/**
 * CLAUSE 2, pure. The worker may keep content-hashed assets and nothing else.
 *
 * `cache.put` and `cache.add` are the only two ways anything enters a Cache, so
 * every write site is found and each must be reachable only from the static
 * branch or from the install precache of the offline document.
 */
export function judgeWorkerCaching(source) {
  const failures = []
  if (source === null) {
    return { failures: [`${APP_WORKER} does not exist, so there is no offline fallback at all`], judged: 0 }
  }

  const writes = [...source.matchAll(/cache\.(put|add|addAll)\(/g)]
  let judged = writes.length

  // The install precache: exactly one cache.add, and it must be the offline document.
  const precache = [...source.matchAll(/cache\.add(?:All)?\(([^\n]*)/g)].map(m => m[1])
  for (const arg of precache) {
    if (!arg.includes('OFFLINE_URL')) {
      failures.push(
        `${APP_WORKER}: an install precache adds something other than OFFLINE_URL (${arg.trim().slice(0, 80)}). Anything else precached here is a document served to a buyer with no way to know how old it is.`,
      )
    }
  }

  // Every cache.put must sit inside cacheFirst, the only function the static branch calls.
  const cacheFirstAt = source.indexOf('function cacheFirst(')
  const cacheFirstEnd = cacheFirstAt < 0 ? -1 : source.indexOf('\n}', cacheFirstAt)
  for (const m of source.matchAll(/cache\.put\(/g)) {
    const at = m.index ?? 0
    const inside = cacheFirstAt >= 0 && at > cacheFirstAt && at < cacheFirstEnd
    if (!inside) {
      failures.push(
        `${APP_WORKER}: a cache.put sits outside cacheFirst, at character ${at}. Only /_next/static/ may be kept: Next names those by content hash so a cached copy can never be the wrong copy. A cached PAGE carries a price and a remaining-tickets count.`,
      )
    }
  }

  // cacheFirst must be reached only from the content-hashed branch.
  for (const m of source.matchAll(/\bcacheFirst\(/g)) {
    const at = m.index ?? 0
    if (cacheFirstAt >= 0 && at === cacheFirstAt + 'function '.length) continue // the declaration itself
    const before = source.slice(Math.max(0, at - 260), at)
    if (!before.includes('STATIC_PATH')) {
      failures.push(
        `${APP_WORKER}: cacheFirst is called at character ${at} without a STATIC_PATH test above it. That is how a page, an order or a ticket ends up in the cache.`,
      )
    }
    judged += 1
  }

  // The navigation branch must pass straight through to the network.
  if (!/request\.mode === 'navigate'/.test(source)) {
    failures.push(`${APP_WORKER}: no navigation branch, so nothing answers when the network refuses.`)
  } else if (!/fetch\(request\)\s*\.catch\(/.test(source.replace(/\s+/g, ' '))) {
    failures.push(
      `${APP_WORKER}: the navigation branch does not go to the network first and fall back only on a refusal. A navigation answered from a cache is a stale price shown to a buyer.`,
    )
  } else {
    judged += 1
  }

  return { failures, judged }
}

/** CLAUSE 3, pure. The worker is mounted, and it waits for the paint. */
export function judgeRegistration(registrar, layout) {
  const failures = []
  if (registrar === null) return { failures: [`${REGISTRAR} does not exist, so nothing registers the worker`], judged: 0 }
  if (layout === null) return { failures: [`${LAYOUT} does not exist`], judged: 0 }

  if (!registrar.includes('serviceWorker') || !registrar.includes('.register(')) {
    failures.push(`${REGISTRAR}: no serviceWorker registration. The worker file would be dead weight.`)
  }
  if (!/readyState === 'complete'/.test(registrar) || !/'load'/.test(registrar)) {
    failures.push(
      `${REGISTRAR}: the registration does not wait for load. Starting a worker thread during the paint is a performance regression inside a performance item (close-out H3 moved the error-reporting SDK off this same path).`,
    )
  }
  if (!layout.includes('<RegisterAppWorker')) {
    failures.push(`${LAYOUT}: RegisterAppWorker is not rendered, so no page ever registers the worker.`)
  }
  return { failures, judged: 2 }
}

/** CLAUSE 4, pure. What the worker precaches is a real route the crawler is told to ignore. */
export function judgeOfflineRoute(worker, policy, routeExists) {
  const failures = []
  if (worker === null) return { failures: [`${APP_WORKER} does not exist`], judged: 0 }

  const declared = /var OFFLINE_URL = '([^']+)'/.exec(worker)?.[1]
  if (!declared) {
    failures.push(`${APP_WORKER}: no OFFLINE_URL is declared, so this clause cannot tell which route to check.`)
    return { failures, judged: 0 }
  }
  if (!routeExists) {
    failures.push(
      `${APP_WORKER} precaches ${declared} and there is no page at src/app${declared}/page.tsx. The install would fail and every offline navigation would fall through to the inline last resort.`,
    )
  }
  if (policy === null) {
    failures.push(`${POLICY} is missing, so the indexing class of ${declared} cannot be read.`)
  } else {
    const entry = new RegExp(`\\{\\s*route:\\s*'${declared.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')}',\\s*klass:\\s*'never'`).test(policy)
    if (!entry) {
      failures.push(
        `${POLICY}: ${declared} is not classified 'never'. "You are offline" is not a page that should ever rank, and an unclassified route fails the indexing guard anyway.`,
      )
    }
  }
  return { failures, judged: 2 }
}

function main() {
  const checkoutForm = read(CHECKOUT_FORM)
  const worker = read(APP_WORKER)
  const registrar = read(REGISTRAR)
  const layout = read(LAYOUT)
  const policy = read(POLICY)
  const offlineRouteExists = existsSync(join(ROOT, 'src/app/offline/page.tsx'))

  const clauses = [
    ['1 the checkout submit catches a thrown action', judgeCheckoutCatch(checkoutForm)],
    ['2 the root worker keeps only content-hashed assets', judgeWorkerCaching(worker)],
    ['3 the worker is registered, after the paint', judgeRegistration(registrar, layout)],
    ['4 the precached document is a real route, never indexed', judgeOfflineRoute(worker, policy, offlineRouteExists)],
  ]

  let judged = 0
  const failures = []
  for (const [name, result] of clauses) {
    judged += result.judged
    if (result.failures.length === 0) {
      console.log(`${TAG} clause ${name}: OK (${result.judged} check(s))`)
    } else {
      for (const f of result.failures) failures.push(`clause ${name}: ${f}`)
    }
  }

  if (failures.length) {
    for (const f of failures) console.error(`${TAG} FAIL: ${f}`)
    console.error(
      `${TAG} FAIL - ${failures.length} fault(s). The behavioural half of this proof is ` +
        `scripts/verify/scope-10-3-audit.mjs, which cuts a real network against a real build.`,
    )
    process.exit(1)
  }
  console.log(
    `${TAG} PASS - ${judged} check(s) across 4 clauses: the checkout survives a dropped submit, the root worker ` +
      `keeps only content-hashed assets, it is registered after the paint, and /offline is a real route classified never.`,
  )
}

// pathToFileURL, never a hand-built `file://` string: on Windows the hand-built
// form is missing a slash (`file://C:/...` against Node's `file:///C:/...`), the
// comparison silently fails, and a guard that runs nothing exits 0.
// scripts/verify/sentry-parity-sink.mjs records the same trap.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
