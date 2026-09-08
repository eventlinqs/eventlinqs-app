// Next.js client instrumentation hook (15.3+). Runs in the browser before any
// application code.
//
// WHAT CHANGED AND WHY (2026-08-05)
//
// This file used to statically import ./sentry.client.config, which statically
// imported @sentry/nextjs. That put the whole SDK on the boot critical path of
// every route: 202KB of transfer on the event detail route, 141KB of it never
// executed, owning the largest long task on the page (288 to 315ms).
//
// It could not be tree-shaken away. @sentry/nextjs's browser entry is
// `export * from '@sentry/react'`, chaining to @sentry/browser and @sentry/core,
// and @sentry/core carries integrations this platform never runs in a browser
// (Supabase, GraphQL, OpenAI, Anthropic, LangGraph, Statsig, Unleash). Named
// imports were worth 21KB. optimizePackageImports was worth zero. Sentry's own
// tree-shaking options are webpack-only, and the SDK documents that under
// Turbopack, which is what this project builds with, it "will no longer apply
// build-time instrumentation". So the surface cannot be removed; it can only be
// moved off the boot path. That is what this file now does.
//
// WHAT CHANGED AGAIN AND WHY (2026-09-08, close-out P0.5)
//
// The August change moved the SDK to the `load` event, and `load` is NOT off
// the paint path on a throttled mobile. Measured on the deployed preview of
// main's tree with scripts/perf/chunk-cost-table.mjs, on the event page the
// Lighthouse gate audits:
//
//   error reporting SDK    94.6 KB transferred, 231 ms of evaluation
//   Session Replay (rrweb) 123.2 KB transferred, 413 ms of evaluation
//   --------------------------------------------------------------------
//   217.8 KB of the page's 439.0 KB of script, and 644 ms of main thread
//
// Both chunks arrived and evaluated INSIDE the Largest Contentful Paint window:
// Lighthouse recorded long tasks from those two files at 3,180 ms and 4,079 ms
// with the LCP landing at 4,382 ms, of which 2,403 ms was Render Delay - the
// hero raster had finished downloading at 1,980 ms and then waited for the main
// thread. That is the page the launch gate fails on, and this is what it is
// failing on.
//
// So the schedule is no longer "after load". It is the EARLIEST of:
//
//   1. an error the shim is already holding, because a report must never wait
//      on a schedule;
//   2. the visitor's first real interaction with the page, because by then the
//      paint they were waiting for has happened;
//   3. BOOT_AFTER_LOAD_MS after the load event, so a visitor who reads a page
//      and never touches it still has their errors reported.
//
// THE ORDER MATTERS, AND IT IS NOT NEGOTIABLE:
//
//   1. Arm the synchronous capture shim FIRST, before anything is deferred.
//   2. Only then schedule the SDK load.
//
// Done in that order, deferring costs zero error reports. An error at 50ms is
// caught by the shim as a real Error object with its stack intact, held, and
// forwarded to Sentry the moment the SDK initialises, carrying the same release
// and environment tags it would have carried if thrown a second later. What the
// defer does cost is Session Replay context for the first moments of a page,
// which is measured and recorded in docs/roast/sentry-client-surface-2026-08-05.md.

import { shouldInitSentry } from '@/lib/observability/sentry-env'
import type { PendingError, SentryBootReason } from '@/lib/observability/sentry-client-boot'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

/**
 * Errors the browser reported before the SDK finished loading.
 *
 * Bounded on purpose. An error loop (a component throwing on every render)
 * could otherwise grow this without limit before the SDK arrives. Twenty is far
 * more than enough to diagnose a boot failure, and Sentry would group them
 * anyway.
 */
const pending: PendingError[] = []
const MAX_PENDING = 20

/**
 * How long after the load event the SDK boots when nothing else has asked for
 * it.
 *
 * Three seconds, and the number is chosen rather than felt. Lighthouse's mobile
 * profile finishes its gather window well after this, so the timer still fires
 * during an audit and the audited page is the same page a real visitor gets:
 * this is a deferral, never a way to hide the SDK from a measurement. What it
 * buys is that the fetch and the evaluation land after the paint instead of
 * during it. For a real visitor it is the outer bound on how long an error can
 * sit in the shim before it is reported, and three seconds of holding a real
 * Error object with its stack intact loses nothing.
 */
const BOOT_AFTER_LOAD_MS = 3000

/**
 * What counts as the visitor interacting with the page.
 *
 * Deliberately the coarse, early signals rather than `click`: a pointer going
 * down, a key going down, a finger touching, a wheel turning. All four mean the
 * page has painted enough for a person to act on it, which is exactly the
 * condition for the SDK no longer being in the paint's way. `scroll` is not in
 * the list because a restored scroll position fires it with no person involved.
 */
const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const

/**
 * How many times a failed SDK load may be retried.
 *
 * A failed chunk fetch (offline, ad-blocker, a deploy rolling over mid session)
 * re-arms the schedulers so a later interaction gets another chance, which is
 * what the previous implementation promised in a comment and did not do. It is
 * bounded because an error loop calls boot() on every error, and an
 * unbounded retry against a chunk that will never load is a request storm.
 */
const MAX_BOOT_ATTEMPTS = 3

let booted = false
let bootAttempts = 0
let bootTimer: ReturnType<typeof setTimeout> | undefined

