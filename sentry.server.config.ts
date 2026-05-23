// Sentry server init. Runs in the Node.js runtime (route handlers,
// server components, middleware on Node, server actions).
//
// Loaded by instrumentation.ts via dynamic import gated on
// NEXT_RUNTIME === 'nodejs'.
//
// PII discipline: same scrubber path as the client config. Server
// events more often carry sensitive payloads (auth headers, Stripe
// signature headers, Supabase JWTs) so scrubbing is non-negotiable.

import * as Sentry from '@sentry/nextjs'
import { scrubValue } from '@/lib/observability/pii-scrub'

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    profilesSampleRate: 0.1,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV || 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
    beforeSend(event) {
      try {
        return scrubValue(event) as typeof event
      } catch {
        return event
      }
    },
    beforeSendTransaction(event) {
      // Strip query strings from transaction names that contain known
      // sensitive params. Cheap defence; the scrubber covers the rest
      // of the payload.
      try {
        return scrubValue(event) as typeof event
      } catch {
        return event
      }
    },
  })
}
