# EventLinqs Fee Structure: LOCKED (do not relitigate)

This is the final, decided fee model. It is built into the platform and made
editable in the admin panel. Do not reopen the debate. Build to this exactly.

**No figure in this document is the source of truth.** The one source is the
PRICING-LOCK block in `docs/PRICING.md`, and the worked arithmetic is COMPUTED
from it by `scripts/pricing-derive.mjs`. This file explains the reasoning; that
file holds the numbers. Where the two disagree, the build fails and
`docs/PRICING.md` wins.

## The model: ONE fee (founder ruling, 15 August 2026)

EventLinqs charges **one fee on every paid ticket**, and card processing comes
out of it rather than being charged beside it. The rate itself is in the lock
block, not here.

Free events: no fee at all, permanently, the same as every competitor.

<!-- ONE-FEE-ALLOW-BEGIN: records what was deleted, which requires naming it. -->
**This document previously specified TWO fees**, a platform fee plus a separate
2.5 per cent payment processing fee. That second fee is deleted. The reasoning
for the deletion, including the Competition and Consumer Act s 55A surcharge
exposure that a fee named after processing carried, is in `docs/PRICING.md`
section 1 and is not repeated here.
<!-- ONE-FEE-ALLOW-END -->

## Why one fee, and what it costs us

- **Stripe's real cost is `1.70% + A$0.30`** per domestic Australian
  card-not-present payment, and Stripe's published pricing states, verbatim,
  **"Fees include GST"**, so no GST is added on top of that.
  (https://support.stripe.com/questions/april-2024-pricing-update-for-businesses-on-standard-pricing-in-australia
  and https://stripe.com/au/pricing, both fetched 15 August 2026.)

  **Two corrections are recorded here rather than quietly applied**, because both
  were live in this document and both moved the margin in the direction that
  flattered nobody:

  1. This file said Stripe costs "about 1.75% + $0.30". That was the rate until
     **1 April 2024**, when Stripe reduced it to 1.70%. The figure had been
     stale for over two years.
  2. A proposed correction was to ADD 10 per cent GST to Stripe's fee. That
     would have been wrong in the other direction: the published AU rate is
     already GST-inclusive, so adding GST overstates the cost by about 10 per
     cent and understates the margin by the same.

  **UNSOURCED:** the rate after **1 October 2026**. Stripe's pricing page
  footnotes the 1.7% figure with "Lower pricing from 1 Oct 2026" and does not
  publish the new number. That date falls about six weeks after launch, so the
  margin table must be re-derived then.

- **The margin is positive at every price**, from a $5 ticket upward, and is
  computed in `docs/PRICING.md` section 3 from the lock block. It is not restated
  here, because restating it here is exactly how this document came to carry four
  wrong numbers.

- **A dispute costs A$25.00** (https://stripe.com/au/pricing, fetched 15 August
  2026), which is more than the margin on every ticket in the table. Chargebacks,
  not the processing rate, are the real margin risk.

## Positioning: the old rule is OUT OF DATE and the opposite is now provable

<!-- ONE-FEE-ALLOW-BEGIN: states the superseded basis of the old positioning rule. -->
The founder decision of 5 July 2026 (Path B) recorded that **"cheaper than
Humanitix" is FALSE all-in and must never be claimed**. That was correct under
the two-fee model, where our all-in was the platform fee plus 2.5 per cent.
<!-- ONE-FEE-ALLOW-END -->

**Deleting the second fee inverted it.** Humanitix publishes **"4% + $0.99 Per
paid ticket (excl. GST)"** for Australia
(https://www.humanitix.com/au/pricing, fetched 15 August 2026). EventLinqs
charges a lower percentage on the same flat amount, so the EventLinqs fee is
lower at every non-zero ticket price, and the gap widens as the price rises.
Their figure is quoted excluding GST, so the true gap in the buyer's pocket is
wider still.

**What that does and does not license.** The comparison above is arithmetic from
both parties' published rates and it holds across the whole price range. Whether
to put a comparative pricing claim in market is a commercial decision for the
founder, not an engineering one, and it carries Australian Consumer Law exposure
if a competitor changes their rate and our page does not. Two things follow, and
only the second is a build instruction:

1. **Founder decision required:** whether the marketing now makes a direct
   all-in comparison. It is available and sourced; it is not automatic.
2. **Build rule, regardless of that decision:** no comparative claim may be
   hardcoded in a page. If one ships, it derives from the lock block and carries
   the date the competitor's page was last verified, because a comparison is a
   claim about someone else's price and theirs can change without notice.

Ticketmaster and Ticketek use flat per-order fees suited to expensive arena
seats. That model is wrong for community events at lower prices and EventLinqs
does not copy it.

## Hard requirements for the build

1. **ONE fee**, applied per paid ticket, resolved from `pricing_rules` through
   the single resolver. Never two.
2. **Editable in the admin panel** by the founder, both the percentage and the
   flat amount, without a code change.
   <!-- ONE-FEE-ALLOW: records the removed admin fields. -->
   The processing-fee fields were REMOVED from that screen on 15 August 2026:
   nothing read them, so they let the founder set a number that charged nobody.
3. **ACCC compliance** (drip-pricing): the all-in total is shown clearly and
   early, as a single figure, never sprung at the final checkout step.
4. **Who pays**: support both absorb (organiser pays, deducted from payout) and
   pass-on (buyer pays at checkout). Pass-on is the per-event default so the
   organiser keeps full face value.
5. **GST posture unchanged**: EventLinqs is a limited payment collection agent.
   The ORGANISER is the seller and handles GST on the ticket price. EventLinqs
   deals with GST only on its own fee, and only once GST-registered (turnover
   above $75k). Do not add 10 per cent GST to the EventLinqs fee until then.
   EventLinqs also cannot recover the GST embedded in Stripe's fee while
   unregistered; see `docs/PRICING.md` section 9.
6. **Single source of truth**: fees resolve through `pricing_rules` and the one
   resolver. Do not fork or duplicate fee logic. The funds-holding payment engine
   stays intact.

## Status

LOCKED. One fee, founder ruling 15 August 2026. Do not reopen the number; tune
only in admin if real data later warrants it.
