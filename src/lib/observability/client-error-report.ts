// Client error reporting seam. CARRIES NO SENTRY IMPORT, ON PURPOSE.
//
// The four client error boundaries (src/app/error.tsx, src/app/global-error.tsx,
// src/app/checkout/error.tsx, src/app/(dashboard)/dashboard/error.tsx) used to
// import captureException from src/lib/observability/sentry.ts, which statically
// imports @sentry/nextjs. Two of those boundaries are platform-wide, so that one
// import put the whole SDK in the client bundle of EVERY route. Deferring the
// SDK in instrumentation-client.ts would have achieved nothing while this path
// existed: the bytes would simply have arrived through the error boundary
// instead, and the deferral would have looked correct while doing nothing.
//
// So the boundaries now talk to this module, which knows nothing about Sentry.
// It holds reports until something installs a sink. sentry-client-boot.ts
// installs one immediately after init and drains whatever accumulated.
//
// WHY A QUEUE AND NOT A DYNAMIC IMPORT AT THE CALL SITE. A React error caught by
// an error boundary never becomes a window 'error' event, so the capture shim in
// instrumentation-client.ts cannot see it. If a boundary fires before the SDK
// has loaded and we simply awaited an import there, the report would race the
// boot and could be captured before init, which drops it silently. Queueing is
// the only ordering that cannot lose the report.

type ClientErrorReport = {
  error: unknown
  context?: Record<string, unknown>
}

export type ClientErrorSink = (report: ClientErrorReport) => void

/**
 * Bounded. A component throwing on every render would otherwise grow this
 * without limit before the SDK arrives. Sentry would group them anyway.
 */
const MAX_QUEUED = 20
const queued: ClientErrorReport[] = []

let sink: ClientErrorSink | null = null

/**
 * Report a client error. Safe to call at any point in the page lifecycle,
 * including before the Sentry SDK has loaded.
 */
export function reportClientError(error: unknown, context?: Record<string, unknown>): void {
  const report: ClientErrorReport = { error, context }

  if (sink) {
    sink(report)
    return
  }

  if (queued.length < MAX_QUEUED) queued.push(report)

  // Development fallback, matching the behaviour the old shim had: with no DSN
  // and no init in `next dev`, an error should still reach stdout rather than
  // vanish into a queue nobody drains.
  if (process.env.NODE_ENV !== 'production') {
    console.error('[observability] reportClientError', error, context)
  }
}

/**
 * Install the real reporter and flush anything that arrived before it existed.
 * Called once, by sentry-client-boot.ts, immediately after Sentry.init.
 *
 * Returns the number of queued reports drained, so the caller can assert the
 * drain happened rather than assuming it.
 */
export function setClientErrorSink(next: ClientErrorSink): number {
  sink = next
  let drained = 0
  while (queued.length > 0) {
    const report = queued.shift()
    if (report) {
      next(report)
      drained += 1
    }
  }
  return drained
}

/** Test seam. Drops the sink and any queued reports. */
export function __resetClientErrorReporting(): void {
  sink = null
  queued.length = 0
}
