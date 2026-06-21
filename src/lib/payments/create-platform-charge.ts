import { createAdminClient } from '@/lib/supabase/admin'
import type { Organisation } from '@/types/database'
import {
  ChargePreconditionError,
  assertOrganiserCanReceiveFunds,
  computeOrganiserTransferCents,
  getCurrencyForCountry,
} from './application-fee'
import type { FeeBreakdown } from './payment-calculator'
import type { CreatePaymentIntentParams, PaymentGateway, PaymentIntentResult } from './gateway'

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

  const intent = await input.gateway.createPaymentIntent({
    amount_cents: input.fees.total_cents,
    currency: input.fees.currency,
    customer_email: input.customerEmail,
    idempotency_key: input.idempotencyKey,
    metadata: input.metadata,
    // PLATFORM charge: funds held in the platform balance. transfer_group links
    // this charge to the later organiser transfer. No Connect charge fields.
    transfer_group: input.transferGroup,
  })

  return {
    intent,
    organiserTransferCents,
    connectedAccountId,
    currency: input.fees.currency.toUpperCase(),
  }
}

async function loadOrgChargeFields(organisationId: string): Promise<OrgChargeFields> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('organisations')
    .select(
      'id, stripe_account_id, stripe_payouts_enabled, stripe_account_country, payout_status'
    )
    .eq('id', organisationId)
    .maybeSingle()
  if (error) {
    throw new Error(`Failed to load organisation ${organisationId}: ${error.message}`)
  }
  if (!data) {
    throw new Error(`Organisation ${organisationId} not found`)
  }
  return data as OrgChargeFields
}
