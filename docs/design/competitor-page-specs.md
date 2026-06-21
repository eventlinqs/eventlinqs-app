# Competitor page specs: the world-class bar, page by page

Purpose: for every EventLinqs buyer surface, capture how Ticketmaster.com.au and
Eventbrite build the equivalent page, define what makes the best version
world-class, and name the concrete gap versus our current page. This is the
reference the homepage rebuild and every subsequent surface build aims to surpass.

**The benchmark bar is the fusion of the leaders: Ticketmaster, Eventbrite, DICE,
and Humanitix.** Ticketmaster and Eventbrite are the primary captured references
(below); DICE sets the typographic/discovery polish bar and Humanitix the
all-in-pricing and community-trust bar (and the audited donation model referenced
in the parked community-support workstream). Every changed launch surface earns an
explicit SURPASS or PARITY verdict per aspect against this set at 1440 and 390;
parity is the floor, the goal is to surpass (per CLAUDE.md Definition of Done).

- Captured with Playwright (Chromium 1.59.1) at desktop 1440 and mobile 390, en-AU / Australia-Sydney.
- Screenshots live in `design-captures/<competitor>/<page>-<viewport>.png`. Machine-readable index: `design-captures/manifest.json`.
- Capture scripts (committed for reproducibility): `design-captures/capture-script.mjs`, `recapture.mjs`, `recapture-tm-event.mjs`.
- Scope cross-check: our page list is confirmed against `docs/EventLinqs_Scope_v5.md` (checkout is one-page per §3.7.1; "search results" is `/events?q=`, not a dedicated route).
- Australian English. No em-dashes.

## Evidence quality and honest gaps

All 26 captures rendered real content (body text 2.5k to 10k chars); none were bot-blocked. Three needed correction or a caveat:

1. **Ticketmaster event detail is a Moshtix page, not a TM-branded one.** TM AU federates much of its concert discovery to Moshtix (a Ticketmaster-owned AU brand). No native `ticketmaster.com.au/event/` link surfaced across the homepage, sports discovery, or search. The captured event page is therefore Moshtix, and it is a passed event (waitlist state). Ticketmaster's flagship seat-map / queue conversion page is its known strength but was not publicly reachable this run; it is described from its established pattern.
2. **Checkout is partly gated.** Eventbrite's checkout modal was captured by clicking "Get tickets" on a live on-sale event. Ticketmaster's checkout sits behind a cart/queue and a real purchase, so it is described from pattern, not captured.
3. **The digital ticket page has no public competitor equivalent.** Both TM and EB put the issued ticket behind sign-in (TM app/wallet, EB "Find my tickets"). Benchmarked against Apple Wallet / DICE app patterns rather than a capture.

## Capture inventory (our page -> competitor equivalents)

| Our page | Route | Ticketmaster capture | Eventbrite capture | Status |
|---|---|---|---|---|
| Homepage | `/` | `ticketmaster/homepage-{desktop,mobile}.png` | `eventbrite/homepage-{desktop,mobile}.png` | both captured |
| Browse / discovery | `/events` | `ticketmaster/browse-discovery-*` | `eventbrite/browse-discovery-*` | both captured |
| Search results | `/events?q=` | `ticketmaster/search-results-*` | `eventbrite/search-results-*` | both captured |
| Event detail | `/events/[slug]` | `ticketmaster/event-detail-*` (Moshtix, see caveat) | `eventbrite/event-detail-*` | captured + caveat |
| For-organisers / sell | `/organisers` (`/for-organisers` 308s here) | `ticketmaster/for-organisers-*` (business.ticketmaster.com.au) | `eventbrite/for-organisers-*` | both captured |
| Checkout | `/checkout/[reservation_id]` | not captured (cart/queue gated) | `eventbrite/checkout-*` (live modal) | EB captured, TM noted |
| Digital ticket | `/t/[code]` (+ `/tickets`) | none public (app/wallet) | none public (sign-in) | no equivalent, noted |
| City page | `/city/[slug]` | `ticketmaster/city-page-*` (Brisbane) | `eventbrite/city-page-*` (Sydney) | both captured |

---

## 1. Homepage

- **Ticketmaster:** https://www.ticketmaster.com.au/ -> `ticketmaster/homepage-{desktop,mobile}.png`
- **Eventbrite:** https://www.eventbrite.com.au/ -> `eventbrite/homepage-{desktop,mobile}.png`

