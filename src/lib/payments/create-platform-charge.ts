import { createAdminClient } from '@/lib/supabase/admin'
import type { Organisation } from '@/types/database'
import {
  ChargePreconditionError,
  assertOrganiserCanReceiveFunds,
  computeOrganiserTransferCents,
  getCurrencyForCountry,
} from './application-fee'
import { statementDescriptorSuffix } from '@/lib/stripe/business-profile'
import { verifyRowFields } from './required-fields'
import type { FeeBreakdown } from './payment-calculator'
import type { CreatePaymentIntentParams, PaymentGateway, PaymentIntentResult } from './gateway'
import { captureException } from '@/lib/observability/sentry'

/**
 * Funds-holding model (docs/PAYMENTS-FUNDS-HOLDING.md): the buyer is charged on
 * the PLATFORM account (separate charges and transfers). No `on_behalf_of`, no
 * `transfer_data`, no `application_fee_amount` - the platform is the merchant of
 * record and the funds settle to, and are HELD in, the platform balance. The
 * organiser's net share is recorded as an event-scoped held liability in the
 * ledger and released later by a platform->connected Transfer after the event
 * (Stage 4). This replaces the old `createDestinationCharge`.
 */

type OrgChargeFields = Pick<
  Organisation,
  | 'id'
  | 'name'
  | 'stripe_account_id'
  | 'stripe_payouts_enabled'
  | 'stripe_account_country'
  | 'payout_status'
>

export interface CreatePlatformChargeInput {
  gateway: PaymentGateway
  organisationId: string
  /** Event being charged. Lets the organiser-transfer composition honour a
   *  per-event fee override through the same resolver as the charge. */
  eventId?: string | null
  fees: FeeBreakdown
  metadata: CreatePaymentIntentParams['metadata']
  customerEmail: string
  idempotencyKey: string
  /** The order id. Sets `transfer_group` so the later organiser transfer and
   *  this charge reconcile as one group on the Stripe side. */
  transferGroup: string
}

export interface CreatePlatformChargeResult {
  intent: PaymentIntentResult
  /** The net amount owed to the organiser, to be transferred post-event. */
  organiserTransferCents: number
  connectedAccountId: string
  currency: string
}

/**
 * Loads the organisation, runs the can-receive-funds pre-conditions, and
 * creates a Stripe PLATFORM charge through the supplied PaymentGateway.
 *
 * Throws `ChargePreconditionError` (typed reason on the error) when the
 * organisation cannot be paid out. Throws plain Error when the org row cannot
 * be loaded or when the currency map disagrees with `fees.currency`.
 */
export async function createPlatformCharge(
  input: CreatePlatformChargeInput
): Promise<CreatePlatformChargeResult> {
  const org = await loadOrgChargeFields(input.organisationId)
  assertOrganiserCanReceiveFunds(org, input.fees)

  const expectedCurrency = getCurrencyForCountry(org.stripe_account_country)!
  if (input.fees.currency.toUpperCase() !== expectedCurrency) {
    throw new ChargePreconditionError(
      'fee_breakdown_invalid',
      `FeeBreakdown currency "${input.fees.currency}" does not match Connect settlement currency "${expectedCurrency}" for country "${org.stripe_account_country}".`
    )
  }

  const organiserTransferCents = await computeOrganiserTransferCents(
    input.fees,
    (org.stripe_account_country ?? 'GLOBAL').toUpperCase(),
    expectedCurrency,
    input.organisationId,
    input.eventId ?? null
  )
  const connectedAccountId = org.stripe_account_id!

  // The buyer's bank statement carries the EVENT, falling back to the organiser
  // only when the event yields nothing printable. Loaded here rather than passed
  // in because the three checkout call sites (general, seated, squad) hold three
  // differently-shaped event objects and only one of them selects `title`;
  // reading it from the id they all pass is one indexed lookup and cannot
  // silently go missing at one call site.
  const eventTitle = await loadEventTitle(input.eventId ?? null)
  const descriptorSuffix =
    statementDescriptorSuffix(eventTitle) ?? statementDescriptorSuffix(org.name)

  const intent = await input.gateway.createPaymentIntent({
    amount_cents: input.fees.total_cents,
    currency: input.fees.currency,
    customer_email: input.customerEmail,
    idempotency_key: input.idempotencyKey,
    metadata: input.metadata,
    // PLATFORM charge: funds held in the platform balance. transfer_group links
    // this charge to the later organiser transfer. No Connect charge fields.
    transfer_group: input.transferGroup,
    // Put the EVENT on the buyer's bank statement, which is what they remember
    // and what the published competition does (Eventbrite "EB *[event title]",
    // Humanitix "Tickets-[first 16 of the event title]"). All three checkout
    // call sites inherit it without changing a line.
    //
    // This is the ONLY route by which the organiser reaches a statement in this
    // architecture. Stripe: "The customer's statement uses the platform
    // account's static component for ... Separate charges and transfers without
    // on_behalf_of" (https://docs.stripe.com/connect/statement-descriptors,
    // fetched 2026-08-09), and this is exactly that charge type. The connected
    // account's own business_profile.name never reaches the buyer.
    ...(descriptorSuffix ? { statement_descriptor_suffix: descriptorSuffix } : {}),
  })

  return {
    intent,
    organiserTransferCents,
    connectedAccountId,
    currency: input.fees.currency.toUpperCase(),
  }
}

