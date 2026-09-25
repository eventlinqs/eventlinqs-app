import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * MONEY FIX, PART A, A3 LAYER THREE. THE DAILY SETTLEMENT RECONCILIATION.
 *
 * The item's own words: "a daily reconciliation reads platform balance
 * transactions and raises a P0 into REVIEW-QUEUE.md naming the charge id if any
 * ticket charge is found on the platform account."
 *
 * ============================================================================
 * THE LITERAL READING IS UNBUILDABLE, AND SAYING SO IS THE FIRST JOB
 * ============================================================================
 *
 * Under the funds-holding model this platform actually runs
 * (docs/PAYMENTS-FUNDS-HOLDING.md, and see the header of
 * src/lib/payments/create-platform-charge.ts), EVERY ticket charge is on the
 * platform account BY DESIGN. The buyer is charged on the platform balance with
 * no transfer_data and no application_fee_amount, and the organiser is paid
 * afterwards by a platform to connected Transfer. So an alarm that fires
 * whenever "a ticket charge is found on the platform account" fires on every
 * order ever taken, which is the same as an alarm that never fires.
 *
 * THE READING THAT MATCHES THE INTENT, and the one built here, is the inverse:
 * raise a P0 for any charge on the platform balance that is NOT recorded as
 * owed onward to an organiser. That is exactly the MKLStudios condition of
 * 10 September 2026: A$52.48 of organiser revenue settled into the platform
 * account and the organiser was owed it by nobody's record. It fires on nothing
 * on a healthy day, and it is the only reading that is neither silent nor
 * deafening. The contradiction and this resolution are recorded in
 * C:\dev\CLOSE-OUT.md under MONEY FIX and in BUILD-LOG.md.
 *
 * ============================================================================
 * HOW A CHARGE IS IDENTIFIED, FROM SOURCE RATHER THAN FROM A GUESS
 * ============================================================================
 *
 * createPlatformCharge passes `transfer_group: input.transferGroup`, and all
 * three checkout call sites pass the ORDER ID as that value
 * (src/app/actions/checkout.ts lines 653 and 1039, and
 * src/app/actions/squad-checkout.ts line 259). So every ticket charge this
 * platform has ever created carries the order id on the Stripe object itself.
 * That is the identification hook, and it is a fact of the charge rather than
 * an inference from an amount or a description.
 *
 * "RECORDED AS OWED ONWARD" means an `organiser_balance_ledger` row with
 * reason `order_confirmed`, reference_type `order` and reference_id equal to
 * that order id. That row is written by recordOrderConfirmedLedger
 * (src/lib/payments/connect-ledger.ts) and is the platform's statement that it
 * holds this money for a named organisation. No row means the platform is
 * holding money it does not say it owes.
 *
 * ============================================================================
 * IT REPORTS. IT NEVER REPAIRS, AND IT NEVER MOVES MONEY.
 * ============================================================================
 *
 * There is no insert, update, upsert or delete anywhere in this module, and
 * clause four of scripts/guards/funds-reach-the-organiser.mjs fails the build if
 * one appears. The reason is the one written into
 * src/app/api/cron/aggregate-reconcile/route.ts and proven by every finding of
 * the 25 August pass: a reconciliation that silently corrected what it found
 * would destroy the evidence of how the money came to be adrift, and a
 * self-healing money alarm is indistinguishable from no alarm at all.
 *
 * ============================================================================
 * THE GRACE WINDOW, SO IT IS NOT DEAFENING ON A HEALTHY DAY
 * ============================================================================
 *
 * The ledger row is written by the Stripe webhook after the charge succeeds, so
 * a charge taken seconds ago is legitimately unrecorded for as long as delivery
 * takes. Charges newer than `graceHours` are therefore not judged at all, and
 * the window that WAS judged is reported alongside the findings so a reader
 * never has to assume which charges were in scope.
 */

