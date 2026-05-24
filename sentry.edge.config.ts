// Sentry edge init. Runs in the Edge runtime (proxy.ts, edge-routed
// route handlers, middleware on edge).
//
// Loaded by instrumentation.ts via dynamic import gated on
// NEXT_RUNTIME === 'edge'. Profiling is NOT available on edge so
// profilesSampleRate is omitted.

import * as Sentry from '@sentry/nextjs'
import { scrubValue } from '@/lib/observability/pii-scrub'

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV || 'development',
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
