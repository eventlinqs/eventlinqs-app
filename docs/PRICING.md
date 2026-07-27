# PRICING: the single authoritative record

**This document is the ONLY place a fee figure exists in prose.** Every surface,
every component and every calculation reads the value from the database through
one resolver. If a number appears anywhere else as a literal, that is a defect,
and CI fails the build for it.

Status: locked. Founder: Lawal Adams. Last reviewed 27 July 2026.
Authority: this file plus `public.pricing_rules`. Where they disagree, the build
fails and neither is trusted until a human reconciles them.

---

## 1. The locked values

These are the AU/AUD region defaults. The build guard
(`scripts/check-pricing-lock.mjs`) parses the block below and fails the build if
the live database does not match it exactly.

<!-- PRICING-LOCK:BEGIN -->
```
country            = AU
currency           = AUD
platform_fee_percentage    = 3.5
platform_fee_fixed         = 99
processing_fee_percentage  = 2.5
processing_fee_fixed_cents = 0
processing_fee_pass_through = 1
```
<!-- PRICING-LOCK:END -->

Read as: a PLATFORM (service) fee of 3.5 percent plus 99 cents per ticket, and a
PAYMENT PROCESSING fee of 2.5 percent of the order with no flat component.
`processing_fee_pass_through = 1` means the processing fee is passed to the buyer
by default.

Free events are free: a zero subtotal short-circuits before any fee applies.

## 2. How a total is composed, in order

Every figure below is computed by `computeFeeLineCents` and
`computeAllInTotalCents` in `src/lib/payments/fee-math.ts`. That module is pure
and is called by BOTH the server charge authority and the client all-in display,
so the shown total can never diverge from the charged total.

1. **Merchandise subtotal.** Ticket face value times quantity, after any discount.
2. **Platform fee.** `round(subtotal x platform_fee_percentage / 100 + ticketCount x platform_fee_fixed)`.
   The percentage applies to the discounted subtotal. The flat component is
   **per ticket**.
3. **Payment processing fee.** `round(subtotal x processing_fee_percentage / 100 + processing_fee_fixed_cents)`.
   The flat component is **per order**, not per ticket. It is 0 under the locked model.
4. **Tax.** Always 0. EventLinqs is the organiser's limited payment collection
   agent: the organiser is the seller and remits GST on the ticket price.
   EventLinqs deals with GST only on its own fee, and only once GST-registered
   (turnover above 75k). No separate GST line is ever added to a buyer total.
5. **The all-in total**, by who carries the fees:
   - **PASS-ON** (`pass_to_buyer`, the per-event default): buyer pays
     `subtotal + platform fee + processing fee`. The organiser keeps the full
     face value.
   - **ABSORB**: buyer pays `subtotal` only. The fees are deducted from the
     organiser payout by the funds-holding payout math, which is unchanged.

Rounding is `Math.round` (half up) on each fee line independently.

**ACCC all-in display.** The true all-in total is shown clearly and early, on the
ticket-selection surface, as a single figure, never sprung at the final step.

## 3. The worked example: one 20.00 ticket

### At the public rates (pass-on, the default)

| Component | Working | Cents | AUD |
|---|---|---|---|
| Merchandise subtotal | 1 x 2000 | 2000 | 20.00 |
| Platform fee | round(2000 x 3.5 / 100 + 1 x 99) = round(70 + 99) | 169 | 1.69 |
| Payment processing fee | round(2000 x 2.5 / 100 + 0) = round(50) | 50 | 0.50 |
| Tax | GST-inclusive posture | 0 | 0.00 |
| **Total fees** | 169 + 50 | **219** | **2.19** |
| **Buyer pays** | 2000 + 169 + 50 | **2219** | **22.19** |
| **Organiser keeps** | full face value | **2000** | **20.00** |

This is the founder's first locked anchor: a 20.00 ticket carries 2.19 in fees
and the organiser keeps the full 20.00.

### At the public rates, ABSORB mode

| Component | Cents | AUD |
|---|---|---|
| Buyer pays | 2000 | 20.00 |
| Fees deducted from payout | 219 | 2.19 |
| **Organiser receives** | **1781** | **17.81** |

### During the founding fee-free period (pass-on)

The platform fee is waived to zero. The payment processing fee is a genuine
third-party cost and is still passed on.

| Component | Working | Cents | AUD |
|---|---|---|---|
| Merchandise subtotal | 1 x 2000 | 2000 | 20.00 |
| Platform fee | waived | 0 | 0.00 |
| Payment processing fee | round(2000 x 2.5 / 100 + 0) | 50 | 0.50 |
| **Buyer pays** | 2000 + 0 + 50 | **2050** | **20.50** |
| **Organiser keeps** | full face value | **2000** | **20.00** |

