import { createAdminClient } from '@/lib/supabase/admin'
import { getRedisClient } from '@/lib/redis/client'

/**
 * M6 Phase 3 (rework) - pricing rules service.
 *
 * Single read path for every fee, reserve, and payout-policy value the
 * platform charges. Reads from the long-format public.pricing_rules table.
 * Production has 18 baseline rows; this service walks the precedence ladder
 * and returns the first match.
 *
 * Lookup precedence (most specific first):
 *   1. (country_code, currency, rule_type, organisation_id = X)         per-org override
 *   2. (country_code, currency, rule_type, organisation_id IS NULL)     region default
 *   3. ('GLOBAL',     currency, rule_type, organisation_id IS NULL)     global currency default
 *   4. ('GLOBAL', any currency, rule_type, organisation_id IS NULL)     global wildcard
 *   5. PricingRuleNotFoundError
 *
 * Effectiveness window:
 *   effective_from <= NOW() AND (effective_until IS NULL OR effective_until > NOW())
 *
 * Tie-breaking (multiple rows match): highest version wins.
 *
 * Caching:
 *   60-second TTL via Upstash Redis when configured. Falls back to direct DB
 *   reads when Redis is unavailable so tests and local dev work without
 *   Redis credentials. Admin panel writes MUST call invalidatePricingRule()
 *   for the change to land within 60 seconds.
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

export type PricingRuleValueType = 'percentage' | 'fixed' | 'integer'

export interface PricingRuleRow {
  id: string
  rule_type: PricingRuleType
  country_code: string
  currency: string
  event_type: string
  organiser_tier: string
  organisation_id: string | null
  value: number
  value_type: PricingRuleValueType
  version: number
  effective_from: string
  effective_until: string | null
}

export interface PricingRuleQuery {
  ruleType: PricingRuleType
  countryCode: string
  currency: string
  organisationId?: string | null
}

export class PricingRuleNotFoundError extends Error {
  constructor(query: PricingRuleQuery) {
    super(
      `No effective pricing rule found for rule_type=${query.ruleType} country=${query.countryCode} currency=${query.currency} organisation_id=${query.organisationId ?? 'null'}`
    )
    this.name = 'PricingRuleNotFoundError'
  }
}

interface CachedEntry {
  value: number
  valueType: PricingRuleValueType
  ruleId: string
  source: 'org_override' | 'region_default' | 'global_currency' | 'global_wildcard'
}

function cacheKey(query: PricingRuleQuery): string {
  const orgPart = query.organisationId ?? 'null'
  return `pr:v1:${query.ruleType}:${query.countryCode}:${query.currency}:${orgPart}`
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
 */
