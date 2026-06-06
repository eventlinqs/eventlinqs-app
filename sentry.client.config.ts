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
    integrations: [
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
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
}
