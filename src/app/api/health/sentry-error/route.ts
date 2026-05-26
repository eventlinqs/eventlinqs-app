import { NextResponse } from 'next/server'
import { captureException, isSentryEnabled } from '@/lib/observability/sentry'
import { applyRateLimit } from '@/lib/rate-limit/middleware'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Synthetic error endpoint for verifying Sentry is wired correctly.
// Throws an explicit error tagged so it can be filtered out of dashboards.
//
// Usage: curl https://<host>/api/health/sentry-error?token=<HEALTH_TOKEN>
//
// Defence in depth: token gate + IP rate limit. Each successful call
// generates a Sentry event, so even if the token leaks the rate limit
// caps quota burn at 5/min/IP per the health-sentry-error policy.
export async function GET(request: Request) {
  const blocked = await applyRateLimit('health-sentry-error', request)
  if (blocked) return blocked

  const token = process.env.HEALTH_CHECK_TOKEN
  const provided = new URL(request.url).searchParams.get('token')

  if (!token) {
    return NextResponse.json(
      { ok: false, error: 'HEALTH_CHECK_TOKEN not configured on server' },
      { status: 503 }
    )
  }

  if (provided !== token) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const error = new Error('Synthetic Sentry verification error - safe to ignore')
  ;(error as Error & { __synthetic?: boolean }).__synthetic = true

  captureException(error, {
    tags: {
      synthetic: 'true',
      source: 'api/health/sentry-error',
    },
    timestamp: new Date().toISOString(),
  })

  // Snapshot the enabled status once so the JSON body and the note can
  // never disagree. isSentryEnabled() forwards to Sentry.isInitialized()
  // which is the canonical SDK-side check that init succeeded.
  const enabled = isSentryEnabled()

  // [DIAG 2026-05-26] Surface the per-step init diagnostics written by
  // instrumentation.ts and sentry.server.config.ts. When sentryEnabled
  // is false, the diag object reveals exactly which step failed:
  //   - registerCalledAt missing  -> instrumentation.register() never ran
  //   - registerError present     -> the dynamic config import threw
  //   - serverConfigLoadedAt missing -> import resolved but module body didn't execute
  //   - serverDsnPresent: false   -> DSN env var was undefined at module evaluation
  //   - serverInitError present   -> Sentry.init threw synchronously
  //   - serverInitOk: false       -> Sentry.init returned but isInitialized was false
  const diag = (globalThis as typeof globalThis & {
    __el_sentry_diag?: Record<string, unknown>
  }).__el_sentry_diag ?? null

  return NextResponse.json({
    ok: true,
    sentryEnabled: enabled,
    note: enabled
      ? 'Synthetic error dispatched to Sentry. Within ~30s an event tagged synthetic=true should appear in the project.'
      : 'Sentry.isInitialized() returned false at request time. The synthetic error was routed through the dev console fallback in src/lib/observability/sentry.ts and did NOT reach Sentry. Inspect the `diag` field below for the per-step init state - the missing or failing step is the root cause.',
    diag,
    timestamp: new Date().toISOString(),
  })
}
