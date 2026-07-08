# Pricing decision support (2026-07-05): STOPPED, no rate changed

The founder-approved change (platform 3.5% to 3.0%, all else unchanged)
carried its own gate: confirm the maths first, and STOP if we are not
clearly cheaper than Humanitix all-in by $30. The maths below fails that
gate at every price in the bracket, so per the directive the rate was NOT
changed and no different rate was guessed. pricing_rules on TEST still
holds platform 3.5% + $0.99 and processing 2.5% (verified live before
computing). No file, rate, or surface was modified by this task.

Method: our totals use the exact checkout rounding (`computeFeeLineCents`,
half-up per line, one ticket). Humanitix is their published 4% + $0.99
inclusive of payment processing, quoted excl GST
([their pricing page](https://humanitix.com/au/pricing)), shown BOTH ways:
"+GST" (their AU checkout adds GST on the fee) and "no GST" (conservative
for us). Eventbrite is their published AU 3.7% + $1.79 + 2.9% processing.
Delta = our buyer total minus Humanitix (positive means we are dearer).

## Today: platform 3.5% + $0.99, processing 2.5%

| Ticket | Our all-in | Our fee take | Humanitix +GST (delta) | Humanitix no GST (delta) | Eventbrite |
|---|---|---|---|---|---|
| $15 | $16.90 | $1.90 | $16.75 (+$0.15) | $16.59 (+$0.31) | $17.79 |
| $20 | $22.19 | $2.19 | $21.97 (+$0.22) | $21.79 (+$0.40) | $23.11 |
| $25 | $27.50 | $2.50 | $27.19 (+$0.31) | $26.99 (+$0.51) | $28.45 |
| $30 | $32.79 | $2.79 | $32.41 (+$0.38) | $32.19 (+$0.60) | $33.77 |
| $35 | $38.10 | $3.10 | $37.63 (+$0.47) | $37.39 (+$0.71) | $39.11 |
| $50 | $53.99 | $3.99 | $53.29 (+$0.70) | $52.99 (+$1.00) | $55.09 |

## The directed change: platform 3.0% + $0.99, processing 2.5% (NOT APPLIED)

| Ticket | Our all-in | Our fee take | Humanitix +GST (delta) | Humanitix no GST (delta) |
|---|---|---|---|---|
| $15 | $16.82 | $1.82 | $16.75 (+$0.07) | $16.59 (+$0.23) |
| $20 | $22.09 | $2.09 | $21.97 (+$0.12) | $21.79 (+$0.30) |
| $25 | $27.37 | $2.37 | $27.19 (+$0.18) | $26.99 (+$0.38) |
| $30 | $32.64 | $2.64 | $32.41 (+$0.23) | $32.19 (+$0.45) |
| $35 | $37.92 | $2.92 | $37.63 (+$0.29) | $37.39 (+$0.53) |

STILL DEARER at every point in the bracket, under both GST readings, and
the gap widens with price. The stop clause therefore applies. The
structural reason: our take is (platform% + processing%) = 5.5% + $0.99
after the cut, against their effective 4.4% + $1.09 (with GST) or 4.0% +
$0.99 (without). A 0.5 point cut cannot close a 1.1 to 1.5 point spread.

## The two earlier candidates, for completeness (both also fail)

(a) processing 2.5% to 2.2% and (b) platform 3.5% to 3.2% produce
IDENTICAL buyer totals (each removes 0.3 points): $16.85 / $22.13 /
$27.42 / $32.70 / $37.99 across the bracket, dearer than Humanitix at
every point under both GST readings. Revenue given up versus today: 0.3%
of the ticket price (5c at $15, 9c at $30).

## What WOULD make us clearly cheaper (informational, not applied)

The knobs are symmetric on the buyer total; only the TOTAL percentage
matters to the buyer. Two calibrated examples, expressed here as
processing cuts (which keep the platform-fee base intact for the venue
revenue share):

| Scenario | Take at $30 | Our all-in $30 | vs Humanitix +GST | vs no GST |
|---|---|---|---|---|
| Beat their GST-added price: total 4.0% + $0.99 (e.g. platform 3.0% + processing 1.0%) | $2.19 | $32.19 | $0.22 cheaper everywhere in the bracket | exact tie |
| Beat both readings: total 3.6% + $0.99 (e.g. platform 3.0% + processing 0.6%) | $2.07 | $32.07 | $0.34 cheaper | $0.12 cheaper |

Revenue given up at $30 versus today: 60c per ticket (first scenario) or
72c (second). MARGIN WARNING before committing either: Stripe's real cost
(about 1.7% + 30c on the gross charge, roughly 85c on a $30 order)
already exceeds the 2.5% processing line's 75c take at low prices; the
platform line covers the difference. Any processing cut deepens that
cross-subsidy, so the founder should model against actual Stripe invoices
first. The alternative remains scoping the marketing claim to the
platform fee (3.5% + $0.99 beats their 4% + $0.99 headline) plus the
transparency edge already shipped, giving up no revenue at all.

## One-line recommendation

Do not chase Humanitix with sub-point trims: either commit to a real
repositioning at a total take near 4.0% + $0.99 (about 60c per $30 ticket
given up, Stripe margin modelling first) or keep today's rates and win on
the platform-fee headline plus radical transparency; the 3.0% cut as
directed buys neither and was therefore stopped per its own gate.
