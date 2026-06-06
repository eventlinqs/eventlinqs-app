// Shared Sentry init-gate and environment resolver.
//
// Two jobs, applied identically at every Sentry.init site (client, server,
// edge, the observability shim's module-load fallback, and the health
// route's handler-internal init):
//
//   1. shouldInitSentry() - the development kill-switch. The SDK must
//      NEVER initialise or send events from a local development machine.
//      A dev TypeError reaching the founder's inbox is exactly the failure
//      this prevents: the production alert rule firing on a local error.
//      `next dev` runs with NODE_ENV=development; we refuse to init in that
//      case regardless of whether a DSN happens to be present in
//      .env.local. Because captureException/captureMessage only forward to
//      Sentry when Sentry.isInitialized() is true, blocking init also
//      blocks every send path in development.
//
//   2. sentryEnvironment() - the environment pin. Production deployments
//      report as "production" and previews as "preview", using Vercel's
//      standard env detection (NEXT_PUBLIC_VERCEL_ENV in the browser bundle,
//      VERCEL_ENV on the server and edge runtimes). Passing this value
//      explicitly overrides the @sentry/nextjs default, which is
//      `vercel-${VERCEL_ENV}` (i.e. "vercel-production") via the SDK's
//      getVercelEnv() helper. We never emit a "development" environment
//      because init never runs in development; a local production build
//      with no VERCEL_ENV set therefore reports as "production", matching a
//      real production deploy.

/**
 * The development kill-switch for Sentry initialisation.
 *
 * Returns true only when running as a production build (NODE_ENV ===
 * 'production'). Vercel production and preview deployments both build with
 * NODE_ENV=production and pass; a local `next dev` server runs with
 * NODE_ENV=development and is blocked. NODE_ENV is inlined into both the
 * server and client bundles by Next.js at build time, so this resolves
 * correctly in either runtime.
 */
export function shouldInitSentry(): boolean {
  return process.env.NODE_ENV === 'production'
}

/**
 * The pinned Sentry `environment` value for the current deployment.
 *
 * Uses standard Vercel env detection: the client bundle can only read the
 * NEXT_PUBLIC_-prefixed variable, while server and edge runtimes read the
 * unprefixed VERCEL_ENV first. A Vercel preview deploy reports "preview";
 * everything else (Vercel production, and a local production build with no
 * VERCEL_ENV) reports "production".
 *
 * @param isClient true for the browser bundle, false for server/edge runtimes.
 */
export function sentryEnvironment(isClient: boolean): 'production' | 'preview' {
  const vercelEnv = isClient
    ? process.env.NEXT_PUBLIC_VERCEL_ENV
    : process.env.VERCEL_ENV || process.env.NEXT_PUBLIC_VERCEL_ENV
  return vercelEnv === 'preview' ? 'preview' : 'production'
}
