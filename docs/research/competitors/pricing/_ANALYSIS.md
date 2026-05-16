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
