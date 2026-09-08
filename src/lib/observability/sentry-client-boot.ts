// Sentry client boot. THIS MODULE IS ONLY EVER REACHED BY DYNAMIC IMPORT.
//
// It carries the @sentry/nextjs import, so whatever imports it statically pulls
// the whole SDK into that chunk. instrumentation-client.ts imports it with
// `await import(...)` on the window load event, which is what keeps roughly
// 121KB of transfer and a ~300ms long task off the boot critical path. Import
// it statically from anywhere and that win is silently undone, which is why
// scripts/ci/critical-path-guard.mjs (RULE 4) fails the build on a static import.
//
// Replaces the former repo-root sentry.client.config.ts. That file was deleted
// rather than emptied: while it existed it was a second, convention-based path
// into the SDK, and a file that must never be imported is safer absent than
// present-and-inert. instrumentation-client.ts is the documented client hook on
// both Turbopack and webpack, so nothing depends on the old filename.
//
// PII discipline is unchanged: every outbound event goes through scrubValue
// from src/lib/observability/pii-scrub.ts (17 unit tests, conservative
// false-positives). Stack frames, message, contexts, tags, and extra all get
// scrubbed. Bearer tokens, JWTs, Stripe ids, emails, phones, CC-shaped digit
// blocks, and UUIDs are all redacted before the event leaves the browser.
//
// Filters applied BEFORE scrub (cheaper to drop than scrub):
//   - ResizeObserver loop errors (noisy, harmless)
//   - AbortError-class messages (user navigation, fetch cancellation)
//   - Browser-extension origin frames (chrome-extension://, moz-extension://, safari-extension://)

// NAMED IMPORTS, NEVER A NAMESPACE IMPORT. `import * as Sentry` cannot be
// tree-shaken, because the bundler must assume any property of the namespace
// object might be read. scripts/check-client-barrel-imports.mjs blocks it.
import { init, captureException, captureRouterTransitionStart } from '@sentry/nextjs'

/**
 * Re-exported so instrumentation-client.ts can reach it WITHOUT a second
 * dynamic import of the @sentry/nextjs barrel.
 *
 * That barrel import was the leak (close-out P0.5, 8 September 2026). A dynamic
 * `import('@sentry/nextjs')` is a NAMESPACE import: the bundler must assume any
 * property of the namespace might be read, so it cannot tree-shake, so that one
 * line dragged the rrweb recorder into the same chunk group. Driven proof: with
 * Session Replay already correctly deferred to the first interaction, the
 * recorder chunk was still fetched at 4,323 ms with no input at all, 50 ms
 * behind the SDK core, on 2 of 2 runs. The arming was deferred; the 123.2 KB
 * was not.
 *
 * A named static import shakes cleanly and lands in the core chunk that was
 * being fetched anyway, so this costs nothing.
 */
export { captureRouterTransitionStart }
import { scrubValue } from './pii-scrub'
import { sentryEnvironment } from './sentry-env'
import { setClientErrorSink } from './client-error-report'

/**
 * Why the SDK was loaded, decided by instrumentation-client.ts.
 *
 * It is passed in rather than inferred here because only the scheduler knows:
 * 'interaction' means the visitor has already touched the page, 'timer' means
 * the page loaded and nobody touched it, 'error' means something threw and the
 * report must not wait. Session Replay reads it to decide whether it may start
 * recording at once or must wait for a first interaction of its own.
 */
export type SentryBootReason = 'error' | 'interaction' | 'timer'

/** An error the capture shim held while the SDK was still loading. */
export type PendingError = {
  error: unknown
  /** performance.now() at the moment the browser reported it. */
  at: number
  kind: 'error' | 'unhandledrejection'
}

/**
 * Initialise the client SDK, drain anything the shim caught while we were
 * loading, then arm Session Replay.
 *
 * Returns the number of buffered errors forwarded, so the caller can assert the
 * drain actually happened rather than assuming it.
 */
