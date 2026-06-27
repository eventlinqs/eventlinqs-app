import { createAdminClient } from '@/lib/supabase/admin'
import { getRedisClient } from '@/lib/redis/client'

/**
 * Pricing rules service - the ONE resolver for every fee the platform charges,
 * pays out, OR displays. Reads the long-format public.pricing_rules table, the
 * single source of truth for fee values. charge (PaymentCalculator), payout
 * (application-fee), and display (lib/pricing/live-fee) all call this resolver,
 * so a fee can never drift between what is shown and what is charged.
 *
 * Scope precedence (most specific first - founder fee law, three scopes):
 *   0. (rule_type, event_id = E)                                 per-EVENT override   [highest]
 *   1. (country_code, currency, rule_type, organisation_id = X)  per-ORGANISER override
 *   2. (country_code, currency, rule_type, org IS NULL)          region default
 *   3. ('GLOBAL',     currency, rule_type, org IS NULL)          global currency default
 *   4. ('GLOBAL', any currency, rule_type, org IS NULL)          global wildcard
 *   5. PricingRuleNotFoundError
 *
 * The per-event override is absolute for that event: it is matched on
 * (rule_type, event_id) alone and ignores country/currency, because an event_id
 * is globally unique and an event has exactly one organiser/currency. The org,
 * region, and global levels are all guarded with `event_id IS NULL` so an
 * event-scoped row can never leak into a broader lookup (no collisions).
 *
 * Effectiveness window:
 *   effective_from <= NOW() AND (effective_until IS NULL OR effective_until > NOW())
 * Tie-breaking (multiple rows match a level): highest version wins (append-only
 * versioning, so past orders keep their historical fee).
 *
 * Pluggable client: getPricingRule accepts an optional Supabase client. The
 * charge/payout paths use the default service-role admin client; the public
 * display path (live-fee) passes the anon client so a marketing page resolves
 * the SAME rows (pricing_rules has a public SELECT policy) without a service
 * key. Same resolver, same precedence, one source.
 *
 * Caching: 60-second TTL via Upstash Redis when configured; falls back to direct
 * DB reads when Redis is unavailable. Admin panel writes MUST call
 * invalidatePricingRule() for the change to land within 60 seconds.
 */

export const PRICING_RULES_CACHE_TTL_SECONDS = 60

export type PricingRuleType =
  | 'platform_fee_percentage'
  | 'platform_fee_fixed'
  | 'instant_payout_fee'
  | 'resale_fee'
  | 'featured_listing'
  | 'subscription_price'
  | 'processing_fee_percentage'
  | 'processing_fee_fixed_cents'
  | 'processing_fee_pass_through'
  | 'reserve_percentage'
  | 'payout_schedule_days'
  | 'application_fee_composition_mode'
  | 'venue_revenue_share_percentage'

export type PricingRuleValueType = 'percentage' | 'fixed' | 'integer'

// [FIX-CHECKOUT 2026-05-28] Schema-vs-code drift recovered.
//
// Migration 20260520000001_schema_hygiene (P1-4b in the audit) dropped
// public.pricing_rules.value and split it into three typed columns:
//   value_percentage NUMERIC(7,4)  - when value_type='percentage'
//   value_cents       BIGINT       - when value_type='fixed'
//   value_integer     INTEGER      - when value_type='integer'
// The migration backfilled but this consuming module was not updated,
// so every pricing_rules lookup since the migration applied has thrown
// `column pricing_rules.value does not exist`. That throw crashed the
// /checkout/[reservation_id] server-component render and blocked every
// purchase attempt.
//
// PostgREST serialises NUMERIC and BIGINT as strings (JSON-safe for the
// full numeric range); INTEGER stays as a JS number. The Row type below
// reflects what comes off the wire. resolveRuleValue() narrows to a
// single number based on value_type so every downstream caller can keep
// reading rule.value as a plain number without change.
export interface PricingRuleRow {
  id: string
  rule_type: PricingRuleType
  country_code: string
  currency: string
  event_type: string
  organiser_tier: string
  organisation_id: string | null
  event_id: string | null
  value_percentage: string | null
  value_cents: string | null
  value_integer: number | null
  value_type: PricingRuleValueType
  version: number
  effective_from: string
  effective_until: string | null
}

