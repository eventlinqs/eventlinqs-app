import { createAdminClient } from '@/lib/supabase/admin'
import { invalidatePricingRule, type PricingRuleType, type PricingRuleValueType } from '@/lib/payments/pricing-rules'
import { recordAuditEvent } from '@/lib/admin/audit'
import type { AdminSession } from '@/lib/admin/types'

/**
 * M7 admin pricing controls.
 *
 * Reads and writes the live public.pricing_rules table that the fee
 * calculator (PaymentCalculator -> pricing-rules.ts) reads from, so a change
 * here changes the live fee with no code deploy (scope 3.18 NON-NEGOTIABLE).
 *
 * Writes are append-only versioned rows (scope 3.18.1): a change inserts a new
 * row with version = previous + 1 and effective_from = now. The reader picks
 * the highest-version effective row, so old orders keep their historical fee
 * and there is no retroactive change. Every write is audit-logged old -> new.
 *
 * Region defaults are public-readable but writes are RLS-blocked for
 * non-admins; the admin panel writes through the service-role client.
 */

export interface AdminPricingScope {
  countryCode: string
  currency: string
  label: string
}

// v1 geography: AU/UK/US/EU plus the GLOBAL default.
export const ADMIN_PRICING_SCOPES: readonly AdminPricingScope[] = [
  { countryCode: 'GLOBAL', currency: 'AUD', label: 'Global default' },
  { countryCode: 'AU', currency: 'AUD', label: 'Australia' },
  { countryCode: 'GB', currency: 'GBP', label: 'United Kingdom' },
  { countryCode: 'US', currency: 'USD', label: 'United States' },
  { countryCode: 'IE', currency: 'EUR', label: 'Europe' },
]

// The fields the owner edits per region. Both fees (their percentages AND the
// platform flat amount) and the processing-fee treatment are editable, no code
// change (locked fee structure: founder controls pricing). processing_fee_fixed_cents
// is the flat processing component (0 under the locked AU model).
// processing_fee_pass_through is the treatment: 0 = absorb, 1 = pass to buyer.
export const ADMIN_EDITABLE_FIELDS = [
  'platform_fee_percentage',
  'platform_fee_fixed',
  'processing_fee_percentage',
  'processing_fee_fixed_cents',
  'processing_fee_pass_through',
] as const
export type AdminEditableField = (typeof ADMIN_EDITABLE_FIELDS)[number]

const FIELD_VALUE_TYPE: Record<AdminEditableField, PricingRuleValueType> = {
  platform_fee_percentage: 'percentage',
  platform_fee_fixed: 'fixed',
  processing_fee_percentage: 'percentage',
  processing_fee_fixed_cents: 'fixed',
  processing_fee_pass_through: 'integer',
}

export interface AdminPricingCell {
  value: number | null
  version: number | null
}

export interface AdminPricingRowView {
  scope: AdminPricingScope
  platformFeePercentage: AdminPricingCell
  platformFeeFixedCents: AdminPricingCell
  processingFeePercentage: AdminPricingCell
  processingFeeFixedCents: AdminPricingCell
  processingTreatment: AdminPricingCell // value 0 (absorb) | 1 (pass)
}

type AdminClient = ReturnType<typeof createAdminClient>

function rowValue(row: {
  value_type: string
  value_percentage: string | number | null
  value_cents: string | number | null
  value_integer: number | null
}): number | null {
  if (row.value_type === 'percentage') return row.value_percentage === null ? null : Number(row.value_percentage)
  if (row.value_type === 'fixed') return row.value_cents === null ? null : Number(row.value_cents)
  if (row.value_type === 'integer') return row.value_integer === null ? null : Number(row.value_integer)
  return null
}