/**
 * The event title for the statement descriptor. Best effort by design: a
 * missing title costs the buyer a less specific statement line, and must never
 * cost them their tickets, so any failure returns null and the caller falls
 * back to the organiser name.
 */
async function loadEventTitle(eventId: string | null): Promise<string | null> {
  if (!eventId) return null
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('events')
      .select('title')
      .eq('id', eventId)
      .maybeSingle()
    if (error || !data) return null
    return data.title ?? null
  } catch (error) {
    captureException(error, { where: 'lib/payments/create-platform-charge:148' })
    return null
  }
}

/**
 * The exact columns the charge precondition reads, as one list.
 *
 * It sits beside the type rather than inside the query, so narrowing the select
 * and forgetting the reader is not possible in one edit. `assertOrganiserCanReceiveFunds`
 * reads four of these; `id` and `name` are carried for the caller.
 */
const ORG_CHARGE_FIELDS_SELECT =
  'id, name, stripe_account_id, stripe_payouts_enabled, stripe_account_country, payout_status'

/**
 * The subset the GATE READS, which is what must be verified.
 *
 * NOT the whole select list, and the difference matters: `id` and `name` are
 * carried for the caller (the statement descriptor), and their absence is a
 * cosmetic problem, not a wrong verdict about whether money may move. Requiring
 * them here made the verifier throw on every existing charge fixture, which was
 * the verifier working correctly on a list I had given it wrongly. Verify what
 * the DECISION depends on, nothing more.
 */
const ORG_CHARGE_FIELD_KEYS = [
  'stripe_account_id',
  'stripe_payouts_enabled',
  'stripe_account_country',
  'payout_status',
]

async function loadOrgChargeFields(organisationId: string): Promise<OrgChargeFields> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('organisations')
    .select(ORG_CHARGE_FIELDS_SELECT)
    .eq('id', organisationId)
    .maybeSingle()
  if (error) {
    throw new Error(`Failed to load organisation ${organisationId}: ${error.message}`)
  }
  if (!data) {
    throw new Error(`Organisation ${organisationId} not found`)
  }

  /*
   * VERIFIED, NOT CAST. This used to end `return data as OrgChargeFields`, and a
   * cast is an assertion by the author that nobody checks. Narrow the select by
   * one column and it still compiles, still returns an object, and the missing
   * field arrives `undefined` at a boolean test where BOTH `!undefined` and
   * `undefined !== true` are true, so the precondition refuses and the refusal is
   * indistinguishable from a real one.
   *
   * On the charge path a refusal is not a page state, it is a buyer who has
   * already chosen tickets being turned away, so this throws rather than
   * returning a verdict: the caller is mid-payment and has no better answer to
   * give than "this failed", and a loud failure gets fixed.
   */
  const verdict = verifyRowFields<OrgChargeFields>(data, ORG_CHARGE_FIELD_KEYS, 'charge-precondition')
  if (!verdict.complete) {
    throw new Error(
      `Organisation ${organisationId} loaded without ${verdict.missing.join(', ')}, which the ` +
        `charge precondition reads. Refusing to decide on an incomplete row.`,
    )
  }
  return verdict.row
}
