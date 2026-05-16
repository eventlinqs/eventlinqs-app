# Competitor Intelligence + EventLinqs Self-Assessment

National Launch Foundation, Phase 1.3
Prepared: 16 May 2026
Inputs: 5 competitor captures + 6 live EventLinqs pages (+ 1 documented 404), markdown + full-page screenshots in this directory and ../eventlinqs-current/

Scope reminder: this analysis is the brief for the /pricing rebuild (v0.dev, tomorrow) and sets the rebuild order for every other public page. The bar is "objectively better than any competitor's equivalent", for a national Australian launch and international expansion, serving both free and paid organisers across the full event-size spectrum.

---

## A. POSITIONING ANALYSIS

One sentence per surface: the promise it leads with, who it targets, how it frames trust.

**Competitors**

- **Ticketmaster (Business AU)**: "Partner with the global leader who breaks records" - targets stadiums, major promoters and rights-holders, trust framed through marquee-event name-drops (F1, Australian Open, Sydney Royal Easter Show) and named senior-executive testimonials; pricing deliberately invisible.
- **DICE**: "The only ticketing platform that puts the fan first" - targets venues, promoters and artists in the live-music/club world, trust framed through an ideological values narrative plus operator and artist case studies; pricing deliberately invisible.
- **Eventbrite (AU)**: "Publish free on the world's largest events marketplace, attendees pay low fees only on paid tickets" - targets the self-serve long tail plus a sales-assisted large-event segment, trust framed through scale numbers (270M tickets, 89M users) and a head-to-head competitor table.
- **Humanitix (AU)**: "Tickets for good, not greed: low fees, 100% of profits to charity" - targets values-driven organisers, charities and schools, trust framed almost entirely through the charitable-mission reframe of the booking fee.
- **Squarespace**: "Beautiful websites that also sell" - targets small businesses and creators who want one owned web presence (ticketing is an afterthought, not a product), trust framed through design quality, 24/7 support and a 14-day trial.

**EventLinqs (per page scraped)**

- **Homepage**: "Every culture. Every event. One platform" - targets attendees first (discovery marketplace), organiser pitch is one block of fourteen; trust framed only through the event content itself (no signals).
- **/events**: "Find your next event" - functional attendee browse; no positioning beyond the filter taxonomy; trust = inventory.
- **/events/[slug]**: "This event, clearly, with a community organiser behind it" - the only surface with explicit trust framing (Secure checkout / Community organiser / Refund policy micro-row).
- **/cultures**: "Every culture, each with its own home" - strong promise, but 14/14 destinations are "Coming soon" so the surface advertises absence.
- **/cities**: "20 cities, capitals and regions alike" - same: 16/20 "Coming soon", and a copy/state contradiction.
- **/organisers**: "Sell tickets. Keep more. No gatekeeping" - targets the self-serve long tail explicitly; trust framed through honest FAQ depth, but zero quantified proof.
- **/pricing**: "Simple. Transparent. Fair." - targets organisers deciding on cost; trust framed through the "free forever" promise and an honest FAQ, undercut by hedging language.

Synthesis: the market splits cleanly into two camps. Enterprise-prestige sales-gated (Ticketmaster, DICE) and self-serve transparent (Eventbrite, Humanitix, Squarespace). EventLinqs is correctly in the second camp, and is the only player in the entire set whose lead promise is cultural-community-first. No competitor owns multicultural Australia. That is open territory.

---

## B. PRICING STRUCTURE COMPARISON

| Platform | Free events | Paid-ticket fee | Buyer fee model | Payout timing | Subscription | Public pricing? |
|---|---|---|---|---|---|---|
| **EventLinqs** | $0 forever, all features | **From 2.9% + AUD 0.59 / paid ticket** | Organiser chooses absorb or pass; buyer always sees full total | Within 5 business days of event end (+1-3 bank days), Stripe Connect | None | Yes (self-serve) |
| Eventbrite AU | $0, unlimited | 3.7% + AUD 1.79 service + 2.9% processing (effective ~6.6% + 1.79) | Buyer-paid by default, organiser can absorb | Pre-event payouts available | Optional Pro from AUD 15/mo | Yes (self-serve) |
| Humanitix AU | $0 | Standard 4% + 0.99 (excl GST); Charities/Schools 2.5% + 0.50 | Booking fee on buyer; configurable | Scheduled payouts | None | Yes (self-serve) |
| Ticketmaster Business AU | Not stated | Not disclosed (bespoke) | Not disclosed | Not disclosed | Not disclosed | No (sales gate) |
| DICE | Not stated | Not disclosed (bespoke); consumer model absorbs fee into face value | Fee absorbed (fan-first) | Not disclosed | Not disclosed | No (partner gate) |
| Squarespace | n/a (no ticketing product) | Subscription AUD 19/32/56/109 per mo + card 2.5-2.9% + 0.30; store/digital transaction fees by tier | Buyer pays card cost only | Standard card settlement | Required (no free plan) | Yes (but not ticketing) |

Headline finding: **EventLinqs has the cheapest credible per-ticket economics in the set.** 2.9% + $0.59 undercuts Humanitix Standard (4% + $0.99) and is dramatically below Eventbrite's effective ~6.6% + $1.79. Only Humanitix's Charities/Schools tier (2.5% + $0.50) goes lower, and that is a restricted segment tied to a charity mission. This is a genuine, defensible price advantage that the current /pricing page barely dramatises.

Caveat the rebuild must resolve: EventLinqs states the fee three different ways across three pages. /pricing says "from 2.9% + AUD 0.59" with an "indicative ... may vary by event type" disclaimer; /organisers says the fee is "a percentage ... split between EventLinqs and the organiser ... we cap the total"; the homepage stat strip says "0% on free events" only. A single, definite, consistent fee statement is mandatory.

---

## C. PAGE STRUCTURE PATTERNS

Approximate section order and prose-vs-visual balance on the pricing/sell pages:

