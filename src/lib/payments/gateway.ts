// PaymentGateway interface - all gateways implement this
// M3: Stripe only. Future: Paystack, Flutterwave, PayPal plug in here.

export interface CreatePaymentIntentParams {
  amount_cents: number
  currency: string
  metadata: {
    order_id: string
    event_id: string
    organisation_id: string
    buyer_email: string
    // Optional fields for seat reservations - used by webhook to locate and update seats
    reservation_id?: string
    seat_ids?: string
    // Optional fields for squad payments - used by webhook to mark member as paid
    squad_id?: string
    squad_member_id?: string
  }
  customer_email: string
  idempotency_key: string

  // Stripe Connect destination-charge fields (M6 Phase 3). Pass all three
  // together for a destination charge, or omit all three for a platform-only
  // charge. Mixed states are rejected by the adapter.
  connected_account_id?: string
  application_fee_cents?: number
  on_behalf_of?: string
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