// Minimal structural type for the Supabase client this module reads through.
// Both createAdminClient() (service role) and createPublicClient() (anon)
// satisfy it, so the SAME resolver serves charge, payout, and public display.
export type PricingReadClient = Pick<ReturnType<typeof createAdminClient>, 'from'>

const RULE_SELECT_COLUMNS =
  'id, rule_type, country_code, currency, event_type, organiser_tier, organisation_id, event_id, value_percentage, value_cents, value_integer, value_type, version, effective_from, effective_until'

// Single resolver from the typed-union storage to the legacy `number`
// the rest of the payment pipeline consumes. Throws a precise error if
// a row's value_type does not match the populated column (data-integrity
// issue, should never happen because the migration's CHECK constraint
// enforces the split - but we throw rather than silently coerce so a
// future regression surfaces immediately).
function resolveRuleValue(row: PricingRuleRow): number {
  switch (row.value_type) {
    case 'percentage':
      if (row.value_percentage === null) {
        throw new Error(
          `pricing_rules row ${row.id} (${row.rule_type}): value_type='percentage' but value_percentage is NULL`
        )
      }
      return Number(row.value_percentage)
    case 'fixed':
      if (row.value_cents === null) {
        throw new Error(
          `pricing_rules row ${row.id} (${row.rule_type}): value_type='fixed' but value_cents is NULL`
        )
      }
      return Number(row.value_cents)
    case 'integer':
      if (row.value_integer === null) {
        throw new Error(
          `pricing_rules row ${row.id} (${row.rule_type}): value_type='integer' but value_integer is NULL`
        )
      }
      return Number(row.value_integer)
    default: {
      // Exhaustiveness check: TS will fail this line if a new value_type
      // is added to the union without a case branch here.
      const _exhaustive: never = row.value_type
      throw new Error(
        `pricing_rules row ${row.id} (${row.rule_type}): unknown value_type ${String(_exhaustive)}`
      )
    }
  }
}

export interface PricingRuleQuery {
  ruleType: PricingRuleType
  countryCode: string
  currency: string
  organisationId?: string | null
  /** Per-event override scope (highest precedence). */
  eventId?: string | null
}

export class PricingRuleNotFoundError extends Error {
  constructor(query: PricingRuleQuery) {
    super(
      `No effective pricing rule found for rule_type=${query.ruleType} country=${query.countryCode} currency=${query.currency} organisation_id=${query.organisationId ?? 'null'} event_id=${query.eventId ?? 'null'}`
    )
    this.name = 'PricingRuleNotFoundError'
  }
}

interface CachedEntry {
  value: number
  valueType: PricingRuleValueType
  ruleId: string
  source: 'event_override' | 'org_override' | 'region_default' | 'global_currency' | 'global_wildcard'
}

function cacheKey(query: PricingRuleQuery): string {
  // Event resolution is matched on (rule_type, event_id) alone and ignores
  // country/currency, so the event key omits them. The key holds the resolved
  // value for that event (override OR region fall-through); a per-event admin
  // edit invalidates exactly this key with no need to know the event currency.
  if (query.eventId) {
    return `pr:v2:${query.ruleType}:event:${query.eventId}`
  }
  const orgPart = query.organisationId ?? 'null'
  return `pr:v2:${query.ruleType}:${query.countryCode}:${query.currency}:${orgPart}`
}

async function readCache(key: string): Promise<CachedEntry | null> {
  const redis = getRedisClient()
  if (!redis) return null
  try {
    const raw = await redis.get<CachedEntry | string>(key)
    if (!raw) return null
    if (typeof raw === 'string') {
      return JSON.parse(raw) as CachedEntry
    }
    return raw
  } catch {
    return null
  }
}

