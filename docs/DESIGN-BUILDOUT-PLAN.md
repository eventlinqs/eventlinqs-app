# EventLinqs Design Build-Out Plan

**Status:** Draft for founder approval - no UI code changed yet
**Author:** Design session (dedicated DESIGN tab)
**Date:** 2026-06-01
**Authority:** `frontend-design` skill (design principles) + `docs/DESIGN-SYSTEM.md` v2.1 (locked tokens) + the live homepage (`src/app/page.tsx`) and event detail (`src/app/events/[slug]/page.tsx`) as the source of truth.
**Scope:** Buyer-facing surfaces only. This session does NOT touch the admin cockpit, payment internals, or infrastructure.

---

## 0. How to read this document

This is the whole path, ordered, so it can be approved as one picture before any pixel moves. It is organised as:

1. **Grounding** - where we stand, what is locked, what the bar is.
2. **The signature voice layer** - the cross-cutting craft that every surface inherits: distinctive display typeface, colour punch, illustration and empty-state system, motion and spatial craft. These come first because every surface depends on them.
3. **Surface by surface** - homepage, event detail, browse/discovery, checkout, confirmation, ticket. For each: current state, the specific gaps versus the competitor set, and the ordered work to close each gap to the bar.
4. **Conversion completeness** - the functional gaps that cost sales.
5. **Sequencing** - phased delivery, gates, definition of done.
6. **Founder decisions required** - the small number of calls only Lawal can make. The display typeface is the first and most important.

Every recommendation cites the `frontend-design` principle it serves. The skill's core mandate: commit to a bold, intentional aesthetic direction and execute it with precision; never converge on generic AI defaults (named offenders: Inter, Roboto, system fonts, purple-on-white, predictable layouts).

---

## 1. Grounding

### 1.1 The standing verdict (taken as given)

- We already out-design Eventbrite and Ticketmaster on atmosphere, palette, image consistency, and mobile.
- We trail only DICE.fm, on display typography.
- Grade: A- structure, B refinement.

The mission is a celebrity-grade, Apple-grade buyer experience that beats DICE.fm, Ticketmaster.com.au, Eventbrite, and Humanitix on every dimension. Hold the navy and gold brand and the locked tokens. Elevate, never fork.

### 1.2 What the competitors actually do well (the bar to clear)

| Competitor | Their strength we must surpass | Their weakness we already beat |
|---|---|---|
| **DICE.fm** | Massive, characterful display type. Confident minimalism. Zero ads. Swipe-native rails. A single, memorable typographic voice. | All-black alienates 40+. US/UK only. App-only mentality. No cultural breadth. |
| **Ticketmaster.com.au** | Big cinematic cards, clear hierarchy, trusted commerce patterns. | Soulless. Stock photos. "Open in app" interrupts. Ads between content. |
| **Eventbrite** | Warm, approachable tone. | Generic typography. Cream/orange feels twee. DIY, not premium. |
| **Humanitix** | Clean grids, clear information density, trust via the charity angle. | Utilitarian. Flat. No atmosphere, no signature voice. |

The single dimension where a competitor beats us is DICE on type. That is the headline of this plan.

### 1.3 What is locked and cannot move without Lawal's sign-off

Per `DESIGN-SYSTEM.md` section 16:

- Primary gold `--gold-500` (`#D4A017`).
- ~~Tagline "WHERE THE CULTURE GATHERS"~~ - SUPERSEDED 2026-06-01 (founder): removed entirely. New tagline: **"Every community. Every event. One platform."** Display form: **"EVERY COMMUNITY. EVERY EVENT. ONE PLATFORM."** This is part of the locked community sweep - there is no culture exception anywhere in user-facing copy.
- **Font families (Manrope + Inter).** Superseded 2026-06-01 per section 6.1 below.
- The anti-patterns list (section 15).
- WCAG 2.2 AA floor.
- Performance targets (LCP < 2.5s, INP < 200ms, CLS < 0.1, mobile Lighthouse 95+).

