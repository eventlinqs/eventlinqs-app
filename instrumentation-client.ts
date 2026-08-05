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
// which is measured and recorded in docs/perf/sentry-client-surface.md.

import { shouldInitSentry } from '@/lib/observability/sentry-env'
import type { PendingError } from '@/lib/observability/sentry-client-boot'

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

function hold(error: unknown, kind: PendingError['kind']) {
  if (pending.length >= MAX_PENDING) return
  pending.push({ error, at: performance.now(), kind })
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

if (typeof window !== 'undefined' && dsn && shouldInitSentry()) {
  // STEP 1. Capture is live from here on. Nothing below this line can lose an
  // error, because the browser will hand it to these listeners regardless of
  // whether the SDK has loaded.
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)

  // STEP 2. Load the SDK off the boot path.
  const boot = () => {
    import('@/lib/observability/sentry-client-boot')
      .then(({ bootSentryClient }) => {
        // Detach the shim BEFORE draining, so an error arriving during the
        // drain is handled by Sentry's own handlers rather than by both.
        window.removeEventListener('error', onError)
        window.removeEventListener('unhandledrejection', onRejection)

        bootSentryClient(dsn, pending)
        pending.length = 0

        return import('@sentry/nextjs')
      })
      .then(({ captureRouterTransitionStart }) => {
        realRouterTransitionStart = captureRouterTransitionStart
      })
      .catch(() => {
        // The SDK chunk failed to load (offline, or a deploy rolled over mid
        // session). The shim listeners stay attached in this case because the
        // removal above only runs on the success path, so errors continue to be
        // held rather than silently dropped, and a later navigation gets
        // another chance to boot. Never let telemetry break the page.
      })
  }

  // The window load event, not requestIdleCallback: load has already fired
  // after LCP, so this is off the critical path either way, and waiting for
  // idle on top would push Session Replay's arming later than it needs to be.
  if (document.readyState === 'complete') boot()
  else window.addEventListener('load', boot, { once: true })
}