**TM anatomy.** Blue portal. A persistent top search rig with three controls (Location "All of Australia", Dates "All Dates", "Artist, Event or Venue" + Search), category nav (Music, Sport, Arts Theatre & Comedy, Family & Attractions, Cities), a single photographic hero banner (MotoGP Australia 2026 with a "Find tickets" button), then rows of promotional tiles and a "Follow your favourites" card. Search-first, ad-driven, flat blue-on-blue.

**EB anatomy.** White, friendly. Location selector in the header. The signature block is "Hand-picked happenings" - a carousel of curated-list collage cards (Find connection & community, Your digital detox starts here, Upgrade date night, Dance until dawn), then a row of category icons (Music, Nightlife, Performing & Visual Arts, Holidays, Dating, Hobbies, Business, Food & Drink). Mobile keeps the same: one hero card plus a 2x4 category-icon grid.

**What makes the best version world-class.** EB's curated-list framing ("explore curated lists") turns a marketplace into editorial discovery; the category-icon row gives instant orientation. TM's strength is the always-present location+date+query rig that gets a high-intent buyer to results in one move.

**Concrete gap vs ours (`/`).** We are ahead here, and should protect the lead rather than copy. Ours already beats both on atmosphere (cinematic rotating cultural hero vs TM's single static banner and EB's collage cards), palette (navy + gold on warm canvas vs flat blue / flat white), and mobile (our persistent bottom tab app-shell vs their plain responsive headers). Deltas to close to reach the Apple bar: (a) we lack a distinctive **display typeface** - we run a single Manrope for display and body, whereas the editorial bar wants a characterful display voice; (b) TM's one-move **location+date+query** rig is more decisive than our mood-led search for high-intent users, so add an explicit date/location quick-filter without losing the brand framing; (c) EB's **curated-list cards** are a discovery pattern worth matching with our cultural-moments curation.

## 2. Browse / discovery (events listing)

- **Ticketmaster:** https://www.ticketmaster.com.au/discover/concerts -> `ticketmaster/browse-discovery-*`
- **Eventbrite:** https://www.eventbrite.com.au/d/australia/all-events/ -> `eventbrite/browse-discovery-*`

**TM anatomy.** Genre-led discovery (Rock, Latin, Jazz, Festivals) with event cards under a category banner; the top search rig persists.

**EB anatomy.** The strongest faceted discovery of the set: category chips, time facets (For you / Today / This weekend), a location autocomplete, and a dense event-card grid. Functionally complete, visually plain.

**What makes the best version world-class.** EB lets a buyer narrow by category + time + location + price without leaving the page, and keeps the result grid legible at high density. That faceted breadth is the bar for "find the event I want fast".

**Concrete gap vs ours (`/events`).** Ours already has the right bones: `EventsHeroStrip`, `EventsFilterBar` (M5), `EventsPopularSection`, `EventsGrid`, `EventsPagination`, and a map toggle (`EventsMapLazy`) that neither competitor surfaces in-line. The deltas: (a) confirm our filter bar exposes EB-level facets in one view (date / price / type / location), since EB's breadth is its one advantage; (b) our card imagery treatment is more consistent than EB's ragged user uploads, so density + image polish is ours to win; (c) add the map view as a visible differentiator - EB and TM have no in-grid map.

## 3. Search results

- **Ticketmaster:** https://www.ticketmaster.com.au/search?q=music -> `ticketmaster/search-results-*`
- **Eventbrite:** https://www.eventbrite.com.au/d/online/music/?q=music -> `eventbrite/search-results-*` (EB rewrites the query into a faceted discovery URL)

**Anatomy.** Both render search as the same faceted grid as browse, scoped by the query. EB rewrites `?q=music` into `/d/online/music/` - search and category discovery are one system. TM returns a titled "Search results for music" grid.

**What makes the best version world-class.** Treating search and browse as one faceted surface (EB) means a query never dead-ends; the buyer keeps every facet to refine.

**Concrete gap vs ours (`/events?q=`).** We already model this correctly: search is `/events` with `searchParams`, so query and facets share one surface. Delta: make the query state visible and refinable (active-filter chips, result count, "did you mean", empty-state with suggestions) to EB's standard; ensure zero-result queries offer nearby/related events rather than a bare empty grid.

## 4. Event detail

- **Ticketmaster:** federated to Moshtix, e.g. https://www.moshtix.com.au/v2/event/... -> `ticketmaster/event-detail-*` (see caveat; TM-native seat-map page described from pattern)
- **Eventbrite:** https://www.eventbrite.com.au/e/...-tickets-<id> -> `eventbrite/event-detail-*`

