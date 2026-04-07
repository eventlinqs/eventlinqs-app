// PaymentGateway interface — all gateways implement this
// M3: Stripe only. Future: Paystack, Flutterwave, PayPal plug in here.

export interface CreatePaymentIntentParams {
  amount_cents: number
  currency: string
  metadata: {
    order_id: string
    event_id: string
    organisation_id: string
    buyer_email: string
  }
  customer_email: string
  idempotency_key: string
}

export interface PaymentIntentResult {
  gateway_payment_id: string
  client_secret: string
  status: string
}

export interface PaymentGateway {
  name: string

  createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentIntentResult>

  confirmPaymentIntent(gateway_payment_id: string): Promise<{
    status: string
    receipt_url?: string
  }>

  cancelPaymentIntent(gateway_payment_id: string): Promise<void>

  constructWebhookEvent(payload: string | Buffer, signature: string): Promise<unknown>
}
