// Sentry server init. Runs in the Node.js runtime (route handlers,
// server components, middleware on Node, server actions).
//
// Loaded by instrumentation.ts via dynamic import gated on
// NEXT_RUNTIME === 'nodejs'.
//
// PII discipline: same scrubber path as the client config. Server
// events more often carry sensitive payloads (auth headers, Stripe
// signature headers, Supabase JWTs) so scrubbing is non-negotiable.
//
// [DIAG 2026-05-26] Module load + Sentry.init result are recorded on
// globalThis.__el_sentry_diag so /api/health/sentry-error can surface
// exactly which step failed when sentryEnabled is false. Sentry.init
// is wrapped in try/catch so a synchronous throw inside the SDK does
// not silently leave the module half-initialised - the prior pattern
// shipped no try/catch and any init exception vanished into the void.

import * as Sentry from '@sentry/nextjs'
import { scrubValue } from '@/lib/observability/pii-scrub'

type SentryDiag = {
  registerCalledAt?: string
  registerError?: string
  runtime?: string
  serverConfigLoadedAt?: string
  serverDsnSource?: 'SENTRY_DSN' | 'NEXT_PUBLIC_SENTRY_DSN' | 'NONE'
  serverDsnPresent?: boolean
  serverInitAt?: string
  serverInitOk?: boolean
  serverInitError?: string
}

function getDiag(): SentryDiag {
  const g = globalThis as typeof globalThis & { __el_sentry_diag?: SentryDiag }
  if (!g.__el_sentry_diag) g.__el_sentry_diag = {}
  return g.__el_sentry_diag
}

const diag = getDiag()
diag.serverConfigLoadedAt = new Date().toISOString()

const sentryDsn = process.env.SENTRY_DSN
const publicDsn = process.env.NEXT_PUBLIC_SENTRY_DSN
const dsn = sentryDsn || publicDsn

diag.serverDsnSource = sentryDsn ? 'SENTRY_DSN' : publicDsn ? 'NEXT_PUBLIC_SENTRY_DSN' : 'NONE'
diag.serverDsnPresent = Boolean(dsn)

console.log('[sentry-server-config] module loaded', {
  dsnPresent: diag.serverDsnPresent,
  dsnSource: diag.serverDsnSource,
  timestamp: diag.serverConfigLoadedAt,
})

if (dsn) {
  try {
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
    diag.serverInitAt = new Date().toISOString()
    diag.serverInitOk = Sentry.isInitialized()
    console.log('[sentry-server-config] Sentry.init returned', {
      isInitialized: diag.serverInitOk,
      timestamp: diag.serverInitAt,
    })
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    diag.serverInitOk = false
    diag.serverInitError = message
    console.error('[sentry-server-config] Sentry.init threw:', err)
  }
}
