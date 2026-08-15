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

<!-- ONE-FEE-ALLOW-BEGIN: this section records what was deleted and the legal
     reasoning for deleting it, which cannot be written without naming it. -->

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

<!-- ONE-FEE-ALLOW-END -->

## 2. How a total is composed, in order

Every figure below is computed by `computeFeeLineCents` and
`computeAllInTotalCents` in `src/lib/payments/fee-math.ts`. That module is pure
and is called by BOTH the server charge authority and the client all-in display,
so the shown total can never diverge from the charged total.

1. **Merchandise subtotal.** Ticket face value times quantity, after any discount.
2. **The fee, and there is only one.**
   `round(subtotal x platform_fee_percentage / 100 + ticketCount x platform_fee_fixed)`.
   The percentage applies to the discounted subtotal. The flat component is
   **per ticket**. Card processing is paid out of this, not charged beside it.
3. **Tax.** Always 0. EventLinqs is the organiser's limited payment collection
   agent: the organiser is the seller and remits GST on the ticket price.
   EventLinqs deals with GST only on its own fee, and only once GST-registered
   (turnover above 75k). No separate GST line is ever added to a buyer total.
4. **The all-in total**, by who carries the fee:
   - **PASS-ON** (`pass_to_buyer`, the per-event default): buyer pays
     `subtotal + fee`. The organiser keeps the full face value.
   - **ABSORB**: buyer pays `subtotal` only. The fee is deducted from the
     organiser payout by the funds-holding payout math, which is unchanged.

Rounding is `Math.round` (half up) on each fee line independently.

**ACCC all-in display.** The true all-in total is shown clearly and early, on the
ticket-selection surface, as a single figure, never sprung at the final step.

## 3. The worked examples, and what the platform earns

**Nothing in this section is written down. It is COMPUTED from the lock block in
section 1** by `scripts/lib/pricing-derive.mjs`, using the same rounding the
charge uses, and `node scripts/pricing-derive.mjs --check` fails the build if the
text below and the lock block ever disagree.

<!-- ONE-FEE-ALLOW-BEGIN: names the stale figures this mechanism exists to stop. -->
That is deliberate and it is the fix for a real failure. This document declared
itself the only place a fee figure may be written, and then wrote four more
underneath: a worked example, an absorb example, a founding-window example and a
margin table. They were prose, so nothing checked them, and when the second fee
was deleted on 15 August 2026 every one of them went on showing 2.19 in fees,
22.19 all in, and 20.50 during the founding window. The authority document had
become the largest single source of the wrong number it existed to prevent.
<!-- ONE-FEE-ALLOW-END -->

<!-- PRICING-DERIVED:BEGIN -->

> GENERATED FROM THE LOCK BLOCK ABOVE. Do not hand-edit anything between
> the PRICING-DERIVED markers. Regenerate with
> `node scripts/pricing-derive.mjs --write`; `--check` runs in the guard
> suite and fails the build if this text and the lock block disagree.

### One 20.00 ticket at the public rates (pass-on, the default)

| Component | Working | Cents | AUD |
|---|---|---|---|
| Merchandise subtotal | 1 x 2000 | 2000 | 20.00 |
| EventLinqs fee | round(2000 x 3.5 / 100 + 1 x 99) | 169 | 1.69 |
| Tax | GST-inclusive posture | 0 | 0.00 |
| **Total fees** | the one fee | **169** | **1.69** |
| **Buyer pays** | 2000 + 169 | **2169** | **21.69** |
| **Organiser keeps** | full face value | **2000** | **20.00** |

There is ONE fee line. A 20.00 ticket carries 1.69 in fees and the organiser keeps the full 20.00.

### The same ticket, ABSORB mode

| Component | Cents | AUD |
|---|---|---|
| Buyer pays | 2000 | 20.00 |
| Fee deducted from payout | 169 | 1.69 |
| **Organiser receives** | **1831** | **18.31** |

### The same ticket during the founding fee-free window

The one fee is waived to zero. There is no second fee left to charge, so a waived ticket is now genuinely free of charge.

| Component | Cents | AUD |
|---|---|---|
| Merchandise subtotal | 2000 | 20.00 |
| EventLinqs fee (waived) | 0 | 0.00 |
| **Buyer pays** | **2000** | **20.00** |
| **Organiser keeps** | **2000** | **20.00** |

<!-- ONE-FEE-ALLOW-BEGIN: contrasts the current anchor with the deleted one. -->
**20.00 all in, not 20.50.** Under the two-fee model the processing line was never waived, so "completely fee-free" was 50 cents short of true. It is literally true now.
<!-- ONE-FEE-ALLOW-END -->

### What EventLinqs actually earns, after Stripe

Stripe's Australian domestic card-not-present rate is **1.7% + A$0.30**, and Stripe states "Fees include GST", so GST is NOT added on top of it.

