/**
 * THE LIVE INDEXING THRESHOLD, WHICH THE OWNER CAN MOVE WITHOUT A DEPLOY.
 *
 * SEO3 step 2: "The threshold is a single configuration value the owner can
 * change without a deploy."
 *
 * The rule was already conditional and already a single named constant before
 * this item (`DISCOVERY_INDEXING_THRESHOLD`, close-out C19.3, 8 September 2026).
 * What it was not is MOVEABLE: a TypeScript constant needs a build, a push and a
 * deployment before the number changes, and SEO3's reversal condition is a
 * same-day action taken when Search Console says so.
 *
 * So the number is read from `public.seo_settings` (the migration at
 * docs/migrations-pending/20260914000001_seo_settings.sql, which is WAITING ON THE
 * FOUNDER and is explained in that folder's README), and this module is the ONE
 * resolver. The
 * page and the sitemap both come through here, exactly as they both come through
 * `isDiscoveryIndexable`, so the robots directive on a page and that page's
 * presence in the sitemap can never be decided by two different numbers.
 *
 * ============================================================================
 * IT FALLS BACK RATHER THAN THROWING, AND THAT IS THE WHOLE DESIGN
 * ============================================================================
 *
 * Applying a migration to production is the founder's step, reserved by the
 * constitution. Merging code is not, and the two happen at different times. A
 * resolver that REQUIRED the table would mean this commit could not be merged
 * until he had applied it, and `scripts/guards/schema-ahead-of-code.mjs` exists
 * precisely because that ordering has bitten before.
 *
 * This resolver requires nothing. Before the migration is applied it returns the
 * code constant; after it is applied it returns the row; if the database is
 * unreachable mid-request it returns the code constant again. The platform
 * therefore behaves identically before and after the migration lands, and the
 * migration's only effect is to hand the owner the dial.
 *
 * That is also why the query is UNTYPED (`from('seo_settings' as never)`). The
 * generated `src/types/database.ts` describes the schema the types-drift guard
 * compares against PRODUCTION, and naming a not-yet-applied table there would
 * turn that guard red on main until the founder acted. The cast is the honest
 * encoding of "this table may not exist yet", not a shortcut around types.
 *
 * WHAT A FAILED READ MUST NEVER DO. It must never look like zero. Zero would
 * make every discovery page indexable at once, which is the opposite of the safe
 * direction, so an unreadable setting degrades to the CONSTANT and says so in
 * the log once rather than on every render.
 */
import { createPublicClient } from '@/lib/supabase/public-client'
import { DISCOVERY_INDEXING_THRESHOLD, discoveryIndexing, organiserIndexing } from './indexing-policy'

/** The key in public.seo_settings. Written here and in the migration only. */
export const DISCOVERY_THRESHOLD_KEY = 'discovery_indexing_threshold'

/**
 * How long a resolved value is reused within one server process.
 *
 * The sitemap asks for this number once and then counts about 490 pages against
 * it; a page render asks once. Sixty seconds means an owner's change is live on
 * the next minute's renders, which is "without a deploy" by any reading, and it
 * keeps one sitemap request from making 490 identical round trips.
 */
const CACHE_MS = 60_000

let cached: { value: number; at: number } | null = null
let warned = false

/**
 * The value the owner has set, or the code constant.
 *
 * Bounds are applied HERE as well as in the migration's CHECK constraint,
 * because this resolver must survive a row written by something that bypassed
 * the constraint (the service role can, and a future admin screen will use it).
 * A negative threshold would index everything; a NaN would compare false against
 * every count and index nothing. Both degrade to the constant.
 */
export async function resolveDiscoveryThreshold(): Promise<number> {
  const now = Date.now()
  if (cached && now - cached.at < CACHE_MS) return cached.value

  let value = DISCOVERY_INDEXING_THRESHOLD
  try {
    const supabase = createPublicClient()
    const { data, error } = await supabase
      .from('seo_settings' as never)
      .select('value_int')
      .eq('key', DISCOVERY_THRESHOLD_KEY)
      .maybeSingle()

    if (error) throw new Error(error.message)

    const raw = (data as { value_int?: unknown } | null)?.value_int
    if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 1000) {
      value = raw
    }
  } catch (error) {
    // ONCE PER PROCESS, not once per render. A page that logs on every request
    // is a page whose logs nobody reads, and the thing worth knowing here is
    // that the setting is unavailable, not how many times it was asked for.
    if (!warned) {
      warned = true
      console.warn(
        `[discovery-threshold] seo_settings unreadable, using the code constant ` +
          `${DISCOVERY_INDEXING_THRESHOLD}: ${(error as Error).message}`,
      )
    }
  }

  cached = { value, at: now }
  return value
}

/**
 * Empties the cache. For tests, and for a future admin write that wants its own
 * change visible on the next render rather than within the minute.
 */
export function resetDiscoveryThresholdCache() {
  cached = null
  warned = false
}

/**
 * The metadata block for a templated discovery page, at the LIVE threshold.
 *
 * Every conditional page calls this rather than `discoveryIndexing` directly, so
 * no page can be left comparing against the compiled constant while the sitemap
 * compares against the owner's number. It lives here rather than in
 * indexing-policy.ts only to keep the import one-way: the policy module is pure
 * and must not reach for a database client.
 */
export async function discoveryIndexingFor(eventCount: number, canonicalPath: string) {
  return discoveryIndexing(eventCount, canonicalPath, await resolveDiscoveryThreshold())
}

/**
 * The metadata block for an organiser profile, at the LIVE threshold.
 *
 * The same one-resolver rule as `discoveryIndexingFor` above and for the same
 * reason: the profile page and the sitemap's organiser block must decide with
 * one number, or a profile says noindex while the sitemap advertises it, which
 * is the contradiction Search Console reports back as an exclusion.
 */
export async function organiserIndexingFor(
  eventCount: number,
  hasBiography: boolean,
  canonicalPath: string,
) {
  return organiserIndexing(eventCount, hasBiography, canonicalPath, await resolveDiscoveryThreshold())
}
