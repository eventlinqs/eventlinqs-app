// Sentry shim. Until @sentry/nextjs is installed (a SHARED package.json
// change that requires project-manager coordination), this module
// provides a no-op implementation that error boundaries and route
// handlers can call without a guard. When Sentry is wired up the
// implementations swap to forward to @sentry/nextjs with the PII scrub
// applied in beforeSend.
//
// The function signatures here are stable. Once Sentry is installed the
// internals change; callers do not.

import { scrubValue } from './pii-scrub'

type SentryContext = Record<string, unknown>

const isDev = process.env.NODE_ENV !== 'production'
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
const enabled = Boolean(dsn) && process.env.NODE_ENV === 'production'

export function captureException(error: unknown, context?: SentryContext): void {
  const scrubbedContext = context ? scrubValue(context) : undefined
  if (!enabled) {
    if (isDev) {
      console.error('[observability] captureException', error, scrubbedContext)
    }
    return
  }
  // Forward to @sentry/nextjs once installed. Until then this is a noop
  // in production so missing DSN never crashes the app.
}

export function captureMessage(message: string, context?: SentryContext): void {
  const scrubbedContext = context ? scrubValue(context) : undefined
  const scrubbedMessage = typeof message === 'string' ? message : String(message)
  if (!enabled) {
    if (isDev) {
      console.warn('[observability] captureMessage', scrubbedMessage, scrubbedContext)
    }
    return
  }
}

export function isSentryEnabled(): boolean {
  return enabled
}
