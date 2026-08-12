import 'server-only'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { retrieveAccount } from './connect'
import { connectStateFrom } from './reconcile-connect'

/**
 * The divergence guard: does what the platform BELIEVES about a connected account
 * still match what Stripe SAYS?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS SEPARATELY FROM THE RECONCILER, WHICH ALREADY FIXES DRIFT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The reconciler corrects a row the moment anything asks it to. That is the right
 * behaviour for an organiser who is stranded right now, and it is also how a
 * systemic fault disappears from view: if the `account.updated` webhook is not being
 * delivered at all, the hourly reconcile quietly patches every organisation, every
 * hour, forever, and nobody ever learns that the webhook is dead. The platform looks
 * healthy precisely because something is broken and something else keeps hiding it.
 *
 * So this module is deliberately the opposite of the reconciler:
 *
 *   IT NEVER WRITES. Not one column, not even to fix an obvious error. Its output is
 *   a report. If it corrected anything it would destroy the evidence it exists to
 *   collect, which is exactly the failure above.
 *
 * The founder's own lockout is the shape it hunts: the row held payout_status
 * 'restricted', stripe_charges_enabled false and stripe_payouts_enabled false while
 * Stripe reported the account fully enabled with transfers=active and
 * card_payments=active. Nothing on the platform noticed for as long as it lasted,
 * and it took SQL against production to end it. One run of this check would have
 * named it in a line.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO SEVERITIES, AND THE SPLIT IS THE DIFFERENCE BETWEEN A USED GATE AND AN
 * IGNORED ONE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * BLOCKING fields are the ones that decide whether a person can trade:
 * stripe_charges_enabled, stripe_payouts_enabled, payout_status and
 * stripe_onboarding_complete. A wrong value in any of them either stops somebody
 * selling who should be able to, or lets somebody sell who Stripe has stopped. That
 * is the lockout class, and it goes red.
 *
 * INFORMATIONAL fields are the ones that legitimately churn between a reconcile and
 * a scan: the capabilities and requirements payloads (a `current_deadline` moves on
 * its own), the account country, the bank destination. Stale copies of these cannot
 * strand anybody. Reporting them as failures would put the gate permanently red for
 * a benign reason, and a gate that is always red is a gate somebody switches off.
 *
 * ADMIN HOLDS ARE NOT DIVERGENCE. `payout_status = 'on_hold'` is an EventLinqs
 * decision that Stripe knows nothing about, so a held organisation whose Stripe
 * account is perfectly healthy is CORRECT, not divergent. The reconciler preserves
 * the hold; this guard must not then report the reconciler's own correct behaviour
 * as a fault, or every held organisation shows up as a defect forever.
 */

/** The fields whose disagreement means somebody's ability to trade is wrong. */
export const BLOCKING_FIELDS = [
  'stripe_charges_enabled',
  'stripe_payouts_enabled',
  'stripe_onboarding_complete',
  'payout_status',
] as const

/** The fields that drift harmlessly between a reconcile and a scan. */
export const INFORMATIONAL_FIELDS = [
  'stripe_account_country',
  'payout_destination',
  'stripe_capabilities',
  'stripe_requirements',
] as const

export type DivergenceField =
  | (typeof BLOCKING_FIELDS)[number]
  | (typeof INFORMATIONAL_FIELDS)[number]

export type Divergence = {
  field: DivergenceField
  platform: string
  stripe: string
  blocking: boolean
}

export type OrganisationVerdict = {
  organisationId: string
  organisationName: string
  stripeAccountId: string | null
  /** Empty when the platform and Stripe agree on everything. */
  divergences: Divergence[]
  /** True when at least one BLOCKING field disagrees. */
  blocking: boolean
  /** Set when Stripe could not be reached for this organisation. */
  unreachable?: string
  /** True when an admin hold was found, so a reader knows why payout_status differs. */
  adminHold: boolean
}

export type DivergenceReport = {
  checked: number
  /** Organisations whose trading-critical columns disagree with Stripe. */
  blocking: OrganisationVerdict[]
  /** Organisations whose non-critical columns are merely stale. */
  informational: OrganisationVerdict[]
  /** Organisations Stripe could not be asked about. Not a divergence, but not a pass. */
  unreachable: OrganisationVerdict[]
  /**
   * Rows claiming no Stripe account while still carrying live Stripe state. These
   * need no Stripe call to detect: the row contradicts itself.
   */
  halfCleared: Array<{ organisationId: string; organisationName: string; carrying: string[] }>
}

/** A stable, readable rendering of a column value for a report line. */
function show(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'object') {
    const json = JSON.stringify(value)
    return json.length > 120 ? `${json.slice(0, 117)}...` : json
  }
  return String(value)
}

function differs(a: unknown, b: unknown): boolean {
  if (typeof a === 'object' || typeof b === 'object') {
    return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)
  }
  return a !== b
}

/**
 * Compare one stored row against one Stripe account. PURE, so the whole decision
 * table can be tested without a Stripe or a database.
 */
