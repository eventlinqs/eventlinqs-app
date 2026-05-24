// Sentry observability wrapper.
//
// Forwards to @sentry/nextjs with PII scrubbing applied to the
// user-supplied context, and a dev-mode console fallback so local
// development without a DSN logs to stdout instead of swallowing
// errors.
//
// The Sentry SDK is initialised by sentry.client.config.ts,
// sentry.server.config.ts, and sentry.edge.config.ts (loaded by
// instrumentation.ts and instrumentation-client.ts at the repo root).
// Those configs run scrubValue over the full event payload via
// beforeSend; the per-call scrub here is defence-in-depth for the
// caller-supplied context object.
//
// Function signatures are stable. callers (error.tsx,
// global-error.tsx, /api/health/sentry-error) do not move when the
// shim swaps.

import * as Sentry from '@sentry/nextjs'
import { scrubValue } from './pii-scrub'

type SentryContext = Record<string, unknown>

const isDev = process.env.NODE_ENV !== 'production'

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