**TM (native, known pattern).** TM's flagship event page is a seat-map / price-level conversion engine: interactive map, price tiers, queue (Verified Fan), resale, and demand signals, battle-tested at stadium scale. Fees surface late. The captured **Moshtix** federated page is far below that bar: a small poster thumbnail, a "DON'T MISS OUT" marquee, an Afterpay strip, a black "EVENT DETAILS" bar and centred body text; passed events show "Join the waitlist".

**EB anatomy.** Poster-art image carousel hero, an "Aboriginal owned" / category badge, H1, an organiser row with **follower count and a Follow button** ("TOP ORGANIZER"), a right-side **sticky ticket panel** ("From A$57.83 / Get tickets" orange CTA), location + date, a long About section, an FAQ accordion, and an "Organized by" block with Contact / Follow. The fee is disclosed inside the ticket modal ("incl A$5.20 Fee"), not on the page CTA.

**What makes the best version world-class.** TM: proven high-scale conversion machinery (maps, queues, tiers). EB: a clean right-rail sticky CTA, organiser social proof (followers), and structured FAQ that reduce purchase anxiety.

**Concrete gap vs ours (`/events/[slug]`).** Ours is already stronger than both on craft: full-bleed cinematic hero (vs EB's poster carousel and Moshtix's thumbnail), **multi-tier steppers inline**, a sticky summary, an explicit **all-in pricing** promise (vs EB/TM late fees), a trust row, a venue map, WhatsApp-first share, and a related-events rail. Deltas to close: (a) **organiser social proof** - add follower count + Follow like EB, we currently defer the follow button; (b) an **FAQ / know-before-you-go** accordion, which EB has and we do not; (c) the live **conversion dead-end** - many of our events show "Tickets not yet on sale - organiser still finishing payment setup", which EB/TM never do; filter these from discovery or convert to a "notify me"; (d) for high-demand on-sales we have no **queue / waiting-room** UI, which TM does - needed before any marquee event.

## 5. For-organisers / sell

- **Ticketmaster:** https://business.ticketmaster.com.au/ -> `ticketmaster/for-organisers-*` (TM Business AU, B2B marketing site)
- **Eventbrite:** https://www.eventbrite.com.au/organizer/overview/ -> `eventbrite/for-organisers-*` ("Become an Event Hosting Legend")

**Anatomy.** Both are conversion-oriented B2B landing pages: a value-proposition hero, feature sections (publishing, promotion, payments, analytics), social proof, and a sign-up CTA. EB leans warm and self-serve ("hosting legend"); TM Business leans enterprise.

**What makes the best version world-class.** A confident promise, concrete feature proof, transparent fees, and a single obvious "start selling" CTA. EB's self-serve framing lowers the barrier for the long tail; TM's enterprise framing wins large promoters.

**Concrete gap vs ours (`/organisers`, with `/for-organisers` 308-redirecting in).** Our `OrganisersLandingPage` already promises self-serve sign-up, transparent fees, real-time tools, and "a checkout your audience will actually complete". Deltas: (a) lead with **transparent all-in fees** as a headline differentiator (neither competitor makes fees a hero claim); (b) add **concrete proof** - payout timing, dashboard screenshots, real organiser outcomes - to match EB's feature-rich page; (c) a single, unmissable "Start selling" CTA with a fast self-serve path.

## 6. Checkout

- **Ticketmaster:** cart / queue gated, not captured (described from pattern).
- **Eventbrite:** checkout modal on a live event -> `eventbrite/checkout-{desktop,mobile}.png`

**EB anatomy (captured).** A centred modal over a dimmed page: event title + date header, a **Promo Code** field (Enter code / Apply), a "Tickets" section with ticket-type cards (name, price with **fee inline** "A$155.20 incl A$5.20 Fee", "Sales end on Jun 8, 2026", an inclusions line, and a `- 0 +` stepper), a **"Going fast"** urgency pill, and a "Check out" CTA; the event poster and a cart sit to the right. Mobile is a near full-screen sheet.

**TM (pattern).** Queue / waiting-room, then a timed cart, seat/price selection, account or guest, payment; fees and service charges appear late in the flow.

**What makes the best version world-class.** EB: one modal, fee shown at selection, urgency signal, promo code, clear primary CTA, no page reloads. TM: scarcity control (queue) and a cart timer that protect inventory under load.

