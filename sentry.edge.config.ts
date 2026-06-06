// Sentry edge init. Runs in the Edge runtime (proxy.ts, edge-routed
// route handlers, middleware on edge).
//
// Loaded by instrumentation.ts via dynamic import gated on
// NEXT_RUNTIME === 'edge'. Profiling is NOT available on edge so
// profilesSampleRate is omitted.

import * as Sentry from '@sentry/nextjs'
import { scrubValue } from '@/lib/observability/pii-scrub'
import { shouldInitSentry, sentryEnvironment } from '@/lib/observability/sentry-env'

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN

// shouldInitSentry() blocks initialisation in local development; the edge
// runtime only ever boots on Vercel deployments, but the guard keeps the
// behaviour identical to the client and server config sites.
if (dsn && shouldInitSentry()) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    environment: sentryEnvironment(false),
    release: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
    beforeSend(event) {
      try {
        return scrubValue(event) as typeof event
      } catch {
        return event
      }
    },
  })
}
