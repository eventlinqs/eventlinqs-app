import { createAdminClient } from '@/lib/supabase/admin'
import { readEveryRow } from '@/lib/supabase/read-every-row'
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

// The fields the owner edits per region: the ONE fee (its percentage and its
// flat per-ticket amount) and who carries it. No code change required (locked
// fee structure: the founder controls pricing).
//
// ONE FEE, founder ruling 15 August 2026. `processing_fee_percentage` and
// `processing_fee_fixed_cents` were REMOVED from this list, and from the admin
// screen with it, because nothing reads those rules any more. Leaving them
// editable was worse than leaving them unread: the screen invited the founder to
// set a number, accepted it, versioned it, wrote it to the audit log, and
// charged nobody a cent of it. An editor that silently does nothing is a no-op
// control, and this one was a no-op control over money.
//
// `processing_fee_pass_through` STAYS and is genuinely live: despite its name it
// governs whether the single fee is passed to the buyer (1) or absorbed by the
// organiser (0). Renaming the rule needs a migration and a coordinated deploy,
// so the name is left alone and the screen labels it for what it does.
export const ADMIN_EDITABLE_FIELDS = [
  'platform_fee_percentage',
  'platform_fee_fixed',
  'processing_fee_pass_through',
] as const
export type AdminEditableField = (typeof ADMIN_EDITABLE_FIELDS)[number]

const FIELD_VALUE_TYPE: Record<AdminEditableField, PricingRuleValueType> = {
  platform_fee_percentage: 'percentage',
  platform_fee_fixed: 'fixed',
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
  /** Who carries the one fee: 0 = organiser absorbs, 1 = passed to the buyer. */
  processingTreatment: AdminPricingCell
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
  /*
   * THE ERROR IS READ, NOT DROPPED. This used to destructure `data` alone, so a
   * read that FAILED was indistinguishable from a scope that has no rule yet:
   * both returned `{ value: null }`. Since LB-OVERRIDE0 a null value renders the
   * control on its placeholder, so an unreachable database showed the founder a
   * fee screen that looked like a platform with no fee configured. Raising says
   * "could not read", which is the true statement.
   */
  const { data, error } = await admin
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
  if (error) {
    throw new Error(
      `the current ${ruleType} for ${countryCode}/${currency} could not be read: ${error.message}`,
    )
  }
  if (!data) return { value: null, version: null }
  return { value: rowValue(data), version: data.version }
}

