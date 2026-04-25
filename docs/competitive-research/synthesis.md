# Competitive Synthesis — TM, DICE, Eventbrite

**Captured:** 2026-04-26
**Inputs:** `homepage.md`, `category-page.md`, `city-page.md`, `event-detail.md`, `search.md`
**Aesthetic target:** Apple / Stripe / Linear / Aesop / Net-a-Porter premium restraint. Quiet confidence, not spectacle. Cultural warmth without bling.

---

## Top 10 — What Each Competitor Does Well

### Ticketmaster (top 10)
1. Cinematic full-bleed hero with single primary CTA — emotional hook before any list.
2. Search-first interaction model — three-pill (Location / Dates / Query) is unmistakable in intent.
3. Tabbed search results (Events / Artists / Venues / Articles) — disambiguates queries that map to multiple entity types.
4. Date chip overlaid on cover art on result cards — at-a-glance scanning.
5. Eyebrow + small accent bar + section title rhythm — editorial cadence on a transactional surface.
6. Tab-aggregated artist page — Presales / Concerts / Experience / FAQ all under one URL is genuinely useful even though execution is bloated.
7. Cards in a 3-col 4:3 grid — image-dominant, the right ratio for cover art.
8. Geo-scoped Cities nav surfaces capital-city hubs as primary navigation.
9. Persistent sign-in CTA top-right with account icon — never makes users hunt for it.
10. Console-quiet on the actual page render of the artist page (third-party errors aside).

### DICE (top 10) — gold-standard reference
1. **Backdrop tinted to artwork dominant colour** on event detail — every event page feels custom without per-event design work.
2. **"The price you'll pay. No surprises later."** baked into the buy card — converts trust into a visual.
3. **Audio preview / Top track** on event detail — Spotify-grade differentiator.
4. **Sticky bottom CTA on mobile** with the transparent-pricing line — universal pattern.
5. **Tout protection copy** baked into the page reinforces fan-first promise.
6. **Spotify / Apple Music personalisation card** on the browse page solves cold-start discovery.
7. Single global search input — unambiguous, no friction.
8. Recent + Popular searches on focus — fills empty-state void.
9. Bold display typography as hero (homepage) — trust through restraint, no stock photo trap.
10. Hand-drawn illustrations carrying brand personality without falling into corporate stock.

### Eventbrite (top 10)
1. **Geo-aware "Browsing events in [city]" header** with a switch — personalisation that costs nothing.
2. **Sub-genre circular tile carousel** below category hero — diaspora-first discovery (Afrobeats, Amapiano, Highlife > parent "Music").
3. **Organiser social proof row:** TOP ORGANIZER badge + follower count + total attendees on event detail. Three layers of trust on one row.
4. **Organiser flyer respected (object-contain)** — preserves diaspora-promoter aesthetic instead of cropping it.
5. **Autosuggest with thumbnails** on header search — only competitor to show event imagery inside suggest.
6. Sticky right-rail ticket card on event detail desktop.
7. Sticky bottom buy CTA on mobile event detail.
8. Free / "From $XX" pricing visible on every card.
9. Geo-aware query-result H1 doubles as SEO copy.
10. Eight-circle category strip on homepage surfaces verticals immediately.

---

## Top 10 — Where Each Competitor Falls Short

### Ticketmaster (weaknesses)
1. In-page banner ads on event detail and category pages — trust-killer.
2. Royal blue + italic wordmark reads aggressive and dated.
3. Console errors on load — unprofessional.
4. 10-tab artist page = decision paralysis; user has to scroll the tab bar.
5. No transparent pricing on hero — fans drill into a date to see fees.
6. Right-rail ad on search results cannibalises high-intent surface.
7. Three-pill search bar inside a coloured band is loud rather than confident.
8. No autosuggest at focus — wastes the moment of highest intent.
9. Cards stop at 2-wide because of the ad rail — image scale sacrificed.
10. Hero text feels disconnected: italic name + generic description + a single CTA without context.

