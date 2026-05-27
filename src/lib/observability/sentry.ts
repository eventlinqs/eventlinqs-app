// Sentry observability wrapper.
//
// Forwards to @sentry/nextjs with PII scrubbing applied to the
// user-supplied context, and a dev-mode console fallback so local
// development without a DSN logs to stdout instead of swallowing
// errors.
//
// The Sentry SDK is initialised in three places that converge on the
// same global SDK state:
//   1. sentry.client.config.ts via instrumentation-client.ts (browser).
//   2. sentry.server.config.ts via instrumentation.ts.register() (Node
//      server-startup hook) when Next.js actually fires it.
//   3. ensureServerSentryInitialized() below, at module load of this
//      shim, when the instrumentation hook does NOT fire.
//
// Why (3) exists - the empirical finding from PR #48 inspection:
// Next.js 16.2.2 + Turbopack splits instrumentation.ts into its own
// chunk (server/chunks/_0dzsk13._.js in our build output), but per-
// route serverless function bundles do not reference that chunk. The
// route handler's bundle for /api/health/sentry-error/route.js lists
// six chunks, none of which is _0dzsk13._.js. On Vercel cold start
// the route's function therefore has no path to call register(), and
// Sentry.init never runs - producing sentryEnabled:false on the
// health endpoint and the diag:null signature documented in PR #48.
// Initialising at shim module-load guarantees Sentry.init runs the
// moment any module imports this file. Every Sentry-using surface
// imports the shim, so coverage is complete. Sentry.isInitialized()
// short-circuits the second call when register() also fires.
//
// Function signatures are stable. Callers (error.tsx,
// global-error.tsx, /api/health/sentry-error) do not move when the
// shim swaps.

import * as Sentry from '@sentry/nextjs'
import { scrubValue } from './pii-scrub'

type SentryContext = Record<string, unknown>

const isDev = process.env.NODE_ENV !== 'production'
const isServer = typeof window === 'undefined'

// Module-load Sentry init fallback. Runs server-side only. Mirrors
// sentry.server.config.ts so captured-event behaviour is identical
// regardless of which entry path triggered init. Idempotent on
// repeat imports via Sentry.isInitialized().
function ensureServerSentryInitialized(): void {
  if (!isServer) return
  if (Sentry.isInitialized()) return

  const sentryDsn = process.env.SENTRY_DSN
  const publicDsn = process.env.NEXT_PUBLIC_SENTRY_DSN
  const dsn = sentryDsn || publicDsn

  const diag = (globalThis as typeof globalThis & {
    __el_sentry_diag?: Record<string, unknown>
  }).__el_sentry_diag ?? ((globalThis as typeof globalThis & {
    __el_sentry_diag: Record<string, unknown>
  }).__el_sentry_diag = {})
  diag.shimLoadedAt = new Date().toISOString()
  diag.shimDsnSource = sentryDsn ? 'SENTRY_DSN' : publicDsn ? 'NEXT_PUBLIC_SENTRY_DSN' : 'NONE'
  diag.shimDsnPresent = Boolean(dsn)

  if (!dsn) {
    console.log('[observability/sentry] shim load: no DSN, skipping init', {
      dsnSource: diag.shimDsnSource,
      timestamp: diag.shimLoadedAt,
    })
    return
  }

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
        try {
          return scrubValue(event) as typeof event
        } catch {
          return event
        }
      },
    })
    diag.shimInitAt = new Date().toISOString()
    diag.shimInitOk = Sentry.isInitialized()
    console.log('[observability/sentry] shim Sentry.init returned', {
      isInitialized: diag.shimInitOk,
      dsnSource: diag.shimDsnSource,
      timestamp: diag.shimInitAt,
    })
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    diag.shimInitOk = false
    diag.shimInitError = message
    console.error('[observability/sentry] shim Sentry.init threw:', err)
  }
}

// Run at module load. Idempotent: Sentry.isInitialized() short-circuits
// when sentry.server.config.ts already ran via the instrumentation hook.
ensureServerSentryInitialized()

function applyContext(
  scope: Sentry.Scope,
  scrubbed: SentryContext | undefined,
): Sentry.Scope {
  if (!scrubbed) return scope
  // Tags get first-class treatment so Sentry's UI can filter on them.
  // Everything else lands in the "custom" context block.
  const { tags, ...rest } = scrubbed as { tags?: unknown } & Record<string, unknown>
  if (tags && typeof tags === 'object' && !Array.isArray(tags)) {
    for (const [k, v] of Object.entries(tags as Record<string, unknown>)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        scope.setTag(k, String(v))
      }
    }
  }
  if (Object.keys(rest).length > 0) {
    scope.setContext('custom', rest)
  }
  return scope
}

export function captureException(error: unknown, context?: SentryContext): void {
  const scrubbed = context ? (scrubValue(context) as SentryContext) : undefined
  if (Sentry.isInitialized()) {
    Sentry.captureException(error, scope => applyContext(scope, scrubbed))
    return
  }
  if (isDev) {
    console.error('[observability] captureException', error, scrubbed)
  }
}

export function captureMessage(message: string, context?: SentryContext): void {
  const scrubbed = context ? (scrubValue(context) as SentryContext) : undefined
  const safeMessage = typeof message === 'string' ? message : String(message)
  if (Sentry.isInitialized()) {
    Sentry.captureMessage(safeMessage, scope => applyContext(scope, scrubbed))
    return
  }
  if (isDev) {
    console.warn('[observability] captureMessage', safeMessage, scrubbed)
  }
}

// Returns true when the SDK has been initialised (DSN was present at
// init time and init succeeded). The /api/health/sentry-error route
// uses this to report end-to-end status. Replaces the previous
// "DSN set + production" heuristic that could produce a false positive
// before the SDK was installed.
export function isSentryEnabled(): boolean {
  return Sentry.isInitialized()
}
