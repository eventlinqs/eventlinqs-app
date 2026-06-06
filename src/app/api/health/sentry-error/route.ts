import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { captureException, isSentryEnabled } from '@/lib/observability/sentry'
import { scrubValue } from '@/lib/observability/pii-scrub'
import { shouldInitSentry, sentryEnvironment } from '@/lib/observability/sentry-env'
import { applyRateLimit } from '@/lib/rate-limit/middleware'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// [FIX-OBS 2026-05-27] Handler-internal Sentry init.
//
// Empirical finding after PR #48 (diag-fix) and PR #49 (shim-module-load
// init): neither the instrumentation.ts hook (registerCalledAt never
// written) nor the shim module-load IIFE (shimLoadedAt never written)
// actually executes in the deployed Vercel serverless function on
// Next.js 16.2.2 + Turbopack. The IIFE is verifiably present in the
// route's referenced chunks (_12oqzib._.js, [root-of-the-server]__
// 12trtep._.js) but the chunk module wrapper is not invoked at cold
// start. Production curl returns diag: null and Vercel function logs
// show zero hits for [sentry-instrumentation] or [observability/sentry]
// markers.
//
// Calling ensureSentryInitializedInHandler() at the top of GET runs
// inside the handler's actual execution context. Whatever module-load
// optimisation is dropping the IIFE invocation cannot drop a function
// call from code that is reached when the request is served.
// Idempotent on subsequent requests via Sentry.isInitialized().

function ensureSentryInitializedInHandler(): void {
  if (Sentry.isInitialized()) return

  const sentryDsn = process.env.SENTRY_DSN
  const publicDsn = process.env.NEXT_PUBLIC_SENTRY_DSN
  const dsn = sentryDsn || publicDsn

  const diag = (globalThis as typeof globalThis & {
    __el_sentry_diag?: Record<string, unknown>
  }).__el_sentry_diag ?? ((globalThis as typeof globalThis & {
    __el_sentry_diag: Record<string, unknown>
  }).__el_sentry_diag = {})
  diag.handlerInitInvokedAt = new Date().toISOString()
  diag.handlerDsnSource = sentryDsn ? 'SENTRY_DSN' : publicDsn ? 'NEXT_PUBLIC_SENTRY_DSN' : 'NONE'
  diag.handlerDsnPresent = Boolean(dsn)

  console.log('[health/sentry-error] handler init invoked', {
    dsnSource: diag.handlerDsnSource,
    dsnPresent: diag.handlerDsnPresent,
    timestamp: diag.handlerInitInvokedAt,
  })

  if (!dsn) return

  // Development kill-switch. Mirrors every other init site: a local dev
  // server must not initialise Sentry or dispatch the synthetic event,
  // even when hit with a valid token, so dev never reports.
  if (!shouldInitSentry()) {
    diag.handlerInitOk = false
    diag.handlerInitError = 'skipped: development build'
    console.log('[health/sentry-error] skipping init: development build', {
      nodeEnv: process.env.NODE_ENV,
      timestamp: diag.handlerInitInvokedAt,
    })
    return
  }

  try {
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      profilesSampleRate: 0.1,
      environment: sentryEnvironment(false),
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
    diag.handlerInitAt = new Date().toISOString()
    diag.handlerInitOk = Sentry.isInitialized()
    console.log('[health/sentry-error] handler Sentry.init returned', {
      isInitialized: diag.handlerInitOk,
      timestamp: diag.handlerInitAt,
    })
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    diag.handlerInitOk = false
    diag.handlerInitError = message
    console.error('[health/sentry-error] handler Sentry.init threw:', err)
  }
}

// Synthetic error endpoint for verifying Sentry is wired correctly.
// Throws an explicit error tagged so it can be filtered out of dashboards.
//
// Usage: curl https://<host>/api/health/sentry-error?token=<HEALTH_TOKEN>
//
// Defence in depth: token gate + IP rate limit. Each successful call
// generates a Sentry event, so even if the token leaks the rate limit
// caps quota burn at 5/min/IP per the health-sentry-error policy.
export async function GET(request: Request) {
  // Handler-internal Sentry init runs FIRST so the synthetic error
  // dispatched below can actually reach Sentry even if the shim
  // module-load IIFE and instrumentation.register() both no-op'd.
  ensureSentryInitializedInHandler()

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

  // Surface the pinned environment the SDK actually initialised with, so a
  // production check can confirm the pin (production deploys report
  // "production", previews "preview") without enabling SDK debug logging.
  // null when the SDK did not initialise (development build, or no DSN).
  const activeEnvironment = Sentry.getClient()?.getOptions().environment ?? null

  // [DIAG 2026-05-26..27] Surface per-step init diagnostics written by
  // instrumentation.ts, sentry.server.config.ts, the shim's module-load
  // IIFE, and this route's handler-internal init. When sentryEnabled is
  // false, the diag object names exactly which step failed:
  //   - registerCalledAt missing      -> instrumentation.register() never ran
  //   - registerError present         -> the dynamic config import threw
  //   - serverConfigLoadedAt missing  -> import resolved but module body didn't execute
  //   - serverDsnPresent: false       -> DSN env var was undefined at module evaluation
  //   - serverInitError present       -> sentry.server.config.ts Sentry.init threw
  //   - serverInitOk: false           -> server config Sentry.init returned but isInitialized was false
  //   - shimLoadedAt missing          -> shim module-load IIFE never executed
  //   - shimInitError present         -> shim Sentry.init threw
  //   - shimInitOk: false             -> shim Sentry.init returned but isInitialized was false
  //   - handlerInitInvokedAt missing  -> request never reached ensureSentryInitializedInHandler (impossible if you see this response)
  //   - handlerInitError present      -> handler Sentry.init threw
  //   - handlerInitOk: false          -> handler Sentry.init returned but isInitialized was false
  //   - handlerInitOk: true + sentryEnabled: true -> fix is working
  const diag = (globalThis as typeof globalThis & {
    __el_sentry_diag?: Record<string, unknown>
  }).__el_sentry_diag ?? null

  return NextResponse.json({
    ok: true,
    sentryEnabled: enabled,
    sentryEnvironment: activeEnvironment,
    note: enabled
      ? 'Synthetic error dispatched to Sentry. Within ~30s an event tagged synthetic=true should appear in the project.'
      : 'Sentry.isInitialized() returned false at request time. The synthetic error was routed through the dev console fallback in src/lib/observability/sentry.ts and did NOT reach Sentry. Inspect the `diag` field below for the per-step init state - the missing or failing step is the root cause.',
    diag,
    timestamp: new Date().toISOString(),
  })
}
