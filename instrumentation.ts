// Next.js instrumentation hook. Runs once per server process at boot
// and routes Sentry init to the correct runtime config file.
//
// Reference: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
// Sentry guide: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
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