async function writeCache(key: string, entry: CachedEntry): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return
  try {
    await redis.set(key, JSON.stringify(entry), { ex: PRICING_RULES_CACHE_TTL_SECONDS })
  } catch {
    // Cache write is best-effort. Read path always falls back to DB.
  }
}

/**
 * Resolves a single pricing rule by walking the precedence ladder.
 * Throws PricingRuleNotFoundError if no row matches at any level.
 *
 * @param opts.client Optional Supabase client. Defaults to the service-role
 *   admin client (charge/payout paths). The public display path passes the
 *   anon client so it resolves the identical rows without a service key.
 */
export async function getPricingRule(
  query: PricingRuleQuery,
  opts?: { client?: PricingReadClient }
): Promise<{
  value: number
  valueType: PricingRuleValueType
  ruleId: string
  source: CachedEntry['source']
}> {
  const key = cacheKey(query)
  const cached = await readCache(key)
  if (cached) return cached

  const client: PricingReadClient = opts?.client ?? createAdminClient()
  const orgId = query.organisationId ?? null
  const eventId = query.eventId ?? null

  // Level 0: per-event override (absolute for that event, ignores region).
  if (eventId) {
    const eventMatch = await selectActiveEventRule(client, {
      rule_type: query.ruleType,
      event_id: eventId,
    })
    if (eventMatch) {
      const entry: CachedEntry = {
        value: resolveRuleValue(eventMatch),
        valueType: eventMatch.value_type,
        ruleId: eventMatch.id,
        source: 'event_override',
      }
      await writeCache(key, entry)
      return entry
    }
  }

  // Level 1: per-org override (event_id IS NULL).
  if (orgId) {
    const orgMatch = await selectActiveRule(client, {
      rule_type: query.ruleType,
      country_code: query.countryCode,
      currency: query.currency,
      organisation_id: orgId,
    })
    if (orgMatch) {
      const entry: CachedEntry = {
        value: resolveRuleValue(orgMatch),
        valueType: orgMatch.value_type,
        ruleId: orgMatch.id,
        source: 'org_override',
      }
      await writeCache(key, entry)
      return entry
    }
  }

  // Level 2: region default (org IS NULL, event_id IS NULL).
  const regionMatch = await selectActiveRule(client, {
    rule_type: query.ruleType,
    country_code: query.countryCode,
    currency: query.currency,
    organisation_id: null,
  })
  if (regionMatch) {
    const entry: CachedEntry = {
      value: resolveRuleValue(regionMatch),
      valueType: regionMatch.value_type,
      ruleId: regionMatch.id,
      source: 'region_default',
    }
    await writeCache(key, entry)
    return entry
  }

  // Level 3: GLOBAL with same currency.
  const globalCurrencyMatch = await selectActiveRule(client, {
    rule_type: query.ruleType,
    country_code: 'GLOBAL',
    currency: query.currency,
    organisation_id: null,
  })
  if (globalCurrencyMatch) {
    const entry: CachedEntry = {
      value: resolveRuleValue(globalCurrencyMatch),
      valueType: globalCurrencyMatch.value_type,
      ruleId: globalCurrencyMatch.id,
      source: 'global_currency',
    }
    await writeCache(key, entry)
    return entry
  }

  // Level 4: GLOBAL wildcard (any currency on the GLOBAL row).
  // This is the seed pattern for application_fee_composition_mode where
  // there is one GLOBAL/AUD row that conceptually applies to every currency.
  const globalWildcardMatch = await selectActiveRuleAnyCurrency(client, {
    rule_type: query.ruleType,
    country_code: 'GLOBAL',
    organisation_id: null,
  })
  if (globalWildcardMatch) {
    const entry: CachedEntry = {
      value: resolveRuleValue(globalWildcardMatch),
      valueType: globalWildcardMatch.value_type,
      ruleId: globalWildcardMatch.id,
      source: 'global_wildcard',
    }
    await writeCache(key, entry)
    return entry
  }

  throw new PricingRuleNotFoundError(query)
}