- **Eventbrite** (longest, ~14 blocks): nav with dual CTA -> hero promise + CTA -> feature triad (Get discovered / Fast-track / Engage) -> scale-proof stat band (270M/89M/4.7M) -> **3 plain pricing cards** -> large-event sales-assist block -> upsells (Pro, Ads) -> plans-grow block -> 2 testimonials -> **competitor comparison table** -> FAQ accordion (6, titles only) -> closing CTA with image. Visual:prose roughly 50:50, image-led section alternation.
- **Humanitix** (shortest, ~7 blocks): hero promise + dual CTA + image -> **4 pricing tiles** -> "all good, no compromise" 4-bullet -> full feature list (30 items) -> mission block + image -> FAQ (2, titles only) -> closing CTA. Visual:prose ~40:60, copy does the work, very tight.
- **Squarespace** (medium): hero + billing toggle -> **4 subscription cards with Recommended badge** -> expandable full feature matrix -> premium upsell -> FAQ (10, full answers) -> 24/7 support -> trial CTA. Visual:prose ~35:65, the matrix is the centrepiece.
- **Ticketmaster / DICE**: no pricing structure at all; both are hero -> solution pillars / values -> case studies/testimonials -> long lead-capture form. Pricing section word count: zero.
- **EventLinqs /pricing** (~5 blocks): eyebrow -> hero promise -> **3 text pricing cards** -> indicative disclaimer -> FAQ accordion (6, full answers) -> closing CTA. Visual:prose ~10:90. It is the most prose-dominant, least visual pricing page in the entire set.

Pattern: every credible pricing page leads the actual pricing cards with either scale proof (Eventbrite) or a mission hook (Humanitix) or a value anchor (Squarespace Recommended badge), then follows the cards with proof (table, testimonials, or full feature matrix) and closes with risk-reversal. CTA placement is consistently top (nav) + on the primary card + closing. FAQ is universal (everyone has one); the strong ones give full answers (Squarespace, EventLinqs), the weak ones give titles only (Eventbrite, Humanitix).

---

## D. TRUST SIGNAL PATTERNS

| Platform | Where | Density | Authenticity |
|---|---|---|---|
| Ticketmaster | Throughout (stats, testimonials, PCI/P2PE) | High | High - named execs, real marquee events, verifiable |
| Eventbrite | Above pricing (scale band) + below (table, 2 quotes) | High | Medium - big numbers are real but the competitor table is self-serving |
| DICE | Mid-page (1 operator quote, artist stories, values) | Medium | Medium-high - named operator, recognisable artists |
| Humanitix | The mission itself + "no contracts/free support" | Low-medium | High but thin - relies entirely on the charity claim, no numbers or names |
| Squarespace | Support promise + full-answer FAQ + trial | Low | Medium - process trust, not social proof |
| **EventLinqs** | **Only the event-detail micro-row.** None on /pricing, /organisers, homepage | **Near zero** | n/a - there is almost nothing to assess |

This is the sharpest single contrast in the study. Every serious competitor front-loads trust adjacent to the price. EventLinqs front-loads nothing. The "Secure checkout / Community organiser / Refund policy" row on event detail proves the team knows the right pattern; it simply has not been propagated to the pages where the buying decision is actually made.

---

## E. VISUAL & UX OBSERVATIONS