/** Reads the current effective value for every scope + editable field. */
export async function readAdminPricingMatrix(): Promise<AdminPricingRowView[]> {
  const admin = createAdminClient()
  const rows: AdminPricingRowView[] = []
  for (const scope of ADMIN_PRICING_SCOPES) {
    const [pct, fixed, treat] = await Promise.all([
      readCurrent(admin, 'platform_fee_percentage', scope.countryCode, scope.currency),
      readCurrent(admin, 'platform_fee_fixed', scope.countryCode, scope.currency),
      readCurrent(admin, 'processing_fee_pass_through', scope.countryCode, scope.currency),
    ])
    rows.push({
      scope,
      platformFeePercentage: pct,
      platformFeeFixedCents: fixed,
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
 * What public.write_pricing_rule returns. `version` is null exactly when
 * `changed` is false, because an unchanged value is not written and therefore
 * has no new version to report.
 */
interface PricingWriteResult {
  changed: boolean
  old_value: number | null
  new_value: number
  version: number | null
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
  const newValue = valueType === 'percentage' ? input.value : Math.round(input.value)

  /*
   * THE WRITE GOES THROUGH public.write_pricing_rule AND NOWHERE ELSE.
   *
   * This function used to read the current row, then INSERT a new one with
   * effective_until NULL, leaving the previous row open. On 2026-07-27
   * migration 20260727000002 added uq_pricing_rules_one_open_per_scope, whose
   * own COMMENT states the obligation that creates: "Writers must stamp the
   * previous row before inserting the next version." No writer was changed that
   * day, so from that date every save on /admin/pricing was refused by the
   * index, region defaults included. Driven on TEST before this was rewritten:
   *
   *   insert ... ('platform_fee_percentage','AU','AUD',...,4,now(),null,7.5)
   *   ERROR: 23505 duplicate key ... "uq_pricing_rules_one_open_per_scope"
   *
   * Closing the old row and inserting the new one CANNOT be done from here as
   * two calls: supabase-js has no transaction, so between them the scope has no
   * open row and the resolver reads through to the next precedence level, and a
   * failure on the second call leaves the scope with no open rule at all. The
   * database function does both in one statement, under a scope-keyed advisory
   * lock so two admins saving the same region cannot both write the same
   * version. It returns the old value, so the audit entry below still records
   * old -> new without a second read that could disagree with the write.
   */
  /*
   * `undefined` AND NOT `null` FOR THE FIVE OPTIONAL ARGUMENTS, and the reason
   * is that this is what the function now DECLARES.
   *
   * These five carry `default null` in the database (migration 20260920000011);
   * supabase-js omits an undefined key from the JSON body, PostgREST then does
   * not name the argument, and Postgres applies the default. The value that
   * reaches every one of them is NULL, exactly as before.
   *
   * It used to pass `null` explicitly, which reads the same and is not: the
   * generated Args type derives optionality from the DEFAULT, so with no
   * defaults declared it emitted all ten as required and non-nullable, and the
   * generated section of src/types/database.ts had been hand-widened to `|
   * null` to let this call compile. That widening is a shape the generator can
   * never produce, and the types-drift guard went red on it the hour production
   * caught up. The schema says what is optional now, so nothing has to lie.
   */
  const { data, error } = await admin.rpc('write_pricing_rule', {
    p_rule_type: input.field,
    p_country_code: input.countryCode,
    p_currency: input.currency,
    p_value_type: valueType,
    p_created_by: session.userId,
    p_organisation_id: orgId ?? undefined,
    p_event_id: eventId ?? undefined,
    p_value_percentage: valueType === 'percentage' ? newValue : undefined,
    p_value_cents: valueType === 'fixed' ? newValue : undefined,
    p_value_integer: valueType === 'integer' ? newValue : undefined,
  })
  if (error) return { ok: false, changed: false, error: error.message }

  const result = (data ?? null) as PricingWriteResult | null
  if (!result) {
    return { ok: false, changed: false, error: 'write_pricing_rule returned no result' }
  }
  // Unchanged is decided in the database, under the same lock as the write, so
  // it cannot be decided against a value that moved a moment later.
  if (!result.changed) return { ok: true, changed: false }

  const oldValue = result.old_value
  const nextVersion = result.version

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
/** The columns `readActiveOverrides` pages, named so the pager has a shape. */
interface PricingRuleOverrideRow {
  rule_type: string
  country_code: string
  currency: string
  organisation_id: string | null
  event_id: string | null
  value_type: string
  value_percentage: number | string | null
  value_cents: number | string | null
  /**
   * `number | null`, not `number | string | null`, because that is the shape
   * `rowValue` above accepts and the two must agree. Postgres hands NUMERIC back
   * as a string over PostgREST, which is why the other two are widened; this
   * column is a plain INTEGER and arrives as a number.
   */
  value_integer: number | null
  version: number
}

export async function readActiveOverrides(): Promise<PricingOverrideView[]> {
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()
  /*
   * EVERY OVERRIDE, NOT THE FIRST THOUSAND, AND THE TIE-BREAK MATTERS.
   *
   * This was an unbounded select, and `pricing_rules` is APPEND-ONLY and
   * VERSIONED: every fee change anywhere on the platform adds a row and none is
   * ever removed, so this table grows for ever by design. Supabase stops at
   * 1,000 rows in silence, HTTP 200 and `error` null
   * (https://supabase.com/docs/reference/javascript/select, fetched
   * 2026-09-19; measured here as `Content-Range: 0-999/14364`). 79 rows today.
   *
   * WHAT TRUNCATION DOES HERE IS NOT AN UNDERCOUNT, IT IS AN ABSENCE. The loop
   * below keeps the FIRST row it sees per target, so a target whose rows all
   * fall past the ceiling does not appear at all. That means a live per-event
   * or per-organiser fee override, one that IS being charged, would be missing
   * from the only screen that lists what is overriding the defaults, and the
   * founder would read the platform default and believe it.
   *
   * THE SECOND ORDER IS NOT DECORATION. `version` is not unique across scopes,
   * and ranged paging over a non-unique order is undefined: Postgres may return
   * one row in two windows and another in none. `id` breaks the tie, so the
   * pages are consecutive slices of one stable sequence and "highest version
   * per target wins" still holds across a page boundary.
   */
  const rows = await readEveryRow<PricingRuleOverrideRow>('the active fee overrides', (from, to) =>
    admin
      .from('pricing_rules')
      .select(
        'rule_type, country_code, currency, organisation_id, event_id, value_type, value_percentage, value_cents, value_integer, version'
      )
      .in('rule_type', [...ADMIN_OVERRIDE_FIELDS])
      .or('organisation_id.not.is.null,event_id.not.is.null')
      .lte('effective_from', nowIso)
      .or(`effective_until.is.null,effective_until.gt.${nowIso}`)
      .order('version', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<{
      data: PricingRuleOverrideRow[] | null
      error: { message: string } | null
    }>,
  )

  const byTarget = new Map<string, PricingOverrideView>()
  for (const row of rows) {
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
