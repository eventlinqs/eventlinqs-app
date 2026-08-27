import { NextResponse } from 'next/server'
import { checkRateLimit, clientIp } from '@/lib/redis/rate-limit'
import { POLICIES, type PolicyName } from './policies'
import { captureException } from '@/lib/observability/sentry'

// Standard rate-limit response headers per
// draft-ietf-httpapi-ratelimit-headers. Including limit/remaining/reset
// lets well-behaved clients back off without a 429 round-trip.
function buildHeaders(limit: number, remaining: number, resetMs: number): HeadersInit {
  const reset = Math.ceil(resetMs / 1000)
  return {
    'RateLimit-Limit': String(limit),
    'RateLimit-Remaining': String(remaining),
    'RateLimit-Reset': String(reset),
  }
}

function build429(limit: number, remaining: number, resetMs: number): NextResponse {
  const retryAfter = Math.max(1, Math.ceil(resetMs / 1000))
  return NextResponse.json(
    {
      ok: false,
      error: 'rate_limited',
      message: 'Too many requests. Slow down and try again shortly.',
      retryAfterSeconds: retryAfter,
    },
    {
      status: 429,
      headers: {
        ...buildHeaders(limit, remaining, resetMs),
        'Retry-After': String(retryAfter),
      },
    }
  )
}

// Apply a named policy to the request. Returns null on pass (caller
// continues), or a 429 NextResponse on fail. Caller is responsible for
// returning that response if non-null.
//
// Usage:
//   const blocked = await applyRateLimit('health-redis', request)
//   if (blocked) return blocked
//   ...handler logic...
//   return NextResponse.json({...}, { headers: buildHeaders(...) })
//
// The pure-functional shape was chosen over the higher-order
// `withRateLimit(handler)` form because the handler's other concerns
// (auth, validation, response shaping) are simpler to read inline than
// stacked behind decorators.
export async function applyRateLimit(
  policyName: PolicyName,
  request: Request,
  identifierOverride?: string
): Promise<NextResponse | null> {
  const policy = POLICIES[policyName]
  const ident = identifierOverride ?? clientIp(request)
  const result = await checkRateLimit({
    key: `${policy.keyPrefix}:${ident}`,
    limit: policy.limit,
    windowSec: policy.windowSec,
    failClosed: policy.failClosed,
  })
  if (!result.ok) {
    const res = build429(result.limit, result.remaining, result.resetMs)
    /*
     * WHY, on the response, so the handler can say something true.
     *
     * A refusal because the limiter has no store is not the same event as a
     * refusal because the bucket is full, and a person told to wait ten minutes
     * for the first will wait, retry, be refused again, and leave. Driven on
     * 27 August 2026 against a brand new signup.
     */
    if (result.reason) res.headers.set('X-RateLimit-Reason', result.reason)
    if (result.reason === 'store-unavailable') {
      captureException(new Error(`rate limiter has no store: ${policyName} failed closed`), {
        where: 'lib/rate-limit/middleware:applyRateLimit',
        policy: policyName,
      })
    }
    return res
  }
  return null
}

// Helper for handlers that want to surface RateLimit-* headers on the
// success path too (lets monitoring scrapers self-throttle).
export async function rateLimitWithHeaders(
  policyName: PolicyName,
  request: Request,
  identifierOverride?: string
): Promise<{ blocked: NextResponse | null; headers: HeadersInit }> {
  const policy = POLICIES[policyName]
  const ident = identifierOverride ?? clientIp(request)
  const result = await checkRateLimit({
    key: `${policy.keyPrefix}:${ident}`,
    limit: policy.limit,
    windowSec: policy.windowSec,
    failClosed: policy.failClosed,
  })
  const headers = buildHeaders(result.limit, result.remaining, result.resetMs)
  if (!result.ok) {
    return { blocked: build429(result.limit, result.remaining, result.resetMs), headers }
  }
  return { blocked: null, headers }
}
