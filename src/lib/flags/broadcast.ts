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
  // Close-out FO1. The Founding Organiser offer's reversal condition needs a
  // switch the owner can throw WITHOUT A DEPLOY, so it rides the same governed
  // switch system rather than becoming a second, private flag mechanism.
  'founding_open',
  // Close-out GA1. The audience asset's reversal condition: one switch removes
  // the marketing question from checkout AND stops every audience write.
  'audience_capture',
  // Close-out GA2. Whether a new matcher run may be produced at all. The runs
  // already stored are never touched by it.
  'marketing_matcher_enabled',
  // Close-out GA3. Whether a new click or attribution is WRITTEN. Every tracked
  // link keeps redirecting either way: a poster on a wall is not a feature.
  'marketing_attribution_capture_enabled',
  /*
   * NOT A BROADCAST STAGE, and it is here because this is the platform's ONE
   * flag resolver rather than because it belongs to that layer. The
   * constitution names public.feature_flags as where a feature switch lives;
   * the array's name is historical.
   *
   * It is close-out SEO5's reversal condition, written as a switch rather than
   * as a sentence: "One flag hides the availability indicator and the
   * accessibility section while leaving the calendar links in place."
   */
  'event_availability_and_access',
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
  // ON. The offer is live on /organisers and in every outreach message, so the
  // safe posture when the flags table cannot be read is the posture the public
  // page is already promising. Closing it is a deliberate act, never an outage.
  founding_open: true,
  // ON. The consent question is already on the checkout of a live platform and
  // the asset it builds is the point of the item, so the safe posture when the
  // flags table cannot be read is the posture the checkout is already taking.
  // Nothing about this default weakens consent: an audience row still cannot
  // exist without a granted consent record, and the database is what refuses it.
  audience_capture: true,
  // ON. The matcher decides who inside a consented audience should hear about
  // an event, and the alternative to having it is messaging everybody, which is
  // how a consented list becomes a dead list. Nothing about this default sends
  // anything: the matcher produces a ranked list and no transport can reach it.
  marketing_matcher_enabled: true,
  // ON. Attribution is the billing basis, and the failure mode of being off is
  // a sale that happened and cannot be accounted for afterwards. A click that
  // was never written cannot be recovered later, so the safe posture when the
  // flags table cannot be read is to keep recording.
  marketing_attribution_capture_enabled: true,
  // ON. Both surfaces are shipped, correct and wanted; the switch exists to
  // turn them OFF in one row change if either is ever found saying something
  // untrue, which is the reversal condition rather than a launch decision.
  event_availability_and_access: true,
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
  founding_open:
    'lawal 2026-09-13: ON. The Founding Organiser offer is open to new organisers. This is the FO1 reversal condition made operable: set it false and no new spot is granted and no new fee-free window is opened, at once and with no deploy. Organisations that already hold a window keep it and their referrals keep earning, because a promise already made is not withdrawn by closing the door behind it. The fifty cap closes the offer on its own; this closes it early.',
  audience_capture:
    'lawal 2026-09-13: ON. The one marketing question at checkout and every write to the audience asset. Set it false and the question disappears from the checkout and no audience row is created or enriched, at once and with no deploy. Every existing row and every consent record is left exactly as it is. It is deliberately powerless in one direction: a withdrawal still removes its audience row while the switch is off, because a feature flag may not keep somebody in a marketing audience they asked to leave.',
  marketing_matcher_enabled:
    'lawal 2026-09-13: ON. Whether a new matcher run may be produced. Set it false and no new run starts, at once and with no deploy, and the admin view becomes a read of the runs already stored: every run, score and breakdown row is left exactly as it is, because a stored run is the record of a decision already taken. It gates producing a list and nothing else; no send path exists yet for it to gate.',
  marketing_attribution_capture_enabled:
    'lawal 2026-09-13: ON. Whether a new click row, order signal or attribution record is WRITTEN. Set it false and nothing new is recorded, at once and with no deploy, while every short link keeps redirecting to its target and every click, attribution and reversal already stored stays intact and readable: a link printed on a poster is not a feature and must not stop working because a switch moved. Orders placed while it is off still get their one attribution record, with the decision none and the reason naming the switch, because an order with no record at all is the one thing this item exists to prevent.',
  event_availability_and_access:
    'lawal 2026-09-14: ON. Close-out SEO5 reversal condition. Hides the remaining-tickets line and the social-proof badges on the event page, and the accessibility section on the event and venue pages, in one admin row change with no deploy. The calendar links are deliberately NOT behind it: a date in a diary is never the thing that turns out to be untrue. Turn it OFF if any availability figure is ever found not to come from inventory, or if an accessibility claim is ever found that no organiser made.',
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
    if (raw === 'true') return true
    if (raw === 'false') return false
    /*
     * A VALUE THIS READER DOES NOT RECOGNISE MEANS "I DO NOT KNOW", NOT "OFF".
     *
     * This line used to be `return raw === 'true'`, which collapsed EVERY
     * unrecognised value to false and returned it as a decision, without ever
     * asking the database. So the cache could switch a feature OFF on its own,
     * silently, with nothing logged and the row in feature_flags still saying
     * ON.
     *
     * That is not theoretical. On 29 August 2026, driving the Launch Kit,
     * /api/organiser/events/[id]/poster answered 404 feature_off on three runs
     * out of four while both the database row AND the cached value read as
     * true. Deleting the cache key before each request made it 200 four times
     * out of four. The organiser's printable A4 poster, which is the artefact
     * this platform is sold on, was being switched off by its own cache.
     *
     * Note the asymmetry this removes. A database ERROR already falls back to
     * BROADCAST_FLAG_DEFAULTS, which for broadcast_share is ON. So the two
     * failure paths for the same question had OPPOSITE postures: an unreachable
     * database left the feature on, and an unrecognised cache value turned it
     * off. Returning null here routes an unknown cache value down the same path
     * as a cache miss, which is the only honest answer: the cache is an
     * optimisation and must never be able to decide a feature is off.
     */
    return null
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
