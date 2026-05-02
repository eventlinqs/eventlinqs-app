import { NextResponse } from 'next/server'
import { getRedisClient } from '@/lib/redis/client'
import { rateLimitWithHeaders } from '@/lib/rate-limit/middleware'

// Health endpoint for Upstash Redis. Returns latency for a single PING from
// the Vercel function region to the configured Redis endpoint. Used to
// validate the Sydney migration (target: < 20ms post-migration) and as an
// ongoing observability surface for incident response.
//
// Never logs token values. The body returns no credentials. Region is
// derived from the configured URL hostname when possible (best-effort) and
// falls back to "unknown".
//
// Cache: never. This must reflect live Redis state on every call.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function deriveRegion(url: string | undefined): string {
  if (!url) return 'unconfigured'
  // Upstash REST URLs include the region as a subdomain segment, e.g.
  //   https://apn1-cool-name-12345.upstash.io
  // The first 4 chars before the dash are the region code.
  try {
    const host = new URL(url).hostname
    const first = host.split('.')[0]
    const region = first?.split('-')[0] ?? 'unknown'
    return region.length >= 3 && region.length <= 5 ? region : 'unknown'
  } catch {
    return 'unknown'
  }
}

export async function GET(request: Request) {
  const { blocked, headers } = await rateLimitWithHeaders('health-redis', request)
  if (blocked) return blocked

  const url = process.env.UPSTASH_REDIS_REST_URL
  const region = deriveRegion(url)
  const ts = new Date().toISOString()

  const redis = getRedisClient()
  if (!redis) {
    return NextResponse.json(
      {
        ok: false,
        latencyMs: null,
        region,
        cmd: 'ping',
        ts,
        error: 'redis_not_configured',
      },
      { status: 503, headers },
    )
  }

  const started = Date.now()
  try {
    const result = await redis.ping()
    const latencyMs = Date.now() - started
    const ok = result === 'PONG'
    return NextResponse.json(
      {
        ok,
        latencyMs,
        region,
        cmd: 'ping',
        result,
        ts,
      },
      { status: ok ? 200 : 503, headers },
    )
  } catch (err) {
    const latencyMs = Date.now() - started
    return NextResponse.json(
      {
        ok: false,
        latencyMs,
        region,
        cmd: 'ping',
        ts,
        error: err instanceof Error ? err.message : 'unknown',
      },
      { status: 503, headers },
    )
  }
}
