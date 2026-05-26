// Next.js instrumentation hook. Runs once per server process at boot
// and routes Sentry init to the correct runtime config file.
//
// Reference: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
// Sentry guide: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
//
// [DIAG 2026-05-26] register() is wrapped in try/catch and writes
// markers to globalThis.__el_sentry_diag so /api/health/sentry-error
// can surface exactly which init step failed when sentryEnabled is
// false. console.log routes the same signal to Vercel Function logs.
// Three prior init attempts (PR #41, #45, follow-up 62df960) shipped
// without a visible signal of which step actually failed in production;
// this closes that gap. The try/catch itself also fixes the silent-
// throw failure mode where a config-import error was being swallowed
// by Next.js with no surfaced trace.

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

export async function register(): Promise<void> {
  const diag = getDiag()
  diag.registerCalledAt = new Date().toISOString()
  diag.runtime = process.env.NEXT_RUNTIME

  console.log('[sentry-instrumentation] register() invoked', {
    runtime: process.env.NEXT_RUNTIME,
    vercelEnv: process.env.VERCEL_ENV,
    timestamp: diag.registerCalledAt,
  })

  try {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      await import('./sentry.server.config')
    }
    if (process.env.NEXT_RUNTIME === 'edge') {
      await import('./sentry.edge.config')
    }
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    diag.registerError = message
    console.error('[sentry-instrumentation] register() config import threw:', err)
  }
}

// onRequestError forwards uncaught request errors to Sentry. Used by
// Next.js 15+ to bridge server-component / server-action errors that
// were previously invisible to Sentry's auto-instrumentation. Imports
// Sentry from @sentry/nextjs at call time so this module stays cheap
// at boot.
export async function onRequestError(
  ...args: Parameters<typeof import('@sentry/nextjs').captureRequestError>
): Promise<void> {
  const Sentry = await import('@sentry/nextjs')
  Sentry.captureRequestError(...args)
}