/**
 * One settled charge on the PLATFORM balance, flattened from the Stripe balance
 * transaction and its expanded source so this module never holds a Stripe type
 * and can be tested without the SDK.
 */
export interface SettledPlatformCharge {
  /** `ch_...`, the value every finding must name. */
  readonly chargeId: string
  /** `txn_...`, the balance transaction the money actually landed through. */
  readonly balanceTransactionId: string
  readonly paymentIntentId: string | null
  /** The order id, set as `transfer_group` by createPlatformCharge. */
  readonly transferGroup: string | null
  readonly amountCents: number
  readonly currency: string
  readonly createdIso: string
  readonly description: string | null
}

export type SettlementFindingKind =
  | 'unrouted_ticket_charge'
  | 'unattributable_platform_charge'

export interface SettlementFinding {
  readonly kind: SettlementFindingKind
  readonly chargeId: string
  readonly balanceTransactionId: string
  readonly paymentIntentId: string | null
  readonly orderId: string | null
  readonly amountCents: number
  readonly currency: string
  readonly createdIso: string
  /** Filled for an unrouted ticket charge once the order row is read. */
  readonly organisationId: string | null
  readonly organisationName: string | null
  readonly orderNumber: string | null
  /** One sentence a person can act on, naming the charge. */
  readonly why: string
}

export type SettlementVerdict =
  | { readonly outcome: 'owed_onward'; readonly orderId: string }
  | { readonly outcome: 'unrouted_ticket_charge'; readonly orderId: string }
  | { readonly outcome: 'unattributable_platform_charge' }

export interface SettlementWindow {
  readonly sinceIso: string
  readonly untilIso: string
  readonly graceHours: number
}

export interface SettlementReport {
  readonly window: SettlementWindow
  /** How many settled charges were judged. */
  readonly checked: number
  /** How many carried an order id and had their onward record found. */
  readonly owedOnward: number
  readonly findings: readonly SettlementFinding[]
  /** True when nothing was found. The cron answers 503 when this is false. */
  readonly ok: boolean
}

/** Injected so the scan is testable without Stripe and drivable against TEST. */
export type SettledChargeLister = (window: SettlementWindow) => Promise<readonly SettledPlatformCharge[]>

/** Default lookback. One day of charges plus a day of overlap, so a charge that
 *  lands either side of midnight is never judged by nobody. */
export const DEFAULT_LOOKBACK_HOURS = 48

/** A charge younger than this is not judged; see THE GRACE WINDOW above. */
export const DEFAULT_GRACE_HOURS = 6

/**
 * THE WHOLE RULE, AS A PURE FUNCTION, so the guard, the unit tests, the cron and
 * the verification script all judge the same thing rather than four descriptions
 * of it.
 *
 * A charge with an order id whose onward record exists is owed onward and is
 * fine. A charge with an order id and no onward record is the MKLStudios
 * condition. A charge with no order id at all cannot be shown to belong to any
 * organiser's order, and money the platform cannot explain is a P0 in its own
 * right rather than something to skip quietly: the A$2.03 payment of 18 August
 * 2026 in the same payout is exactly that shape.
 */
export function classifySettledCharge(
  charge: SettledPlatformCharge,
  recordedOrderIds: ReadonlySet<string>,
): SettlementVerdict {
  const orderId = charge.transferGroup?.trim()
  if (!orderId) return { outcome: 'unattributable_platform_charge' }
  if (recordedOrderIds.has(orderId)) return { outcome: 'owed_onward', orderId }
  return { outcome: 'unrouted_ticket_charge', orderId }
}

/** The sentence a finding carries. Always names the charge id, because that is
 *  the one value that identifies the money in Stripe's own dashboard. */
