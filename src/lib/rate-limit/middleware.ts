import { NextResponse } from 'next/server'
import { checkRateLimit, clientIp } from '@/lib/redis/rate-limit'
import { POLICIES, type PolicyName } from './policies'

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
  })
  if (!result.ok) {
    return build429(result.limit, result.remaining, result.resetMs)
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
  })
  const headers = buildHeaders(result.limit, result.remaining, result.resetMs)
  if (!result.ok) {
    return { blocked: build429(result.limit, result.remaining, result.resetMs), headers }
  }
  return { blocked: null, headers }
}
