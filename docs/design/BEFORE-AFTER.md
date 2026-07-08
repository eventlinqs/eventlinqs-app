# Before and After: 2026-07-04 design upgrade (Fable 5)

BEFORE: `docs/baseline/2026-07-04-opus-baseline/` - the deployed staging build
of 4 July 2026, captured before any Fable 5 work (see its BASELINE-REPORT.md).
AFTER: `docs/design/2026-07-04-fable5-after/` - the same surfaces, same
viewports (desktop 1440x900, mobile iPhone 13 390x844 DPR 3), same full-page
scroll-then-capture method, captured from a LOCAL PRODUCTION build
(`next build` + `next start`) of `feat/design-upgrade-2026-07-04` pointed at
the TEST database (vkapkibzokmfaxqogypq), 4-5 July 2026. The baseline came
from deployed staging; the after set substitutes a local production server
because the redesign branch is not yet deployed - the honest delta is the
serving host, not the code path (same production bundle semantics). The
production database was never touched.

Capture and smoke record: `2026-07-04-fable5-after/capture-smoke.json`
(per-page HTTP status, horizontal-overflow check, console errors).

## The systemic changes behind every pair

1. Glassmorphism removed platform-wide (10 live frosted surfaces -> solid
   navy chrome per the constitution ban); hero carousel arrows now carry the
   platform RailArrows treatment.
2. Colour system consolidated: five shipping golds -> the two gold tokens;
   banned hexes purged; alert banners derive from the semantic error/warning
   tokens; one navy-tinted elevation family and three radius tokens
   (card/panel/control) added and adopted in the shared primitives.
3. Rail/section headings now obey the measured 24px law via
   `.type-rail-heading` in the shared SectionHeader (they rendered up to 30px).
4. Designed error boundaries added for checkout and the organiser dashboard
   (previously any render failure fell to the one global boundary).
5. Every event share link is a designed, branded Open Graph invitation card
   (cover photo under the platform scrim, gold eyebrow, title, date, venue,
   wordmark), generated per event at `/events/[slug]/opengraph-image`.
