import { getRedisClient } from './client'

export type RateLimitResult = {
  ok: boolean
  remaining: number
  limit: number
  resetMs: number
  /**
   * WHY A REFUSAL WAS ISSUED, so a caller can tell the user something TRUE.
   *
   * Found by driving the stranger signup journey on 27 August 2026. With no
   * Upstash configured, a failClosed policy refused the FIRST attempt a brand
   * new person ever made, and returned `resetMs = windowSec * 1000`. The signup
   * form read that as a retry-after and told them to wait about ten minutes.
   *
   * They had made one attempt, and waiting would not have helped, because the
   * cause was a missing deploy variable rather than their own behaviour. A
   * person who does that twice concludes the platform is broken and leaves, and
   * nothing anywhere records that it happened.
   *
   * 'over-limit'        the bucket is genuinely full. Waiting works.
   * 'store-unavailable' the limiter has no store and the policy fails closed.
   *                     Waiting does NOT work. This is an incident.
   */
  reason?: 'over-limit' | 'store-unavailable'
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
   * production only). Used for the abuse-sensitive auth and checkout paths so a
   * deploy that forgot to set UPSTASH_REDIS_REST_URL/_TOKEN cannot silently run
   * them unprotected.
   *
   * Note this flag no longer decides what happens on a store ERROR. It used to,
   * and the error path ignored it and allowed everything, which made the flag a
   * comforting label rather than a control. Errors now degrade to the
   * per-instance limiter for every policy, flagged or not. See the degradation
   * contract on checkRateLimit.
   */
  failClosed?: boolean
}

/**
 * In-process fallback buckets, used ONLY when the shared store errors.
 *
 * WHY THIS EXISTS. The error path used to `return { ok: true }` unconditionally,
 * which meant a store error turned every limit on the platform off, including
 * every policy explicitly marked `failClosed`: login, signup, password reset,
 * magic link, checkout and the AI spend guard. `failClosed` was only honoured
 * for MISSING CONFIGURATION, never for a failure, so the one state an attacker
 * would actually try to induce was the one state that removed the control.
 *
 * That is not a theoretical trigger. Upstash returns errors when a plan's
 * request quota is exhausted, and the cheapest way to exhaust it is to hammer
 * the very endpoints these policies protect. So the sequence was: make the
 * limiter throw, then brute force with no limiter at all.
 *
 * A per-instance bucket is NOT a global limit; a serverless fleet has many
 * instances, so a determined attacker spread across them gets limit x instances.
 * It is still the difference between a bounded and an unbounded attack, and it
 * holds availability, which is why it beats both "allow everything" and "block
 * everything" as the degraded mode.
 */
type MemoryBucket = { count: number; resetAtMs: number }
const memoryBuckets = new Map<string, MemoryBucket>()
/** Cap so a hostile key space cannot grow this map without bound. */
const MEMORY_BUCKET_CAP = 10_000

function memoryRateLimit(key: string, limit: number, windowSec: number): RateLimitResult {
  const now = Date.now()

  // Opportunistic sweep. Cheap because it only runs when the map is at the cap,
  // and it keeps the fallback from becoming its own memory-exhaustion vector.
  if (memoryBuckets.size >= MEMORY_BUCKET_CAP) {
    for (const [k, b] of memoryBuckets) if (b.resetAtMs <= now) memoryBuckets.delete(k)
    // Still full after sweeping: every bucket is live, so refuse rather than
    // grow. Refusing is the correct direction for a limiter.
    if (memoryBuckets.size >= MEMORY_BUCKET_CAP) {
      return { ok: false, remaining: 0, limit, resetMs: windowSec * 1000 }
    }
  }

  const existing = memoryBuckets.get(key)
  const bucket =
    existing && existing.resetAtMs > now
      ? existing
      : { count: 0, resetAtMs: now + windowSec * 1000 }
  bucket.count += 1
  memoryBuckets.set(key, bucket)

  return {
    ok: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    limit,
    resetMs: Math.max(0, bucket.resetAtMs - now),
  }
}

/** Test seam. The fallback is per-process by design, so tests must be able to
 *  reset it without reaching into module internals. */
export function __resetMemoryRateLimitBuckets(): void {
  memoryBuckets.clear()
}

/**
 * Fixed-window rate limiter backed by Upstash Redis. INCR + EXPIRE on the
 * first hit gives ±1 request of slop at window edges - acceptable for
 * abuse prevention; not suitable as a hard billing meter.
 *
 * DEGRADATION CONTRACT. No path returns an unlimited allowance:
 *
 *   store healthy                -> the shared Redis window (correct, global)
 *   store errors                 -> per-instance in-memory window (bounded)
 *   config missing, production,
 *     failClosed policy          -> block (a deploy misconfiguration, not a blip)
 *   config missing, non-prod     -> allow (local dev and tests have no Upstash)
 */
export async function checkRateLimit(opts: RateLimitOpts): Promise<RateLimitResult> {
  const redis = getRedisClient()
  if (!redis) {
    // Config missing. Fail closed for the abuse-sensitive paths in production, so
    // a deploy that forgot UPSTASH_* cannot run auth/checkout unprotected. This
    // is a misconfiguration rather than a transient fault, so it is not something
    // to degrade around: it should be loud and it should block.
    if (opts.failClosed && process.env.NODE_ENV === 'production') {
      // resetMs stays 0: there is no window to wait out. Reporting a full window
      // here is what produced "wait about 10 minutes" for a first attempt.
      return {
        ok: false,
        remaining: 0,
        limit: opts.limit,
        resetMs: 0,
        reason: 'store-unavailable',
      }
    }
    // Local dev and unit tests have no Upstash and are not a threat surface.
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
      reason: count <= opts.limit ? undefined : 'over-limit',
    }
  } catch (err) {
    // NOT fail-open. Degrade to the per-instance window rather than removing the
    // control. Logged with a stable tag so the degradation is observable instead
    // of silent, because a limiter that quietly stopped limiting is how this
    // stayed broken.
    console.error('[rate-limit] redis error, degrading to in-process limiter:', err)
    return memoryRateLimit(`${opts.key}:${windowStart}`, opts.limit, opts.windowSec)
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
