# EventLinqs Fee Structure — LOCKED (do not relitigate)

This is the final, decided fee model. It is built into the platform and made
editable in the admin panel. Do not reopen the debate. Build to this exactly.
Researched and confirmed against Eventbrite, Humanitix, Ticketmaster, Ticketek
(June 2026). Dash rule followed in prose to Lawal.

## The model: two fees, like the whole industry (Eventbrite-style percentage, not Ticketmaster flat-order)

EventLinqs charges TWO fees on every PAID ticket:

1. PLATFORM / SERVICE FEE (this is the profit margin): 3.5% + $0.99 per ticket.
2. PAYMENT PROCESSING FEE (covers Stripe, earns a small margin): 2.5% of the order.

Free events: $0, no fees (same as all competitors).

## Why these numbers (the reasoning, so it is not reopened)

- Stripe costs EventLinqs about 1.75% + $0.30 per domestic AU card. The 2.5%
  processing fee covers that and leaves a small margin (set below Eventbrite's
  2.9% deliberately).
- CORRECTED POSITIONING (founder decision 2026-07-05, Path B, superseding
  the original claim in this section): Humanitix's published 4% + $0.99
  INCLUDES payment processing, so on an all-in basis they are 7 to 29 cents
  cheaper than us across $15 to $35 (full tables:
  docs/surpass/pricing-decision.md). "Cheaper than Humanitix" is FALSE
  all-in and must never be claimed. The true money story: a lower HEADLINE
  platform fee than Humanitix (3.5% + $0.99 versus their 4% + $0.99), far
  cheaper than Eventbrite all-in at every price point, and radical fee
  transparency no competitor offers.
- Worked example, $30 ticket: platform fee 1.05 + 0.99 = 2.04; processing 2.5% ≈
  0.75; total fees ≈ 2.79. Stripe takes ~0.83. Profit ≈ 2.04 platform + a thin
  processing margin. Profitable on the platform line; processing roughly at cost-plus.
- Comparison on $30 (honest): EventLinqs 2.79 in fees all-in versus
  Eventbrite about 3.77 and Humanitix about 2.41 to 2.64 depending on their
  GST treatment. Far cheaper than Eventbrite; slightly ABOVE Humanitix.
- Higher-priced check, $80 ticket: our 6% + $0.99 is about 5.79 all-in,
  still well under Eventbrite and above Humanitix's inclusive 4% + $0.99
  (about 4.61 with GST on their fee). The gap to Humanitix widens with
  price, which is why the marketing claim is scoped to the headline
  platform fee and the transparency edge, never to all-in price.
- Ticketmaster/Ticketek use flat per-order fees (~$5.50 to $7) suited to expensive
  arena tickets. That model is WRONG for community/music events at lower prices,
  so EventLinqs does NOT copy it. But they confirm the universal rule: everyone
  charges processing separately and profits on the service fee. EventLinqs is not
  a charity, so it charges processing and profits on it.

## Hard requirements for the build

1. TWO fees as above, applied per paid ticket / per order as specified.
2. ALL fees fully editable in the ADMIN PANEL by the founder (both percentages and
   the flat amount), without a code change. The founder controls pricing.
3. ACCC COMPLIANCE (Australian Consumer Law, drip-pricing rules): the total all-in
   price MUST be shown clearly and early to the buyer, as a single total figure,
   never sprung at the final checkout step. Unavoidable fees are surfaced up front.
4. Who pays the fees: support BOTH absorb (organiser pays, deducted from payout) and
   pass-on (buyer pays at checkout), like Eventbrite and Humanitix. Default to
   pass-on (buyer pays), so the organiser keeps full face value, but make it a
   per-event toggle for the organiser.
5. GST posture stays as already locked: EventLinqs is a limited payment collection
   agent. The ORGANISER is the seller and handles GST on the ticket price.
   EventLinqs only deals with GST on its OWN fee, and only when GST-registered
   (turnover over $75k). Do not add 10% GST to the EventLinqs fee until registered.
6. Single source of truth: fees resolve through the existing pricing_rules / fee
   system. Do not fork or duplicate fee logic. The funds-holding payment engine
   (proven, gate-green) stays intact; the fee change is additive and verified.

## Status

LOCKED 2026. Build when Lawal is home, after the production security fix and the
TEST migrations. This is the NEXT major build after launch-readiness is closed.
Do not reopen the numbers; tune only in admin if real data later warrants it.
