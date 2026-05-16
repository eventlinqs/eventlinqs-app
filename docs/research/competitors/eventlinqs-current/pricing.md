# EventLinqs - /pricing (live, current state) - THE REBUILD TARGET

Source: https://www.eventlinqs.com/pricing
Scraped: 16 May 2026 (firecrawl, location AU, onlyMainContent, waitFor 3000)
Status: 200 OK
Screenshot: screenshots/pricing.png

---

## Structure

- Eyebrow "PRICING"
- H1: **Simple. Transparent. Fair.**
- Sub: "No upfront fees. No surprise charges. Pay only when you sell paid tickets."
- **Pricing tiers** (3 cards):
  - **Free Events** - "Free forever" - "Host any free event at zero cost. No platform fees. No hidden charges. Keep every dollar you collect."
    - Unlimited free events / Unlimited free tickets / All platform features included / Real-time sales dashboard and scan app / Guest list export and check-in tools
  - **Paid Events** (badge: "Most popular") - "From 2.9% + AUD 0.59 per paid ticket sold" - "Transparent, industry-leading rates. Pass the fee to buyers or absorb it into your ticket price. Your choice."
    - All features from Free tier / Squad booking and group ticketing / Discount codes and tiered pricing / Advanced sales analytics / Dedicated payout support / Multi-currency checkout
    - CTA: [Start selling tickets] -> /organisers/signup
  - **Enterprise** - "Custom - contact us for a quote" - "For venues, festivals, and high-volume organisers. Custom rates, dedicated support, and white-label options available."
    - Custom pricing for high volume / Dedicated account manager / White-label event pages (optional) / Custom integrations and reporting / Priority support SLA
    - CTA: [Contact us] -> /contact?topic=partnership
- Disclaimer: "All fees shown are indicative. Actual rates are configured in the organiser dashboard and may vary by event type. Free events always have zero platform fees."
- **Pricing FAQ** (6, full answers):
  - What counts as a paid ticket? (any ticket > $0; free/comp not charged)
  - Who pays the booking fee? (organiser choice: absorb or pass on; buyer always sees full amount before confirming)
  - What currencies? (AUD, GBP, USD, CAD, EUR; no EventLinqs currency conversion fee)
  - When do I get paid? (within 5 business days of event ending +1-3 bank days; Stripe verification required)
  - What payment methods? (Visa/MC/Amex, Apple Pay, Google Pay, Stripe Link)
  - Do you charge a fee for refunds? (no separate refund fee; platform fee refunded to buyer; Stripe processing fee may not be recoverable; organiser-cancelled = full refund incl. service fees)
  - [More payment and payout questions ›] -> /help/payments-and-payouts
- **Closing**: "Ready to see it in action? Sign up and build your first event in minutes. No credit card required until you sell a ticket." [Start selling tickets] [Talk to us]

## Meta
- Title: "Pricing | EventLinqs"
- Description: "Simple, transparent pricing for event organisers. Free events always have zero platform fees. Paid events from 2.9% + AUD 0.59 per ticket. No upfront costs."
- og:image -> http://localhost:3000/opengraph-image (BUG)

---

ANALYST NOTE (this is the page being rebuilt via v0.dev):

WHAT WORKS:
- The 3-tier model (Free / Paid / Enterprise) is the correct industry structure and matches Eventbrite/Humanitix conventions buyers expect.
- "Free forever / zero platform fees / keep every dollar" is a strong, repeated promise and is the single best asset on the page.
- The fee headline "From 2.9% + AUD 0.59 per paid ticket" is materially CHEAPER than Eventbrite (3.7% + $1.79 service + 2.9% processing) and competitive with Humanitix (4% + $0.99). This is a winning number that is currently under-dramatised.
- FAQ answers are honest and thorough (refund handling, Stripe verification, organiser-pays-vs-buyer-pays choice) - real trust content.
- "No credit card required until you sell a ticket" closing line is excellent risk-reversal.

WHAT IS CRITICALLY BEHIND THE "SURPASS TICKETMASTER" BAR:
- NO all-in worked example. The entire brand promise is "all-in pricing, what you see is what you pay" yet the pricing page never shows a single concrete example (e.g. "$50 ticket -> buyer pays $X, you receive $Y"). This is the biggest gap and the easiest high-impact win.
- "From 2.9%" with no upper bound + a disclaimer that "actual rates ... may vary by event type" and "all fees shown are indicative" actively UNDERMINES the "Simple. Transparent. Fair." headline. It reads as a hedge. Humanitix wins precisely by being unhedged. The /organisers page also says the fee is "split between EventLinqs and the organiser" and "capped" - none of that nuance is reconciled here. The numbers must be made definite and consistent across /pricing, /organisers, and the homepage stat strip.
- ZERO trust signals: no organiser count, no testimonial, no logo, no "X events ticketed", no security/PCI/Stripe badge, no comparison-vs-competitors table. Eventbrite uses a competitor table as a weapon; Humanitix uses the charity mission; EventLinqs uses nothing.
- No visual hierarchy beyond three text cards - no fee calculator, no comparison table, no hero image, no mobile-first interactive element. It is the plainest page in the entire competitive set.
- Same localhost OG bug - this page is unshareable on social in its current state.
- "Industry-leading rates" is an unsubstantiated claim with no proof adjacent to it (no comparison). Either prove it (table) or drop it.

BOTTOM LINE: The pricing page has the best underlying economics in the set and the weakest presentation of them. The rebuild's job is almost entirely dramatisation and proof, not repricing.