export function describeFinding(
  kind: SettlementFindingKind,
  chargeId: string,
  amountCents: number,
  currency: string,
  orderId: string | null,
): string {
  const money = formatMoney(amountCents, currency)
  if (kind === 'unrouted_ticket_charge') {
    return (
      `${money} settled on the platform balance as charge ${chargeId} for order ${orderId}, ` +
      `and no organiser_balance_ledger order_confirmed row records it as owed onward to an organisation. ` +
      `The platform is holding money it does not say it owes.`
    )
  }
  return (
    `${money} settled on the platform balance as charge ${chargeId} carrying no transfer_group, ` +
    `so the platform cannot show which order or organisation it belongs to. ` +
    `Identify it before the next payout run.`
  )
}

function formatMoney(amountCents: number, currency: string): string {
  const sign = amountCents < 0 ? '-' : ''
  const abs = Math.abs(amountCents)
  return `${sign}${currency.toUpperCase()} ${(abs / 100).toFixed(2)}`
}

/** The window to judge, computed from one clock reading so every part agrees. */
export function settlementWindow(
  now: Date,
  lookbackHours: number = DEFAULT_LOOKBACK_HOURS,
  graceHours: number = DEFAULT_GRACE_HOURS,
): SettlementWindow {
  const untilMs = now.getTime() - graceHours * 3_600_000
  const sinceMs = untilMs - lookbackHours * 3_600_000
  return {
    sinceIso: new Date(sinceMs).toISOString(),
    untilIso: new Date(untilMs).toISOString(),
    graceHours,
  }
}

interface ScanOptions {
  readonly listCharges: SettledChargeLister
  readonly now?: Date
  readonly lookbackHours?: number
  readonly graceHours?: number
}

/**
 * Reads the settled charges, reads the onward records, and judges one against
 * the other. Every database call here is a select; see IT REPORTS above.
 */
export async function scanPlatformSettlement(
  client: SupabaseClient,
  options: ScanOptions,
): Promise<SettlementReport> {
  const window = settlementWindow(
    options.now ?? new Date(),
    options.lookbackHours ?? DEFAULT_LOOKBACK_HOURS,
    options.graceHours ?? DEFAULT_GRACE_HOURS,
  )

  const charges = await options.listCharges(window)

  const orderIds = Array.from(
    new Set(
      charges
        .map((c) => c.transferGroup?.trim())
        .filter((v): v is string => Boolean(v)),
    ),
  )

  const recordedOrderIds = await readOnwardRecords(client, orderIds)

  const findings: SettlementFinding[] = []
  let owedOnward = 0

  for (const charge of charges) {
    const verdict = classifySettledCharge(charge, recordedOrderIds)
    if (verdict.outcome === 'owed_onward') {
      owedOnward += 1
      continue
    }
    const orderId = verdict.outcome === 'unrouted_ticket_charge' ? verdict.orderId : null
    findings.push({
      kind: verdict.outcome,
      chargeId: charge.chargeId,
      balanceTransactionId: charge.balanceTransactionId,
      paymentIntentId: charge.paymentIntentId,
      orderId,
      amountCents: charge.amountCents,
      currency: charge.currency,
      createdIso: charge.createdIso,
      organisationId: null,
      organisationName: null,
      orderNumber: null,
      why: describeFinding(verdict.outcome, charge.chargeId, charge.amountCents, charge.currency, orderId),
    })
  }

  const enriched = await enrichWithOrganisation(client, findings)

  return {
    window,
    checked: charges.length,
    owedOnward,
    findings: enriched,
    ok: enriched.length === 0,
  }
}

/**
 * The order ids that ARE recorded as owed onward. Chunked because an `in` list
 * goes into the query string and a busy day is more order ids than one URL can
 * carry.
 */
