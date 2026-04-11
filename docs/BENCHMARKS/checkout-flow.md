# Benchmark: Checkout Flow

## Overview

Checkout is where revenue is made or lost. Every additional step, every required account creation, every hidden fee revealed at the end — each one costs conversion. Eventbrite and Ticketmaster have different philosophies, and both have weaknesses. EventLinqs must take the best of each and fix the failures.

---

## Eventbrite Checkout Flow

### Structure

Eventbrite uses a **3-step checkout** for most events:

**Step 1 — Ticket Selection**
- Event listing page has a right-rail "Get Tickets" widget (desktop) or bottom-fixed "Get Tickets" button (mobile)
- Widget shows all available ticket tiers with name, price, description, availability indicator
- Quantity selector per tier (dropdown or +/- stepper)
- Max per order enforced with inline message: "Maximum 8 tickets per order"
- Discount code field (optional, shown in collapsed accordion "Have a promo code?")
- Order summary subtotal updates in real-time as quantities change
- "Get Tickets" button advances to checkout

**Step 2 — Registration / Info**
- Attendee information collection: First name, Last name, Email (required for all)
- Per-ticket questions (if organiser configured them): e.g., "Dietary requirements", "T-shirt size"
- If user is logged in: fields pre-filled, step is minimal
- If user is not logged in: two options:
  - "Log in or create account" (Eventbrite account)
  - "Continue as guest" (email only — most attendees use this)
- Guest checkout does NOT require password creation — just email
- Form auto-advances to Step 3 when all required fields are complete and user clicks Next

**Step 3 — Payment**
- Order summary shown at top (mobile) or right rail (desktop) — sticky, always visible
- Subtotal, Platform fee (clearly labeled "Eventbrite fee"), Total
- Payment options:
  - Credit/debit card (Stripe-powered form embedded)
  - PayPal (redirect)
  - Apple Pay (if on Safari iOS/macOS with card on file)
  - Google Pay (if on Chrome Android)
- Card form: Card number, Expiry, CVV, Name on card, Billing postcode (US/UK)
- "Save card for future purchases" checkbox (if logged in)
- Terms of service agreement: checkbox or "By clicking Place Order you agree to our Terms..."
- "Place Order" CTA — large, high-contrast button
- Order processing state: button becomes "Processing..." with spinner, disabled

### Fee Disclosure

Eventbrite shows fees in **Step 3** only — not during ticket selection. This is a known UX failure:
- Buyer selects $20 ticket, sees $20 in Step 1
- In Step 3: Subtotal $20.00, Eventbrite fee $2.19, Total $22.19
- This is a dark pattern called "drip pricing" — illegal in some jurisdictions (UK, Australia)
- Users often feel deceived and abandon at this step

**EventLinqs must show all-in pricing from the first click — this is a core platform commitment.**

---

## Ticketmaster Checkout Flow

### Structure

Ticketmaster uses a **2-step modal checkout** for most events (seat selection is separate):

**Pre-checkout: Seat/Ticket Selection**
- Full seat map interaction (covered in seat-selection.md)
- Ticket quantity selection for GA events
- Reservation timer begins immediately when seats are selected

**Step 1 — Review & Confirm**
- Modal slides up (mobile) or centered modal (desktop)
- Shows: selected seats, ticket type, base price, service fees, order processing fee (typically $2.50–$5.00 flat), facility fee, total
- ALL fees shown at once — Ticketmaster has moved to fee-inclusive pricing display in many markets after regulatory pressure
- Delivery options: Mobile ticket (default), Print at home (sometimes extra $)
- Insurance upsell (Event Ticket Protector) — opt-in, clearly labeled, not a default
- Guest checkout available: "Continue as Guest" alongside "Sign In"
- Logged-in users: name, email pre-filled; payment method from account auto-selected

**Step 2 — Payment**
- Payment methods: Saved card (if signed in), New card, Apple Pay, Google Pay, Klarna (buy-now-pay-later for larger orders)
- CVC re-entry required for saved cards (security)
- Billing address fields (full address, not just postcode)
- CAPTCHA on guest checkout
- "Purchase" button — green, prominent
- Timeout reminder: "Your seats expire in 3:22" shown in modal header

### Guest Checkout Friction

Ticketmaster heavily nudges account creation:
- Default landing state has sign-in form pre-loaded
- "Continue as Guest" is smaller, below the fold on mobile
- After guest checkout, aggressive post-purchase account creation prompt: "Save your tickets to your Ticketmaster account — enter a password to complete your account"
- This is intentional friction — Ticketmaster wants accounts for data collection

**EventLinqs must make guest checkout the primary, equally prominent path.**

---

## Mobile Checkout Differences

