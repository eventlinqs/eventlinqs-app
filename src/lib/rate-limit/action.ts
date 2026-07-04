import 'server-only'
import { headers } from 'next/headers'
import { checkRateLimit } from '@/lib/redis/rate-limit'
import { POLICIES, type PolicyName } from './policies'

export type ActionRateLimit = { ok: boolean; retryAfterSeconds: number }

/**
 * Rate-limit a Server Action (which has no Request object) using the same named
 * policy table as the route middleware. The client identifier is the forwarded
 * IP read from the request headers. Returns { ok } so the action can return its
 * own error shape; it never throws.
 *
 * Used to throttle the abuse-sensitive funnel entry points (reservation,
 * checkout, squad payment-intent) and the login pre-gate. Those policies are
 * failClosed, so a missing Upstash config blocks them in production.
 */
export async function actionRateLimit(
  policyName: PolicyName,
  identifierOverride?: string,
): Promise<ActionRateLimit> {
  const policy = POLICIES[policyName]
  let ip = identifierOverride
  if (!ip) {
    try {
      const hdrs = await headers()
      const xff = hdrs.get('x-forwarded-for')
      ip = xff ? xff.split(',')[0]!.trim() : (hdrs.get('x-real-ip')?.trim() ?? 'local')
    } catch {
      // No request store (e.g. unit tests, static generation). Fall back to a
      // static identifier; the real per-IP bucketing applies in a live request.
      ip = 'local'
    }
  }
  const result = await checkRateLimit({
    key: `${policy.keyPrefix}:${ip}`,
    limit: policy.limit,
    windowSec: policy.windowSec,
    failClosed: policy.failClosed,
  })
  return { ok: result.ok, retryAfterSeconds: Math.max(1, Math.ceil(result.resetMs / 1000)) }
}