- **Ticketmaster**: dark cinematic palette, autoplay video, oversized stat callouts, premium and intimidating; clearly desktop-led, enterprise.
- **DICE**: high-contrast black/white, one bold ideological headline, full-bleed imagery, single CTA, confident negative space.
- **Eventbrite**: bright brand orange (#f6682f), alternating image/text rows, three uncluttered pricing cards, accordion FAQ, comparison table as a visual weapon; mobile-considered.
- **Humanitix**: clean and friendly, playful typographic copy ("Nothing. Nada. zero."), four compact tiles, illustration, brevity as confidence.
- **Squarespace**: ultra-minimal, four-card grid, single Recommended badge to anchor the eye, annual/monthly toggle with "Save X%", progressive-disclosure feature matrix; the gold standard for pricing-page craft in this set.
- **EventLinqs**: event detail and homepage are visually rich and on-brand (real cultural imagery, warm copy, AU specificity). But /pricing is the plainest page in the entire study: three text cards, no hero image, no badge, no toggle, no calculator, no table, no illustration. The homepage has the opposite problem: 14 sections and 5+ rails with heavy seed-data repetition (the same ~25 event titles recur across every rail), risking density fatigue. Touch-target and drag-rail standards appear met on cards; the pricing page has no interactive element to assess.

---

## F. THE 3 STRONGEST COMPETITOR PATTERNS (with reasoning)

1. **Humanitix: price-as-story plus flat all-features pricing plus a moral reframe of the fee.** Reasoning: it neutralises the single biggest objection in ticketing (fees feel like greed) by making the fee a contribution, and "ALL plans get ALL features" removes feature-gating anxiety entirely. It converts a cost conversation into a values conversation. EventLinqs cannot copy the charity mechanic, but it can copy the structural move: make the fee a story (community keeps more) and guarantee all features on every tier.
2. **Eventbrite: the free-events-free promise repeated three times, plus scale proof placed immediately above the pricing cards.** Reasoning: repetition of the zero-cost entry promise lowers the activation barrier for the long tail; putting "270M tickets" right before the fee pre-justifies the fee so it never feels like the first thing you see. Sequencing is doing persuasive work, not just the words.
3. **Squarespace: a single Recommended badge plus a savings-framed billing toggle plus a progressive-disclosure feature matrix.** Reasoning: the badge removes choice paralysis by pre-deciding for the median user; the toggle reframes price as savings; the expandable matrix serves detail-hungry buyers without punishing scanners. This is the cleanest decision-architecture in the set and is directly transferable to a 3-tier ticketing page.

---

## G. THE 3 WEAKEST COMPETITOR PATTERNS (do NOT copy)

1. **Hiding all pricing behind a sales gate (Ticketmaster, DICE).** It abandons the entire self-serve long tail and signals "if you have to ask, you cannot afford it". EventLinqs already beats this; the rebuild must not regress toward it (e.g. by making the real number feel gated behind "indicative / contact us / may vary").
2. **Claiming "simple" while presenting split-fee math with no all-in number (Eventbrite).** "3.7% + $1.79 service" plus "2.9% processing per order" forces the reader to do arithmetic to learn what they will actually pay. Saying "simple" while being unsimple erodes trust. The fix competitors miss: a worked example.
3. **Subscription-first / hedged-pricing patterns that tax or confuse before value is delivered (Squarespace's mandatory monthly fee; and the generic "fees may vary, indicative only" disclaimer seen industry-wide).** Charging or hedging before the organiser has sold a single ticket is hostile to the community and one-off organisers EventLinqs must win. Note: EventLinqs currently commits failure #2 and #3 against itself (no all-in example; "indicative ... may vary by event type" disclaimer). These are unforced errors.

---

## H. EVENTLINQS CURRENT STATE (per page)

- **Homepage**: Works - genuine culture-led carousel, strong AU specificity, warm community copy, the "0% / 2-tap / 5+ / 24/7" stat seed. Missing - any trust signal; the organiser pitch is buried at block 13/14. Generic risk - high section count with repeated seed events reads thin. Off-brand - none, tone is right. Bug - localhost OG image.
- **/events**: Works - clean filters, grid/map toggle, believable AU price ladder. Missing - culture and category are merged into one flat dropdown (should be orthogonal). Generic - looks like an Eventbrite search; nothing yet signals culture-first. Bug - localhost OG.
- **/events/[slug]**: Works - the best page; competitive with Eventbrite/Humanitix on detail, map, organiser block, share row (WhatsApp first), mixed tiers, trust micro-row. OG tags correct here. Missing - no all-in fee preview at the ticket step, no organiser proof, no add-to-calendar.
- **/cultures**: Works - differentiated taxonomy and excellent taglines. Critically broken - 14/14 "Coming soon"; reads as vapourware; cultures list does not match the CLAUDE.md canonical list. Bug - localhost OG.
- **/cities**: Works - regional inclusion is on-brand. Critically broken - 16/20 "Coming soon" and a direct copy/state contradiction ("launches with full event catalogues in each" above tiles that say Coming soon). Bug - localhost OG.
- **/organisers**: Works - honest 4-step flow with real time estimates, full-answer FAQ with refund-override guarantee, "no gatekeeping" differentiator. Missing - zero quantified trust, fee story verbal not visual, "real-time tools" claimed but not shown. Bug - localhost OG. Also: /for-organisers is a 404 (only /organisers exists).
- **/pricing**: Works - correct 3-tier model, strong "free forever" promise, the cheapest headline rate in the set, honest FAQ, strong "no card until you sell" line. Critically behind - no all-in worked example, hedged "from/indicative/may vary" language fighting the "Simple. Transparent. Fair." headline, zero trust signals, plainest visual presentation in the set, fee story inconsistent with /organisers and homepage. Bug - localhost OG.

---

## I. GAP ANALYSIS (current state vs the "surpass Ticketmaster" bar)

- **/pricing**: Gap is presentation and proof, not economics. Bar requires: one definite headline number, an all-in worked example, a competitor comparison table (EventLinqs wins it on real numbers), at least one quantified trust signal, and a mobile-first interactive element (fee calculator). Currently has none of these. Highest-leverage rebuild in the project.
- **Homepage**: Gap is trust and focus. Bar requires a trust band (organiser/payout proof) and a tighter, less repetitive structure with the organiser value surfaced earlier. Move the stat strip up and make it real.
- **/organisers**: Gap is proof. Bar requires quantified trust, a visible all-in example, and a real product screenshot for the "real-time tools" claim.
- **/cultures and /cities**: Gap is existence. Bar requires real, populated destination pages. "Surpassing Ticketmaster" is impossible while the brand's central promise links to 14 empty rooms. These are launch-credibility blockers, second only to the OG bug.
- **/events**: Gap is differentiation. Bar requires the browse to feel culture-first (split culture from category; lead with community rails) rather than a generic search.
- **/events/[slug]**: Smallest gap; near parity. Bar requires all-in fee preview at the ticket step plus organiser proof and add-to-calendar to move from parity to surpass.
- **Cross-cutting blocker**: the `http://localhost:3000/opengraph-image` leak on every marketing page makes the entire site unshareable on social and WhatsApp - directly contradicting "WhatsApp sharing built in". This is a hard launch blocker and must be fixed before any of the above ships.

---

## J. RECOMMENDED STRUCTURE FOR EVENTLINQS /PRICING

Every choice below is justified. Mobile-first throughout (the buyer audience is mobile and WhatsApp-native per the brand). All copy follows brand rules: Australian English, no em-dashes, no exclamation marks, culture-first language.

**0. Pre-work (blocking, not optional)**
- Fix the OG image base URL before this page ships. A pricing page that cannot be shared is a pricing page that does not exist. Reason: the rebuild's whole point is distribution.
- Reconcile the fee to ONE definite statement used identically on /pricing, /organisers, and the homepage stat strip. Reason: three different numbers is the opposite of "Transparent".

**1. Hero - the promise, made specific.**
- H1: "Keep more of what your community pays." Sub: "Free events are free, forever. Paid tickets: one low fee, shown in full before anyone pays." Primary CTA "Start selling tickets", secondary "See an example below" (anchor).
- Reason: leads with the organiser-benefit ("keep more") not a generic adjective; "shown in full before anyone pays" states the all-in promise as fact, not slogan. Image: a real Australian community-event photograph (same library as event detail), not an abstract gradient, to keep culture-first identity continuous with the rest of the site.

**2. The all-in worked example - the single most important new element.**
- An interactive mini-calculator (or, if time-boxed, a static worked example): "A $50 ticket. Buyer pays $50.00. You receive $4X.XX. EventLinqs fee: $X.XX. No surprises at checkout." Toggle: "I will absorb the fee" / "Buyer pays the fee", showing both outcomes.
- Reason: this is the gap NO competitor closes (Eventbrite explicitly fails it). It converts "Transparent" from a claim into a demonstration, on mobile, above the fold-ish. It is the highest-conversion element we can add and the clearest way to "surpass".

**3. Three pricing cards: Free / Paid (Most popular badge) / Enterprise.**
- Keep the existing tier model (it matches buyer expectations). Add a single "Most popular" anchor on Paid (Squarespace pattern, justified: removes choice paralysis). Definite number on Paid: "2.9% + AUD 0.59 per paid ticket. That is it." Remove "from" and the "indicative/may vary" disclaimer from the card; if event-type variation is real, express it as a named, visible exception, not a blanket hedge.
- Reason: hedging language is weakest-pattern #3 and actively fights the headline. Humanitix wins by being unhedged; we have a better number than Humanitix Standard and must state it with the same confidence.

**4. "All features, every tier" strip.**
- One line plus a compact icon row: dashboard, scan app, squad booking, discount codes, multi-currency, payout support - all included on Free and Paid.
- Reason: directly adopts Humanitix's strongest structural move (no feature-gating anxiety); differentiates from Squarespace's tier-gated model.

**5. Comparison table: EventLinqs vs Eventbrite vs Humanitix (vs "Enterprise platforms: pricing on request").**
- Rows: free events, fee on a $50 paid ticket (show the real math), all features on free tier, public transparent pricing, payout timing. EventLinqs wins or ties every row on real numbers.
- Reason: Eventbrite proves a comparison table is a conversion weapon. We can run the same play and actually win it honestly, which Eventbrite cannot (their effective rate is ~6.6% + $1.79). Honest, verifiable, devastating.

**6. Trust band (new, mandatory).**
- Whatever is genuinely true at launch: events ticketed to date, payout reliability statement, Stripe-secured badge, the refund-override guarantee restated, and 1-2 real organiser quotes if any exist. If volume numbers are not yet credible, lead with the guarantees (refund override, no card until you sell, free forever) rendered as trust tiles rather than buried in FAQ prose.
- Reason: section D shows this is our single biggest deficit versus every competitor. Trust must sit adjacent to price, not only inside the FAQ.

**7. FAQ - keep the full-answer format, reorder by buyer anxiety.**
- Order: who pays the fee / what is the all-in cost / when do I get paid / refunds / currencies / what counts as a paid ticket. Keep full answers (this already beats Eventbrite and Humanitix title-only accordions; matches Squarespace).
- Reason: the content is already a strength; only sequencing and consistency with section 2-3 need work.

**8. Closing risk-reversal CTA.**
- Keep "No credit card required until you sell a ticket." Pair CTAs: "Start selling tickets" + "Talk to us" (Enterprise).
- Reason: this line is already best-in-set risk reversal; do not weaken it.

**Mobile-first layout decisions (justified):**
- Calculator and cards stack single-column, calculator first after hero (mobile users decide on cost fastest with a concrete number, not three cards to compare by scrolling sideways).
- Comparison table becomes a stacked, per-competitor card set on narrow viewports (never a horizontally scrolling table - that hides the row where we win).
- Sticky bottom CTA bar on mobile ("Start selling tickets") so the action is always one tap away during a long scroll.
- Trust band uses 2-up tiles on mobile, not a carousel (carousels hide proof; proof must be glanceable).

**One-line rebuild thesis:** EventLinqs already has the best economics and the most honest voice in the market; the rebuild's entire job is to PROVE it - one definite number, one worked example, one comparison table, one trust band - and to stop hedging against its own strongest asset.

---

## SUMMARY STATS

- Competitor pages captured: 5 (Ticketmaster Business AU, DICE Partners, Eventbrite AU, Humanitix AU, Squarespace) - 2 had no public pricing (enterprise sales gate), 1 had no ticketing product (Squarespace), 2 are true self-serve pricing pages (Eventbrite, Humanitix).
- EventLinqs pages captured: 6 live (homepage, /events, event detail, /cultures, /cities, /organisers, /pricing) + 1 documented 404 (/for-organisers).
- Initial competitor URLs that 404'd and were re-located via site map/search: 2 (DICE /help/sell -> /partners; Squarespace /tour/sell-tickets -> /pricing).
- Patterns identified: 3 strongest, 3 weakest, plus 1 cross-cutting launch blocker (OG localhost leak).
- Artefacts: 11 markdown captures + 13 full-page screenshots in this directory tree.

---

# PHASE 1.4 ADDENDUM - TICKETMASTER-SURPASS REFRAME

Reframe statement: Sections A to J above were anchored against Eventbrite and Humanitix as the practical comparables. That framing is demoted here. The mission is to SURPASS Ticketmaster (primary target) and DICE (secondary target, best modern challenger UX). Eventbrite and Humanitix are tertiary: beating the top two beats them automatically. From this point, "match" or "at parity" is recorded as a FAILURE state, not a milestone. Every bar below is an exceed bar.

Additional evidence captured for this addendum (consumer-side, where Ticketmaster and DICE actually expose fees, checkout and mobile UX, since their B2B pages have no pricing):
- ticketmaster-consumer.md - ticketmaster.com.au homepage + Guns N' Roses artist page (mobile 390x844). Evidence: no price/fee on any discovery surface, ad slots, browser-not-supported banner, OneTrust consent wall, reCAPTCHA, mega-brand only, capital-city only.
- dice-consumer.md - dice.fm homepage + an event page (mobile 390x844). Evidence: "See the full price upfront, with no surprises at checkout" and "From $21.53 The price you'll pay. No surprises later." (DICE explicitly counter-positions on Ticketmaster's hidden fees); app-download funnel; US-geo/USD even on an AU request; club/gig vertical only.
- 2 new mobile screenshots: ticketmaster-event-mobile.png, dice-event-mobile.png.

---

## K. TICKETMASTER-SURPASS CRITERIA (PER PAGE TYPE)

Each page: what Ticketmaster does (evidence cited), what DICE does, what SURPASS means in concrete UI/UX/copy/data terms, and the named visual quality bar. Specifics are literal (px, line-height, ms), not adjectives.

### K1. /pricing
- **Ticketmaster**: no public pricing exists anywhere (business.ticketmaster.com.au is a "Work With Us" sales gate; consumer surfaces never show a fee until checkout). Evidence: ticketmaster-pricing.md, ticketmaster-consumer.md.
- **DICE**: no organiser pricing page either (dice.fm/partners is a lead form). But the consumer promise "See the full price upfront, with no surprises at checkout" is the implicit pricing philosophy.
- **SURPASS means**: a public, definite, single-number pricing page that does the one thing both leaders refuse to do. Concrete: one headline figure rendered in tabular-nums at 36 to 44px, weight 600, with the words "This is the whole fee" within 8px of it; an interactive all-in calculator above the fold on mobile (input ticket price, instantly render "Buyer pays $X / You receive $Y" in under 100ms, no submit button); a 4-column honest comparison table (EventLinqs, Eventbrite, Humanitix, "Ticketmaster: price on request") where every row is a real number and the Ticketmaster column literally reads "not disclosed" - using their opacity as our proof. Zero hedging words ("from", "indicative", "may vary") on the card. Trust band of glanceable tiles directly under the cards, not buried in FAQ.
- **Visual bar**: Stripe-quality pricing typography and number clarity (tabular figures, generous 1.5 to 1.6 body line-height, ruthless alignment); Linear-quality density discipline (no decorative noise).

### K2. Event detail page
- **Ticketmaster**: artist/event pages show NO price at the listing layer, only "Find tickets" and "VIP Packages"; bio padding; ad slot on page; browser-not-supported banner. Fees appear only deep in the funnel. Evidence: ticketmaster-consumer.md.
- **DICE**: gold-standard. "From $21.53  The price you'll pay. No surprises later." adjacent to the number; anti-tout trust banner top and repeated; clean vertical mobile flow; useful FAQ accordion; "Read more" body truncation. Evidence: dice-consumer.md, dice-event-mobile.png.
- **SURPASS means**: match DICE's price-with-reassurance microcopy AND beat it on three axes DICE ignores: (1) localisation - AUD, AU venue, AU date format ("Saturday 23 May 2026"), no app wall (DICE forces app install; we stay web-first and WhatsApp-native); (2) all-in fee preview at the ticket selector itself, not just a slogan - show the line-item math the moment a quantity stepper changes, in under 100ms; (3) organiser proof - a verified-organiser badge plus events-hosted count next to the organiser block (Ticketmaster has no organiser identity at all; DICE has none on web). Concrete spacing: ticket selector primary action minimum 48px tall, inside the bottom 33% thumb zone, sticky on scroll; image LCP painted with priority, no parallax. EventLinqs's current event detail (event-detail-gospel.md) is already near DICE; the surpass delta is the all-in preview + organiser proof + AU localisation.
- **Visual bar**: DICE-quality mobile vertical rhythm, Airbnb-quality imagery curation (real cultural photography, never stock-generic), Stripe-quality price legibility.

### K3. Browse / discovery (/events)
- **Ticketmaster**: capital-city, mega-brand only (AFL, Guns N' Roses, Melbourne Cup); ad slots in the grid; no cultural or community taxonomy; no price on cards. Evidence: ticketmaster-consumer.md.
- **DICE**: clean card grid, price ON every card, face-cropped square imagery, "Trending in [city]" - but US-geo-locked and gig/club only.
- **SURPASS means**: a discovery surface that is culture-first AND price-transparent on every card (DICE shows price, Ticketmaster does not - we match DICE and add culture). Concrete: two orthogonal filter axes (Culture and Category as separate controls, not one merged dropdown - the current /events merges them, see events.md); price or "Free" rendered on every card in tabular-nums; zero ad slots ever (a permanent differentiator vs Ticketmaster's in-grid ads); community rails ("Gospel near you", "Owambe this month") that Ticketmaster's taxonomy cannot express. Card grid: 8px base spacing unit, 16px gutter mobile / 24px desktop, image aspect locked 3:2, title clamped to 2 lines at 16px/1.3.
- **Visual bar**: Airbnb-quality grid curation and whitespace, Linear-quality filter-control restraint, no ad clutter (anti-Ticketmaster by design).

### K4. Homepage
- **Ticketmaster**: SEO-stuffed title, browser-not-supported banner, two ad slots, OneTrust wall, reCAPTCHA, 100% mega-brand rails, capital-only cities. High friction, zero community. Evidence: ticketmaster-consumer.md.
- **DICE**: tight, opinionated ("Welcome to the alternative. Incredible live shows. Upfront pricing."), app-download funnel, "Loved by millions" social proof.
- **SURPASS means**: a homepage that loads to culture and trust, not ads and consent walls. Concrete: hero LCP is a real AU cultural event image painted with priority (no carousel jank on first paint); a trust band ("real organisers, transparent fees, fair refunds") within the first viewport on mobile, not at section 14 (current homepage buries the organiser/trust story at block 13 of 14, see homepage.md); reduce the current 14-section homepage to roughly 7 to 9 with no repeated seed-event titles; zero advertising slots, ever. One opinionated line of positioning above the fold, DICE-confident but EventLinqs-cultural ("Every culture. Every event. One platform." earns its place only if the page proves it).
- **Visual bar**: Apple-quality first-viewport hierarchy and restraint, Airbnb-quality imagery, DICE-quality opinionated confidence, zero Ticketmaster-style ad/consent clutter.

### K5. Organiser-facing (/organisers, dashboard)
- **Ticketmaster**: pure sales gate ("Work With Us"), no self-service, no transparency, enterprise only. Evidence: ticketmaster-pricing.md.
- **DICE**: long qualification form, bespoke pricing, no self-service. Evidence: dice-pricing.md.
- **SURPASS means**: instant self-serve is itself the surpass (both leaders gate organisers behind sales). Beyond that: show, do not tell. Concrete: a real product screenshot or short looping muted video (poster-backed, under 2MB, lazy below fold) of the live dashboard and scan app (current /organisers asserts "real-time tools" with no visual proof, see organisers.md); quantified trust (events ticketed, payout reliability) rendered as a stat band; the 4-step sign-up flow with realistic time estimates kept (it already beats every competitor's hand-wave) but each step paired with a UI thumbnail. Definite fee with a one-line worked example mirrored from /pricing (consistency across surfaces is mandatory; today the fee is stated three different ways).
- **Visual bar**: Stripe-quality "developer-trust" calm and proof density, Linear-quality dashboard screenshots, Airbnb-quality onboarding warmth.

### K6. City pages (/city/[slug])
- **Ticketmaster**: /discover/[city] exists but is capital-only, mega-brand, no community framing. Evidence: ticketmaster-consumer.md.
- **DICE**: "Trending in [city]" but US-geo-locked, gig-only, no AU cities.
- **SURPASS means**: a city page that is a cultural map of that city, not a venue list. Concrete: city hero with a real photograph of THAT city (not a generic stock skyline), an at-a-glance "what is on this week in [city]" strip, culture rails specific to that city's communities, upcoming cultural-moment callouts (Diwali, Eid, Africa Day) scoped to the city. Honest empty states: where inventory is thin, say "Be the first to host in [city]" with an organiser CTA, never a dead "Coming soon" tile (current /cities is 16/20 "Coming soon" with a copy/state contradiction, see cities.md). Regional cities treated with the same design weight as capitals (anti-metro-centric is on-brand and anti-Ticketmaster).
- **Visual bar**: Airbnb-quality place-imagery curation and local-guide editorial tone; Apple-quality empty-state grace.

### K7. Culture pages (/culture/[slug])
- **Ticketmaster**: does not exist as a concept. No cultural taxonomy anywhere. This is structurally impossible for them.
- **DICE**: does not exist. DICE is single-vertical (gigs/clubs).
- **SURPASS means**: this is the page type where "surpass" is automatic IF it exists and is good, because neither leader can build it. Concrete: each culture landing has a real hero, sub-culture rails (e.g. South Asian -> Bollywood, bhangra, garba), city scoping, cultural-moment calendar, and a community-organiser spotlight. The bar is not "beat Ticketmaster" (they have nothing) but "be undeniably authentic" - real imagery, correct cultural nomenclature, AU-community framing. Current /cultures is 14/14 "Coming soon" (cultures.md): the entire brand promise links to empty rooms. At minimum 3 flagship culture pages must ship populated. Also reconcile the live taxonomy with the CLAUDE.md canonical cultures list (they currently differ).
- **Visual bar**: Airbnb-quality curatorial imagery and editorial respect; National-Geographic-grade authenticity (no clip-art culture); zero "Coming soon" dead ends.

### K8. Checkout flow
- **Ticketmaster**: the signature failure. Fees are absent from every pre-checkout surface we captured and only resolve late in the funnel; aggressive VIP-package framing on nearly every date; ad-laden context. Evidence: ticketmaster-consumer.md (no price/fee at artist layer; "VIP Packages" default labelling).
- **DICE**: "The price you'll pay. No surprises later." stated at the event; checkout breadcrumb (Ticket -> Payment), anti-tout assurance. Strong, but app-install pressure at the end.
- **SURPASS means**: the all-in number shown at the event must be byte-identical to the number at the final confirm step (a literal invariant: the figure on the event page equals the figure on the pay button). Concrete: a persistent order-total component visible at every checkout step (not revealed at the end), updating in under 100ms on any change; no fee introduced after step 1; no upsell interstitial that is not dismissible in one tap and never pre-ticked; guest checkout default (no forced account, no forced app - direct anti-DICE and anti-Ticketmaster); 2-tap payment via wallet (Apple/Google Pay) in the thumb zone. The promise "what the buyer sees is what they pay" must be demonstrably true with a screenshot diff at QA.
- **Visual bar**: Stripe-quality checkout calm and total-clarity, DICE-quality step minimalism, zero Ticketmaster-style fee surprise or upsell ambush.

---

## L. TICKETMASTER WEAKNESSES WE EXPLOIT

Each: evidence (URL + artefact), and the EventLinqs counter-commitment, which is now a FEATURE REQUIREMENT (not an aspiration).

1. **Fees hidden until deep in the funnel.** Evidence: ticketmaster-consumer.md - no price or service fee on the homepage or the Guns N' Roses artist page; only "Find tickets". DICE openly counter-markets this (dice-consumer.md: "no surprises at checkout"). **Commitment / requirement**: the all-in price is shown on the event card, the event page, and is invariant through to the pay button. A QA gate fails the build if the event-page figure differs from the confirm-step figure by any amount.

2. **Dynamic / surge pricing that surprises buyers.** Evidence: industry-documented Ticketmaster practice; not directly screenshotted here (the "platinum" tokens on the artist page were album certifications, not the pricing product - we do not overclaim). **Commitment / requirement**: EventLinqs prices are organiser-set and fixed per tier; no surge, no algorithmic price inflation; if a tier sells out the next tier's price is pre-disclosed on the page before purchase. Stated explicitly in copy: "The price does not change based on demand."

3. **Aggressive upsells / VIP-package framing as default.** Evidence: ticketmaster-consumer.md - nearly every tour date labelled "VIP Packages"; homepage upsells (gift cards, app). **Commitment / requirement**: no pre-ticked add-ons, no non-dismissible interstitials, add-ons are opt-in and one-tap dismissible; the cheapest valid ticket is always the first option shown.

4. **Generic event presentation, zero community connection.** Evidence: ticketmaster-consumer.md - 100% mega-brand (AFL, Guns N' Roses, Melbourne Cup), bio padding, no organiser identity. **Commitment / requirement**: every event page carries a community-organiser identity block (name, bio, verified badge, events hosted) and cultural context; events are presented as community moments, not SKUs.

5. **Poor / gated mobile experience.** Evidence: ticketmaster-event-mobile.png + ticketmaster-consumer.md - browser-not-supported banner, OneTrust wall, reCAPTCHA, ad slots rendered on a 390px viewport. **Commitment / requirement**: mobile-first, no browser gating, consent handled with a single non-blocking bar, primary action always in the bottom 33% thumb zone at minimum 48px height, Lighthouse mobile Performance >= 95 (already a locked standard).

6. **No cultural relevance for AU community events.** Evidence: ticketmaster-consumer.md (capital-only, mega-brand); dice-consumer.md (US-geo, gig-only). **Commitment / requirement**: culture and city are first-class taxonomies; AUD, AU venues, AU date format and AU cultural-moment calendar everywhere; regional cities given equal design weight to capitals.

7. **Sales-gate opacity on pricing.** Evidence: ticketmaster-pricing.md, dice-pricing.md - both route pricing to a sales form. **Commitment / requirement**: pricing is public, definite, and self-serve; "contact us" exists only for genuine Enterprise, never as the default path.

8. **Limited organiser self-service.** Evidence: ticketmaster-pricing.md ("Work With Us"), dice-pricing.md (qualification form). **Commitment / requirement**: organiser sign-up to live event with no human gate; most events auto-approved same business day; this "no gatekeeping" promise is kept and quantified.

9. **Confusing typography hierarchy and SEO-stuffed framing.** Evidence: ticketmaster-consumer.md - title "Tickets for Concerts, Sport, Arts, Theatre, Family, Events, more. Official Ticketmaster site"; bio-padded artist pages. **Commitment / requirement**: one clear H1 per page stating the user benefit; titles written for humans; type scale with no more than 4 active sizes per page; Stripe-grade hierarchy.

10. **Information overload vs scannability; ad and consent clutter.** Evidence: ticketmaster-consumer.md - two ad slots + OneTrust centre + reCAPTCHA + paginated date sprawl. **Commitment / requirement**: zero third-party advertising on any consumer surface, ever (permanent product principle); a page must be scannable in under 5 seconds to its primary action; Linear-grade density discipline.

---

## M. PER-PAGE REBUILD BRIEFS

Format per page. Priority is launch impact under the Ticketmaster-surpass bar.

### PAGE: https://www.eventlinqs.com/pricing
- CURRENT STATE: Correct 3-tier model, the cheapest real rate in the set (2.9% + AUD 0.59), honest full-answer FAQ, strong "no card until you sell" line. But it is the plainest page in the entire study and hedges its own best asset.
- WHAT WORKS: "Free forever, zero platform fees"; the FAQ candour; the closing risk-reversal line.
- WHAT IS GENERIC: three undifferentiated text cards; no hero; no interactive element; reads like a default SaaS pricing template.
- WHAT IS BROKEN: localhost OG image (unshareable); "from / indicative / may vary by event type" disclaimer contradicts the "Simple. Transparent. Fair." headline; fee inconsistent with /organisers and homepage.
- GAP TO TICKETMASTER: already ahead (they have no public pricing). This page wins by merely existing well.
- GAP TO SURPASS BAR: no all-in worked example; no calculator; no comparison table; no trust band; hedged number. Surpass requires all five.
- REBUILD APPROACH (v0.dev): sections in order = hero (benefit H1 + real cultural image) -> interactive all-in calculator -> 3 cards (Free / Paid "Most popular" / Enterprise, definite number, no hedge) -> "all features, every tier" strip -> honest 4-col comparison table (EventLinqs vs Eventbrite vs Humanitix vs "Ticketmaster: not disclosed") -> trust band tiles -> reordered full-answer FAQ -> risk-reversal close. Components: PricingCalculator, PricingCard, ComparisonTable (stacked cards on mobile), TrustTileRow, FAQAccordion. Constraints: no em-dashes, AUD, tabular-nums for all figures, sticky mobile CTA, zero hedging copy.
- PRIORITY: CRITICAL (the explicit rebuild target for tomorrow).

### PAGE: https://www.eventlinqs.com (homepage)
- CURRENT STATE: Genuinely culture-led and AU-specific, warm copy, but 14 sections with heavy seed-event repetition and the organiser/trust story buried at block 13 of 14.
- WHAT WORKS: cultural carousel leads with Africultures/Pasifika/Diwali; "0% / 2-tap / 5+ / 24/7" stat seed; AU specificity.
- WHAT IS GENERIC: rail after rail of the same ~25 repeated events; no trust band; reads thin on close inspection.
- WHAT IS BROKEN: localhost OG image; localhost og:url leak.
- GAP TO TICKETMASTER: ahead on culture and zero-ads; behind on first-viewport trust and focus.
- GAP TO SURPASS BAR: trust must be in the first mobile viewport; section count roughly halved; no repeated titles; opinionated single positioning line that the page then proves.
- REBUILD APPROACH: priority-painted real-image hero -> one positioning line -> first-viewport trust band -> curated (de-duplicated) discovery rails -> culture entry points -> organiser value (moved up) -> newsletter. Components: HeroMedia (priority), TrustBand, CuratedRail (dedupe logic), CultureGrid. Constraints: <= 9 sections, no repeated event across rails, zero ad slots.
- PRIORITY: HIGH.

### PAGE: https://www.eventlinqs.com/events
- CURRENT STATE: Functional browse, sensible date pills + grid/map, believable AU price ladder, but culture and category are merged into one flat dropdown and it feels like a generic search.
- WHAT WORKS: filter taxonomy breadth; price/Free on cards; grid/map toggle.
- WHAT IS GENERIC: indistinguishable from an Eventbrite search; no culture-first identity.
- WHAT IS BROKEN: localhost OG; merged Culture/Category control is an information-architecture defect.
- GAP TO TICKETMASTER: ahead (they show no price, run in-grid ads, capital-only). Match DICE (price on cards) and exceed via culture.
- GAP TO SURPASS BAR: split Culture and Category into two orthogonal controls; add community rails; zero ads forever.
- REBUILD APPROACH: filter bar (Culture control + Category control + Date + Free + Map) -> community rails above the flat grid -> dense card grid. Components: FilterBar, CommunityRail, EventCardMedia (price always shown). Constraints: 8px grid, 3:2 image lock, 2-line title clamp, no ads.
- PRIORITY: HIGH.

### PAGE: https://www.eventlinqs.com/events/gospel-on-the-river-brisbane-worship-night (event detail)
- CURRENT STATE: The strongest existing page; near DICE parity (clear hierarchy, real map, organiser block, WhatsApp-first share, mixed tiers, trust micro-row). OG tags correct here.
- WHAT WORKS: trust micro-row; organiser identity; share row; interactive map; mixed free/paid steppers.
- WHAT IS GENERIC: ticket selector lacks an all-in preview; no organiser proof metrics; no add-to-calendar.
- WHAT IS BROKEN: nothing structural here (OG is correct on event pages).
- GAP TO TICKETMASTER: already far ahead (they have no organiser identity, no price at this layer).
- GAP TO SURPASS BAR (vs DICE): add the all-in fee preview at the ticket stepper (sub-100ms), organiser verified-badge + events-hosted count, add-to-calendar, AU date-format everywhere. DICE has the price-reassurance microcopy; we must match it verbatim-strength and add organiser proof + AU localisation + no app wall.
- REBUILD APPROACH: keep structure; insert AllInPreview into the ticket selector; add OrganiserProof to the organiser block; add CalendarButton. Constraints: selector CTA >= 48px in bottom-third thumb zone, sticky; price reassurance microcopy adjacent to figure (DICE pattern, exceeded with the live math).
- PRIORITY: HIGH (it is closest to the bar, so the surpass delta is cheap and high-return).

### PAGE: https://www.eventlinqs.com/cultures
- CURRENT STATE: Excellent taxonomy and taglines, but 14 of 14 destinations are "Coming soon". The brand's central promise links to empty rooms.
- WHAT WORKS: differentiated taxonomy; strong one-line culture copy.
- WHAT IS GENERIC: the index itself is fine; the failure is downstream emptiness.
- WHAT IS BROKEN: every culture page unbuilt; live taxonomy does not match the CLAUDE.md canonical cultures list; localhost OG.
- GAP TO TICKETMASTER: this page type is an automatic surpass IF populated, because Ticketmaster and DICE cannot build it at all.
- GAP TO SURPASS BAR: ship at least 3 flagship culture pages fully populated; reconcile taxonomy with canonical list; replace "Coming soon" with honest pre-launch states.
- REBUILD APPROACH: keep the index; build CulturePage template (hero, sub-culture rails, city scoping, cultural-moment calendar, organiser spotlight). Constraints: real imagery only, correct cultural nomenclature, no "Coming soon" dead ends.
- PRIORITY: CRITICAL (credibility blocker, second only to the OG bug).

### PAGE: https://www.eventlinqs.com/cities
- CURRENT STATE: Good concept (regional inclusion is on-brand), but 16 of 20 "Coming soon" and a direct copy/state contradiction ("launches with full event catalogues in each" above Coming-soon tiles).
- WHAT WORKS: regional-equal-to-capital framing; clean grid.
- WHAT IS GENERIC: tile grid is template-default.
- WHAT IS BROKEN: contradictory claim vs tile state; localhost OG; mostly empty.
- GAP TO TICKETMASTER: ahead conceptually (they are capital-only, no community). Surpass needs real inventory or graceful honesty.
- GAP TO SURPASS BAR: fix the contradiction immediately; design honest empty states ("Be the first to host in [city]"); build the CityPage template as a cultural map, not a venue list.
- REBUILD APPROACH: CityPage template (real city photo, "this week in [city]" strip, culture rails, cultural-moment callouts, organiser CTA on thin inventory). Constraints: regional == capital design weight; no dead "Coming soon".
- PRIORITY: MEDIUM (HIGH for the copy-contradiction fix, which is a same-day correction).

### PAGE: https://www.eventlinqs.com/organisers
- CURRENT STATE: Solid, honest, already ahead of Ticketmaster/DICE on transparency and self-service, but trust is asserted not evidenced and "real-time tools" is tell-not-show.
- WHAT WORKS: 4-step flow with realistic time estimates; full-answer FAQ; "no gatekeeping" differentiator; refund-override guarantee.
- WHAT IS GENERIC: no product visuals; no quantified proof.
- WHAT IS BROKEN: localhost OG; fee stated differently than /pricing and homepage; /for-organisers is a 404 (only /organisers exists - ensure all internal links and any external references use /organisers).
- GAP TO TICKETMASTER: far ahead (instant self-serve vs their sales gate).
- GAP TO SURPASS BAR: add real dashboard/scan-app visuals; add a quantified trust stat band; mirror the definite fee + worked example from /pricing.
- REBUILD APPROACH: keep narrative; insert ProductProof (screenshot/looping muted poster-backed video), StatBand, and a fee block consistent with /pricing. Constraints: visuals < 2MB, lazy below fold; fee identical to /pricing wording.
- PRIORITY: HIGH.

(Note: dashboard is post-auth and out of scrape scope; its surpass criteria are defined in K5 and apply when that build lands.)

---

## N. VISUAL & TYPOGRAPHIC QUALITY BENCHMARKS

Named, testable bars. Each rebuild is checked against the question in quotes.

- **Typography**: evoke **Stripe**. Concrete: a 4-step type scale max per page; display 44 to 64px, line-height 1.05 to 1.1, letter-spacing -0.02em; body 16 to 18px, line-height 1.5 to 1.6; all prices and money figures in tabular-nums (lining figures, fixed advance) so columns align; one humanist sans for UI, optional one display face for hero only. Test: "Does a pricing figure on this page read with Stripe-level numeric clarity and alignment?" Anti-reference: Ticketmaster's SEO-stuffed, hierarchy-flat titles.
- **Imagery**: evoke **Airbnb**. Concrete: real, warm, human, culturally specific photography; consistent 3:2 (cards) and 16:9 (heroes) ratios; faces favoured; no clip-art, no generic event stock, no broken/placeholder rasters on any public surface; LCP image priority-painted. Test: "Would this image set survive on an Airbnb category page?" Anti-reference: Ticketmaster mega-brand promo tiles.
- **Density**: scannable surfaces (homepage, /events, /pricing cards) evoke **Linear** (high signal, low ornament, decisive whitespace, <= 9 sections); detailed surfaces (event detail, FAQ, organiser) evoke **Stripe docs** (dense but ordered, progressive disclosure, "Read more" truncation per DICE). Test: "Can a first-time mobile user reach the primary action in under 5 seconds without hitting an ad or consent wall?" Anti-reference: Ticketmaster ad + OneTrust + reCAPTCHA clutter.
- **Motion**: subtle, not absent. Concrete: 150 to 250ms ease-out for hover, card, and accordion transitions; crossfade not slide for hero rotation; no parallax on the LCP path; honour prefers-reduced-motion (no nonessential motion when set). Test: "Is every animation under 250ms and disable-able?" Reference: Linear (restraint). Anti-reference: janky carousel first-paint.
- **Colour / accent strategy**: the locked palette (CLAUDE.md: primary Deep Navy #1A1A2E, accent Electric Blue #4A90D9, plus semantic success/warning/error) stays canonical. Differentiation strategy against competitors: Ticketmaster owns corporate azure, DICE owns stark black/white, Eventbrite owns loud orange, Humanitix owns playful candy brights. EventLinqs's distinct space is deep-navy gravity with a single warm celebratory accent used sparingly for premium/cultural cues (CTAs, "free forever", verified trust marks) against generous neutral ground - read as luxury and culture, not SaaS. If a warm gold/amber accent is desired beyond the canonical Electric Blue, it must be ratified as a documented accent extension to the locked palette via the project manager (DESIGN-SYSTEM.md), not introduced ad hoc. Test: "At a glance, is this unmistakably not Ticketmaster-azure, not DICE-monochrome, not Eventbrite-orange, not Humanitix-candy?"

---

## TOP 5 CROSS-PAGE ACTIONS (priority order, all rebuilds)

1. **Fix the localhost OG/canonical leak across all marketing pages.** Hard launch blocker; the entire site is unshareable on social and WhatsApp, which negates the "WhatsApp sharing built in" promise. Nothing else ships first. (Cross-session: flag to project manager; likely metadata/next.config base-URL, Session 2 territory.)
2. **Make the fee ONE definite number with ONE worked example, identical on /pricing, /organisers, and homepage.** Removes the self-inflicted hedging that undermines the strongest asset; precondition for the /pricing rebuild.
3. **Build the all-in price moment everywhere it matters** (event card, event detail ticket selector, checkout invariant) - this is the exact axis Ticketmaster hides and DICE only sloganises; making it live and provable is the central surpass move.
4. **Populate at least 3 flagship culture pages and fix the /cities copy/state contradiction.** The brand promise cannot link to 14 empty rooms; this is the second credibility blocker after the OG bug.
5. **Add a quantified trust band adjacent to price on /pricing, /organisers, and homepage first-viewport.** Section D's single biggest deficit; every serious competitor front-loads trust and EventLinqs front-loads none.

## TICKETMASTER-SURPASS FRAMING - CONFIRMED

This analysis is now Ticketmaster-surpass framed, not parity framed:
- Sections A to J retained unchanged (history preserved per constraint); the Phase 1.4 addendum explicitly demotes the Eventbrite/Humanitix anchor and records "parity" as a failure state.
- Section K defines exceed bars for all 8 page types against Ticketmaster (primary) and DICE (secondary), with literal UI specifics and named visual benchmarks.
- Section L converts 10 evidenced Ticketmaster weaknesses into binding feature requirements.
- Section M gives every scraped page a rebuild brief that distinguishes "gap to Ticketmaster" from the higher "gap to surpass bar".
- Section N sets testable, named quality bars (Stripe, Airbnb, Linear) with anti-references to Ticketmaster's specific failures.
- Evidence base is consumer-side and current (Ticketmaster and DICE homepages + event pages + mobile screenshots), not inferred. Where evidence was insufficient (dynamic pricing), the claim was explicitly NOT overstated.

Net position restated honestly: EventLinqs already structurally beats Ticketmaster and DICE on the two things they refuse to do (public transparent pricing, instant organiser self-service) and on cultural breadth they cannot serve. It does NOT yet beat them on proof, polish, or the visible all-in price moment. The rebuilds win by making the existing advantage undeniable and shipping the proof, not by inventing new economics.

---

## SUMMARY STATS (updated, Phase 1.4)

- Competitor captures: 7 markdown (Ticketmaster Business + Ticketmaster consumer, DICE Partners + DICE consumer, Eventbrite, Humanitix, Squarespace).
- EventLinqs captures: 7 (6 live + 1 documented 404).
- Screenshots: 15 full-page (5 competitor pricing + 8 EventLinqs + 2 consumer mobile: ticketmaster-event-mobile, dice-event-mobile).
- New analysis sections appended: K (8 page-type surpass criteria), L (10 evidenced weaknesses as requirements), M (7 per-page rebuild briefs), N (5 named quality benchmarks), plus top-5 cross-page actions and surpass-framing confirmation.
- Framing: shifted from Eventbrite/Humanitix parity to Ticketmaster/DICE surpass; "parity" recorded as failure state.