export function bootSentryClient(
  dsn: string,
  pending: PendingError[],
  reason: SentryBootReason = 'timer',
): number {
  init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    environment: sentryEnvironment(true),
    release: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
    // Session Replay is NOT listed here on purpose: it is armed after load by
    // armSessionReplay() below. Adding it here statically imports the rrweb
    // recorder (@sentry-internal/replay, ~304KB unminified with rrweb inlined)
    // into whatever chunk this module lands in. Measured on the event-detail
    // route: that chunk was 187KB transferred with 1,047ms of evaluation and
    // owned every long task on the page, holding LCP "Render Delay" at 3,071ms
    // while the hero raster sat downloaded and ready since 127ms. Sentry
    // documents dynamic import + addIntegration as the supported way to keep
    // Replay out of the initial bundle.
    integrations: [],
    beforeSend(event, hint) {
      // 1. Drop known-noise classes outright.
      const originalErr = hint?.originalException as Error | undefined
      const message = event.message ?? originalErr?.message ?? ''
      if (typeof message === 'string') {
        if (/ResizeObserver loop/i.test(message)) return null
        if (/AbortError/i.test(message)) return null
      }
      const frames = event.exception?.values?.[0]?.stacktrace?.frames ?? []
      for (const frame of frames) {
        if (
          frame.filename &&
          /^(chrome|moz|safari-web|safari)-extension:\/\//i.test(frame.filename)
        ) {
          return null
        }
      }

      // 2. PII scrub everything that remains. scrubValue walks objects
      //    recursively and rewrites known PII patterns in any string
      //    field it encounters.
      try {
        return scrubValue(event) as typeof event
      } catch {
        // Scrub failure must not block the event entirely; ship the
        // un-scrubbed event rather than dropping it. The scrubber is
        // unit-tested but defence-in-depth.
        return event
      }
    },
  })

  // Drain the shim's buffer. These are real Error objects captured by the
  // window 'error' / 'unhandledrejection' listeners, so their stacks are
  // intact and Sentry parses them exactly as it would a live throw. The
  // release and environment tags come from the init above, so a buffered
  // error carries the same tags as one thrown a second later.
  let forwarded = 0
  for (const item of pending) {
    captureException(item.error, {
      tags: { el_capture: 'pre_init_buffer' },
      extra: { reportedAtMs: Math.round(item.at), kind: item.kind },
    })
    forwarded += 1
  }

  // Take over client error reporting from the queue. Anything an error boundary
  // reported while the SDK was loading drains here, with the same release and
  // environment tags as a live report. Counted into the same return value so a
  // caller asserting "nothing was lost" sees both sources.
  forwarded += setClientErrorSink(({ error, context }) => {
    const scrubbed = context ? (scrubValue(context) as Record<string, unknown>) : undefined
    captureException(error, {
      tags: { el_capture: 'client_boundary' },
      ...(scrubbed ? { extra: scrubbed } : {}),
    })
  })

  armSessionReplay(reason === 'interaction')
  return forwarded
}

/**
 * The interaction signals that arm the recorder.
 *
 * The same four instrumentation-client.ts schedules the SDK on, and for the
 * same reason: all four mean a person has acted on a page that has painted.
 * `scroll` is excluded because a restored scroll position fires it with nobody
 * involved.
 */
const REPLAY_INTERACTION_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const

/**
 * Arm Session Replay strictly off the PAINT path: never before the visitor's
 * first interaction with the page.
 *
 * Why armed on an interaction and NOT on first error: replay runs in BUFFER
 * mode here (replaysSessionSampleRate 0, replaysOnErrorSampleRate 1.0). Buffer
 * mode keeps a rolling ~60s ring of DOM events so that when an error fires it
 * can upload what led up to it. That buffer only exists if the recorder was
 * already running. Sentry's documentation is explicit: if the integration is
 * added after an error has occurred there is nothing in the buffer to capture.
 * So arming on first error would report errors with no preceding context, which
 * is the entire value of on-error replay.
 *
 * WHAT THIS COSTS, SAID PLAINLY. An error that happens BEFORE the visitor has
 * touched the page now has no replay attached. The error itself is reported in
 * full, with its stack, exactly as before; what is missing is a recording of a
 * page nobody had yet interacted with.
 *
 * WHY THAT TRADE (close-out P0.5, 8 September 2026). The previous schedule was
 * requestIdleCallback with a 5,000 ms timeout, which reads as "off the critical
 * path" and is not: an idle callback fires during the quiet a throttled device
 * has WHILE the hero is still being painted. Measured on the deployed preview
 * with scripts/perf/chunk-cost-table.mjs and Lighthouse 12.6.1, on
 * /events/cat-indie-sounds-live-at-the-enmore-sydney: the recorder is 123.2 KB
 * transferred and 413 ms of script evaluation, 70% of it never executed, and it
 * was evaluating inside the Largest Contentful Paint window - a 270 ms long
 * task at 4,079 ms against an LCP of 4,382 ms whose Render Delay was 2,403 ms.
 * Every visitor paid that on every page load, and that page scored 0.79 against
 * the launch gate's 0.80 floor.
 *
 * P0.5 set the bar in the owner's own words: "either remove it, or load it
 * lazily and strictly off the critical path so it costs nothing before first
 * interaction." This is the second of those. Nothing is removed.
 *
 * @param userHasInteracted true when the SDK itself was booted BY an
 *   interaction, in which case waiting for a second one would only widen the
 *   window in which there is no buffer.
 */
function armSessionReplay(userHasInteracted: boolean) {
  if (typeof window === 'undefined') return

  const load = () =>
    import('./sentry-session-replay')
      .then(({ addSessionReplay }) => {
        addSessionReplay()
      })
      .catch(() => {
        // Replay is best-effort telemetry. A failed chunk fetch (offline,
        // ad-blocker, deploy rollover) must never break the page or the
        // error reporting that still works without it.
      })

  if (userHasInteracted) {
    load()
    return
  }

  const onFirstInteraction = () => {
    for (const name of REPLAY_INTERACTION_EVENTS) window.removeEventListener(name, onFirstInteraction)
    load()
  }
  for (const name of REPLAY_INTERACTION_EVENTS) window.addEventListener(name, onFirstInteraction, { passive: true })
}