This is the founder's second locked anchor: 20.50 all in during the founding
fee-free period.

## 4. The founding offer

Founding organisers in the founding cities (Geelong and Melbourne) earn
fee-free months: `INVITES_PER_FOUNDING_ORGANISER = 5` invites each, and
`REFERRAL_BONUS_MONTHS = 3` fee-free months per converted referral, tracked on
`organisations.founding_bonus_months` (`src/lib/founding/invites.ts`).

**Fee-free means the PLATFORM fee only.** The payment processing fee is a real
cost paid to the processor and is never waived. A fee-free 20.00 ticket is
therefore 20.50 all in, not 20.00.

**Implementation status: the waiver is NOT automatic.** See section 7.

## 5. Where the value lives

`public.pricing_rules`, one row per (rule_type, scope, version).

- Value columns are typed: `value_percentage` (NUMERIC), `value_cents` (BIGINT),
  `value_integer` (INTEGER). Which one is populated is decided by `value_type`.
- **Three scopes, most specific wins:** per-event (`event_id`) beats
  per-organiser (`organisation_id`) beats region default (both NULL). Every
  lower level is guarded with `event_id IS NULL` so scopes cannot collide.
- **Versioned.** A change inserts a NEW row with `version = previous + 1`. The
  reader takes the highest version whose effectiveness window is open.
- **Audit-logged.** Every admin write records `admin.pricing.updated` with the
  old value, the new value and the acting user.

## 6. How it is read in code

One resolver, no exceptions: `getPricingRule()` in
`src/lib/payments/pricing-rules.ts`.

- **Charge**: `PaymentCalculator` resolves the four rates and calls `fee-math`.
- **Payout**: the application-fee path resolves through the same function.
- **Display**: `getLivePublicFee()` (`src/lib/pricing/live-fee.ts`) resolves the
  same rows through the same resolver using the anon client.
- **Cache**: 60-second TTL in Redis. Admin writes call
  `invalidatePricingRule()` so a change lands immediately.
- **Fallback**: `src/lib/pricing/public-fee.ts` holds a last-resort constant used
  ONLY inside `getLivePublicFee`'s catch path so a marketing page cannot 500 when
  the database is unreachable. It is not a second source and must be kept equal
  to section 1.

## 7. Known gaps, stated not hidden

1. **The founding fee waiver is not wired to the charge.**
   `organisations.founding_bonus_months` is incremented by the referral flow and
   displayed on the invites dashboard as "Fee-free months earned", but NO code in
   the payment path reads `is_founding` or `founding_bonus_months`. A founding
   organiser inside their fee-free window is charged the full platform fee today.
   The offer is expressible only by an admin creating a per-organiser override in
   `/admin/pricing`, done by hand, with no expiry. Until this is built, the
   20.50 anchor is reachable only through that manual override.
2. **Superseded versions are never ended.** A new version is inserted with
   `effective_until = NULL` and the previous row is left open, so several
   versions of the same rule are simultaneously "active" and correctness rests
   entirely on `ORDER BY version DESC LIMIT 1`. Any row inserted with a
   non-incrementing or duplicate version silently changes the resolved fee.
   The migration in section 8 closes the existing instances.

## 8. The rule: no fee figure as a literal, anywhere else

**No percentage, dollar amount or cent amount describing a fee may be written as
a literal in any code path, component, copy string, template, email, or document
other than this one.**

- Code reads the value through `getPricingRule` or a helper that wraps it.
- Copy uses the live resolved label (`getLivePublicFee`) or neutral phrasing.
- The single permitted exception is `src/lib/pricing/public-fee.ts`, the
  documented last-resort fallback, which exists so a marketing page cannot 500.
  It must equal section 1 and the build guard checks it.

Enforced by:
- **Lock 1**, migration `20260727000001_pricing_locked_values.sql`: sets the
  database to exactly section 1 and ends every superseded version.
- **Lock 2**, `scripts/check-pricing-lock.mjs` in `prebuild`: reads
  `pricing_rules` at build time and FAILS THE BUILD on any mismatch with
  section 1.
- **Lock 3**, `tests/unit/payments/pricing-anchors.test.ts`: asserts the exact
  arithmetic in section 3.
- **Lock 4**, `scripts/copy-gate.mjs`: fails the build if a fee literal appears
  in user-facing copy or a component. This file is the only exemption.