### DICE (weaknesses)
1. All-dark UI excludes audiences over 40 and culturally-conservative diaspora segments.
2. App-first to a fault — fans landing on web for browsing get marketing, not a grid.
3. Lime/green neon accent reads punk, not premium for diaspora-headliner artists.
4. No type-disambiguation in search — artist queries return shows, never an artist profile.
5. "Top track" personalisation only works for music events.
6. No geo-personalisation on homepage (city is pinned to the user's last browse).
7. No editorial city pages — city is a filtered query, not a destination.
8. Sub-category icon row labels (~12px) have low affordance.
9. No AU presence — diaspora artists touring AU aren't surfaced.
10. Cookie banner takes the bottom third of mobile screen on first load.

### Eventbrite (weaknesses)
1. Coral + cream + purple gradient feels twee, low-trust for premium artists.
2. "Almost full" / "Promoted" pills crowd cards and read like manipulation.
3. 4-col card density on desktop sacrifices image scale.
4. Yellow display on blue category hero looks template-y.
5. Visible scrollbars under sub-genre rails feel amateur.
6. "Check availability" CTA is weak compared to DICE's "BUY NOW".
7. Two-input header (query + location) is a tap-target conflict on mobile.
8. Promoted cards interleaved with organic results muddy trust.
9. 5-deep breadcrumbs that wrap on mobile.
10. No transparent-pricing promise anywhere — pricing is per-card only.

---

## Adoption Strategy — What EventLinqs Carries Forward

### Adopt verbatim (copy the pattern, change the brand)
1. **Backdrop tinted to artwork dominant colour** on event detail (DICE).
2. **Transparent-pricing line on the buy card** (DICE) — verbatim copy: `"All-in. No fees added at checkout."`
3. **Sticky bottom buy CTA on mobile** (DICE + Eventbrite) — universal.
4. **Sticky right-rail ticket card on desktop event detail** (Eventbrite).
5. **Organiser flyer respected (object-contain)** on event detail (Eventbrite) — diaspora-promoter respect.
6. **Geo-aware "in [city]" page titles + breadcrumbs** (Eventbrite).
7. **Autosuggest with thumbnail event rows** (Eventbrite) on header search.
8. **Recent + Popular searches on focus** (DICE).
9. **Cinematic hero with single primary CTA** (Ticketmaster).
10. **Eyebrow + accent bar + section title rhythm** (Ticketmaster, refined to gold-500 on canvas).

### Adopt and elevate (take the idea, beat the execution)
1. **Sub-genre/culture carousel** (Eventbrite circles → EventLinqs square cover-art tiles, no visible scrollbar, gold-500 accent ring on hover).
2. **Organiser social proof row** (Eventbrite) → add a `Verified by EventLinqs` tier above `TOP ORGANIZER` based on real verification (KYC + first 3 events delivered without disputes).
3. **Search result tabs** (Ticketmaster) → only render tabs with results; reduce from 4 generic to 5 specific (Events / Artists / Organisers / Venues / Cities).
4. **Editorial city pages** (gap in all 3) → cinematic city hero with real diaspora photography, city-scoped culture rails (`Afrobeats in Melbourne`), featured venues, trust signals (`12 verified organisers in Melbourne`).
5. **Hero pattern library** — two heroes, not one: cinematic photo (event detail, city) + bold-display text (homepage, category). Pick per surface based on intent.
6. **Card hover choreography** — quiet, refined. 1.05 image scale + ink-900 caption shift to gold-600 + gold-100 ring border. No bounce, no neon, no elevation jump > 4px.
7. **Pricing transparency** — not just on the buy card; the price line `"All-in"` appears on every card and every search result. The promise is the brand, not a button.
8. **Empty-state work** — every search no-result, every browse-by-city with zero events, every saved-events page returns a real surface (cultural illustration + recommended events), never a blank state.
9. **Filter pills** — sticky 4-control row (When / Date / Price / Culture-Language) consistent across category, city, and search result pages.
10. **WhatsApp-first share menu** on event detail (diaspora primary), then X / Instagram Story / Copy link.

### Reject permanently
1. **In-page banner ads** anywhere on the public site (TM).
2. **Manipulative urgency pills** ("Almost full / Selling fast / Promoted") without inventory truth (Eventbrite).
3. **All-dark canvas** as the only mode (DICE) — exclusionary.
4. **Visible horizontal scrollbars** on rails (Eventbrite).
5. **App-only homepage** with no browseable events (DICE mobile).
6. **Loud header bands** with three pill search — search is a single input plus a location chip (TM rejected, Eventbrite refined).
7. **10-tab artist pages** (TM) — vertical sections instead.
8. **5-deep breadcrumbs** (Eventbrite mobile).
9. **Royal-blue / coral-orange palettes** — both read transactional. EventLinqs canvas + ink-900 + gold-500 + coral-500 accent only.
10. **Promoted interleaved with organic** (Eventbrite). If sponsored ever ships, it sits in a separate `Featured` rail above the grid with explicit border + label.

---

## Cultural / Diaspora Representation Findings

None of the three platforms represents Black, brown, Asian, or Pacific diaspora cultures with intent on the public surfaces I observed. Stock photography skews white-American (Eventbrite homepage), white-British (DICE) or generic concert-stage (TM). Sub-genre tags exist (Afrobeats appears as a chip on Eventbrite) but never surface real artists or organisers from those cultures in editorial positions.

EventLinqs's opening:

- **Hero photography** must rotate real diaspora events (Owambe, Amapiano warehouse, mehndi night, Diwali concert, lunar new year, gospel revival) at homepage cinematic scale.
- **City pages** must lead with real local diaspora venues and crews, not generic "live music photography".
- **Sub-genre carousel** must lead with culturally-specific genres (Afrobeats, Amapiano, Highlife, Bollywood, Reggaeton, K-pop, Comedy in language) above generic parents (Music, Nightlife).
- **Organiser verification badge** has cultural credibility built in: when a community-known organiser lists, the verified badge accelerates trust faster than algorithmic promotion ever can.

This is the moat. It's not a feature competitors can ship in a sprint. It's an editorial muscle they don't have.

---

## Implication for EventLinqs's Visual Identity

The design system already in `docs/DESIGN-SYSTEM.md` is correctly calibrated:

- **Canvas (#FAFAF7)** instead of white — warmer, premium-magazine feel.
- **Ink-900 (#0A1628)** instead of pure black — softer authority.
- **Gold-500** as the single brand accent — used sparingly (eyebrow text, hover rings, primary CTA) so it never reads as bling.
- **Coral-500** reserved for save-state and warm secondary actions.
- **Manrope display + Inter body** — display weight 700-800 only; body 400-500. No italic on display.
- **Editorial spacing rhythm** — 8/16/24/40/64 (4px base) with generous vertical air around hero and section titles.
- **Motion** — `cubic-bezier(0.16, 1, 0.3, 1)` 200-300ms on interactive states, 1400ms on cinematic image scale. No bounce, no overshoot. Always honour `prefers-reduced-motion`.

The competitive teardown validates this calibration. None of the three competitors hits all five at once. EventLinqs's moat is being the only premium-restraint, fan-first, culturally-led platform in the category.
