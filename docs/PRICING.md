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
processing_fee_pass_through = 1
```
<!-- PRICING-LOCK:END -->

Read as: **ONE fee of 3.5 percent plus 99 cents per ticket, all in.** The buyer
pays it, the organiser keeps 100 percent of face value, and card processing comes
out of that 3.5 rather than being charged as a second line.

`processing_fee_pass_through = 1` is a MISNOMER kept deliberately. That rule has
always governed whether the fee is passed to the buyer or absorbed by the
organiser, not just a processing component, and renaming it means a migration and
a coordinated deploy. It is read once, in the calculator, and its meaning is
stated here rather than corrected under launch pressure.

Free events are free: a zero subtotal short-circuits before any fee applies.

### The separate processing fee is DELETED (founder ruling, 15 August 2026)

There used to be a second fee: 2.5 percent of the order, described as covering
Stripe. It is gone. Nothing in the codebase reads
`processing_fee_percentage` or `processing_fee_fixed_cents` any more, which is
why **those rows can stay in `pricing_rules` as inert history rather than
requiring a migration during launch week**. An unnecessary production migration
is risk for no gain.

**Deleting it also removed a regulatory exposure rather than creating one.**
Competition and Consumer Act 2010 s 55A(a) defines a payment surcharge as "an
amount charged, in addition to the price of goods or services, **for processing
payment** for the goods or services", with **no requirement that it vary by
payment method**. A buyer-facing line named "payment processing fee" answers that
description on its face. The RBA's carve-out for booking and service fees is
worded as fees "unrelated to payment costs **and** apply regardless of the method
of payment", which is a conjunctive test, so a processing-named fee forfeited half
of it even though it never varied by method. One fee, not named after processing,
sits inside the carve-out. The RBA states the ban does "not apply to weekend
surcharges, public holiday surcharges, **or booking fees or service fees**", and
its own Q&A names **the ticketing industry** as the example.
(RBA FAQ and RBA Q&A, both fetched 15 August 2026; CCA s 55A, compilation
1 January 2026.)

**A dated obligation to diarise.** The Competition and Consumer Amendment (Unfair
Trading Practices) Act 2026 inserts ACL **s 48A**, commencing **1 July 2027**,
requiring a "transaction based charge" to be displayed **in close proximity to
every displayed base price**, each time a base price is displayed. A per-ticket
booking fee is such a charge. The all-in display already satisfies the spirit of
it; the wording of s 48A(3) should be checked against the ticket selector before
that date.

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

## 4. The founding offer: a DATE WINDOW

Founder decision, locked 27 July 2026: the waiver is a **date window**, not a
months counter. A counter has no expiry and no audit trail; a timestamp answers
"is this organisation inside the window right now" with one comparison that the
charge, the display and the payout each make identically.

**The terms.**

| Term | Value | Where it lives |
|---|---|---|
| Initial grant | 6 months from onboarding | `FOUNDING_INITIAL_MONTHS` |
| Per confirmed referral | plus 3 months | `FOUNDING_REFERRAL_MONTHS` |
| Cap | the first 50 organisations, Geelong and Melbourne | `FOUNDING_WAIVER_CAP` |
| Stored as | `organisations.founding_fee_free_until` (TIMESTAMPTZ) | migration `20260727000002` |

**Fee-free means the PLATFORM fee only.** The payment processing fee is a real
cost paid to the processor and is never waived. A fee-free 20.00 ticket is
therefore 20.50 all in, not 20.00.

**Referrals stack.** An extension adds three months to the CURRENT expiry, not
to today, so two referrals in the same week give six months rather than one
overwriting the other. A window that has already lapsed extends from today
instead, so the grant is real rather than a silent no-op.

**Month arithmetic is done in UTC.** `setMonth` works in the host's local time
while the value is stored and compared as UTC, so a six-month window granted in
July (UTC+10) and expiring in January (UTC+11) came out a day short. The helper
uses `setUTCMonth` so the window is identical wherever it is computed.

**The cap is enforced twice**: in code
(`acceptFoundingInvite` checks the holder count and audit-logs a refusal) and by
the database trigger `trg_founding_waiver_cap`, which cannot be bypassed by a
direct SQL grant or a code path nobody has written yet.

**Every grant and extension is audit-logged** with the organisation, the reason,
the previous expiry and the new expiry: `founding.waiver.granted`,
`founding.waiver.extended`, `founding.waiver.cap_reached`.

**Where the waiver is applied.** One shared function,
`applyFoundingWaiver()` in `src/lib/payments/founding-waiver.ts`, called from
BOTH resolution points so the shown total and the charged total cannot diverge:

| Point | File | Covers |
|---|---|---|
| Charge authority | `payment-calculator.ts` | checkout, capture, and payout (the payout composes the application fee from the amounts stored on the order) |
| Display resolver | `event-fee-config.ts` | the event page all-in, and the ticket selector that consumes its rates |

A lookup failure reads the waiver as INACTIVE, so an error charges the standard
rate rather than silently giving the platform fee away.

Marketing and legal surfaces call `getEventFeeRates({})` with no organisation,
so they keep showing the standard public rates. That is correct: those pages
describe the platform's rates, not one organiser's deal.

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

1. **RESOLVED 27 July 2026: the founding fee waiver is now wired to the charge.**
   It was previously displayed and never applied. It is now a date window read by
   both resolution points (section 4). `founding_bonus_months` is retained as the
   historical record of referrals earned, but nothing prices from it.
   Outstanding: the migration must be applied before the column exists, and no
   organisation currently holds a window (0 of 50 on both databases as at
   27 July 2026).
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