async function readCurrent(
  admin: AdminClient,
  ruleType: AdminEditableField,
  countryCode: string,
  currency: string,
): Promise<{ value: number | null; version: number | null }> {
  const nowIso = new Date().toISOString()
  const { data } = await admin
    .from('pricing_rules')
    .select('id, value_type, value_percentage, value_cents, value_integer, version')
    .eq('rule_type', ruleType)
    .eq('country_code', countryCode)
    .eq('currency', currency)
    .is('organisation_id', null)
    .lte('effective_from', nowIso)
    .or(`effective_until.is.null,effective_until.gt.${nowIso}`)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return { value: null, version: null }
  return { value: rowValue(data), version: data.version }
}

/** Reads the current effective value for every scope + editable field. */
export async function readAdminPricingMatrix(): Promise<AdminPricingRowView[]> {
  const admin = createAdminClient()
  const rows: AdminPricingRowView[] = []
  for (const scope of ADMIN_PRICING_SCOPES) {
    const [pct, fixed, procPct, procFixed, treat] = await Promise.all([
      readCurrent(admin, 'platform_fee_percentage', scope.countryCode, scope.currency),
      readCurrent(admin, 'platform_fee_fixed', scope.countryCode, scope.currency),
      readCurrent(admin, 'processing_fee_percentage', scope.countryCode, scope.currency),
      readCurrent(admin, 'processing_fee_fixed_cents', scope.countryCode, scope.currency),
      readCurrent(admin, 'processing_fee_pass_through', scope.countryCode, scope.currency),
    ])
    rows.push({
      scope,
      platformFeePercentage: pct,
      platformFeeFixedCents: fixed,
      processingFeePercentage: procPct,
      processingFeeFixedCents: procFixed,
      processingTreatment: treat,
    })
  }
  return rows
}

/**
 * Scope a pricing write targets. Default (both null) is the region/global
 * default. An organisationId writes a per-organiser override; an eventId writes
 * a per-event override (highest precedence). Exactly one of org/event should be
 * set for an override; event wins if both are passed.
 */
export interface PricingWriteScope {
  organisationId?: string | null
  eventId?: string | null
}

/**
 * Inserts a new version row for one field of one scope, invalidates the cache,
 * and audit-logs old -> new. No-op (returns changed: false) when the value is
 * unchanged so we do not churn versions. Works for the region default and for
 * per-organiser / per-event overrides via the optional scope.
 */
export async function writePricingField(
  input: {
    field: AdminEditableField
    countryCode: string
    currency: string
    value: number
    scope?: PricingWriteScope
  },
  session: AdminSession,
): Promise<{ ok: boolean; changed: boolean; error?: string }> {
  const admin = createAdminClient()
  const valueType = FIELD_VALUE_TYPE[input.field]
  const orgId = input.scope?.eventId ? null : (input.scope?.organisationId ?? null)
  const eventId = input.scope?.eventId ?? null

  // Find the current effective row for THIS exact scope (event > org > region),
  // so the new version sits on top of the right history.
  let curQuery = admin
    .from('pricing_rules')
    .select('id, version, value_type, value_percentage, value_cents, value_integer')
    .eq('rule_type', input.field)
    .order('version', { ascending: false })
    .limit(1)
  if (eventId) {
    curQuery = curQuery.eq('event_id', eventId)
  } else {
    curQuery = curQuery.eq('country_code', input.countryCode).eq('currency', input.currency).is('event_id', null)
    curQuery = orgId ? curQuery.eq('organisation_id', orgId) : curQuery.is('organisation_id', null)
  }
  const { data: cur } = await curQuery.maybeSingle()

  const oldValue = cur ? rowValue(cur) : null
  const newValue = valueType === 'percentage' ? input.value : Math.round(input.value)
  if (oldValue !== null && oldValue === newValue) return { ok: true, changed: false }

  const nextVersion = (cur?.version ?? 0) + 1
  const { error } = await admin.from('pricing_rules').insert({
    rule_type: input.field,
    country_code: input.countryCode,
    currency: input.currency,
    event_type: 'ALL',
    organiser_tier: 'ALL',
    organisation_id: orgId,
    event_id: eventId,
    value_type: valueType,
    version: nextVersion,
    effective_from: new Date().toISOString(),
    effective_until: null,
    created_by: session.userId,
    value_percentage: valueType === 'percentage' ? newValue : null,
    value_cents: valueType === 'fixed' ? newValue : null,
    value_integer: valueType === 'integer' ? newValue : null,
  })
  if (error) return { ok: false, changed: false, error: error.message }

  await invalidatePricingRule({
    ruleType: input.field as PricingRuleType,
    countryCode: input.countryCode,
    currency: input.currency,
    organisationId: orgId,
    eventId,
  })

  const scopeLabel = eventId
    ? `event:${eventId}`
    : orgId
      ? `org:${orgId}:${input.countryCode}:${input.currency}`
      : `${input.countryCode}:${input.currency}`
  await recordAuditEvent({
    action: 'admin.pricing.updated',
    targetType: 'pricing_rule',
    targetId: `${input.field}:${scopeLabel}`,
    metadata: {
      field: input.field,
      scope: eventId ? 'event' : orgId ? 'organisation' : 'region',
      country: input.countryCode,
      currency: input.currency,
      organisationId: orgId,
      eventId,
      oldValue,
      newValue,
      version: nextVersion,
    },
    session,
  })
  return { ok: true, changed: true }
}