Stripe charges on the amount actually put through the card, which is the ticket plus the fee in pass-on mode. One ticket per order is assumed, which is the WORST case: the EventLinqs fee carries a flat component per TICKET while Stripe charges its 30c per TRANSACTION, so every additional ticket on the same order widens the margin.

| Ticket | EventLinqs fee | Buyer pays | Stripe cost | **EventLinqs margin** |
|---|---|---|---|---|
| 5.00 | 1.17 | 6.17 | 0.40 | **0.77** |
| 10.00 | 1.34 | 11.34 | 0.49 | **0.85** |
| 20.00 | 1.69 | 21.69 | 0.67 | **1.02** |
| 35.00 | 2.22 | 37.22 | 0.93 | **1.29** |
| 50.00 | 2.74 | 52.74 | 1.20 | **1.54** |
| 100.00 | 4.49 | 104.49 | 2.08 | **2.41** |
| 200.00 | 7.99 | 207.99 | 3.84 | **4.15** |

The margin is positive at every price and never inverts, because the fee grows faster than Stripe's share of it. A dispute costs A$25.00, which exceeds the margin on every ticket in this table, so chargebacks are the real margin risk rather than the rate.
<!-- PRICING-DERIVED:END -->

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

<!-- ONE-FEE-ALLOW-BEGIN: quotes the superseded wording it replaces. -->
**Fee-free now means genuinely fee-free.** This used to read "the PLATFORM fee
only ... a fee-free 20.00 ticket is therefore 20.50 all in, not 20.00", because
the separate processing line was never waived. That fee no longer exists, so the
waiver now takes the whole charge to zero and a waived 20.00 ticket is 20.00 all
in. The founding-offer copy saying "completely fee-free" was 50 cents short of
true for as long as it was shown; it is literally true now.
<!-- ONE-FEE-ALLOW-END -->

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

- **Charge**: `PaymentCalculator` resolves the two fee values plus the
  pass-through treatment, and calls `fee-math`. It resolved FOUR rates under the
  two-fee model; the processing percentage and its flat component are no longer
  read by anything, which is what leaves those rows inert.
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
- **Lock 4**, `scripts/copy-tell-gate.mjs`: fails the build if a fee literal
  appears in user-facing copy or a component. This file is the only exemption.
  (It was recorded here as `scripts/copy-gate.mjs`, which does not exist. A
  citation nobody executes rots exactly like this one did.)
- **Lock 5**, `scripts/pricing-derive.mjs --check`: recomputes every worked
  figure in section 3 from the lock block and fails the build if the document
  disagrees with it. This is what stops the authority document itself from
  becoming the stale source, which is what happened on 15 August 2026.
<!-- ONE-FEE-ALLOW-BEGIN: describes what the guard catches. -->
- **Lock 6**, `scripts/guards/one-fee-copy.mjs`: fails the build if any
  customer-facing surface names a second fee, a payment processing fee, or the
  deleted figures.
<!-- ONE-FEE-ALLOW-END -->

## 9. GST, stated once and correctly

Two separate GST questions get confused with each other, so both are answered
here and neither is answered from memory.

**1. GST on the ticket.** EventLinqs is the organiser's limited payment
collection agent. The ORGANISER is the seller and remits GST on the ticket price.
No separate GST line is ever added to a buyer total (section 2, step 3).

**2. GST on Stripe's fee, and whether EventLinqs can recover it.** Stripe's
published Australian pricing states, verbatim, **"Fees include GST"**
(https://stripe.com/au/pricing, fetched 15 August 2026). So the
`1.70% + A$0.30` domestic card-not-present rate is already GST-inclusive and
there is **no additional 10 per cent to add** to it. A margin table that adds GST
on top of that rate overstates the cost by about 10 per cent and understates the
margin by the same amount.

The recoverability question is therefore **largely moot, and the answer is no in
any case.** An entity is entitled to an input tax credit only for a *creditable
acquisition*, and s 11-5(d) of the A New Tax System (Goods and Services Tax) Act
1999 requires that "you are registered, or required to be registered". EventLinqs
is not yet registered and is below the 75k turnover threshold, so it cannot claim
the GST embedded in Stripe's fee. That GST is simply part of the cost, which is
exactly how the margin table above treats it.
(https://www.austlii.edu.au/au/legis/cth/consol_act/antsasta1999402/s11.5.html.
**Fetched indirectly:** AustLII and ato.gov.au both returned HTTP 403 to the
tooling used here, so the section text was confirmed through ATO interpretive
decisions rather than read verbatim from the Act. Treat the paragraph reference
as sound and the exact wording as unverified from this shell.)

**The rate itself carries a dated caveat.** `stripe.com/au/pricing` footnotes the
1.7% figure with "Lower pricing from 1 Oct 2026" and does not publish what the
rate becomes on that date. **UNSOURCED:** the post-1-October-2026 rate. The table
in section 3 describes the rate in force today and must be re-derived once Stripe
publishes the new one, which falls about six weeks after launch.
