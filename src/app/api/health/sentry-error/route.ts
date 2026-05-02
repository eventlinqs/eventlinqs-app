import { NextResponse } from 'next/server'
import { captureException, isSentryEnabled } from '@/lib/observability/sentry'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Synthetic error endpoint for verifying Sentry is wired correctly.
// Throws an explicit error tagged so it can be filtered out of dashboards.
//
// Usage: curl https://<host>/api/health/sentry-error?token=<HEALTH_TOKEN>
//
// The token gate is necessary because anyone hitting this endpoint
// generates a Sentry event - leaving it unguarded would let scrapers
// fill the org's monthly event quota.
export async function GET(request: Request) {
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

  return NextResponse.json({
    ok: true,
    sentryEnabled: isSentryEnabled(),
    note: isSentryEnabled()
      ? 'Synthetic error sent to Sentry. Check the EventLinqs project for an event tagged synthetic=true within ~30s.'
      : 'Sentry not yet enabled (NEXT_PUBLIC_SENTRY_DSN unset or NODE_ENV != production). Error captured to console only.',
    timestamp: new Date().toISOString(),
  })
}