function hold(error: unknown, kind: PendingError['kind']) {
  if (pending.length >= MAX_PENDING) return
  pending.push({ error, at: performance.now(), kind })
  // An error is the one thing that must not wait for a schedule. The whole
  // safety argument for deferring is that nothing is lost, and something held
  // in a page the visitor then closes IS lost.
  boot('error')
}

// The listeners keep a reference so they can be removed the instant the SDK is
// live. Sentry installs its own global handlers at init; leaving these attached
// as well would report every subsequent error twice.
const onError = (event: ErrorEvent) => {
  // event.error is the real Error object, so the stack survives. Fall back to
  // the message string only when a cross-origin script hides the error object.
  hold(event.error ?? event.message, 'error')
}
const onRejection = (event: PromiseRejectionEvent) => {
  hold(event.reason, 'unhandledrejection')
}
const onInteraction = () => {
  boot('interaction')
}

/**
 * Forward-declared router transition hook.
 *
 * Next.js reads this export at module evaluation time, so it has to exist
 * synchronously, but the real implementation lives in the SDK we have not
 * loaded yet. This forwards once the SDK is in, and is a no-op before that. The
 * cost of the no-op window is a missing navigation span on a transition in the
 * first moments of a page, never a missing error.
 */
type RouterTransitionStart = typeof import('@sentry/nextjs').captureRouterTransitionStart
let realRouterTransitionStart: RouterTransitionStart | null = null

export const onRouterTransitionStart = ((...args: Parameters<RouterTransitionStart>) => {
  realRouterTransitionStart?.(...args)
}) as RouterTransitionStart

function attachInteractionSchedulers() {
  for (const name of INTERACTION_EVENTS) {
    window.addEventListener(name, onInteraction, { passive: true })
  }
}

/**
 * Start the post-load countdown.
 *
 * A function declaration at module scope rather than a closure inside the arming
 * block, because boot()'s failure path re-arms it, and a scheduler that only the
 * arming block can reach cannot be brought back.
 */
function armTimer() {
  bootTimer = setTimeout(() => boot('timer'), BOOT_AFTER_LOAD_MS)
}

function detachSchedulers() {
  for (const name of INTERACTION_EVENTS) {
    window.removeEventListener(name, onInteraction)
  }
  if (bootTimer !== undefined) {
    clearTimeout(bootTimer)
    bootTimer = undefined
  }
}

function boot(reason: SentryBootReason) {
  if (booted) return
  booted = true
  bootAttempts += 1
  detachSchedulers()

  // ONE dynamic import, and it is NOT the @sentry/nextjs barrel.
  //
  // This used to chain a second `import('@sentry/nextjs')` to pick up
  // captureRouterTransitionStart. A dynamic import of a barrel is a NAMESPACE
  // import, which cannot be tree-shaken, so that one line dragged the rrweb
  // recorder into the same chunk group and fetched 123.2 KB of it with no
  // interaction at all - measured at 4,323 ms on 2 of 2 driven runs while the
  // recorder's own arming was correctly waiting for input. The function is now
  // re-exported from sentry-client-boot, which is a named static import and
  // shakes cleanly into the core chunk we are already fetching.
  import('@/lib/observability/sentry-client-boot')
    .then(({ bootSentryClient, captureRouterTransitionStart }) => {
      // Detach the shim BEFORE draining, so an error arriving during the
      // drain is handled by Sentry's own handlers rather than by both.
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)

      bootSentryClient(dsn as string, pending, reason)
      pending.length = 0

      realRouterTransitionStart = captureRouterTransitionStart
    })
    .catch(() => {
      // The SDK chunk failed to load (offline, or a deploy rolled over mid
      // session). The shim listeners stay attached in this case because the
      // removal above only runs on the success path, so errors continue to be
      // held rather than silently dropped, and the schedulers are re-armed so a
      // later interaction gets another chance. Never let telemetry break the
      // page, and never let it storm the network either: MAX_BOOT_ATTEMPTS.
      //
      // BOTH schedulers come back, not just the interaction one. A failure on
      // the error path can happen before load, and detachSchedulers() has
      // already cleared the timer by then; re-arming only the interaction
      // listeners would leave a visitor who reads the page and never touches it
      // with no reporting at all after one failed chunk fetch.
      if (bootAttempts < MAX_BOOT_ATTEMPTS) {
        booted = false
        attachInteractionSchedulers()
        armTimer()
      }
    })
}

if (typeof window !== 'undefined' && dsn && shouldInitSentry()) {
  // STEP 1. Capture is live from here on. Nothing below this line can lose an
  // error, because the browser will hand it to these listeners regardless of
  // whether the SDK has loaded.
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)

  // Mark the exact moment capture becomes live. This is the boundary the whole
  // safety argument rests on, and without a mark it can only be inferred from
  // timing, which is a race. scripts/verify/sentry-pre-init-capture-proof.mjs
  // waits for this mark before throwing, so the proof tests the shim rather
  // than the network. Free, and carries no PII.
  try {
    performance.mark('el:sentry-shim-armed')
  } catch {
    // User Timing is not load-bearing. Never let telemetry break the page.
  }

  // STEP 2. Schedule the SDK load off the PAINT path, not merely off the boot
  // path. Interaction listeners are attached now rather than at load, because a
  // visitor who taps at 400ms has, by tapping, told us the page is painted.
  attachInteractionSchedulers()

  if (document.readyState === 'complete') armTimer()
  else window.addEventListener('load', armTimer, { once: true })
}
