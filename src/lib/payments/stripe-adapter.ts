import Stripe from 'stripe'
import type {
  PaymentGateway,
  CreatePaymentIntentParams,
  PaymentIntentResult,
} from './gateway'

function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  return new Stripe(key, { apiVersion: '2026-03-25.dahlia' })
}

export class StripeAdapter implements PaymentGateway {
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
    await stripe.paymentIntents.cancel(gateway_payment_id)
  }

  async constructWebhookEvent(payload: string | Buffer, signature: string): Promise<unknown> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is not set')
    const stripe = getStripeClient()
    return stripe.webhooks.constructEvent(payload, signature, webhookSecret)
  }
}