The font lock is the crux. The mission asks for a "distinctive display typeface" to beat DICE on the one axis we trail, but the typeface families are explicitly locked. **This plan does not fork the brand. It proposes one founder decision - introduce a distinctive display face for display sizes only, on top of the existing system - and routes everything else through the tokens already in place.** See section 6.1.

### 1.4 What the code review surfaced (verified, not asserted)

Read across all six surfaces plus the token layer and font wiring:

- **Fonts (`src/app/layout.tsx:11-23`):** Inter (400/500) for body, Manrope (600/700/800) for display. Both `display: 'optional'`. Inter is the generic face the `frontend-design` skill explicitly flags. This is the root cause of the DICE typography gap.
- **Tokens (`src/app/globals.css`):** A genuinely strong, disciplined system. Navy `#0A1628`, gold scale with contrast-corrected `gold-700/800` for light surfaces, coral, warm canvas `#FAFAF7`. Two parallel type scales coexist (the older `@theme` fluid clamp scale and the M5 fixed-px `.type-*` classes). Motion tokens, grain, duotone filter, dual-state glass header all present.
- **Homepage (`src/app/page.tsx`):** Rich and structurally strong - hero carousel, category chips, surprise-me, two bento grids, and roughly eleven rails. The risk is rail fatigue and a single vertical rhythm, not thinness.
- **Event detail (`src/app/events/[slug]/page.tsx`):** Cinematic hero, sticky ticket panel, contextual trust signals, social proof badge. Solid A- surface. The organiser "card" is just two initials in a box (`page.tsx:674`) - thin.
- **Browse (`src/app/events/page.tsx`):** Uses a top filter **bar** (`EventsFilterBar`), not the rich left **sidebar** the design system describes in section 6.4. Functional, but the discovery moat (culture/language filter) is under-expressed here.
- **Checkout (`src/app/checkout/[reservation_id]/page.tsx`):** Functional, has a clean handled error state and a trust sidebar, but visually plain and not on the focus-mode template (no stepper, generic buttons).
- **Confirmation (`src/app/orders/[order_id]/confirmation/page.tsx`):** The weakest surface and visibly older code. Uses `bg-ink-100`, raw hex `#1A1A2E` (twice), and `green-100`/`green-600` instead of the brand `--success` token. No celebratory moment, capitalised "Create Account" against the sentence-case rule. This is the biggest single quality drag in the buyer journey.
- **Ticket (`src/app/t/[code]/page.tsx`):** Clean and on-brand, but a plain card. The bar here is an Apple-Wallet-grade keepsake pass.

---

## 2. The signature voice layer (build first, every surface inherits it)

The `frontend-design` skill: "What makes this UNFORGETTABLE? What's the one thing someone will remember?" Right now the answer is "the navy-and-gold cultural atmosphere." That is good, but it is carried almost entirely by photography and palette. The type, the empty states, and the motion do not yet carry a voice. This layer fixes that.

### 2.1 Distinctive display typeface (the headline fix)

**Principle (frontend-design > Typography):** "Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive, characterful choices. Pair a distinctive display font with a refined body font."

**Gap:** Manrope is a clean, competent geometric grotesque - it is refined but not distinctive, and at hero scale it reads as "nice default," not "ours." Inter is the literal example the skill tells us to avoid. DICE wins on type because it commits to one heavy, characterful display voice and lets it dominate. We currently have no display voice of our own.

**The move (minimal fork, maximal impact):** Keep the locked system as the workhorse. Introduce ONE distinctive display face used only at display sizes (hero H1, page titles, section headers - the `--display-*` and `.type-hero-display`/`.type-h1`/`.type-h2` tier). Manrope stays for UI, card titles, and sub-headings. Body text moves off Inter to a refined, slightly warmer neutral so the body no longer reads as a generic SaaS template.

This respects "elevate, never fork": the brand, palette, spacing, and component shapes are untouched; we are adding a voice to the top of the type ramp, exactly where DICE beats us.

**Direction - LOCKED 2026-06-01 (founder): Direction A, Editorial luxury.**

