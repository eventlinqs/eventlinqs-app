# Module 3: Checkout & Payments

**Status:** Not Started
**Depends on:** Module 1 (Foundation), Module 2 (Event Management) — both must be complete
**Priority:** Critical — this is how EventLinqs makes money
**Estimated Sessions:** 4–6 (with Claude Code)

---

## Overview

Module 3 turns EventLinqs from an event listing platform into a revenue-generating ticketing business. This module delivers: the cart and checkout flow, Stripe integration (test mode), the full payment state machine, inventory reservation with cart timer, order management, discount codes, guest checkout, order confirmation with email receipt, and the organiser's order/revenue view.

**What is NOT in this module:**
- Multi-gateway routing (Paystack, Flutterwave, PayPal) — Module 5
- QR ticket generation — Module 6
- Refunds and chargebacks — Module 5
- Organiser payout system — Module 5
- Fraud scoring — Module 5
- Seat map / reserved seating — Module 4

**Architecture principle:** Stripe is the only gateway in M3, but the code is built with a gateway adapter pattern so Paystack/Flutterwave/PayPal plug in later without rewriting checkout logic.

---

## Pre-Module Checklist

Before starting M3, confirm the following:

- [ ] Module 1 complete — auth, profiles, organisations working
- [ ] Module 2 complete — events, ticket tiers, addons, public event pages working
- [ ] Stripe account created (should already exist from initial setup)
- [ ] Stripe test mode API keys available (publishable key + secret key)
- [ ] Stripe webhook endpoint configured in Stripe Dashboard (we'll set this up during the module)
- [ ] Resend account active with verified sending domain (for order confirmation emails)

**Environment variables needed (add to `.env.local`):**

```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## Part 1: Database Schema (SQL — run in Supabase SQL Editor)

> The SQL is provided in a separate combined file: `M3-checkout-payments-sql.sql`
> Copy the entire file contents into Supabase → SQL Editor → New query → Run.

### Tables Created in This Module

| Table | Purpose |
|-------|---------|
| `orders` | Purchase records with payment state machine |
| `order_items` | Individual ticket/addon line items within an order |
| `payments` | Gateway transaction records (Stripe for now) |
| `reservations` | Cart holds with TTL for inventory concurrency |
| `discount_codes` | Promo/discount codes with rules and usage tracking |
| `discount_code_usages` | Tracks which users used which codes |

### Enums Created

| Enum | Values |
|------|--------|
| `order_status` | `pending`, `confirmed`, `partially_refunded`, `refunded`, `cancelled`, `expired` |
| `payment_status` | `initiated`, `processing`, `requires_action`, `completed`, `failed`, `expired`, `cancelled`, `refund_pending`, `refunded`, `refund_failed` |
| `payment_gateway` | `stripe`, `paystack`, `flutterwave`, `paypal` |
| `reservation_status` | `active`, `converted`, `expired`, `cancelled` |
| `discount_type` | `percentage`, `fixed_amount` |
| `fee_pass_type` | `absorb`, `pass_to_buyer` |

---

## Part 2: Gateway Adapter Pattern

### 2.1 Architecture

All payment gateway interactions go through a `PaymentGateway` interface. M3 implements the Stripe adapter only. Future modules plug in additional adapters.

```
src/
  lib/
    payments/
      gateway.ts              # PaymentGateway interface
      stripe-adapter.ts       # Stripe implementation
      gateway-factory.ts      # Returns correct adapter by gateway name
      payment-calculator.ts   # Fee calculation engine
      checkout-service.ts     # Orchestrates the checkout flow
```

### 2.2 PaymentGateway Interface

```typescript
// src/lib/payments/gateway.ts

export interface CreatePaymentIntentParams {
  amount_cents: number          // Total amount in smallest currency unit
  currency: string              // ISO 4217 (aud, usd, gbp, etc.)
  metadata: {
    order_id: string
    event_id: string
    organisation_id: string
    buyer_email: string
  }
  customer_email: string
  idempotency_key: string       // order_id used as idempotency key
}

export interface PaymentIntentResult {
  gateway_payment_id: string    // Stripe's pi_xxx ID
  client_secret: string         // For frontend confirmation
  status: string                // 'requires_payment_method', 'requires_action', etc.
}

export interface PaymentGateway {
  name: string                  // 'stripe', 'paystack', etc.
  
  createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentIntentResult>
  
  confirmPaymentIntent(gateway_payment_id: string): Promise<{
    status: string
    receipt_url?: string
  }>
  
  cancelPaymentIntent(gateway_payment_id: string): Promise<void>
  
  constructWebhookEvent(payload: string | Buffer, signature: string): Promise<unknown>
}
```

### 2.3 Stripe Adapter

Implements `PaymentGateway` using the `stripe` npm package. Key details:

- Uses `stripe.paymentIntents.create()` with `automatic_payment_methods: { enabled: true }` — this enables cards, Apple Pay, Google Pay automatically
- Passes `metadata` for reconciliation
- Uses `idempotency_key` to prevent duplicate charges
- Webhook verification uses `stripe.webhooks.constructEvent()`

### 2.4 Gateway Factory

```typescript
// src/lib/payments/gateway-factory.ts

export function getPaymentGateway(gatewayName: string): PaymentGateway {
  switch (gatewayName) {
    case 'stripe':
      return new StripeAdapter()
    // Future: case 'paystack': return new PaystackAdapter()
    // Future: case 'flutterwave': return new FlutterwaveAdapter()
    default:
      throw new Error(`Unsupported payment gateway: ${gatewayName}`)
  }
}

// For M3, the default gateway is always Stripe
export function getDefaultGateway(): PaymentGateway {
  return getPaymentGateway('stripe')
}
```

---

## Part 3: Fee Calculation Engine

### 3.1 Pricing Rules (Database-Driven)

All fees come from the `pricing_rules` table seeded in the SQL file. **No hardcoded fee values anywhere in the application code.**

The fee calculator:
1. Queries `pricing_rules` for the matching rule (by country, event type, organiser tier)
2. Falls back to GLOBAL default if no specific rule matches
3. Priority: country-specific > event-type-specific > organiser-tier-specific > GLOBAL

### 3.2 Fee Calculation Logic

```typescript
// src/lib/payments/payment-calculator.ts

export interface FeeBreakdown {
  subtotal_cents: number          // Sum of ticket prices × quantities
  addon_total_cents: number       // Sum of addon prices × quantities
  platform_fee_cents: number      // EventLinqs platform fee
  payment_processing_fee_cents: number  // Stripe fee (pass-through)
  tax_cents: number               // GST/VAT if applicable
  discount_cents: number          // Discount code reduction
  total_cents: number             // What the buyer pays
  currency: string
  fee_pass_type: 'absorb' | 'pass_to_buyer'
  breakdown_display: {            // For showing the buyer
    tickets: { name: string; qty: number; unit_price_cents: number; line_total_cents: number }[]
    addons: { name: string; qty: number; unit_price_cents: number; line_total_cents: number }[]
    subtotal: number
    fees: number                  // 0 if absorbed, fee amount if passed to buyer
    discount: number
    tax: number
    total: number
  }
}
```

**Fee calculation rules:**
- Platform fee: percentage + fixed per ticket (from pricing_rules)
- Payment processing: Stripe's fee (2.9% + 30c for AU/international cards) — always pass-through, never marked up by EventLinqs
- If organiser chose `absorb`: fees are deducted from the organiser's revenue, buyer sees ticket price only
- If organiser chose `pass_to_buyer`: fees are added on top, buyer sees ticket price + fees
- Free events: zero fees, no payment processing
- Discount applied before fees are calculated (discount reduces the subtotal)
- Tax (GST for AU): calculated on the subtotal after discount, based on tax_rules table

### 3.3 Organiser Fee Preference

The `events` table (from M2) needs a new column:

```sql
-- Add to events table (included in M3 SQL file)
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS fee_pass_type public.fee_pass_type NOT NULL DEFAULT 'pass_to_buyer';
```

This is set during event creation (add to the event builder form from M2) and can be changed while the event is in draft. Once published with sales, it locks.

---

## Part 4: Inventory Reservation System

### 4.1 How Cart Reservations Work

When a buyer selects tickets and clicks "Checkout":
1. Server checks `ticket_tiers.total_capacity - ticket_tiers.sold_count - (active reservations)` for availability
2. If available, creates a `reservation` row with `expires_at = NOW() + 10 minutes`
3. Increments `ticket_tiers.reserved_count` by the quantity
4. Returns a reservation ID and the cart timer countdown
5. Buyer has 10 minutes to complete payment
6. On payment success → reservation status = `converted`, `sold_count` incremented, `reserved_count` decremented
7. On expiry → reservation status = `expired`, `reserved_count` decremented

### 4.2 Concurrency Handling

Use PostgreSQL `SELECT ... FOR UPDATE` on the `ticket_tiers` row when creating reservations to prevent overselling. The reservation creation is wrapped in a database function:

```sql
-- Included in the SQL file
CREATE OR REPLACE FUNCTION public.create_reservation(...)
```

This function:
- Locks the ticket_tier row
- Checks real availability (capacity - sold - reserved)
- Creates the reservation
- Updates reserved_count
- Returns success or failure
- All within a single transaction

### 4.3 Reservation Cleanup

A Supabase cron job (pg_cron) runs every minute to expire stale reservations:

```sql
-- Included in SQL file
SELECT cron.schedule(
  'expire-stale-reservations',
  '* * * * *',
  $$SELECT public.expire_stale_reservations()$$
);
```

The `expire_stale_reservations()` function:
- Finds all reservations WHERE `status = 'active' AND expires_at < NOW()`
- Sets status to `expired`
- Decrements `reserved_count` on the associated ticket_tier
- Cancels the associated Stripe PaymentIntent if one exists

### 4.4 Cart Timer UI

The checkout page shows a countdown timer (MM:SS) synced to `reservation.expires_at`. When the timer reaches 0:
- Display "Your reservation has expired"
- Offer a "Try Again" button that returns them to the event page
- Do NOT auto-retry — the tickets may have sold to someone else

---

## Part 5: Checkout Flow

### 5.1 User Journey

```
Event Detail Page
  → "Get Tickets" button
  → Ticket Selection (quantity picker per tier + addons)
  → "Checkout" button
  → [Reservation created, timer starts]
  → Checkout Page:
      - Order summary (tickets, addons, fees, total)
      - Discount code input
      - Attendee details (name, email per ticket — or bulk fill)
      - Payment form (Stripe Elements)
      - "Pay $XX.XX" button
  → [Payment processing]
  → Order Confirmation Page
  → [Email receipt sent via Resend]
```

### 5.2 Ticket Selection Component

Located on the event detail page (below event info). Shows:
- Each visible, active ticket tier with name, description, price
- Quantity picker (respects `min_per_order` and `max_per_order` from ticket_tiers)
- Available addons with quantity pickers
- Running subtotal
- "Checkout" button (disabled if nothing selected)

**For free events with only free tiers:** Skip payment entirely. Clicking "Register" creates the order directly with status `confirmed` and payment status `completed` (no Stripe involvement).

### 5.3 Checkout Page

Route: `/checkout/[reservation_id]`

This is a single page with sections (not a multi-step wizard — keep it fast):

**Section 1: Order Summary**
- Event name, date, venue
- Line items (tier name × qty × price)
- Addon items
- Subtotal
- Platform fees (if passed to buyer)
- Discount (if code applied)
- Tax (if applicable)
- Total
- Cart timer countdown

**Section 2: Discount Code**
- Text input + "Apply" button
- Server-side validation:
  - Code exists and is active
  - Code hasn't expired
  - Code hasn't exceeded max_uses
  - Code is valid for this event (or global)
  - User hasn't already used this code (if single_use_per_user = true)
  - Minimum order value met
- On valid: recalculate totals and show discount line
- On invalid: show specific error message

**Section 3: Attendee Details**
- For each ticket: first name, last name, email
- "Use my details for all tickets" toggle (pre-fills from logged-in user profile)
- For guest checkout: collect buyer email + name (no account required)

**Section 4: Payment**
- Stripe Elements `PaymentElement` (handles cards, Apple Pay, Google Pay, etc.)
- Shows total amount and currency
- "Pay" button
- On click:
  1. Validate all attendee fields
  2. Call server action to create the order + payment records + Stripe PaymentIntent
  3. Use `stripe.confirmPayment()` on the client with the client_secret
  4. Handle 3DS/redirects via Stripe's built-in flow
  5. On success → redirect to `/orders/[order_id]/confirmation`

### 5.4 Guest Checkout

- No login required to purchase tickets
- Buyer provides email and name during checkout
- Order is linked to the email, not a user_id
- If a user later creates an account with that email, their past orders are associated via a background migration (not in M3 — future module)
- Guest orders still receive email confirmations

### 5.5 Authentication-Aware Checkout

- If logged in: pre-fill name/email from profile, order linked to user_id
- If not logged in: show "Log in for a faster checkout" link at top, but don't require it
- The `orders.user_id` column is nullable for guest orders
- The `orders.guest_email` column captures the email for guest orders

---

## Part 6: Order Processing

### 6.1 Server-Side Checkout Action

```typescript
// src/app/actions/checkout.ts — server action

export async function processCheckout(data: CheckoutFormData): Promise<CheckoutResult>
```

This action:
1. Validates the reservation is still active and not expired
2. Validates all attendee details
3. Validates discount code (if provided)
4. Calculates fees using `PaymentCalculator`
5. Creates the `order` record (status: `pending`)
6. Creates `order_items` records for each ticket and addon
7. Creates the `payment` record (status: `initiated`)
8. Creates a Stripe PaymentIntent via the gateway adapter
9. Saves the `gateway_payment_id` and `client_secret` to the payment record
10. Returns the `client_secret` to the frontend for Stripe Elements confirmation

**Idempotency:** The `order_id` is used as the Stripe idempotency key. If the user double-clicks, Stripe returns the same PaymentIntent.

### 6.2 Payment State Machine

Every payment follows the state machine from Scope v5 Section 2.4.3. State transitions are enforced by a database function:

```sql
-- In the SQL file
CREATE OR REPLACE FUNCTION public.transition_payment_status(
  p_payment_id UUID,
  p_new_status payment_status,
  p_gateway_data JSONB DEFAULT NULL
) RETURNS BOOLEAN
```

Valid transitions:

| Current State | → Valid Next States |
|--------------|---------------------|
| `initiated` | `processing`, `expired`, `cancelled` |
| `processing` | `completed`, `failed`, `requires_action` |
| `requires_action` | `completed`, `failed`, `expired` |
| `completed` | `refund_pending` |
| `failed` | `initiated` (retry) |
| `expired` | (terminal) |
| `cancelled` | (terminal) |
| `refund_pending` | `refunded`, `refund_failed` |
| `refunded` | (terminal) |
| `refund_failed` | `refund_pending` (retry) |

Any invalid transition throws an error and is logged.

### 6.3 Webhook Handler

Route: `/api/webhooks/stripe` (Next.js API route, NOT a server action)

Handles these Stripe events:

| Stripe Event | Action |
|-------------|--------|
| `payment_intent.succeeded` | Transition payment → `completed`, order → `confirmed`, reservation → `converted`, increment `sold_count`, decrement `reserved_count`, send confirmation email |
| `payment_intent.payment_failed` | Transition payment → `failed`, log failure reason |
| `payment_intent.requires_action` | Transition payment → `requires_action` |
| `payment_intent.canceled` | Transition payment → `cancelled`, release reservation |
| `payment_intent.expired` | Transition payment → `expired`, release reservation |

**Webhook security:**
- Verify signature using `stripe.webhooks.constructEvent()`
- Reject if signature invalid
- Process idempotently (check if payment already in target state before transitioning)
- Return 200 immediately, process asynchronously if needed
- Log all webhook events for debugging

### 6.4 Order Confirmation

On successful payment:
1. Order status → `confirmed`
2. Payment status → `completed`
3. Reservation → `converted`
4. Ticket tier `sold_count` incremented
5. Ticket tier `reserved_count` decremented
6. Redirect buyer to `/orders/[order_id]/confirmation`
7. Send confirmation email via Resend

### 6.5 Order Confirmation Page

Route: `/orders/[order_id]/confirmation`

Shows:
- "Order Confirmed" with checkmark
- Order number (formatted: `EL-XXXXXXXX` — 8 character alphanumeric)
- Event name, date, venue
- Tickets purchased (tier names and quantities)
- Addons purchased
- Total paid
- "Your tickets will be available in your account" message (actual QR tickets come in Module 6)
- "Add to Calendar" button (generates .ics file)
- "Share Event" button
- "Browse More Events" link
- If guest: "Create an account to manage your tickets" prompt

### 6.6 Order Confirmation Email

Sent via Resend immediately after payment confirmation. Contains:
- Order number
- Event name, date, time, venue
- Tickets purchased
- Amount paid
- "View Your Order" button (links to the order page)
- EventLinqs branding

Template: create a React email template at `src/emails/order-confirmation.tsx` using `@react-email/components`.

---

## Part 7: Organiser Order View

### 7.1 Organiser Dashboard — Orders Tab

Add to the existing organiser dashboard (from M2):

Route: `/dashboard/events/[event_id]/orders`

Shows:
- Summary stats at top: total orders, total revenue, tickets sold, tickets remaining
- Orders table with columns: Order #, Buyer Name, Email, Tickets, Amount, Status, Date
- Filter by status (confirmed, cancelled, refunded)
- Search by buyer name or email
- Click order → order detail view

### 7.2 Order Detail (Organiser View)

Route: `/dashboard/events/[event_id]/orders/[order_id]`

Shows:
- Order number and status
- Buyer details (name, email)
- Line items with prices
- Fee breakdown (platform fee, processing fee — organiser sees what they earn)
- Payment details (gateway, transaction ID, payment method)
- Attendee list (names and emails for each ticket)
- Timeline of status changes

### 7.3 Revenue Summary

On the event management page, add a revenue card showing:
- Gross sales (total ticket revenue)
- Platform fees (what EventLinqs takes)
- Processing fees (what Stripe takes)
- Net revenue (what the organiser receives)
- Note: "Payouts are processed after the event" (payout system comes in Module 5)

---

## Part 8: Discount Codes (Organiser Feature)

### 8.1 Discount Code Management

Route: `/dashboard/events/[event_id]/discounts`

Organiser can:
- Create discount codes for their events
- Set code type: percentage off or fixed amount off
- Set maximum uses (total) and per-user limit
- Set valid date range (start/end)
- Restrict to specific ticket tiers (or all tiers)
- Set minimum order value
- Activate/deactivate codes
- View usage stats (times used, revenue impact)

### 8.2 Discount Code Form Fields

| Field | Type | Rules |
|-------|------|-------|
| `code` | Text | Uppercase, alphanumeric + hyphens, unique per event, 3–20 chars |
| `discount_type` | Select | `percentage` or `fixed_amount` |
| `discount_value` | Number | For percentage: 1–100. For fixed: minimum 1 cent |
| `currency` | Text | Required for fixed_amount type, matches event currency |
| `max_uses` | Number | Null = unlimited |
| `max_uses_per_user` | Number | Default 1 |
| `min_order_amount_cents` | Number | Null = no minimum |
| `valid_from` | DateTime | Null = immediately active |
| `valid_until` | DateTime | Null = no expiry |
| `applicable_tier_ids` | UUID[] | Null = applies to all tiers |
| `is_active` | Boolean | Default true |

### 8.3 Code Validation Logic

Server-side validation (never trust the client):

```typescript
async function validateDiscountCode(
  code: string,
  event_id: string,
  user_id: string | null,
  order_subtotal_cents: number,
  tier_ids: string[]
): Promise<{ valid: boolean; discount_cents: number; error?: string }>
```

Checks in order:
1. Code exists → "Invalid discount code"
2. Code is active → "This code is no longer active"
3. Code belongs to this event → "This code is not valid for this event"
4. Current time within valid_from/valid_until → "This code has expired"
5. Usage count < max_uses → "This code has reached its usage limit"
6. User usage < max_uses_per_user → "You've already used this code"
7. Order subtotal >= min_order_amount → "Minimum order of $X required for this code"
8. At least one selected tier is in applicable_tier_ids → "This code doesn't apply to your selected tickets"
9. Calculate discount amount (cap percentage discount at subtotal to prevent negative totals)

---

## Part 9: TypeScript Types

Add to `src/types/database.ts`:

```typescript
// Order types
export type OrderStatus = 'pending' | 'confirmed' | 'partially_refunded' | 'refunded' | 'cancelled' | 'expired'

export type PaymentStatus = 'initiated' | 'processing' | 'requires_action' | 'completed' | 'failed' | 'expired' | 'cancelled' | 'refund_pending' | 'refunded' | 'refund_failed'

export type PaymentGatewayType = 'stripe' | 'paystack' | 'flutterwave' | 'paypal'

export type ReservationStatus = 'active' | 'converted' | 'expired' | 'cancelled'

export type DiscountType = 'percentage' | 'fixed_amount'

export type FeePassType = 'absorb' | 'pass_to_buyer'

export interface Order {
  id: string
  order_number: string
  event_id: string
  organisation_id: string
  user_id: string | null
  guest_email: string | null
  guest_name: string | null
  status: OrderStatus
  subtotal_cents: number
  addon_total_cents: number
  platform_fee_cents: number
  processing_fee_cents: number
  tax_cents: number
  discount_cents: number
  total_cents: number
  currency: string
  fee_pass_type: FeePassType
  discount_code_id: string | null
  reservation_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  confirmed_at: string | null
  cancelled_at: string | null
  expires_at: string | null
}

export interface OrderItem {
  id: string
  order_id: string
  ticket_tier_id: string | null
  addon_id: string | null
  item_type: 'ticket' | 'addon'
  item_name: string
  quantity: number
  unit_price_cents: number
  total_cents: number
  attendee_first_name: string | null
  attendee_last_name: string | null
  attendee_email: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface Payment {
  id: string
  order_id: string
  gateway: PaymentGatewayType
  gateway_payment_id: string | null
  status: PaymentStatus
  amount_cents: number
  currency: string
  client_secret: string | null
  receipt_url: string | null
  failure_reason: string | null
  gateway_response: Record<string, unknown>
  idempotency_key: string
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface Reservation {
  id: string
  event_id: string
  user_id: string | null
  session_id: string | null
  status: ReservationStatus
  items: ReservationItem[]
  expires_at: string
  created_at: string
  converted_at: string | null
}

export interface ReservationItem {
  ticket_tier_id: string
  quantity: number
  addon_id?: string
}

export interface DiscountCode {
  id: string
  event_id: string
  organisation_id: string
  code: string
  discount_type: DiscountType
  discount_value: number
  currency: string | null
  max_uses: number | null
  max_uses_per_user: number
  current_uses: number
  min_order_amount_cents: number | null
  applicable_tier_ids: string[] | null
  valid_from: string | null
  valid_until: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}
```

---

## Part 10: File Structure

After M3 is complete, the following files should exist:

```
src/
  lib/
    payments/
      gateway.ts                    # PaymentGateway interface
      stripe-adapter.ts             # Stripe implementation
      gateway-factory.ts            # Gateway factory
      payment-calculator.ts         # Fee calculation engine
      checkout-service.ts           # Checkout orchestration
  
  app/
    api/
      webhooks/
        stripe/
          route.ts                  # Stripe webhook handler
    
    (public)/
      events/
        [slug]/
          page.tsx                  # Event detail (add ticket selection)
    
    checkout/
      [reservation_id]/
        page.tsx                    # Checkout page
        checkout-form.tsx           # Client component with Stripe Elements
    
    orders/
      [order_id]/
        confirmation/
          page.tsx                  # Order confirmation page
    
    (dashboard)/
      dashboard/
        events/
          [eventId]/
            orders/
              page.tsx              # Organiser orders list
              [orderId]/
                page.tsx            # Organiser order detail
            discounts/
              page.tsx              # Discount code management
  
  actions/
    checkout.ts                     # processCheckout server action
    reservations.ts                 # createReservation server action
    discount-codes.ts               # CRUD for discount codes
  
  emails/
    order-confirmation.tsx          # React Email template
  
  components/
    checkout/
      ticket-selector.tsx           # Ticket quantity picker
      checkout-summary.tsx          # Order summary display
      discount-code-input.tsx       # Discount code form
      attendee-form.tsx             # Attendee details form
      payment-form.tsx              # Stripe Elements wrapper
      cart-timer.tsx                # Countdown timer
    
    orders/
      order-table.tsx               # Organiser orders table
      revenue-summary.tsx           # Revenue stats card
```

---

## Completion Checklist

When Module 3 is complete, every item below must be true:

- [ ] Orders, order_items, payments, reservations, discount_codes tables created in Supabase
- [ ] Pricing rules seeded (GLOBAL defaults + AU/GB/US/NG/GH/KE/ZA market rules)
- [ ] Tax rules seeded (AU GST 10%)
- [ ] PaymentGateway interface defined with Stripe adapter
- [ ] Gateway factory returns Stripe adapter
- [ ] Fee calculator reads pricing_rules from database (no hardcoded fees)
- [ ] Fee calculator handles both absorb and pass_to_buyer modes
- [ ] Ticket selection component on event detail page
- [ ] Reservation created on "Checkout" with 10-minute TTL
- [ ] Concurrency-safe reservation (SELECT FOR UPDATE)
- [ ] Cart timer countdown displays on checkout page
- [ ] Expired reservations release inventory (cron job)
- [ ] Checkout page shows order summary with fee breakdown
- [ ] Discount code input validates and recalculates totals
- [ ] Attendee details form with "use my details" toggle
- [ ] Guest checkout works (no login required)
- [ ] Stripe Elements PaymentElement renders
- [ ] Payment creates Stripe PaymentIntent with idempotency key
- [ ] Payment state machine enforces valid transitions only
- [ ] 3DS/SCA handled via Stripe's built-in flow
- [ ] Webhook handler processes payment_intent.succeeded
- [ ] Webhook handler processes payment_intent.payment_failed
- [ ] On success: order confirmed, reservation converted, sold_count incremented
- [ ] Order confirmation page shows order details
- [ ] Confirmation email sent via Resend
- [ ] Free events skip payment flow entirely
- [ ] Organiser dashboard shows orders tab with table
- [ ] Organiser order detail shows full breakdown
- [ ] Revenue summary card shows gross/fees/net
- [ ] Discount code CRUD for organisers
- [ ] Order number generated as `EL-XXXXXXXX` format
- [ ] `npm run build` passes with zero errors

---

## How To Execute This Module

### Step 1: Install Dependencies

In PowerShell (not inside Claude Code):

```powershell
cd ~\OneDrive\Desktop\EventLinqs\eventlinqs-app
npm install stripe @stripe/stripe-js @stripe/react-stripe-js @react-email/components resend
```

### Step 2: Set Environment Variables

Add to `.env.local`:

```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...  (set this after Step 4)
RESEND_API_KEY=re_...
```

### Step 3: Run the SQL

Download `M3-checkout-payments-sql.sql`. Open Supabase → SQL Editor → New query → paste the entire file → Run.

### Step 4: Set Up Stripe Webhook

In Stripe Dashboard (test mode):
1. Go to Developers → Webhooks → Add endpoint
2. URL: `https://your-vercel-url.vercel.app/api/webhooks/stripe`
3. Events to listen for: `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.requires_action`, `payment_intent.canceled`
4. Copy the webhook signing secret → add to `.env.local` as `STRIPE_WEBHOOK_SECRET`

**For local development:** Use the Stripe CLI to forward webhooks:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

This gives you a local webhook secret (starts with `whsec_`).

### Step 5: Open Claude Code

```powershell
cd ~\OneDrive\Desktop\EventLinqs\eventlinqs-app
claude
```

### Step 6: Give Claude Code the Command

```
Read docs/modules/M3-checkout-payments.md and build everything in Parts 2 through 10. The database SQL has already been run manually in Supabase. Dependencies have been installed. Start with Part 2 (gateway adapter pattern) and work through each part in order. Use server actions for all mutations. Use Stripe Elements PaymentElement for the payment form. Build the checkout as a single page, not a multi-step wizard.
```

### Step 7: Test

After Claude Code finishes:

1. `npm run dev`
2. Go to a published event with paid ticket tiers
3. Select tickets → click Checkout
4. Verify reservation is created, timer starts
5. Fill attendee details
6. Use Stripe test card: `4242 4242 4242 4242`, any future expiry, any CVC
7. Complete payment
8. Verify order confirmation page shows
9. Check email for confirmation
10. Check organiser dashboard → event → orders tab
11. Test discount code creation and application
12. Test guest checkout (log out first)
13. Test timer expiry (wait 10 minutes or adjust TTL temporarily)
14. Test with 3DS card: `4000 0027 6000 3184`

### Step 8: Commit

In PowerShell (after exiting Claude Code with `/exit`):

```powershell
git add .
git commit -m "M3: Checkout & Payments — Stripe integration, cart reservations, order management"
git push
```

---

## What Comes After Module 3

**Module 4: Ticketing Engine & Inventory** — seat maps, reserved seating, dynamic pricing, squad booking, waitlist, advanced inventory management. This is where the ticketing system gets sophisticated.

**Module 5 look-ahead:** Module 5 adds multi-gateway routing (Paystack, Flutterwave, PayPal), refunds, chargebacks, organiser payouts, and fraud scoring. **Action item for Lawal: start your Paystack business verification application during M4 so it's approved by the time we reach M5.**