### Eventbrite Mobile
- Ticket widget becomes full-screen on mobile tap of "Get Tickets"
- Step indicator shows "Step 2 of 3" at top
- Order summary collapsed into accordion at top: "Order Summary (2 tickets) $42.19 ▼"
- Keyboard-aware form: page scrolls above keyboard on iOS
- "Place Order" button fixed to bottom of screen — always reachable
- Back button in top-left returns to previous step

### Ticketmaster Mobile
- Checkout modal is a bottom sheet that slides up to 90% screen height
- Swipe-down to dismiss (risky — easy accidental dismissal)
- Timer shown in sticky header of bottom sheet
- Order summary always visible at top of bottom sheet (not collapsible)
- Payment form causes keyboard to push content — some fields get obscured on older iOS
- Apple Pay presented as prominent button above the card form: "Buy with Apple Pay" (black, full width)

---

## Payment Methods — 2026 Standards

A competitive checkout must offer (in priority order based on conversion data):

1. **Card** (Visa, Mastercard, Amex) — baseline, always required
2. **Apple Pay** — highest conversion on iOS, single tap
3. **Google Pay** — highest conversion on Android, single tap
4. **PayPal** — trust signal, older demographics, international
5. **Klarna / Afterpay** — BNPL for orders over $50; reduces abandonment on premium tickets
6. **Stripe Link** — saved payment across Stripe merchants; autofills returning users
7. **Bank redirect (iDEAL, SEPA for EU; PayID/Osko for AUS)** — regional methods

**Apple Pay / Google Pay button placement (critical):**
- Must appear ABOVE the card form, not below
- Full-width button, minimum height 44px
- "Or pay with card" divider below these buttons
- On iOS Safari: Apple Pay only (no Google Pay shown)
- On Android Chrome: Google Pay only (no Apple Pay shown)
- On desktop: show both if respective browser-wallet is configured, otherwise show Stripe Link

---

## Order Summary Placement

| Context | Correct Pattern |
|---------|----------------|
| Desktop checkout | Right rail, sticky (always visible while scrolling) |
| Mobile checkout Step 1 | Top of page, expanded |
| Mobile checkout Step 2 (payment) | Collapsed accordion at top: "2 × Standard Ticket $38.00 ▼" — expands on tap |
| Confirmation | Full breakdown, non-collapsible |

**Never hide the order summary.** The user must always see what they're buying and what it costs.

---

## Error Recovery Patterns

### Payment Declined
- Ticketmaster: red banner "Your payment was declined. Please check your card details or try another payment method." — seats remain held for 2 additional minutes
- Eventbrite: inline error under card field "Card declined — please try another card"
- EventLinqs target: inline error on relevant field (wrong CVV = error on CVV field, not generic), card-level errors as banner, always with explicit next action

### Session Expired Mid-Checkout
- Ticketmaster: "Your session has expired. Please select your tickets again." — full restart required
- EventLinqs target: preserve cart in session storage. If session expires, show "Your cart was saved — sign in to continue or continue as guest." Recover gracefully.

### Network Failure During Payment
- Do not show "Something went wrong." Show: "We couldn't process your payment — your card was not charged. Please try again."
- If idempotency key is implemented (it must be), it is safe to retry — tell the user this explicitly.

### Sold Out Between Selection and Payment
- Ticketmaster: "Sorry, these tickets are no longer available." Full restart.
- EventLinqs target: "These tickets were sold while you were checking out. [Join Waitlist] or [Find Similar Events]" — never a dead end.

---

## Abandoned Cart Recovery

Eventbrite (logged-in users):
- Sends email 1 hour after abandonment: "You left tickets behind — your cart for [Event Name] is still waiting"
- Email contains event image, ticket count, total, direct "Complete Purchase" link
- Deeplinks to pre-filled checkout with session restored

Ticketmaster:
- No cart recovery email — seats released after timeout
- Does send "An event you saved is going on sale" reminders (from wishlist/follow feature)

**EventLinqs target:**
- For logged-in users: cart recovery email at 30 minutes
- For guests who entered email in Step 2: cart recovery email at 30 minutes
- For anonymous users: browser storage persists cart for 24 hours, reminder on next visit

---

## Checkout Performance Targets

| Metric | Eventbrite | Ticketmaster | EventLinqs Target |
|--------|-----------|-------------|-------------------|
| Steps to complete | 3 | 2 (after seat selection) | 2 (combined review + pay) |
| Time to checkout from event page | ~45 seconds | ~60 seconds | Under 30 seconds |
| Guest checkout available | Yes | Yes (buried) | Yes, prominently |
| Fee transparency | Step 3 only (failure) | Step 1 (all-in) | From ticket selection |
| Apple Pay support | Yes | Yes | Yes, primary CTA |
| Google Pay support | Yes | Yes | Yes, primary CTA |
| BNPL (Klarna/Afterpay) | No | Klarna on select events | Yes for orders >$50 |
| Mobile bottom-fixed CTA | Yes | Yes | Yes, mandatory |
| Abandoned cart recovery | Email, 1hr | None | Email, 30min |
