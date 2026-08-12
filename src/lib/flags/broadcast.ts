import { createAdminClient } from '@/lib/supabase/admin'
import { getRedisClient } from '@/lib/redis/client'

/**
 * Broadcast Layer feature flags - the ONE resolver for every stage switch.
 * Reads public.feature_flags, the single source of truth, so a stage turns
 * on with a config change (an admin row update) and never a deploy. Follows
 * the pricing_rules one-source doctrine: every surface that gates on a stage
 * calls this resolver; nothing reads the table directly and nothing
 * hardcodes a flag state.
 *
 * Fallback posture: when the database is unreachable the resolver returns
 * the SEEDED launch defaults below (share ON, everything else OFF), the
 * same last-resort pattern as public-fee. A transient outage can therefore
 * never switch a stage on early; at worst it briefly reverts to launch
 * state.
 *
 * Caching: short TTL via Upstash Redis when configured; falls back to
 * direct DB reads when Redis is unavailable. The admin flags surface MUST
 * call invalidateFeatureFlag() after every write so a switch lands within
 * seconds, not the TTL.
 */

export const FEATURE_FLAG_CACHE_TTL_SECONDS = 30

export const BROADCAST_FLAGS = [
  'broadcast_share',
  'broadcast_digest',
  'broadcast_follow',
  'broadcast_artists',
  // Performer marketplace stages ride the same governed switch system
  // (admin surface, audit log, cache) as the broadcast stages.
  'gig_board',
  'artist_showcase',
] as const

export type BroadcastFlag = (typeof BROADCAST_FLAGS)[number]

export function isBroadcastFlag(value: string): value is BroadcastFlag {
  return (BROADCAST_FLAGS as readonly string[]).includes(value)
}

/**
 * The seeded launch defaults (SPEC section 6). Used ONLY when the flags
 * table cannot be read; the DB row is always the source of truth.
 */
export const BROADCAST_FLAG_DEFAULTS: Record<BroadcastFlag, boolean> = {
  broadcast_share: true,
  broadcast_digest: false,
  broadcast_follow: false,
  broadcast_artists: false,
  gig_board: false,
  artist_showcase: false,
}

// Minimal structural type so both the service-role admin client and the
// anon client (feature_flags has a public SELECT policy) satisfy it.
export type FlagReadClient = Pick<ReturnType<typeof createAdminClient>, 'from'>

interface FlagRow {
  flag: string
  enabled: boolean
}

/**
 * The environment namespace is applied by the Redis client itself
 * (`src/lib/redis/client.ts`), for EVERY key, not just this one.
 *
 * The defect that produced it was found here: `ff:v1:<flag>` carried no
 * environment, and a local server reading TEST left
 * `ff:v1:broadcast_artists = "true"` in the Redis production reads, while the
 * production row says `false`. Namespacing this one key would have fixed this
 * one instance and left five more key families with the identical shape, two of
 * them far worse than a feature flag (the resolved FEE and the AI budget
 * counter). So it is done once, at the client, where a new call site inherits
 * it by default.
 *
 * v2 rather than v1 so nothing inherits a value written under the old shared
 * key.
 */
function cacheKey(flag: BroadcastFlag): string {
  return `ff:v2:${flag}`
}

async function readCache(key: string): Promise<boolean | null> {
  const redis = getRedisClient()
  if (!redis) return null
  try {
    const raw = await redis.get<boolean | string>(key)
    if (raw === null || raw === undefined) return null
    if (typeof raw === 'boolean') return raw
    return raw === 'true'
  } catch {
    return null
  }
}

async function writeCache(key: string, enabled: boolean): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return
  try {
    await redis.set(key, String(enabled), { ex: FEATURE_FLAG_CACHE_TTL_SECONDS })
  } catch {
    // Cache write is best-effort. Read path always falls back to DB.
  }
}

/**
 * Resolves a broadcast stage flag. Never throws: an unreadable table
 * resolves to the seeded launch default for that flag.
 */
export async function isFeatureEnabled(
  flag: BroadcastFlag,
  opts?: { client?: FlagReadClient }
): Promise<boolean> {
  const key = cacheKey(flag)
  const cached = await readCache(key)
  if (cached !== null) return cached

  try {
    const client: FlagReadClient = opts?.client ?? createAdminClient()
    const { data, error } = await client
      .from('feature_flags')
      .select('flag, enabled')
      .eq('flag', flag)
      .maybeSingle()
    if (error) throw new Error(error.message)
    const enabled = (data as FlagRow | null)?.enabled ?? BROADCAST_FLAG_DEFAULTS[flag]
    await writeCache(key, enabled)
    return enabled
  } catch {
    return BROADCAST_FLAG_DEFAULTS[flag]
  }
}

/**
 * Invalidates the cached state for one flag. The admin flags surface MUST
 * call this after every write so the switch propagates on the next read.
 */
export async function invalidateFeatureFlag(flag: BroadcastFlag): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return
  try {
    await redis.del(cacheKey(flag))
  } catch {
    // No-op. Stale cache expires within the TTL.
  }
}
