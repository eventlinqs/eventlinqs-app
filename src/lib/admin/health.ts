import { createAdminClient } from '@/lib/supabase/admin'
import { getStripeClient } from '@/lib/payments/payout'
import { getRedisClient } from '@/lib/redis/client'

/**
 * Admin system-health probes.
 *
 * Each probe issues ONE real, lightweight round-trip to the dependency and
 * times it. These back the "System health" tiles on the operations dashboard,
 * so the dashboard reflects live infrastructure state on every load (the page
 * is force-dynamic), never a static placeholder.
 *
 * Probes are read-only and side-effect free:
 *   - Supabase: a HEAD count against pricing_rules (tiny, always present).
 *   - Stripe:   balance.retrieve() on the platform account (no mutation).
 *   - Redis:    a single PING (mirrors /api/health/redis).
 *
 * A reachable-but-slow dependency reports 'warn'; an unreachable one reports
 * 'down'. Thresholds are deliberately generous so a normal cold function does
 * not flap to warn.
 */

export type HealthStatus = 'ok' | 'warn' | 'down'

export interface HealthResult {
  ok: boolean
  status: HealthStatus
  latencyMs: number | null
  detail: string
}

const WARN_MS = { supabase: 600, stripe: 1500, redis: 200 } as const

function fail(started: number, detail: string): HealthResult {
  return { ok: false, status: 'down', latencyMs: Date.now() - started, detail }
}

function gradeLatency(latencyMs: number, threshold: number, detail: string): HealthResult {
  return {
    ok: true,
    status: latencyMs > threshold ? 'warn' : 'ok',
    latencyMs,
    detail,
  }
}

export async function checkSupabaseHealth(): Promise<HealthResult> {
  const started = Date.now()
  try {
    const client = createAdminClient()
    const { error } = await client
      .from('pricing_rules')
      .select('id', { head: true, count: 'exact' })
      .limit(1)
    if (error) return fail(started, error.message)
    return gradeLatency(Date.now() - started, WARN_MS.supabase, 'select round-trip')
  } catch (err) {
    return fail(started, err instanceof Error ? err.message : 'unknown')
  }
}

export async function checkStripeHealth(): Promise<HealthResult> {
  const started = Date.now()
  try {
    const stripe = getStripeClient()
    await stripe.balance.retrieve()
    return gradeLatency(Date.now() - started, WARN_MS.stripe, 'balance.retrieve')
  } catch (err) {
    return fail(started, err instanceof Error ? err.message : 'unknown')
  }
}

export async function checkRedisHealth(): Promise<HealthResult> {
  const started = Date.now()
  const redis = getRedisClient()
  if (!redis) return { ok: false, status: 'down', latencyMs: null, detail: 'redis_not_configured' }
  try {
    const result = await redis.ping()
    if (result !== 'PONG') return fail(started, `unexpected reply: ${String(result)}`)
    return gradeLatency(Date.now() - started, WARN_MS.redis, 'PING')
  } catch (err) {
    return fail(started, err instanceof Error ? err.message : 'unknown')
  }
}
