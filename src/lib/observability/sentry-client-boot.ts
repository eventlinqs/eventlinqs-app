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
import { init, addIntegration, captureException } from '@sentry/nextjs'
import { scrubValue } from './pii-scrub'
import { sentryEnvironment } from './sentry-env'
import { setClientErrorSink } from './client-error-report'

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
export function bootSentryClient(dsn: string, pending: PendingError[]): number {
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

  armSessionReplay()
  return forwarded
}

/**
 * Arm Session Replay off the critical path.
 *
 * Why armed on idle and NOT on first error: replay runs in BUFFER mode here
 * (replaysSessionSampleRate 0, replaysOnErrorSampleRate 1.0). Buffer mode keeps
 * a rolling ~60s ring of DOM events so that when an error fires it can upload
 * what led up to it. That buffer only exists if the recorder was already
 * running. Sentry's documentation is explicit: if the integration is added
 * after an error has occurred there is nothing in the buffer to capture. So
 * arming on first error would report errors with no preceding context, which is
 * the entire value of on-error replay. Idle arming is the honest trade.
 *
 * The scheduling here is UNCHANGED from the previous implementation: a
 * requestIdleCallback with a 5000ms timeout, or a 2000ms setTimeout where the
 * API is missing. What moved is that the SDK itself now loads on the window
 * load event rather than at boot, so this callback is scheduled that much
 * later. The real-world width of that shift is measured, not estimated:
 * docs/perf/sentry-client-surface.md records the before and after arming times.
 */
function armSessionReplay() {
  if (typeof window === 'undefined') return

  const load = () =>
    import('@sentry/nextjs')
      .then(({ replayIntegration }) => {
        addIntegration(
          replayIntegration({
            // MASKING RESTORED TO SENTRY'S DEFAULTS (both default to true; this
            // call previously set both to false, which disabled them).
            //
            // WHY. beforeSend does NOT apply to Session Replay. Sentry documents
            // a separate hook for that, beforeAddRecordingEvent, and there was
            // none here, so the scrubValue discipline that protects every error
            // event did not cover replays at all. With replaysOnErrorSampleRate
            // at 1.0, every error uploaded a recording of the preceding ~60s of
            // DOM, with text unmasked.
            //
            // What that DOM contains on this platform is other people's personal
            // data: the organiser attendee list and orders table render buyer
            // names and email addresses, the ticket page renders a ticket code,
            // and checkout renders a name and email. So an error on any of those
            // screens shipped buyer PII to a third party as readable text.
            // Sentry's own guidance for maskAllText: false is to use it "only if
            // your site has no sensitive data". This site is almost entirely
            // other people's data.
            //
            // ASVS 14.2.3 (sensitive data must not be sent to untrusted parties)
            // and 16.2.5 (logging enforced by the data's protection level).
            //
            // COST, stated honestly: replays now show masked text, so a replay
            // localises a fault to an element rather than showing the exact
            // value. Recovering fidelity is a matter of adding `unmask`/`unblock`
            // selectors for regions PROVEN to hold no personal data, which is
            // safe because it is opt-in per element. Turning masking off
            // wholesale is not, because it is opt-out for the entire product.
            maskAllText: true,
            blockAllMedia: true,
          }),
        )
        markReplayArmed()
      })
      .catch(() => {
        // Replay is best-effort telemetry. A failed chunk fetch (offline,
        // ad-blocker, deploy rollover) must never break the page or the
        // error reporting that still works without it.
      })

  // Property-level typeof rather than `'x' in window`: the `in` form narrows
  // `window` itself to never in the else branch, because lib.dom declares
  // requestIdleCallback as always present.
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(load, { timeout: 5000 })
  } else {
    window.setTimeout(load, 2000)
  }
}

/**
 * Leave a performance mark when Replay actually starts recording.
 *
 * This exists so the no-buffer window is a measured number rather than a
 * guess. scripts/verify/sentry-replay-window.mjs reads it. The mark is free
 * (User Timing is already collected) and carries no PII.
 */
function markReplayArmed() {
  try {
    performance.mark('el:sentry-replay-armed')
  } catch {
    // User Timing is not load-bearing. Never let telemetry break the page.
  }
}
