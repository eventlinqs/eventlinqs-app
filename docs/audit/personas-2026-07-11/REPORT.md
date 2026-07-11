# Pre-founder-review audit - persona walkthroughs + technical sweep (2026-07-11)

Production database never touched (TEST `vkapkibzokmfaxqogypq` only). Payment
engine unmodified. Competitors studied via public documentation only, never
named on customer surfaces. Every claim below has evidence in this directory,
`docs/seating/evidence-assign-mode-2026-07-11/`, or the benchmark doc.

## Part 1 - seating parity verdicts

1. **Buyer self-service seat move: VERIFIED EXISTING + re-proven live.**
   Persona B moved their own seat from /tickets (Row A Seat 4 to Row C Seat 1),
   ticket + QR + DB updated, old seat freed atomically. The organiser-move
   notify edge (the reference standard notifies NOBODY) re-proven in persona D:
   "They have been emailed about the change."
2. **Organiser-assigns mode: BUILT NOW.** `events.organiser_assigns_seats`
   (migration 20260711000004): buyers purchase GA-style with honest
   awaiting-allocation states; the organiser assigns from the new Awaiting-seat
   panel; ticket, QR, door scan resolve live; holder emailed. Proven A to Z on
   staging including a Mailinator-verified assignment email. A latent RPC
   defect was found and root-fixed on the way (below).
3. **Tier-to-seat mapping ergonomics: VERIFIED EXISTING + SURPASSED.** The
   section-tier model covers restriction by name binding; the wizard capacity
   check fired live in persona C ("32 seats but tickets only cover 20") and the
   NEW one-action fix ("Fix it: add 12 to General Admission") resolved it in
   one click to "your tickets cover all 32 seats".

## Part 2 - persona defects found, fixed, re-walked

| # | Persona | Defect | Root fix | Re-walk |
|---|---|---|---|---|
| 1 | A | Ticket tiers rendered in arbitrary database order (free pass led a paid event; organiser's order ignored) | Sort by sort_order then created_at at the event page derivation (2966308) | GREEN: GA leads, CTA "Checkout - AUD 27.50" all-in at first tap |
| 2 | A | QA-junk gallery images (colour blocks, "ULTRATALL" test rasters) visible on the seed event | TEST data cleaned (gallery_urls reset) | GREEN: gallery gone |
| 3 | A/B | Staging ticket emails linked to the PRODUCTION domain where the ticket does not exist (VERCEL_PROJECT_PRODUCTION_URL wins on previews) | site-url precedence: preview deployments emit their own origin (15ad63a) + branch-scoped NEXT_PUBLIC_SITE_URL pin | GREEN: persona B email ticket link carries the staging origin |
| 4 | Part 1 | `reassign_ticket_seat` documented unassigned-ticket path threw `record "v_old_seat" is not assigned yet` | Scalar old-seat variables, with-seat path unchanged (migration 20260711000005) | GREEN: assign cycle 2 end to end |
| 5 | B | "Change my seat" button nested INSIDE the ticket card anchor: tapping it also navigated to the QR page (and nested interactives fail a11y) | Control moved outside the Link, beside the transfer control (b6dcc65) | GREEN: picker opens in place, move completes |
| 6 | C | Venues page dead-ended a brand-new organiser ("You need to create an organisation" - no link, no button) | Designed empty state + create-organisation CTA, same pattern as payouts (4a79923) | GREEN: persona C followed the CTA and continued |
| 7 | C | "Invite team member - SOON" placeholder quick action (Law 1 defect) | Replaced with the live set-up-payouts action (4a79923) | GREEN: zero "Soon" on dashboard |
| 8 | C | Sidebar badged the LIVE payouts system "Soon"; Venues had no nav entry at all | Badge dropped, Venues entry added (3b1dbb5) | GREEN: verified on final build |

Positive verification along the way: paid publishing is correctly GATED on
Stripe identity verification for a brand-new organiser (persona C hit the gate
exactly as designed; free events publish anytime) - competitor-standard
compliance behaviour, not a defect.

## Part 2 - persona outcomes (all GREEN)

- **A (guest GA, phone, shared-link entry):** landed logged-out in a fresh
  context on the link a friend receives, browsed, paid 4242. Order
  **EL-H7PN7XUK** confirmed, user_id null, AUD 27.50 all-in shown at first
  tap. Email in Mailinator with ticket code + working QR page. Zero console
  errors on our pages.
- **B (seated, phone):** map pick, paid 4242, order **EL-EDHCJN8W**; seat on
  confirmation + email; ticket link = staging origin; then self-moved
  Row A4 to Row C1, old seat freed, zero console errors.
- **C (cold organiser, desktop):** signup -> confirm email -> dashboard ->
  organisation -> venue -> 32-seat chart in the real builder -> Magic Start
  draft from a typed description -> cover previewed immediately -> capacity
  warning + one-action fix -> paid gate verified -> published free -> Launch
  Kit: **A4 QR poster PDF downloaded**, tracked link copied, a stranger's
  click landed and **the reach panel counted it**.
- **D (returning organiser):** second event reused the saved chart (32 seats
  materialised), attendee list showed the guest, **CSV export contained
  them**, Move attendee Row A1 to Row A6 with the holder emailed.
- **E (performer):** public profile 200 at 1440 + 390, dashboard carries the
  tracked link, fan purchase through /s/ attributed (conversions 1 to 2).
- **F (sceptic):** home, About, pricing, browse, city page, waitlist join,
  confirmation email, unsubscribe (proper confirm-step, then completed).

## Part 4 - technical sweep

| Check | Result |
|---|---|
| Link-integrity crawl | 304 internal links, ZERO dead (4 valid auth/marketing redirects) |
| Affordance scan | 0 dead-end tiles across 16 pages |
| Console errors | 0 on every primary page at 1440 AND 390 (17 pages x 2) |
| Broken images | 0 across the sweep (all img naturalWidth > 0 after full scroll) |
| Flag-off surfaces | /gigs 404, /artists 404 on the final build; artist profile (flag ON) 200 |
| Transactional emails | signup confirm, ticket (paid GA + seated), seat assignment, seat move, waitlist join, unsubscribe - ALL verified in a real inbox this audit |
| Stripe webhooks | payment_intent.succeeded events match both persona purchases to the second; both orders reached confirmed through the webhook path |
| Gates | tsc 0 errors, eslint 0 errors, full vitest suite green, production build clean (final run on the audit head) |

Notes: `/categories/[slug]` is the scene-slug space (afrobeats, gospel,
networking...); guessed URLs like /categories/music 404 correctly and no
rendered link points there (the crawler proves it). The confirmation page's
full `load` event can lag behind its QR render; the page is interactive and
correct well before - noted as a perf observation for the Lighthouse gate, not
a functional defect.