**Concrete gap vs ours (`/checkout/[reservation_id]`).** Ours is architecturally ahead: a true **one-page checkout** (ticket selection -> details -> payment -> confirmation, scope §3.7.1), **guest checkout**, a reservation **inventory hold**, `CheckoutTrustSignals`, and **all-in pricing from the first click** via `PaymentCalculator` (vs EB revealing the fee only at the ticket card and TM revealing it late). Deltas: (a) add a visible **cart/hold countdown** so the buyer sees the reservation timer (TM-style), reducing abandonment anxiety; (b) add a **promo / discount code** field like EB; (c) **Apple Pay / Google Pay express** one-tap (scope §3.7.1 calls for it) to beat both on speed; (d) a light **urgency signal** ("going fast" / low remaining) where truthful.

## 7. Digital ticket

- **Ticketmaster:** none public (app / mobile wallet, sign-in gated).
- **Eventbrite:** none public ("Find my tickets" requires sign-in).

**Anatomy (pattern).** TM pushes a rotating-barcode in-app ticket (SafeTix) to deter screenshots; EB emails a PDF / shows tickets after login. The world-class reference here is Apple Wallet and the DICE app ticket: a single, glanceable, secure pass.

**What makes the best version world-class.** A secure, scannable, offline-capable pass that needs no app install and resists fraud.

**Concrete gap vs ours (`/t/[code]`, `/tickets`).** Our **bearer-link ticket** (a no-login URL with a secret key, QR, status pill: valid / checked-in / refunded / void / transferred) is genuinely a differentiator - neither competitor offers a no-app, no-login scannable ticket. Deltas to reach the Apple-wallet bar: (a) **Add to Apple Wallet / Google Wallet** passes; (b) a rotating / time-boxed code option for high-value events to deter screenshot resale (TM SafeTix parity); (c) offline rendering and a wallet view (`/tickets`) polished to a single glanceable pass per event.

## 8. City page

- **Ticketmaster:** https://www.ticketmaster.com.au/city/... -> `ticketmaster/city-page-*` (Brisbane; link resolved from the homepage Cities nav)
- **Eventbrite:** https://www.eventbrite.com.au/d/australia--sydney/all-events/ -> `eventbrite/city-page-*` (Sydney)

**TM anatomy.** A genuine editorial city landing: a dark city-skyline photographic hero with the city name set large ("BRISBANE"), a short editorial intro ("Looking for things to do in Brisbane?..."), then a "Happening this week" rail of event cards. More art-directed than its homepage.

**EB anatomy.** City is a scoped instance of the faceted discovery grid ("Discover All Events & Activities in Sydney") - the same chips + grid as browse, titled by city. Functional, not editorial.

**What makes the best version world-class.** TM's editorial city page (hero photo + city voice + curated "this week") is the bar: it sells the city, not just lists events. EB's is merely a filtered grid.

**Concrete gap vs ours (`/city/[slug]`).** Ours is already at or above the bar: a city hero photo, editorial copy, **time windows** (this week / this weekend / next 30 days), suburb tiles, **culture** and **category** entry points, and a city map - richer than TM's single "this week" rail and far richer than EB's filtered grid. Deltas: (a) match TM's **photographic art direction** on the hero (large city name over a strong skyline image) so it reads as editorial, not utility; (b) ensure real organiser imagery in the rails (our current stock imagery is the variable that decides the image-quality lead).

---

## Cross-cutting deltas (apply to every page)

1. **Display typography.** Adopt a distinctive display typeface. This is the single dimension where a competitor (DICE, and EB's curated voice) reads more editorial than us; a single Manrope for everything is our clearest "behind".
2. **Fee transparency as a weapon.** We show all-in pricing from the first click; EB reveals the fee only at the ticket card and TM late in checkout. Make this an explicit, visible promise on event, checkout, and organiser pages.
3. **Conversion completeness.** Remove "tickets not yet on sale" dead-ends from discovery, add a high-demand queue/waiting-room (TM parity), a cart-hold countdown, promo codes, and Apple/Google Pay express.
4. **Organiser social proof.** Follower counts + Follow (EB parity) on event and organiser surfaces.
5. **Real imagery.** Replace stock with real organiser covers before launch; this decides our image-quality lead, which is currently ours to lose.

## Where we already lead (protect, do not regress)

- Atmosphere and palette (cinematic navy + gold on warm canvas) beat TM's flat blue portal and EB's flat white marketplace on every captured surface.
- Mobile app-shell (persistent bottom tab nav) is more native than either competitor's mobile web.
- All-in pricing from the first click (vs EB and TM late fees).
- One-page guest checkout with an inventory hold.
- No-login bearer-link digital ticket (no competitor equivalent).
- In-grid map discovery on browse and city (no competitor equivalent).
- Editorial city pages with time windows, suburbs, culture and category axes (richer than both).
