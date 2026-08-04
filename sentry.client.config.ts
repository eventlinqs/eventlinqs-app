// Sentry client init. Runs in the browser bundle.
//
// Loaded indirectly via instrumentation-client.ts so the Next.js 15.3+
// client instrumentation hook drives initialisation; also auto-loaded
// by withSentryConfig for backward compatibility. Either path lands
// here and the init below runs at most once because Sentry.init is
// idempotent against repeat calls with the same DSN.
//
// PII discipline: every outbound event goes through scrubValue from
// src/lib/observability/pii-scrub.ts (17 unit tests, conservative
// false-positives). Stack frames, message, contexts, tags, and extra
// all get scrubbed. Bearer tokens, JWTs, Stripe ids, emails, phones,
// CC-shaped digit blocks, and UUIDs are all redacted before the
// event leaves the browser.
//
// Filters applied BEFORE scrub (cheaper to drop than scrub):
//   - ResizeObserver loop errors (noisy, harmless)
//   - AbortError-class messages (user navigation, fetch cancellation)
//   - Browser-extension origin frames (chrome-extension://, moz-extension://, safari-extension://)

import * as Sentry from '@sentry/nextjs'
import { scrubValue } from '@/lib/observability/pii-scrub'
import { shouldInitSentry, sentryEnvironment } from '@/lib/observability/sentry-env'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

// Init only when a DSN is configured AND this is a production build.
// shouldInitSentry() is the development kill-switch: a local `next dev`
// server (NODE_ENV=development) never initialises the SDK, so it can never
// send events, even when NEXT_PUBLIC_SENTRY_DSN is set in .env.local. A
// missing DSN keeps the SDK a complete no-op (no network, no events).
if (dsn && shouldInitSentry()) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    environment: sentryEnvironment(true),
    release: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
    // Session Replay is NOT listed here on purpose: it is armed after load by
    // armSessionReplay() below. Adding it here statically imports the rrweb
    // recorder (@sentry-internal/replay, ~304KB unminified with rrweb inlined)
    // into the main client chunk on EVERY route. Measured on the event-detail
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

  armSessionReplay()
}

/**
 * Arm Session Replay off the critical path.
 *
 * Why not in `integrations` at init: see the note there. rrweb is the single
 * heaviest passenger in the client bundle and it shipped on every route.
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
 * The cost of this trade, stated plainly so nobody has to rediscover it: an
 * error thrown before the recorder arms (roughly the first one to two seconds)
 * is still CAPTURED as an error, but carries no replay. Errors after arming are
 * unchanged.
 *
 * `load` first, then `requestIdleCallback`, so the import can never compete
 * with hydration for the main thread.
 */
function armSessionReplay() {
  if (typeof window === 'undefined') return

  const start = () => {
    const load = () =>
      import('@sentry/nextjs')
        .then(lazySentry => {
          Sentry.addIntegration(
            lazySentry.replayIntegration({
              maskAllText: false,
              blockAllMedia: false,
            }),
          )
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

  if (document.readyState === 'complete') start()
  else window.addEventListener('load', start, { once: true })
}
