import Stripe from 'stripe'
import type {
  PaymentGateway,
  CreatePaymentIntentParams,
  PaymentIntentResult,
  TransferGateway,
  CreateTransferParams,
  TransferResult,
  ReverseTransferParams,
  TransferReversalResult,
} from './gateway'

function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  return new Stripe(key, { apiVersion: '2026-03-25.dahlia' })
}

export class StripeAdapter implements PaymentGateway, TransferGateway {
  name = 'stripe'

  async createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentIntentResult> {
    const stripe = getStripeClient()

    const connectFieldsPresent = [
      params.connected_account_id,
      params.application_fee_cents,
      params.on_behalf_of,
    ].filter((v) => v !== undefined && v !== null).length

    if (connectFieldsPresent !== 0 && connectFieldsPresent !== 3) {
      throw new Error(
        'Destination charge requires all of connected_account_id, application_fee_cents, on_behalf_of to be set together (or all omitted).'
      )
    }

    const isDestinationCharge = connectFieldsPresent === 3
    if (isDestinationCharge) {
      if (params.application_fee_cents! <= 0) {
        throw new Error('application_fee_cents must be positive for a destination charge.')
      }
      if (params.application_fee_cents! >= params.amount_cents) {
        throw new Error(
          'application_fee_cents must be less than amount_cents; destination would receive zero or negative.'
        )
      }
    }

    const createParams = {
      amount: params.amount_cents,
      currency: params.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      receipt_email: params.customer_email,
      metadata: params.metadata,
      // Funds-holding model: the platform is the merchant of record on this
      // charge. transfer_group links it to the later organiser transfer.
      ...(params.transfer_group ? { transfer_group: params.transfer_group } : {}),
      ...(isDestinationCharge
        ? {
            application_fee_amount: params.application_fee_cents!,
            on_behalf_of: params.on_behalf_of!,
            transfer_data: { destination: params.connected_account_id! },
          }
        : {}),
    } satisfies Stripe.PaymentIntentCreateParams

    const intent = await stripe.paymentIntents.create(createParams, {
      idempotencyKey: params.idempotency_key,
    })

    if (!intent.client_secret) {
      throw new Error('Stripe did not return a client_secret')
    }

    return {
      gateway_payment_id: intent.id,
      client_secret: intent.client_secret,
      status: intent.status,
    }
  }

  async confirmPaymentIntent(gateway_payment_id: string): Promise<{ status: string; receipt_url?: string }> {
    const stripe = getStripeClient()
    const intent = await stripe.paymentIntents.retrieve(gateway_payment_id, {
      expand: ['latest_charge'],
    })
    const charge = intent.latest_charge as Stripe.Charge | null | undefined
    return {
      status: intent.status,
      receipt_url: (typeof charge === 'object' && charge?.receipt_url) ? charge.receipt_url : undefined,
    }
  }

  async cancelPaymentIntent(gateway_payment_id: string): Promise<void> {
    const stripe = getStripeClient()
    // P2-9: deterministic idempotency key. Cancelling an already-cancelled
    // intent throws; under the retry-on-failure webhook regime a cancel can
    // be re-attempted. With a stable key Stripe replays the original cancel
    // response instead of erroring, making cancel a safe no-op on retry,
    // consistent with the keyed refunds.create and paymentIntents.create.
    await stripe.paymentIntents.cancel(gateway_payment_id, undefined, {
      idempotencyKey: `cancel:${gateway_payment_id}`,
    })
  }

  async constructWebhookEvent(payload: string | Buffer, signature: string): Promise<unknown> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is not set')
    const stripe = getStripeClient()
    return stripe.webhooks.constructEvent(payload, signature, webhookSecret)
  }

  // ── TransferGateway: platform -> connected organiser (funds-holding model) ──

  async createTransfer(params: CreateTransferParams): Promise<TransferResult> {
    if (!Number.isInteger(params.amount_cents) || params.amount_cents <= 0) {
      throw new Error(`createTransfer amount_cents must be a positive integer (got ${params.amount_cents})`)
    }
    if (!params.destination_account_id) {
      throw new Error('createTransfer destination_account_id is required')
    }
    const stripe = getStripeClient()
    const transfer = await stripe.transfers.create(
      {
        amount: params.amount_cents,
        currency: params.currency.toLowerCase(),
        destination: params.destination_account_id,
        ...(params.transfer_group ? { transfer_group: params.transfer_group } : {}),
        ...(params.source_transaction ? { source_transaction: params.source_transaction } : {}),
        ...(params.metadata ? { metadata: params.metadata } : {}),
      },
      { idempotencyKey: params.idempotency_key }
    )
    return {
      transfer_id: transfer.id,
      amount_cents: transfer.amount,
      currency: transfer.currency.toUpperCase(),
      destination:
        typeof transfer.destination === 'string'
          ? transfer.destination
          : transfer.destination?.id ?? params.destination_account_id,
    }
  }

  async reverseTransfer(params: ReverseTransferParams): Promise<TransferReversalResult> {
    if (!params.transfer_id) {
      throw new Error('reverseTransfer transfer_id is required')
    }
    if (params.amount_cents !== undefined && (!Number.isInteger(params.amount_cents) || params.amount_cents <= 0)) {
      throw new Error(`reverseTransfer amount_cents must be a positive integer when set (got ${params.amount_cents})`)
    }
    const stripe = getStripeClient()
    const reversal = await stripe.transfers.createReversal(
      params.transfer_id,
      {
        ...(params.amount_cents !== undefined ? { amount: params.amount_cents } : {}),
        ...(params.metadata ? { metadata: params.metadata } : {}),
      },
      { idempotencyKey: params.idempotency_key }
    )
    return { reversal_id: reversal.id, amount_cents: reversal.amount }
  }
}