6. The 55 licensed spine photographs now exist on TEST storage, so every
   marketing surface renders real imagery on TEST-pointed environments
   (they 404'd before; staging masked it by reading production imagery).

## Pairings

| Baseline capture | After capture | What improved |
|---|---|---|
| home-desktop.png | home-desktop.png | Rail floor enforced (RAIL_MIN 3): the one-card Comedy/Sport/Family rails that read as emptiness are gone; page is denser and ~17% shorter with every visible rail full. |
| home-mobile.jpg | home-mobile.jpg | Same rail floor on mobile; the long thin-rail tail is gone; solid (de-glassed) chrome on the bottom nav. |
| events-browse-desktop.jpg | events-browse-desktop.png | Paginated grid (24/page) with the feature rail; the baseline's single-wall catalogue page is gone. |
| events-browse-mobile.jpg | events-browse-mobile.png | The baseline mobile page rendered ~281,000 physical px tall (whole catalogue); the after page is ~1/5 of that via pagination. |
| event-detail-desktop.png | event-detail-desktop.png | Ticket column never runs empty: the attributed share-a-ticket card rides with the sticky panel; organiser card gains Follow (demand graph); rail-heading scale corrected. |
| event-detail-mobile.png | event-detail-mobile.png | Same event, solid badges (no frosted chrome), share bar and trust signals intact; every shared link now unfurls as the branded OG invitation. |
| category-landing-* | category-landing-* | HONEST PAIR: /categories/music rendered the designed 404 in the baseline AND renders it now (the /categories route hosts only the legacy scene categories; general categories browse via /events?category=music and nothing internal links here). Kept same-name for parity; the route mismatch is raised in the critique. |
| city-landing-* | city-landing-* | City spine imagery now real on TEST (was prod-masked); heading scale corrected. |
| cities-index-* | cities-index-* | Count chips solid navy (were frosted glass, banned); city tiles carry real photography on TEST. |
| communities-index-* | communities-index-* | Count chips de-glassed to solid navy; imagery real on TEST. |
| community-landing-* | community-landing-* | HONEST PAIR: /community/first-nations was a guessed URL that rendered the designed 404 in the baseline and still does; the canonical landing is /community/aboriginal-torres-strait-islander (verified 200, along with the other heritage slugs the homepage actually links). |
| organisers-landing-desktop.png | organisers-landing-desktop.png | Full conversion rebuild: wedge hero (Sell out. Keep everything.) with the live all-in fee above the fold, honest live-proof strip (262 events, 20 cities, 25 organisers, live counts with a credibility floor), the demand-engine band, the live payout calculator running the exact checkout fee math, a Founding Organiser offer band, and a zero-fabrication testimonials slot. |
| organisers-landing-mobile.jpg | organisers-landing-mobile.jpg | Same rebuild, mobile-first: hero fits the law-fixed height (headline + fee + CTAs), calculator stacks cleanly, 44px targets throughout. |
| pricing-desktop.png / -mobile.png | same | Rail-heading scale + token consolidation; fee figures remain live from pricing_rules (displayed == charged). |
| about-* / help-* | same | Token consolidation pass; no layout change (kept honest: polish only). |
| signin-* / signup-* | same | Brand-panel auth shell verified on the production build (photographic panel + card, per the encoded competitor pattern); consolidated golds. |
| feed-* | same | Signed-out redirect to /login recorded, matching the baseline behaviour. |
| account-* / account-tickets-* | same | Shared chrome fixes (solid account dropdown, no glass); tokens. |
| organiser-dashboard-* | same | Container lifted to the canonical 1400px (was silently capped at 1152px); designed error boundary added; empty states unchanged (fresh account, as in the baseline). |
| organiser-events-* | same | Same container lift and token pass. |
| event-create-step-1-* | event-create-step-1-* | Baseline showed the organisation-setup form (fresh account); the test account now has its organisation, so the after capture records the wizard entry: noted, not hidden. |
| event-create-step-2/3-desktop.png | same names | Aliases of wizard steps 1/2, as in the baseline's first walk. |
| event-create-wizard-step-1..7 (both viewports) | same names | Full 7-step walk re-captured; the media step passed the upload smoke: the cover preview appeared IMMEDIATELY on upload (the launch-blocker fix held). Draft never published. |
| checkout-attempt-error-desktop.png / -mobile.png | checkout-desktop.png / checkout-mobile.png | THE headline pair: the baseline could not reach checkout at all (createReservation 500, digest 240934949). The after set captures a real /checkout/[reservation_id] on a live TEST reservation: the money surface now works end to end. |
| (not in baseline) | order-confirmation-desktop.png / -mobile.png | Bonus surface: the free-registration path driven end to end by the harness (ticket selected, order minted, confirmation rendered) - proof the acquisition-critical free flow works A to Z. |

## Functional smoke (every redesigned page)

- Every captured route resolved with its expected status; zero horizontal
  overflow at 390 on every page (documentElement.scrollWidth check).
- Login through the real form (rate-limiter respected, one login per run).
- Create-event wizard: all 7 steps advanced; image upload previewed
  immediately; draft left unpublished and clearly named.
- Checkout entry: real reservation created on TEST and the checkout page
  rendered (no payment taken; the reservation expires naturally).
- Free registration: full A-to-Z pass to order confirmation.
- Open Graph: per-event card verified 200 image/png with title, date, venue
  and cover art; page metadata defers og:image/twitter:image to the card. An
  external link-preview validator needs a deployed URL: run one against
  staging after this branch deploys (noted in the critique).

## Side effects left on TEST (never production)

- One draft event "After Capture Draft (design proof, never published)" per
  walked viewport under the test user's organisation.
- One free order (order-confirmation capture) and one expiring reservation
  (checkout capture) for the test user.
