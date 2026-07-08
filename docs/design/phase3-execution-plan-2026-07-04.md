# Phase 3 Execution Plan - 2026-07-04 (Fable 5 design upgrade)

Working branch: `feat/design-upgrade-2026-07-04`. Every surface: mobile-first,
both viewports verified, re-verified functionally after redesign, tokens only,
no glassmorphism, Australian English, no em/en dashes, "community" never
"culture". Baseline comparison target: `docs/baseline/2026-07-04-opus-baseline/`.
After captures: `docs/design/2026-07-04-fable5-after/` (same names).

## Surface order and design intent

### 1. Organiser landing `/organisers` (highest-converting page)
Cold outreach lands here. Current page has good bones (hero, stats, pricing
clarity, three bands, four steps, community strip, FAQ, closing CTA) but is
missing the discovery half of the wedge and all conversion social proof.
Redesign to a conversion narrative in this order:
1. Hero: sharper wedge headline; keep all-in fee line above the fold.
2. Live social-proof band: honest counts from getPlatformStats (events listed,
   organisers, cities) rendered ONLY when live (source === 'live'), styled as
   quiet confidence, never inflated. Plus the existing four platform truths.
3. THE DISCOVERY WEDGE BAND (new, the missing blade): "We bring the audience"
   - feed, push alerts, who's-going, follow-organiser mechanics, stated
   concretely with a slot for the measured discovery stat when data exists.
4. Pricing clarity band (kept) + payout-timing made a first-class element
   (5 business days after event, funds-holding model stated plainly).
5. Founding Organiser offer band (new): config-driven slot in
   src/lib/organisers/founding-offer.ts (headline, terms, CTA), rendered only
   when enabled. Honest scarcity only - no fabricated counters.
6. Data-ownership band (kept, strongest existing asset).
7. Testimonials slot (new): config in src/lib/organisers/testimonials.ts,
   renders only when real testimonials exist (zero fabrication; empty config
   ships empty and the band hides).
8. How-it-works, community strip (rebalanced smaller per the 10-20% law),
   FAQ, closing CTA (kept, polished).

### 2. Home page `/`
Baseline read: a dozen visually identical rails, monotonous; thin rails
(Comedy, Sport, Family 1 card) read as emptiness; same events repeat across
rails. Fixes: rhythm variation (hero -> category chips -> featured rail ->
editorial band -> rails with alternating density), rail-minimum rule (a rail
with fewer than 3 items folds into a combined "More this week" section rather
than rendering thin), tightened section seams, one signature moment (the
featured hero carousel already exists - polish type/scrim/CTA weight).
Do NOT restructure data fetching; presentation only.

### 3. Event detail `/events/[slug]`
The conversion surface. Baseline read: right column empty below ticket panel
for the whole scroll; share bar is plain pills; organiser band thin; no
who's-going. Fixes: sticky ticket panel with all-in fee microcopy at the buy
button ("The total you see is the total you pay" register, own words); share
actions redesigned as a designed, visible band (Copy link primary, WhatsApp,
Facebook, X, Email) near the hero AND after description on mobile; who's-going
/ social-proof module when data exists; organiser card upgraded (avatar,
follow, more-from-organiser); right column gets venue/date recap card so the
column never runs empty; related events kept. Per-event OG card already built.

### 4. Event discovery `/events`
Baseline: extremely long single grid (280k px tall on mobile!). Fixes:
pagination or load-more instead of the infinite wall, filter bar polish,
category chips, card grid rhythm, count display. Careful: this page is heavy;
presentation-layer changes only.

### 5. Checkout `/checkout/[reservation_id]`
Light canvas (law), order summary with all-in fee lines, marketing consent
checkboxes (already built - verify styling), trust microcopy at pay button,
designed expiry timer. Payment engine untouched: styling and copy only inside
checkout-form.tsx; PaymentCalculator and server actions are off-limits.

### 6. Organiser dashboard `/dashboard`
Baseline: near-empty state for fresh account. Fixes: designed empty states
(invite to create first event), stat tiles coherence (radius/shadow tokens),
container to max-w-7xl, sidebar polish, mobile nav. Keep all data plumbing.

### 7. Event creation wizard `/dashboard/events/create` (7 steps)
Fixes: step indicator polish, form rhythm (FormField adoption), image upload
step clarity (upload defect was fixed earlier - verify it held), review step
scannability, mobile form ergonomics (44px targets).

### 8. Auth `/login`, `/signup`
Competitor evidence (encoded skill): desktop auth = brand panel + form card;
mobile = card only. Current baseline is plain centred card. Redesign: split
brand panel (navy, imagery, value line) + form; polish inputs to FormField
standard; error/loading states.

### 9. Share cards + link-preview verification
opengraph-image.tsx per event (built). Verify: local prod server, fetch
/events/[slug]/opengraph-image renders 200 PNG with title/date/venue; check
og:image meta resolves on the page; visual check of the generated card at
1200x630 for a real seeded event and one with no cover image.

## Phase 4 protocol
Same 60 captures, same filenames, from the local production server against
TEST (baseline used deployed staging; note the substitution honestly in
BEFORE-AFTER.md) OR redeploy staging first if feasible. 1440x900 and 390x844
iPhone 13 profile, full-page, scroll-to-load-lazy-images first, seeded test
account for authed surfaces. Then BEFORE-AFTER.md pairing every capture with
a one-line improvement note. Then functional smoke: nav, forms, image upload,
checkout entry, on every redesigned page.
