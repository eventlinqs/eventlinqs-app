import { createAdminClient } from '@/lib/supabase/admin'
import { getRedisClient } from '@/lib/redis/client'
import { captureException } from '@/lib/observability/sentry'

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

/**
 * THE DATED DECISION BEHIND EVERY FLAG. This is the registry
 * `scripts/guards/no-partial-builds.mjs` reads.
 *
 * WHY IT LIVES HERE AND NOWHERE ELSE. That guard requires a feature flag to
 * carry an owner and a dated decision, because an undated flag is
 * indistinguishable from something somebody forgot. Its first implementation
 * looked for a date in the file containing each CALL, which produced 41 hits
 * across about thirty files and would have been "satisfied" by pasting a date
 * comment into every one of them. That is the wrong shape: a flag is one
 * decision with one owner, not thirty, and thirty copies of a date rot
 * independently.
 *
 * So the decision is recorded ONCE, here, beside the flag it governs, and the
 * guard resolves a call site through this registry. Adding a flag without a
 * dated entry fails the build; the call sites need nothing.
 *
 * Each value must contain an owner and an ISO date.
 */
export const BROADCAST_FLAG_DECISIONS: Record<BroadcastFlag, string> = {
  broadcast_share:
    'lawal 2026-08-15: ON at launch. Share links, tracked reach and the card/poster routes are shipped and verified; this is the acquisition loop and it is load-bearing on day one.',
  broadcast_digest:
    'lawal 2026-08-15: OFF at launch, deliberately. The weekly city digest is built and tested but sending scheduled mail to a cold list before there is a catalogue worth opening trains people to ignore us. Turns on when density exists, by an admin row change, no deploy.',
  broadcast_follow:
    'lawal 2026-08-15: OFF at launch, deliberately. Following is built; it is switched on with the digest, because a follow with no notification behind it is a button that does nothing.',
  broadcast_artists:
    'lawal 2026-08-15: OFF at launch, deliberately. The artist layer is built and tested. It is a post-launch workstream and is not marketed until there are events worth attaching artists to.',
  gig_board:
    'lawal 2026-08-15: OFF at launch, deliberately. Built, tested, and held for the post-launch "performers, bring your numbers" moment recorded in the recruitment playbook. Marketing is explicitly barred from naming it before then.',
  artist_showcase:
    'lawal 2026-08-15: OFF at launch, deliberately. Same decision and same moment as gig_board; the two ship together or not at all, because a showcase with no gig board is a directory with nothing to do.',
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
  } catch (error) {
    captureException(error, { where: 'lib/flags/broadcast:167' })
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