- **Direction A - Editorial luxury (CHOSEN).** A high-contrast, optically-sized display face with character (lead candidate: **Fraunces**, variable, open-licensed). This gives a Hollywood/Airbnb editorial-luxury voice that no competitor in the set has - all four are sans-serif. It reads premium, cultural, and celebratory, and it differentiates by category, not just by degree. Pairs with a clean grotesque body.
- ~~Direction B - Bold grotesque (Clash Display / Bricolage Grotesque).~~ Not chosen.

Fraunces is a variable font available for self-hosting via `next/font`, so the performance budget (preload display weights, swap the rest) is preserved.

**Body face - LOCKED 2026-06-01 (founder): refined neutral, Inter retired.** Replace Inter with a refined neutral (lead candidate: **Geist** or **Hanken Grotesk**) so body copy stops reading as a generic SaaS template. Manrope stays for UI and card titles.

**Work:**
1. Founder approves direction + display candidate (section 6.1).
2. Self-host the chosen display + body faces via `next/font/local` (or `next/font/google` if Google-served), wire `--font-display` / `--font-body` to the new variables in `layout.tsx` and `globals.css`. This is the only change to a locked token, and it is gated on approval.
3. Re-tune the type scale tracking and optical sizing for the new face (display faces need tighter tracking and different line-height than Manrope - the `-0.02em` display tracking in the system was tuned for Manrope).
4. Verify Lighthouse 95+ on a production build at desktop and mobile, median-of-5, no CLS regression (faces preloaded, `size-adjust` tuned to the fallback).
5. Playwright side-by-side versus DICE at 1440 and 375 - explicit pass on typography.

### 2.2 Colour punch

**Principle (frontend-design > Color & Theme):** "Dominant colors with sharp accents outperform timid, evenly-distributed palettes."

**Gap:** The palette is strong but applied conservatively. Gold appears mostly as small accents and, on light surfaces, as the low-chroma `gold-800` (an olive, forced by the contrast rule). Coral - the celebratory/live accent - is almost entirely unused in the buyer journey. The result is atmospheric but rarely *punchy*. We never let a colour dominate a viewport.

**The move:** Introduce a small set of high-commitment colour moments, without breaking the contrast rules:
- **Gold-immersive blocks:** at least one full-bleed gold field per major journey (e.g. an organiser or social-proof band) using navy text on gold (`--ink-900` on `--gold-500`, 7.4:1, AAA - already the preferred combo per the system). This is the "dominant colour" the skill asks for.
- **Coral as the live/celebratory punch:** put coral to work where the system intends it - "live now", "trending", "selling fast", the confirmation success moment, low-stock urgency. It is currently dormant.
- **Navy-immersive editorial:** lean into dark sections (the For Organisers block already does this well) as deliberate rhythm breaks, with gold and coral as sharp accents on navy where they are at their most legible and luxurious.

**Work:** Define a "colour rhythm" pass per surface (section 3), then apply. No new tokens needed - this is disciplined use of what exists.

### 2.3 Illustration and empty-state system

**Principle (frontend-design > Backgrounds & Visual Details):** atmosphere and depth over solid colours; and the skill's mandate against cookie-cutter, context-free filler.

**Gap:** The design system (section 8) specifies a hand-drawn, brand-coloured illustration system with cultural motifs - but it does not exist in code. Empty and pending states are generic: the homepage fallback is a dashed-border box ("Events loading soon"), the "tickets being prepared" state is a plain tinted panel. These are exactly the "predictable patterns" the skill warns against, and they appear at emotionally important moments (no results, order pending).

**The move:** Build a small, owned illustration and empty-state system:
- A brand-coloured (navy + gold + coral on canvas) line-illustration set for: no search results, empty saved, empty following, empty basket, 404, order pending, and the homepage cold-start.
- Subtle cultural motif textures (geometric line patterns, used as supporting motifs only, never over faces or photography - per system section 8) for section backgrounds and decorative depth.
- A branded placeholder cascade (already partly present via `BrandedPlaceholder`) extended so no surface ever shows a raw or dashed-box fallback.

**Constraint:** No AI-generated illustration (system section 8 and 15 forbid it, and it degrades trust). Either custom-commissioned to Lawal's brief or a permitted open set re-coloured to brand. The plan delivers the *system and slots*; final art can be swapped in like the logo.

