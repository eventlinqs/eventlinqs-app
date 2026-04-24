import { getRedisClient } from './client'

export type RateLimitResult = {
  ok: boolean
  remaining: number
  limit: number
  resetMs: number
}

type RateLimitOpts = {
  /** Bucket identifier — usually `${route}:${ip}` or `${route}:${userId}`. */
  key: string
  /** Max requests per window. */
  limit: number
  /** Window size in seconds. */
  windowSec: number
}

/**
 * Fixed-window rate limiter backed by Upstash Redis. INCR + EXPIRE on the
 * first hit gives ±1 request of slop at window edges — acceptable for
 * abuse prevention; not suitable as a hard billing meter.
 *
 * Fails open: if Redis is unreachable or misconfigured, requests are
 * allowed. We prefer availability over strictness on public APIs.
 */
export async function checkRateLimit(opts: RateLimitOpts): Promise<RateLimitResult> {
  const redis = getRedisClient()
  if (!redis) {
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