/**
 * Invalidates the cached entry for a single rule scope. Admin panel mutations
 * MUST call this after every UPDATE/INSERT so the change propagates within
 * the next read instead of waiting for the 60s TTL.
 */
export async function invalidatePricingRule(query: PricingRuleQuery): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return
  try {
    await redis.del(cacheKey(query))
  } catch {
    // No-op. Stale cache will expire within 60 seconds.
  }
}

interface ActiveRuleQuery {
  rule_type: PricingRuleType
  country_code: string
  currency: string
  organisation_id: string | null
}

// Region / org / global lookups. Always constrained to event_id IS NULL so an
// event-scoped override row can never satisfy a broader-scope query.
async function selectActiveRule(
  client: PricingReadClient,
  q: ActiveRuleQuery
): Promise<PricingRuleRow | null> {
  const nowIso = new Date().toISOString()
  let builder = client
    .from('pricing_rules')
    .select(RULE_SELECT_COLUMNS)
    .eq('rule_type', q.rule_type)
    .eq('country_code', q.country_code)
    .eq('currency', q.currency)
    .is('event_id', null)
    .lte('effective_from', nowIso)
    .or(`effective_until.is.null,effective_until.gt.${nowIso}`)
    .order('version', { ascending: false })
    .limit(1)

  builder = q.organisation_id === null
    ? builder.is('organisation_id', null)
    : builder.eq('organisation_id', q.organisation_id)

  const { data, error } = await builder.maybeSingle()
  if (error) {
    throw new Error(`pricing_rules lookup failed: ${error.message}`)
  }
  return (data ?? null) as PricingRuleRow | null
}

async function selectActiveRuleAnyCurrency(
  client: PricingReadClient,
  q: { rule_type: PricingRuleType; country_code: string; organisation_id: string | null }
): Promise<PricingRuleRow | null> {
  const nowIso = new Date().toISOString()
  let builder = client
    .from('pricing_rules')
    .select(RULE_SELECT_COLUMNS)
    .eq('rule_type', q.rule_type)
    .eq('country_code', q.country_code)
    .is('event_id', null)
    .lte('effective_from', nowIso)
    .or(`effective_until.is.null,effective_until.gt.${nowIso}`)
    .order('version', { ascending: false })
    .limit(1)

  builder = q.organisation_id === null
    ? builder.is('organisation_id', null)
    : builder.eq('organisation_id', q.organisation_id)

  const { data, error } = await builder.maybeSingle()
  if (error) {
    throw new Error(`pricing_rules lookup failed: ${error.message}`)
  }
  return (data ?? null) as PricingRuleRow | null
}

// Per-event override lookup. Matched on (rule_type, event_id) alone: an event
// is globally unique and has one currency, so an event override is absolute.
async function selectActiveEventRule(
  client: PricingReadClient,
  q: { rule_type: PricingRuleType; event_id: string }
): Promise<PricingRuleRow | null> {
  const nowIso = new Date().toISOString()
  const { data, error } = await client
    .from('pricing_rules')
    .select(RULE_SELECT_COLUMNS)
    .eq('rule_type', q.rule_type)
    .eq('event_id', q.event_id)
    .lte('effective_from', nowIso)
    .or(`effective_until.is.null,effective_until.gt.${nowIso}`)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    throw new Error(`pricing_rules lookup failed: ${error.message}`)
  }
  return (data ?? null) as PricingRuleRow | null
}

/**
 * Convenience helpers that wrap getPricingRule with type-narrowed return
 * values. These are the call sites that the rest of the payment module use,
 * so the integer/percentage interpretation stays consistent. Each accepts an
 * optional eventId so a per-event override propagates through charge + payout.
 */