### 2.4 Motion and spatial craft

**Principle (frontend-design > Motion + Spatial Composition):** "One well-orchestrated page load with staggered reveals creates more delight than scattered micro-interactions." And: "Unexpected layouts. Asymmetry. Overlap. Grid-breaking elements."

**What is already good:** `--ease-out`/`--motion-quick` tokens, ken-burns, marquee, `tile-lift`, `fade-rise`, the dual-state glass header, the grain overlay. The motion vocabulary exists and is performance-aware (paused under headless audits and reduced-motion).

**Gaps:**
- **Motion is decorative, not orchestrated.** There is no signature staggered page-load reveal. Reveals are per-component, not composed.
- **Layout rhythm is uniformly vertical.** The homepage is a tall stack of rails and bentos. The skill explicitly wants asymmetry, overlap, and grid-breaking. We have bento (good) but the macro-rhythm is conventional.
- **No signature transition moment.** DICE-beating polish needs one or two unforgettable moments (hero-to-content reveal, the confirmation success beat).

**The move:**
- Define one orchestrated entrance per surface (staggered reveal of hero, then primary content) using the existing `fade-rise` + `--ease-out`, respecting reduced-motion and the headless kill-switch.
- Introduce deliberate spatial breaks: an asymmetric/overlapping transition between hero and first content block; at least one grid-breaking editorial spread per major surface.
- Reserve `--ease-bounce` for one or two celebratory micro-moments only (save, confirmation).

---

## 3. Surface by surface

Each surface lists: current state, specific gaps versus the named competitors, and ordered work. Work items are sequenced within the surface; cross-surface sequencing is in section 5.

### 3.1 Homepage (`/`)

