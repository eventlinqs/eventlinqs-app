# Batch 11.0 - Trust signals (2026 contextual pattern)

Date: 2026-05-14

## Strategic context

Trust bars on every page are a legacy 2010s pattern. Market leaders (Ticketmaster, DICE, Eventbrite) place trust signals contextually at the purchase-decision moment, not as repeated page-level bands. The 2026 design consensus is that visual minimalism and editorial polish do most of the trust-signalling work; explicit trust copy lives where it tips the conversion.

EventLinqs adopts this pattern in Batch 11.0.

## Implementation matrix

| Page type | Trust signal | Location | Component |
|---|---|---|---|
| `/` (homepage) | **None** | (removed) | TrustBadgesRow import removed from `src/app/page.tsx`; component file remains on disk uncoupled in case it's revived for a future surface |
| `/events`, `/cultures`, `/cities`, `/culture/*`, `/city/*`, `/organisers`, `/pricing`, `/about`, `/contact`, `/help`, `/legal/*`, `/account*` | **None** | The editorial typography + photography is the trust signal | n/a |
| `/events/[slug]` (event detail) | 3-icon row beneath the "Get tickets" hero CTA | Hero band, white text variant | `<EventTrustSignals variant="dark" />` |
| `/checkout/[reservation_id]` | Full sidebar trust block alongside payment form | Right column on desktop, stacked below form on mobile | `<CheckoutTrustSignals />` |

## EventTrustSignals (event detail)

Located at `src/components/features/event/EventTrustSignals.tsx`.

Renders a horizontal list of three icon-plus-microcopy pairs:

- `Lock` icon + "Secure checkout"
- `BadgeCheck` icon + "Verified organiser"
- `RefreshCw` icon + "Refund policy"

Icons gold (`--brand-accent`), microcopy in either navy (`light` variant) or white-85 (`dark` variant). Layout horizontal on tablet and desktop, stacked column on mobile. Used with `variant="dark"` in the event detail hero band, mounted just below the SaveEventButton row (file:line `src/app/events/[slug]/page.tsx` shortly after the StickyActionBar block).

No exclamation marks, no "100%", no hyperbole. AU English where applicable.

## CheckoutTrustSignals (checkout)

Located at `src/components/features/checkout/CheckoutTrustSignals.tsx`.

Renders a vertical aside block with:

- "Secure payment" eyebrow in gold
- 3 icon rows: Stripe encryption note, money-back guarantee, PCI-DSS compliance
- "We accept" subheading + inline list of payment methods (Visa, Mastercard, Amex, Apple Pay, Google Pay)

Mounted in `src/app/checkout/[reservation_id]/page.tsx` as a sidebar adjacent to the existing CheckoutForm. Desktop layout is a 2-column grid (form on the left, trust signals on the right at 320px width). Mobile stacks the trust signals below the form.

Payment-method names are inline text (no third-party brand SVG assets bundled). This sidesteps trademark licensing for Visa/Mastercard/etc and keeps the bundle network-light. If the founder wants brand-asset logos later, the swap is mechanical (replace the `<li>` text with `<img>` from `/public/payment-methods/`).

## Removal from homepage

`src/app/page.tsx`:
- Import for `TrustBadgesRow` removed
- `<TrustBadgesRow />` JSX removed
- Comment block in its place documents the removal and points to this evidence file

The `src/components/features/home/trust-badges-row.tsx` file remains on disk uncoupled. Cleanup of orphaned components is queued for Batch 11.1 alongside the spacing audit (the spacing audit naturally identifies orphans).

## Research citations

Founder research (2026-05) referenced the following industry sources for the contextual-trust pattern. CC did not run new Playwright captures of Ticketmaster/DICE/Eventbrite/Humanitix in this batch (Slice A deferral); founder's prior research is the source for the pattern decision.

- Industry consensus 2026: trust bars on every page = legacy 2010s. Modern e-commerce places trust signals at the purchase-decision moment.
- Ticketmaster / DICE / Eventbrite all show trust signals only on event detail (small inline row) and checkout (full sidebar treatment). No persistent sitewide trust band.
- 2026 design consensus: "Design is doing most of the talking" - visual minimalism over text repetition.

End of report.