export function compareToStripe(
  row: Record<string, unknown>,
  account: Stripe.Account,
): { divergences: Divergence[]; blocking: boolean; adminHold: boolean } {
  const expected = connectStateFrom(account) as unknown as Record<string, unknown>
  const adminHold = row.payout_status === 'on_hold'
  const divergences: Divergence[] = []

  for (const field of BLOCKING_FIELDS) {
    // An admin hold is a deliberate EventLinqs decision that Stripe cannot know
    // about, so it is the correct value rather than a disagreement. See the note at
    // the top of this file.
    if (field === 'payout_status' && adminHold) continue
    if (differs(row[field], expected[field])) {
      divergences.push({
        field,
        platform: show(row[field]),
        stripe: show(expected[field]),
        blocking: true,
      })
    }
  }

  for (const field of INFORMATIONAL_FIELDS) {
    // The reconciler only overwrites payout_destination when Stripe reports one, so
    // a stored destination against an absent one is that rule working, not drift.
    if (field === 'payout_destination' && !expected[field]) continue
    if (differs(row[field], expected[field])) {
      divergences.push({
        field,
        platform: show(row[field]),
        stripe: show(expected[field]),
        blocking: false,
      })
    }
  }

  return { divergences, blocking: divergences.some((d) => d.blocking), adminHold }
}

/**
 * Which live Stripe state a disconnected row is still carrying.
 *
 * Deliberately narrow. `payout_status <> 'unset'` is NOT included, because until
 * migration 20260809000001 is applied the column cannot hold 'unset' at all
 * (proven against TEST: error 23514 on the CHECK constraint,
 * scripts/verify/payout-status-domain.mjs), so including it would put every
 * disconnected organisation in this list for a reason that is about a pending
 * migration rather than about a lie. What IS included is state that actively
 * asserts a capability the organisation does not have.
 */
export function halfClearedFields(row: Record<string, unknown>): string[] {
  const carrying: string[] = []
  if (row.stripe_charges_enabled === true) carrying.push('stripe_charges_enabled=true')
  if (row.stripe_payouts_enabled === true) carrying.push('stripe_payouts_enabled=true')
  if (row.stripe_onboarding_complete === true) carrying.push('stripe_onboarding_complete=true')
  if (row.payout_destination) carrying.push(`payout_destination=${show(row.payout_destination)}`)
  return carrying
}

const SELECT_COLUMNS =
  'id, name, stripe_account_id, stripe_onboarding_complete, stripe_charges_enabled, stripe_payouts_enabled, stripe_account_country, stripe_capabilities, stripe_requirements, payout_destination, payout_status'

/**
 * Scan every organisation and report, without writing anything.
 *
 * `client` must be a service-role client: the stripe_* columns are revoked from
 * `authenticated` by column privilege (migration 20260808000010). It is used for
 * READS ONLY here, which is the entire contract of this module.
 */
export async function scanConnectDivergence(client: SupabaseClient): Promise<DivergenceReport> {
  const { data, error } = await client
    .from('organisations')
    .select(SELECT_COLUMNS)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Could not list organisations: ${error.message}`)

  const rows = (data ?? []) as Array<Record<string, unknown>>
  const report: DivergenceReport = {
    checked: 0,
    blocking: [],
    informational: [],
    unreachable: [],
    halfCleared: [],
  }

  for (const row of rows) {
    const organisationId = row.id as string
    const organisationName = (row.name as string) ?? ''
    const accountId = row.stripe_account_id as string | null

    if (!accountId) {
      const carrying = halfClearedFields(row)
      if (carrying.length > 0) {
        report.halfCleared.push({ organisationId, organisationName, carrying })
      }
      continue
    }

    report.checked++

    let account: Stripe.Account
    try {
      account = await retrieveAccount(accountId)
    } catch (err) {
      // Unreachable is reported as its own category rather than folded into either
      // a pass or a divergence. "I could not ask" is not "they agree", and quietly
      // treating it as a pass is how a broken Stripe key looks green.
      report.unreachable.push({
        organisationId,
        organisationName,
        stripeAccountId: accountId,
        divergences: [],
        blocking: false,
        adminHold: row.payout_status === 'on_hold',
        unreachable: err instanceof Error ? err.message : String(err),
      })
      continue
    }

    const { divergences, blocking, adminHold } = compareToStripe(row, account)
    if (divergences.length === 0) continue

    const verdict: OrganisationVerdict = {
      organisationId,
      organisationName,
      stripeAccountId: accountId,
      divergences,
      blocking,
      adminHold,
    }
    if (blocking) report.blocking.push(verdict)
    else report.informational.push(verdict)
  }

  return report
}

/** A plain-text summary an email or a log line can carry verbatim. */
export function describeDivergence(report: DivergenceReport): string {
  const lines: string[] = []
  for (const v of report.blocking) {
    lines.push(`BLOCKING  ${v.organisationName} (${v.organisationId}) account ${v.stripeAccountId}`)
    for (const d of v.divergences.filter((x) => x.blocking)) {
      lines.push(`    ${d.field}: platform says ${d.platform}, Stripe says ${d.stripe}`)
    }
  }
  for (const h of report.halfCleared) {
    lines.push(
      `HALF-CLEARED  ${h.organisationName} (${h.organisationId}) has no Stripe account but still carries ${h.carrying.join(', ')}`,
    )
  }
  for (const v of report.unreachable) {
    lines.push(`UNREACHABLE  ${v.organisationName} (${v.organisationId}): ${v.unreachable}`)
  }
  for (const v of report.informational) {
    lines.push(`stale  ${v.organisationName} (${v.organisationId}): ${v.divergences.map((d) => d.field).join(', ')}`)
  }
  return lines.join('\n')
}
