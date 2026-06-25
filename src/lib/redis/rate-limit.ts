import { getRedisClient } from './client'

export type RateLimitResult = {
  ok: boolean
  remaining: number
  limit: number
  resetMs: number
}

type RateLimitOpts = {
  /** Bucket identifier - usually `${route}:${ip}` or `${route}:${userId}`. */
  key: string
  /** Max requests per window. */
  limit: number
  /** Window size in seconds. */
  windowSec: number
  /**
   * When true, a MISSING Upstash configuration is treated as a block (in
   * production only), instead of the default fail-open. Used for the abuse-
   * sensitive auth and checkout paths so a deploy that forgot to set
   * UPSTASH_REDIS_REST_URL/_TOKEN cannot silently run them unprotected. Transient
   * Redis errors still fail open, so a Redis blip never takes down checkout.
   */
  failClosed?: boolean
}

/**
 * Fixed-window rate limiter backed by Upstash Redis. INCR + EXPIRE on the
 * first hit gives ±1 request of slop at window edges - acceptable for
 * abuse prevention; not suitable as a hard billing meter.
 *
 * Fails open: if Redis is unreachable or misconfigured, requests are
 * allowed. We prefer availability over strictness on public APIs.
 */
export async function checkRateLimit(opts: RateLimitOpts): Promise<RateLimitResult> {
  const redis = getRedisClient()
  if (!redis) {
    // Config missing. Fail closed only for the abuse-sensitive paths and only in
    // production, so a misconfigured deploy cannot run auth/checkout unprotected,
    // while local dev and tests (no Upstash) still pass.
    if (opts.failClosed && process.env.NODE_ENV === 'production') {
      return { ok: false, remaining: 0, limit: opts.limit, resetMs: opts.windowSec * 1000 }
    }
    return { ok: true, remaining: opts.limit, limit: opts.limit, resetMs: 0 }
  }

  const now = Date.now()
  const windowStart = Math.floor(now / (opts.windowSec * 1000)) * opts.windowSec
  const bucket = `rl:${opts.key}:${windowStart}`

  try {
    const count = await redis.incr(bucket)
    if (count === 1) {
      await redis.expire(bucket, opts.windowSec)
    }
    const remaining = Math.max(0, opts.limit - count)
    const resetMs = (windowStart + opts.windowSec) * 1000 - now
    return {
      ok: count <= opts.limit,
      remaining,
      limit: opts.limit,
      resetMs,
    }
  } catch (err) {
    console.error('[rate-limit] redis error, failing open:', err)
    return { ok: true, remaining: opts.limit, limit: opts.limit, resetMs: 0 }
  }
}

/**
 * Extracts a client identifier from a request. Prefers x-forwarded-for
 * (Vercel sets this), falls back to x-real-ip, then a static token so
 * the limiter still does *something* useful in local dev.
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  return 'local'
}