// ---------------------------------------------------------------------------
// Per-organiser and per-event overrides
// ---------------------------------------------------------------------------

/** The fee fields a per-org / per-event override can set (the platform fee). */
export const ADMIN_OVERRIDE_FIELDS = ['platform_fee_percentage', 'platform_fee_fixed'] as const
export type AdminOverrideField = (typeof ADMIN_OVERRIDE_FIELDS)[number]

export type OverrideScopeKind = 'organisation' | 'event'

/** Country a per-org override currency maps to (mirrors ADMIN_PRICING_SCOPES). */
export function countryForCurrency(currency: string): string {
  const scope = ADMIN_PRICING_SCOPES.find((s) => s.currency === currency.toUpperCase())
  return scope ? scope.countryCode : 'GLOBAL'
}

export interface PricingOverrideView {
  kind: OverrideScopeKind
  targetId: string
  countryCode: string
  currency: string
  percentage: AdminPricingCell
  fixed: AdminPricingCell
}

/**
 * Lists every active per-organiser and per-event platform-fee override with its
 * current effective value and version, so the admin panel can show what is
 * overriding the defaults and where.
 */
export async function readActiveOverrides(): Promise<PricingOverrideView[]> {
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()
  const { data } = await admin
    .from('pricing_rules')
    .select(
      'rule_type, country_code, currency, organisation_id, event_id, value_type, value_percentage, value_cents, value_integer, version'
    )
    .in('rule_type', [...ADMIN_OVERRIDE_FIELDS])
    .or('organisation_id.not.is.null,event_id.not.is.null')
    .lte('effective_from', nowIso)
    .or(`effective_until.is.null,effective_until.gt.${nowIso}`)
    .order('version', { ascending: false })

  const byTarget = new Map<string, PricingOverrideView>()
  for (const row of data ?? []) {
    const kind: OverrideScopeKind = row.event_id ? 'event' : 'organisation'
    const targetId = (row.event_id ?? row.organisation_id) as string
    const key = `${kind}:${targetId}`
    let view = byTarget.get(key)
    if (!view) {
      view = {
        kind,
        targetId,
        countryCode: row.country_code,
        currency: row.currency,
        percentage: { value: null, version: null },
        fixed: { value: null, version: null },
      }
      byTarget.set(key, view)
    }
    // Rows are version-desc, so the FIRST seen per field is the latest.
    if (row.rule_type === 'platform_fee_percentage' && view.percentage.version === null) {
      view.percentage = { value: rowValue(row), version: row.version }
    }
    if (row.rule_type === 'platform_fee_fixed' && view.fixed.version === null) {
      view.fixed = { value: rowValue(row), version: row.version }
    }
  }
  return [...byTarget.values()]
}
