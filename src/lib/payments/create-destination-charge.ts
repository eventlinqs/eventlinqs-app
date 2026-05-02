import { createAdminClient } from '@/lib/supabase/admin'
import type { Organisation } from '@/types/database'
import {
  ChargePreconditionError,
  assertCanCreateDestinationCharge,
  computeApplicationFeeCents,
  getCurrencyForCountry,
} from './application-fee'
import type { FeeBreakdown } from './payment-calculator'
import type { CreatePaymentIntentParams, PaymentGateway, PaymentIntentResult } from './gateway'

type OrgChargeFields = Pick<
  Organisation,
  | 'id'
  | 'stripe_account_id'
  | 'stripe_charges_enabled'
  | 'stripe_account_country'
  | 'payout_status'
>

export interface CreateDestinationChargeInput {
  gateway: PaymentGateway
  organisationId: string
  fees: FeeBreakdown
  metadata: CreatePaymentIntentParams['metadata']
  customerEmail: string
  idempotencyKey: string
}

export interface CreateDestinationChargeResult {
  intent: PaymentIntentResult
  applicationFeeCents: number
  connectedAccountId: string
  currency: string
  organiserShareCents: number
}

/**
 * Loads the organisation, runs Connect pre-conditions, and creates a Stripe
 * destination charge through the supplied PaymentGateway.
 *
 * Throws `ChargePreconditionError` (typed reason on the error) when the
 * organisation is not eligible. Throws plain Error when the org row cannot
 * be loaded or when the currency map disagrees with `fees.currency`.
 */
export async function createDestinationCharge(
  input: CreateDestinationChargeInput
): Promise<CreateDestinationChargeResult> {
  const org = await loadOrgChargeFields(input.organisationId)
  assertCanCreateDestinationCharge(org, input.fees)

  const expectedCurrency = getCurrencyForCountry(org.stripe_account_country)!
  if (input.fees.currency.toUpperCase() !== expectedCurrency) {
    throw new ChargePreconditionError(
      'fee_breakdown_invalid',
      `FeeBreakdown currency "${input.fees.currency}" does not match Connect settlement currency "${expectedCurrency}" for country "${org.stripe_account_country}".`
    )
  }

  const applicationFeeCents = await computeApplicationFeeCents(
    input.fees,
    (org.stripe_account_country ?? 'GLOBAL').toUpperCase(),
    expectedCurrency,
    input.organisationId
  )
  const connectedAccountId = org.stripe_account_id!

  const intent = await input.gateway.createPaymentIntent({
    amount_cents: input.fees.total_cents,
    currency: input.fees.currency,
    customer_email: input.customerEmail,
    idempotency_key: input.idempotencyKey,
    metadata: input.metadata,
    connected_account_id: connectedAccountId,
    application_fee_cents: applicationFeeCents,
    on_behalf_of: connectedAccountId,
  })

  return {
    intent,
    applicationFeeCents,
    connectedAccountId,
    currency: input.fees.currency.toUpperCase(),
    organiserShareCents: input.fees.total_cents - applicationFeeCents,
  }
}

async function loadOrgChargeFields(organisationId: string): Promise<OrgChargeFields> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('organisations')
    .select(
      'id, stripe_account_id, stripe_charges_enabled, stripe_account_country, payout_status'
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