async function readOnwardRecords(
  client: SupabaseClient,
  orderIds: readonly string[],
): Promise<ReadonlySet<string>> {
  const found = new Set<string>()
  const CHUNK = 100
  for (let i = 0; i < orderIds.length; i += CHUNK) {
    const chunk = orderIds.slice(i, i + CHUNK)
    const { data, error } = await client
      .from('organiser_balance_ledger')
      .select('reference_id')
      .eq('reason', 'order_confirmed')
      .eq('reference_type', 'order')
      .in('reference_id', chunk)
    if (error) {
      // FAIL LOUD, never quietly empty. An unreadable ledger would otherwise
      // make every charge in the window look unrouted and produce a P0 per
      // order, which is how a real alarm gets switched off.
      throw new Error(
        `platform-settlement-reconcile: could not read organiser_balance_ledger (${error.message}). ` +
          'Nothing was judged, because an unreadable ledger would report every charge as unrouted.',
      )
    }
    for (const row of data ?? []) {
      const id = (row as { reference_id: string | null }).reference_id
      if (id) found.add(id)
    }
  }
  return found
}

/** Puts a name on the money, so the P0 says whose it is where that is knowable. */
async function enrichWithOrganisation(
  client: SupabaseClient,
  findings: readonly SettlementFinding[],
): Promise<readonly SettlementFinding[]> {
  const orderIds = findings.map((f) => f.orderId).filter((v): v is string => Boolean(v))
  if (orderIds.length === 0) return findings

  const { data, error } = await client
    .from('orders')
    .select('id, order_number, organisation_id, organisations(name)')
    .in('id', orderIds)
  if (error) {
    // A missing NAME never suppresses a finding. The charge id is the fact; the
    // organisation is the courtesy.
    console.error('[platform-settlement-reconcile] could not name the organisations', { error })
    return findings
  }

  const byOrder = new Map<string, { organisationId: string | null; organisationName: string | null; orderNumber: string | null }>()
  for (const row of data ?? []) {
    const r = row as {
      id: string
      order_number: string | null
      organisation_id: string | null
      organisations: { name: string | null } | { name: string | null }[] | null
    }
    const org = Array.isArray(r.organisations) ? r.organisations[0] : r.organisations
    byOrder.set(r.id, {
      organisationId: r.organisation_id,
      organisationName: org?.name ?? null,
      orderNumber: r.order_number,
    })
  }

  return findings.map((f) => {
    const extra = f.orderId ? byOrder.get(f.orderId) : undefined
    if (!extra) return f
    return { ...f, ...extra }
  })
}

/**
 * The P0 block, in the shape REVIEW-QUEUE.md carries. Returns an empty string
 * when there is nothing to raise, so a caller can append unconditionally and a
 * healthy day adds no noise to the file.
 */
export function describeSettlementFindings(report: SettlementReport, takenAtIso: string): string {
  if (report.findings.length === 0) return ''

  const lines: string[] = []
  lines.push('')
  lines.push('='.repeat(80))
  lines.push(`P0 MONEY: ${report.findings.length} charge(s) on the platform balance are not recorded as owed onward`)
  lines.push('='.repeat(80))
  lines.push('')
  lines.push(`Taken at ${takenAtIso}.`)
  lines.push(
    `Window judged: ${report.window.sinceIso} to ${report.window.untilIso} ` +
      `(charges younger than ${report.window.graceHours}h are not judged, because the ledger row is written by the webhook).`,
  )
  lines.push(`Judged ${report.checked} settled charge(s); ${report.owedOnward} were recorded as owed onward.`)
  lines.push('')
  lines.push('MONEY WAS NOT MOVED AND NOTHING WAS REPAIRED. This is a read-only reconciliation.')
  lines.push('')

  for (const f of report.findings) {
    lines.push(`  ${f.kind.toUpperCase()}  ${f.chargeId}`)
    lines.push(`    ${f.why}`)
    lines.push(
      `    balance transaction ${f.balanceTransactionId}; payment intent ${f.paymentIntentId ?? 'none'}; settled ${f.createdIso}`,
    )
    if (f.orderId) {
      lines.push(
        `    order ${f.orderNumber ?? f.orderId} (${f.orderId}); organisation ${f.organisationName ?? 'unknown'} (${f.organisationId ?? 'unknown'})`,
      )
    }
    lines.push('')
  }

  return lines.join('\n')
}