export async function getPlatformFeePercentage(
  countryCode: string,
  currency: string,
  organisationId?: string | null,
  eventId?: string | null
): Promise<number> {
  const rule = await getPricingRule({
    ruleType: 'platform_fee_percentage',
    countryCode,
    currency,
    organisationId,
    eventId,
  })
  return rule.value
}

export async function getPlatformFeeFixedCents(
  countryCode: string,
  currency: string,
  organisationId?: string | null,
  eventId?: string | null
): Promise<number> {
  const rule = await getPricingRule({
    ruleType: 'platform_fee_fixed',
    countryCode,
    currency,
    organisationId,
    eventId,
  })
  return rule.value
}

export async function getProcessingFeePercentage(
  countryCode: string,
  currency: string,
  organisationId?: string | null,
  eventId?: string | null
): Promise<number> {
  const rule = await getPricingRule({
    ruleType: 'processing_fee_percentage',
    countryCode,
    currency,
    organisationId,
    eventId,
  })
  return rule.value
}

export async function getProcessingFeeFixedCents(
  countryCode: string,
  currency: string,
  organisationId?: string | null,
  eventId?: string | null
): Promise<number> {
  const rule = await getPricingRule({
    ruleType: 'processing_fee_fixed_cents',
    countryCode,
    currency,
    organisationId,
    eventId,
  })
  return rule.value
}

export type ProcessingFeePassThrough = 0 | 1 | 2

export async function getProcessingFeePassThrough(
  countryCode: string,
  currency: string,
  organisationId?: string | null,
  eventId?: string | null
): Promise<ProcessingFeePassThrough> {
  const rule = await getPricingRule({
    ruleType: 'processing_fee_pass_through',
    countryCode,
    currency,
    organisationId,
    eventId,
  })
  const v = Math.trunc(rule.value)
  if (v === 0 || v === 1 || v === 2) return v as ProcessingFeePassThrough
  throw new Error(`processing_fee_pass_through value out of range: ${rule.value} (expected 0|1|2)`)
}

export async function getReservePercentage(
  countryCode: string,
  currency: string,
  organisationId?: string | null,
  eventId?: string | null
): Promise<number> {
  const rule = await getPricingRule({
    ruleType: 'reserve_percentage',
    countryCode,
    currency,
    organisationId,
    eventId,
  })
  return rule.value
}

export async function getPayoutScheduleDays(
  countryCode: string,
  currency: string,
  organisationId?: string | null,
  eventId?: string | null
): Promise<number> {
  const rule = await getPricingRule({
    ruleType: 'payout_schedule_days',
    countryCode,
    currency,
    organisationId,
    eventId,
  })
  return Math.trunc(rule.value)
}

export type ApplicationFeeCompositionMode = 1 | 2

export async function getApplicationFeeCompositionMode(
  countryCode: string,
  currency: string,
  organisationId?: string | null,
  eventId?: string | null
): Promise<ApplicationFeeCompositionMode> {
  const rule = await getPricingRule({
    ruleType: 'application_fee_composition_mode',
    countryCode,
    currency,
    organisationId,
    eventId,
  })
  const v = Math.trunc(rule.value)
  if (v === 1 || v === 2) return v as ApplicationFeeCompositionMode
  throw new Error(
    `application_fee_composition_mode value out of range: ${rule.value} (expected 1|2)`
  )
}

/**
 * The Venue Revenue Sharing Program share rate (a percentage of the EventLinqs
 * platform fee), resolved through the SAME single-source resolver as every other
 * fee. Admin-editable in /admin/venues; launch default 20 (AU/AUD + GLOBAL/AUD,
 * seeded by migration 20260627000002). Routes through getPricingRule so the rate
 * is never forked or hardcoded.
 */
export async function getVenueRevenueSharePercentage(
  countryCode: string,
  currency: string,
  organisationId?: string | null,
  eventId?: string | null
): Promise<number> {
  const rule = await getPricingRule({
    ruleType: 'venue_revenue_share_percentage',
    countryCode,
    currency,
    organisationId,
    eventId,
  })
  return rule.value
}