export async function getPricingRule(query: PricingRuleQuery): Promise<{
  value: number
  valueType: PricingRuleValueType
  ruleId: string
  source: CachedEntry['source']
}> {
  const key = cacheKey(query)
  const cached = await readCache(key)
  if (cached) return cached

  const admin = createAdminClient()
  const orgId = query.organisationId ?? null

  // Level 1: per-org override
  if (orgId) {
    const orgMatch = await selectActiveRule(admin, {
      rule_type: query.ruleType,
      country_code: query.countryCode,
      currency: query.currency,
      organisation_id: orgId,
    })
    if (orgMatch) {
      const entry: CachedEntry = {
        value: Number(orgMatch.value),
        valueType: orgMatch.value_type,
        ruleId: orgMatch.id,
        source: 'org_override',
      }
      await writeCache(key, entry)
      return entry
    }
  }

  // Level 2: region default
  const regionMatch = await selectActiveRule(admin, {
    rule_type: query.ruleType,
    country_code: query.countryCode,
    currency: query.currency,
    organisation_id: null,
  })
  if (regionMatch) {
    const entry: CachedEntry = {
      value: Number(regionMatch.value),
      valueType: regionMatch.value_type,
      ruleId: regionMatch.id,
      source: 'region_default',
    }
    await writeCache(key, entry)
    return entry
  }

  // Level 3: GLOBAL with same currency
  const globalCurrencyMatch = await selectActiveRule(admin, {
    rule_type: query.ruleType,
    country_code: 'GLOBAL',
    currency: query.currency,
    organisation_id: null,
  })
  if (globalCurrencyMatch) {
    const entry: CachedEntry = {
      value: Number(globalCurrencyMatch.value),
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
  const globalWildcardMatch = await selectActiveRuleAnyCurrency(admin, {
    rule_type: query.ruleType,
    country_code: 'GLOBAL',
    organisation_id: null,
  })
  if (globalWildcardMatch) {
    const entry: CachedEntry = {
      value: Number(globalWildcardMatch.value),
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

type AdminClient = ReturnType<typeof createAdminClient>

interface ActiveRuleQuery {
  rule_type: PricingRuleType
  country_code: string
  currency: string
  organisation_id: string | null
}

async function selectActiveRule(
  admin: AdminClient,
  q: ActiveRuleQuery
): Promise<PricingRuleRow | null> {
  const nowIso = new Date().toISOString()
  let builder = admin
    .from('pricing_rules')
    .select(
      'id, rule_type, country_code, currency, event_type, organiser_tier, organisation_id, value, value_type, version, effective_from, effective_until'
    )
    .eq('rule_type', q.rule_type)
    .eq('country_code', q.country_code)
    .eq('currency', q.currency)
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
  admin: AdminClient,
  q: { rule_type: PricingRuleType; country_code: string; organisation_id: string | null }
): Promise<PricingRuleRow | null> {
  const nowIso = new Date().toISOString()
  let builder = admin
    .from('pricing_rules')
    .select(
      'id, rule_type, country_code, currency, event_type, organiser_tier, organisation_id, value, value_type, version, effective_from, effective_until'
    )
    .eq('rule_type', q.rule_type)
    .eq('country_code', q.country_code)
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

/**
 * Convenience helpers that wrap getPricingRule with type-narrowed return
 * values. These are the call sites that the rest of the payment module use,
 * so the integer/percentage interpretation stays consistent.
 */

export async function getPlatformFeePercentage(
  countryCode: string,
  currency: string,
  organisationId?: string | null
): Promise<number> {
  const rule = await getPricingRule({
    ruleType: 'platform_fee_percentage',
    countryCode,
    currency,
    organisationId,
  })
  return rule.value
}

export async function getPlatformFeeFixedCents(
  countryCode: string,
  currency: string,
  organisationId?: string | null
): Promise<number> {
  const rule = await getPricingRule({
    ruleType: 'platform_fee_fixed',
    countryCode,
    currency,
    organisationId,
  })
  return rule.value
}

export async function getProcessingFeePercentage(
  countryCode: string,
  currency: string,
  organisationId?: string | null
): Promise<number> {
  const rule = await getPricingRule({
    ruleType: 'processing_fee_percentage',
    countryCode,
    currency,
    organisationId,
  })
  return rule.value
}

export async function getProcessingFeeFixedCents(
  countryCode: string,
  currency: string,
  organisationId?: string | null
): Promise<number> {
  const rule = await getPricingRule({
    ruleType: 'processing_fee_fixed_cents',
    countryCode,
    currency,
    organisationId,
  })
  return rule.value
}

export type ProcessingFeePassThrough = 0 | 1 | 2

export async function getProcessingFeePassThrough(
  countryCode: string,
  currency: string,
  organisationId?: string | null
): Promise<ProcessingFeePassThrough> {
  const rule = await getPricingRule({
    ruleType: 'processing_fee_pass_through',
    countryCode,
    currency,
    organisationId,
  })
  const v = Math.trunc(rule.value)
  if (v === 0 || v === 1 || v === 2) return v as ProcessingFeePassThrough
  throw new Error(`processing_fee_pass_through value out of range: ${rule.value} (expected 0|1|2)`)
}

export async function getReservePercentage(
  countryCode: string,
  currency: string,
  organisationId?: string | null
): Promise<number> {
  const rule = await getPricingRule({
    ruleType: 'reserve_percentage',
    countryCode,
    currency,
    organisationId,
  })
  return rule.value
}

export async function getPayoutScheduleDays(
  countryCode: string,
  currency: string,
  organisationId?: string | null
): Promise<number> {
  const rule = await getPricingRule({
    ruleType: 'payout_schedule_days',
    countryCode,
    currency,
    organisationId,
  })
  return Math.trunc(rule.value)
}

export type ApplicationFeeCompositionMode = 1 | 2

export async function getApplicationFeeCompositionMode(
  countryCode: string,
  currency: string,
  organisationId?: string | null
): Promise<ApplicationFeeCompositionMode> {
  const rule = await getPricingRule({
    ruleType: 'application_fee_composition_mode',
    countryCode,
    currency,
    organisationId,
  })
  const v = Math.trunc(rule.value)
  if (v === 1 || v === 2) return v as ApplicationFeeCompositionMode
  throw new Error(
    `application_fee_composition_mode value out of range: ${rule.value} (expected 1|2)`
  )
}
