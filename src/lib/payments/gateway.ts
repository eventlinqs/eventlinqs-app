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

  /**
   * Funds-holding model (docs/PAYMENTS-FUNDS-HOLDING.md): the buyer charge is a
   * PLATFORM charge (separate charges and transfers), so these Connect
   * destination-charge fields are NOT set at checkout. `transfer_group` links
   * the charge to its later platform->organiser transfer for reconciliation.
   */
  transfer_group?: string

  // DEPRECATED (old destination-charge model). Retained so the adapter still
  // compiles and any legacy caller is rejected unless all three are set
  // together. New checkout omits all three -> a platform charge. See the
  // re-platform design doc.
  connected_account_id?: string
  application_fee_cents?: number
  on_behalf_of?: string
}

/**
 * Platform->connected transfer primitives for the funds-holding model. The
 * platform holds the buyer's funds and later moves the organiser's net share
 * with a Transfer (disbursement), or claws it back with a reversal (refund /
 * dispute). Kept separate from PaymentGateway so existing charge call sites and
 * their test doubles are unaffected. StripeAdapter implements both.
 */
export interface CreateTransferParams {
  amount_cents: number
  currency: string
  /** Connected account that receives the funds (organiser). */
  destination_account_id: string
  /** Links the transfer to the buyer charge group for reconciliation. */
  transfer_group?: string
  /**
   * Optional Stripe charge id (Option B). Ties the transfer to a specific
   * charge. Omitted under the Option A launch default (transfer from the
   * platform's available balance after the event). See design doc section 6.2.
   */
  source_transaction?: string
  idempotency_key: string
  metadata?: Record<string, string>
}

export interface TransferResult {
  transfer_id: string
  amount_cents: number
  currency: string
  destination: string
}

export interface ReverseTransferParams {
  transfer_id: string
  /** Partial reversal amount; omit to reverse the full unreversed amount. */
  amount_cents?: number
  idempotency_key: string
  metadata?: Record<string, string>
}

export interface TransferReversalResult {
  reversal_id: string
  amount_cents: number
}

export interface TransferGateway {
  name: string
  createTransfer(params: CreateTransferParams): Promise<TransferResult>
  reverseTransfer(params: ReverseTransferParams): Promise<TransferReversalResult>
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