**Current state:** Strong. Hero carousel, category chip strip, surprise-me, trending bento, cultural-moments bento, and ~11 rails (this week, weekend, free, cultural picks, trending, just added, editor's picks, cities, community, featured venues), a dark For Organisers split, and an email panel.

**Gaps versus the set:**
- **Rail fatigue / single rhythm.** ~11 horizontally-scrolling rails stacked vertically is more than any competitor uses and flattens into one texture. Versus DICE's confident, edited minimalism, we read as exhaustive rather than curated. (frontend-design: intentionality over intensity; spatial variety.)
- **Display voice.** The hero and section headers ride Manrope - see 2.1. This is where DICE's homepage most visibly beats ours.
- **Colour timidity.** Gold and coral rarely dominate; the page is navy-and-photo with small gold accents. (2.2)
- **Cold-start fragility.** The empty path is a dashed box. (2.3)

**Ordered work:**
1. Apply the new display face to the hero and all section headers (depends on 2.1).
2. Edit the rail set: cut or merge to a curated rhythm (target 6-7 distinct sections), and break the vertical monotony with at least one asymmetric editorial spread and one colour-immersive band (gold or navy) per the colour-rhythm pass (2.2, 2.4).
3. Orchestrate the above-fold entrance: staggered reveal of hero then chips then first bento (2.4).
4. Replace the cold-start empty state with a branded illustration (2.3).
5. Competitive Playwright versus DICE + Ticketmaster at 1440/768/375; pass on typography, density, atmosphere, mobile polish.

### 3.2 Event detail (`/events/[slug]`)

**Current state:** A- surface. Cinematic hero with gradient and grain, category glass pill, date/venue meta, social-proof badge, sticky "Get tickets" CTA, save button, contextual trust signals, sticky action bar, when/where cards, venue map, organiser block, tags, WhatsApp-first share, related events grid.

**Gaps versus the set:**
- **Organiser block is thin** (`page.tsx:674`): two initials in a box, description only. Ticketmaster and DICE both give the organiser/artist real presence (avatar, follower count, follow, verified, upcoming). This is a trust and conversion gap.
- **Display voice** on the H1 and section headers (2.1).
- **Ticket panel is competent but not distinctive** - it is a white card. The Apple-grade bar wants a more crafted selector (clear tier hierarchy, price emphasis, urgency states wired to coral).
- **Lineup section absent** despite being in the template (system 7.3) - relevant for music/cultural events and a DICE strength.

**Ordered work:**
1. Apply display face to H1 and section headers (2.1).
2. Rebuild the organiser block into a real organiser card: `OrganiserAvatar`, name, verified tick, follower count, follow button, link to public organiser page. (Reuses existing media + organiser patterns; no payment code.)
3. Elevate the ticket panel: stronger tier hierarchy and price typography, coral-wired low-stock/urgency, clearer selected state and total. Keep `TicketPanelClient` logic intact - visual layer only.
4. Add the lineup section when artist/lineup data exists (progressive - hidden when absent).
5. Colour-rhythm and entrance-orchestration pass (2.2, 2.4).
6. Competitive Playwright versus DICE event page + Ticketmaster event page.

### 3.3 Browse / discovery (`/events`)

**Current state:** Top filter **bar** + popular rail + responsive grid + pagination + map view. Functional and ISR-fast.

**Gaps versus the set:**
- **The discovery moat is under-expressed.** The Community filter is our one feature no competitor has (system 6.4, 17). On the current bar it is one control among many. DICE and Ticketmaster lean hard on their filtering UX; ours should make the community dimension feel like the headline.
- **Empty/loading states** are generic (2.3).
- **Display voice** on the page title and the result-count line (2.1).

**Ordered work:**
1. Enhanced horizontal filter bar (locked, section 6.2) with the **Community** filter promoted to the hero element.
2. Make the community/heritage/faith dimension the visual headline of discovery (prominent, beautifully-rendered filter affordance, not buried in a chip row).
3. Branded empty state ("no events match your filters") and skeletons (2.3).
4. Display face on title + sort; colour-rhythm pass.
5. Competitive Playwright versus Ticketmaster search + Humanitix browse; pass on filter UX and density.

### 3.4 Checkout (`/checkout/[reservation_id]`)

**Current state:** Single-region grid (form + trust sidebar). Has a genuinely good handled error state and a reservation timer. But it is visually plain: generic buttons, raw `bg-ink-50`/`border-ink-300`, no stepper, no focus-mode header.

**Gaps versus the set:** The design system (7.4) specifies focus mode - minimal header, a 4-step stepper, Apple Pay/Google Pay up top, no nav/upsell distraction, a sticky mobile pay bar. We have the anti-distraction intent but not the crafted focus-mode shell. Against the bar (Apple-grade), checkout is where polish converts directly to revenue, and this surface is mid-tier.

**Ordered work (visual layer only - no payment logic, owned by the backend session):**
1. Apply the focus-mode shell: minimal branded header ("Secure checkout"), remove competing nav, on-brand tokens throughout (kill raw hex/`ink-50`).
2. Add the progress stepper (Tickets / Details / Payment) and a crafted order summary.
3. Strengthen the pay button and sticky mobile pay bar to the primary-CTA spec (gold pill, navy text, 44px+).
4. Wire urgency (reservation timer) and trust into a calm, premium frame - not anxious.
5. Competitive Playwright versus DICE + Ticketmaster checkout; pass on focus, clarity, mobile.

> Coordination note: checkout markup that touches `CheckoutForm` payment behaviour belongs to the backend session. This plan limits checkout work to presentation (layout, tokens, typography, the static shell). Anything that risks payment logic is flagged for the project manager before it ships.

### 3.5 Order confirmation (`/orders/[order_id]/confirmation`)

**Current state:** The weakest buyer surface and visibly older code. `bg-ink-100` page, raw `#1A1A2E` hex (`:145`, `:278`), `green-100`/`green-600` instead of `--success`, a plain checkmark, capitalised "Create Account" (violates sentence-case), functional QR + ticket list + actions.

**Gaps versus the set:** This is the emotional peak of the journey - "You're in" - and it currently looks like a default Tailwind receipt. The design system (7.5) calls for an animated success draw, a celebratory-but-brief moment, wallet buttons, calendar links, and a share-your-crew section. The skill's "one well-orchestrated moment" principle applies here more than anywhere. DICE and Ticketmaster both make purchase confirmation feel like an arrival; ours feels like a transaction log.

**Ordered work:**
1. **Re-tokenise the whole page** - remove raw hex and `green-*`, use `--success`, brand surfaces, sentence case. (This alone lifts it from off-brand to on-brand.)
2. Build the celebratory moment: animated success draw + a restrained coral/gold confetti beat (subtle, reduced-motion-safe), on-brand "You're in" headline in the display face.
3. Conversion completeness: Add-to-Apple-Wallet / Google-Wallet buttons, calendar links, and a "tell your crew" share row (WhatsApp-first, matching event detail). (Verify which already exist in `ConfirmationActions` and fill the gaps - section 4.)
4. Keep the QR/ticket list, but lift its styling to the keepsake bar (shared with 3.6).
5. Competitive Playwright versus Ticketmaster + DICE confirmation; pass on the arrival feeling.

### 3.6 Ticket (`/t/[code]` and `/account/tickets`)

**Current state:** `/t/[code]` is clean and on-brand: branded eyebrow, display title, QR, status pill with accessible contrast, void/refunded handled. It is the most quietly correct surface. But it is a plain white card.

**Gaps versus the set:** The bar is an Apple-Wallet-grade keepsake pass - the ticket is the artefact the buyer screenshots and shows their friends, so it carries the brand into the wild. DICE's ticket has personality; ours is utilitarian-correct. Opportunity for a crafted pass aesthetic (navy field, gold detailing, perforation/ticket-stub motif, brightness-up guidance) without compromising scan reliability (QR must stay maximally legible).

**Ordered work:**
1. Craft the pass: ticket-stub visual language (navy keepsake card, gold detail, optional cultural motif edge), QR kept on a high-contrast white field for scan reliability.
2. Apply the same crafted pass to the confirmation inline tickets (3.5) and `/account/tickets` for consistency.
3. Display face on the event title.
4. Verify scannability is uncompromised (QR contrast, size, screen-brightness guidance) and AA contrast on every status state.
5. Competitive Playwright versus DICE ticket; pass on keepsake quality.

---

## 4. Conversion completeness

These are functional gaps in the buyer journey that cost sales or trust, independent of styling. Verify-then-fill (some may already exist in `ConfirmationActions` or `TicketPanelClient` and just need surfacing):

- **Wallet passes:** Add-to-Apple-Wallet and Add-to-Google-Wallet on confirmation and ticket. (System 7.5/7.6.)
- **Calendar:** Add-to-Google / Add-to-Apple calendar on confirmation.
- **Share:** WhatsApp-first share on confirmation (matches event detail); the target communities spread events through WhatsApp.
- **Urgency, honest:** low-stock ("only N left", coral) and reservation timer surfaced calmly, never as dark-pattern "last few tickets!" (system voice rules forbid the gimmick).
- **Guest-to-account:** the post-purchase account nudge exists but is off-brand; fold it into the re-tokenised confirmation.
- **Save/follow loop:** save event and follow organiser must be present and consistent on event detail and organiser surfaces (drives return visits).
- **Empty-state recovery paths:** every empty/no-result state offers a clear next action (browse, widen filters, list your event) - tied to the illustration system (2.3).

Each item: confirm current state in code, then either surface or build. No payment-logic changes; webhook/payment ownership stays with the backend session.

---

## 5. Sequencing

Ordered so that the cross-cutting voice lands first (every surface inherits it), then surfaces in descending order of impact-per-effort, with the worst surface (confirmation) re-tokenised early because it is cheap and high-visibility.

**Phase 0 - Foundations (blocks everything visual).**
- Founder decisions resolved (section 6): display typeface direction + candidate, body face, browse sidebar-versus-bar.
- Wire the new display + body faces; re-tune the type scale. Verify Lighthouse + CLS. (2.1)

**Phase 1 - Voice layer.**
- Colour-rhythm definitions per surface (2.2).
- Illustration + empty-state system and slots (2.3).
- Orchestrated-entrance + spatial-break patterns as reusable primitives (2.4).

**Phase 2 - Quick high-visibility wins.**
- Confirmation re-tokenise + celebratory moment (3.5) - cheapest path from "weakest surface" to on-brand.
- Ticket keepsake pass (3.6).

**Phase 3 - Core conversion surfaces.**
- Event detail: organiser card, ticket panel, lineup (3.2).
- Checkout focus-mode shell (3.4, with backend-session coordination).
- Conversion-completeness fill (section 4).

**Phase 4 - Discovery + homepage edit.**
- Browse discovery-moat expression (3.3).
- Homepage rail edit + spatial breaks (3.1).

**Phase 5 - Verification sweep.**
- Competitive Playwright across all six surfaces at 1440/768/375 versus the named set.
- Lighthouse 95+ desktop and mobile (median-of-5, production build), axe-core 0 violations, typecheck/lint/vitest/build green.

Each surface is shippable on its own branch with its own gates; the phases are the recommended order, not a monolith.

### Definition of done (per surface)

Inherits `CLAUDE.md` and `DESIGN-SYSTEM.md`:
- Uses tokens only - no raw hex, no off-token colours, no Inter remnants.
- Sentence case, Australian English, no em-dashes, no en-dashes, no exclamation marks, community-first voice, no "diaspora" in any shipped copy.
- WCAG 2.2 AA (contrast, 44px targets, focus-visible, reduced-motion).
- Lighthouse 95+ desktop and mobile on a production build, median-of-5; axe 0 violations.
- Competitive Playwright versus the most relevant competitor at 1440 and 375, explicit pass on information density, typography, image quality, filter UX, mobile polish.
- Verified in production behaviour, not just locally.

---

## 6. Founder decisions required

These are the calls only Lawal can make. Everything in sections 2-5 is ready to execute once these are set. They are listed in priority order.

### 6.1 Display typeface (the one that unlocks the DICE gap)

The font families are a locked token. To beat DICE on display typography we need a distinctive display face. The proposal is to add ONE display face at display sizes only, keeping the rest of the system intact. Direction:

- **A - Editorial luxury (recommended):** Fraunces (or similar high-contrast optical display). Differentiates by category - no competitor uses a display serif. Reads Hollywood/Airbnb/luxury-cultural.
- **B - Bold grotesque:** Clash Display / Bricolage Grotesque. Out-DICEs DICE with more warmth and breadth.

Plus the body face: replace Inter with a refined neutral (Geist / Hanken Grotesk), or retire Inter and let Manrope serve body.

### 6.2 Browse layout - LOCKED 2026-06-01 (founder)

Enhanced horizontal filter bar (the current shape), with the **Community** filter promoted to the hero element of discovery. Not the sidebar. The Community filter is our one moat no competitor has and must read as the headline of the bar.

### 6.3 Illustration sourcing

The illustration system needs art. Custom-commissioned to brief (preferred, on-brand, distinctive) versus a permitted open set re-coloured to brand (faster, less distinctive). AI-generated is ruled out by the system. The plan builds the slots either way; this decides what fills them.

---

## 7. Principle traceability (frontend-design)

For the record, every cross-cutting move maps to a named skill principle:

- **Typography** ("distinctive display, refined body; avoid Inter") -> 2.1, applied on every surface.
- **Color & Theme** ("dominant colours with sharp accents over timid palettes") -> 2.2.
- **Motion** ("one orchestrated load over scattered micro-interactions") -> 2.4.
- **Spatial Composition** ("asymmetry, overlap, grid-breaking") -> 2.4, 3.1, 3.2.
- **Backgrounds & Visual Details** ("atmosphere and depth, grain/texture/layered transparency") -> 2.3, already partly live (grain, duotone).
- **Avoid AI slop** ("no generic fonts, predictable layouts, cookie-cutter patterns") -> the whole plan, most sharply the Inter retirement and the empty-state system.
- **Match complexity to vision** ("refined needs restraint and precision") -> the rail edit (3.1) and the confirmation re-tokenise (3.5) are restraint, not addition.

---

*End of plan. No UI code has been changed. Awaiting founder approval of the path and the section 6 decisions before any implementation begins.*
