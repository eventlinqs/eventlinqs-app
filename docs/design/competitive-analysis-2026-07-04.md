# Competitive Analysis - 2026-07-04 (Fable 5 design upgrade, Phase 1)

Live study of eight ticketing and events platforms operating in Australia and
globally: Humanitix, Eventbrite AU, DICE, Luma, Ticketek, Moshtix, Oztix,
TryBooking. Method: live fetches of public homepages, real event pages,
organiser/pricing pages on 2026-07-04, by four parallel research agents.
Findings marked OBSERVED were fetched and read; anything inferred was flagged
in the raw reports. This is research, not theft: EventLinqs copies nothing.

## Platform-by-platform verdicts

### Humanitix (humanitix.com)
- First 5 seconds: events lead, mission rides along. Featured-event carousel
  hero plus a persistent "Tickets for good, not greed" banner with a LIVE
  donation counter ($20.79M). Discovery chips (Nearby, For You, Trending) and
  city buttons. Organiser entry is a quiet "Host login".
- Event page: date-selector, banner image, key-info block with organiser
  follower count and a follow-WITHOUT-account email capture form (the
  lowest-friction alert loop observed anywhere). Long single-column text does
  the selling. Zero urgency devices. Bare share icons, no incentive.
- Organiser pitch: "Stand out and sell out"; pricing page leads with exact
  numbers: 4% + $0.99 (charities 2.5% + $0.50), free events free. No
  testimonials, no comparison table, no fee calculator: they under-sell their
  own price advantage.
- Weak: no urgency architecture, thin third-party proof, generic rail labels,
  functional-not-premium event pages.

### Eventbrite AU (eventbrite.com.au)
- First 5 seconds: pure inventory aggregator. Search-led hero, 8 category
  tiles, 15 city cards, then a naked alphabetical suburb link farm. Zero brand
  warmth. US spelling ("organizer") on the .com.au domain.
- Event page: 5-slide image carousel, "Top Organiser" badge, Follow button,
  "Featured in 2 collections". NO price on the page body (modal only). Every
  page is a discovery doorway (more-from-organiser, you-might-also-like,
  location cross-links). Found live: a STALE Feb-2025 payment-incident banner
  still on a 2026 event page: visible operational rot post-acquisition.
- Organiser pitch: "Where Event Organizers Grow"; reach stats as the spine
  (270M tickets, 89M monthly users), because on price they lose: 3.7% + $1.79
  + 2.9% processing, hidden a click deep behind a "transparent fees" claim.
  Upsells (Ads, Email Pro $15/mo) inside the pricing page read as fee-stacking.
- Silent on data ownership: the known organiser grievance, unanswered.

### DICE (dice.fm)
- First 5 seconds: "Welcome to the alternative". Anti-Ticketmaster, fan-first,
  all-in prices to the cent on every card. Primary CTA is "Get the app": web
  is a funnel; tickets are app-delivery only.
- Event page: square artwork, a Spotify "Top track" module (the page plays the
  event's sound), price directly under title with "The price you'll pay. No
  surprises later.", inline plain-language refund policy at the point of
  decision. No web share affordances at all: sharing lives in the app.
- Organiser pitch: sales-gated, no public fees (a live reputational wound:
  artists publicly complain). The killer asset: "41% of tickets sold via DICE
  are prompted by Discovery": the entire demand-engine pitch in one quantified
  stat, yet buried on a secondary page.
- Waiting List is their demand-sensing flywheel: converts sell-outs into
  measured unmet demand, prompting extra allocations.

### Luma (luma.com)
- Organiser-only homepage: "Delightful events start here." No attendee
  marketing at all. Radical fee transparency: free tier 5% platform fee, $59/mo
  Plus tier 0%, priced by INVITES PER WEEK: they monetise their own growth loop.
- THE OG SHARE CARD (verified in raw meta tags): a dedicated og.luma.com
  service composes a bespoke share image per event, server-side: cover image,
  event name, host name AND avatar, with colour palette values EXTRACTED from
  the event artwork. Every pasted link is a designed, host-attributed,
  colour-matched invitation. The world benchmark for share-loop craft.
- Weak: discovery is a text-dense SaaS directory (80px thumbnails); taxonomy
  is tech-monoculture (Tech 3K, AI 3K, Crypto); publishes per-city counts even
  when embarrassing ("Sacramento: 1 Event"): a density own-goal.

### Ticketek (premier.ticketek.com.au)
- NO value proposition anywhere: the homepage opens with a logo, a SESSION
  EXPIRY COUNTDOWN (anxiety UX on a browse surface), nav, and event tiles
  carrying image + title only: no date, venue, or price on any card.
- Event page: date `<select>` + "Go" button is the entire purchase entry. NO
  prices pre-selection, plus "the price of a ticket for this event may increase
  or decrease at any time". A compliance wall (restrictions, scalping,
  delivery, duplicated blocks) outranks the artist story.
- No organiser marketing page at all: the front door is a Zendesk article
  promising a reply "within two business days". The mid-market is undefended.
- One mechanic worth studying: WAITLISTS: artist-level demand capture before
  an event exists (maps to the EventLinqs alert engine, executed with
  attribution they lack).

### Moshtix (moshtix.com.au)
- Provably dated: IE-era polyfills (selectivizr, json2.js, a 2009 jQuery
  tooltip RC) live in 2026; a 2014 promo page still reachable ("$3.95 booking
  fee", offer expired September 2014); 140x140px thumbnails on every discovery
  card; pinch-zoom disabled on mobile (WCAG 1.4.4 failure).
- Event pages are structurally better than Ticketek (related-events rail,
  genre tags, Spotify artist link) but visually flat, price-opaque until
  checkout, zero social proof.
- Organiser pitch hides fees entirely and leans on Ticketmaster ownership:
  radioactive branding for the indie organisers they serve.

### Oztix (oztix.com.au)
- "Australia's best events and gigs" + independence story. Client-rendered SPA
  homepage (near-empty without JS: SEO fragility). Attempts a taste graph
  (favourite artists, genres, saved events) but executes with page-refresh
  mechanics and LIVE JUNK DATA: placeholder venue "Oztix Tavern", a card dated
  2020, dead `#` hrefs. A personalisation engine rendering junk is worse than
  none.
- Event page: clean, all-in ("Price includes booking fees"), a "REMIND ME"
  alert button, calendar exports: then a conversion dead end (no related
  events, no social proof; share = a bare email field).
- Organiser pitch: no public pricing, enterprise "Contact sales" posture,
  though "22,000+ organisers / 20+ years" trust numbers and a real data pitch.

### TryBooking (trybooking.com)
- The organiser-acquisition homepage: "Sell tickets online with Australia's
  favourite event booking system"; Create Event leads. Community/SME identity
  owned explicitly. Zero glamour by choice.
- The conversion weapon: EXACT public fees (50c/ticket buyer-side, 2.5%
  processing, free events free) plus an INTERACTIVE who-pays fee calculator
  with live payout estimates: the strongest conversion device observed on any
  of the eight sites. Stats band: 150,000+ organisers, 70M+ tickets. Five
  named, photographed testimonials.
- Buyer side is an afterthought: bare 3-field search; "Featured Events"
  rendering EMPTY on fetch; event pages are text-heavy platform templates with
  no map, no share, no urgency, no related events.

## The market gaps (where EventLinqs wins)

1. THE EVENT PAGE IS UNDEFENDED. No AU platform gives an event native social
   proof, urgency, a designed share mechanic, or (Ticketek/TryBooking/Oztix)
   even related events. Who's-going on the open web is uncontested white space
   globally: DICE and Luma both keep it off their web pages.
2. FEE TRANSPARENCY IS THE TRUST BATTLEGROUND. Humanitix and TryBooking
   weaponise exact numbers; Eventbrite, DICE, Oztix, Moshtix, Ticketek all
   hide fees and it reads evasive. EventLinqs's ACCC all-in-early display and
   published 3.5% + $0.99 / 2.5% is a visible differentiator against SIX of
   eight competitors: design it as conversion copy at the point of decision
   (DICE's "The price you'll pay. No surprises later." shows the register).
3. THE SHARE LOOP HAS NO AU INCUMBENT. Best local share affordance is Oztix's
   email field. Luma's colour-matched, host-attributed OG card is the world
   benchmark: EventLinqs pairs that craft with ATTRIBUTED invite links (which
   even Luma does not surface) and the share-a-ticket loop has no competitor.
4. THE ORGANISER MID-MARKET IS OPEN. Ticketek's front door is a help-desk
   article; DICE and Oztix are sales-gated; Moshtix hides fees. Self-serve
   onboarding + published fees + the data-ownership promise attacks every
   flank at once. TryBooking is the only self-serve local rival and its
   design ceiling is low.
5. QUANTIFY THE DEMAND ENGINE. DICE converts organisers with one stat (41% of
   sales from Discovery). EventLinqs's organiser page must be built with a
   slot for its own measured discovery stat the day real data exists: until
   then the pitch is the mechanism (feed + push + follows), stated concretely.
6. NOBODY SELLS THE FEELING. Ticketek/Moshtix/TryBooking/Oztix are inventory
   lists; Eventbrite is a search box; Luma is a SaaS tool. Only DICE sells a
   night out, and only for club culture. A premium, image-led, all-of-Australia
   platform voice is an empty lane below Ticketmaster scale.

## How design reinforces the three loops

- ACQUISITION LOOP: share actions on every event page (visible, designed,
  incentive-framed) + per-event OG cards that make every shared link a branded
  invitation + post-purchase share prompts. Buyer-to-organiser doorways in the
  chrome ("Run your own events? It is free to start"), the one growth device
  every winner ships.
- DEMAND LOOP: follow affordances styled as first-class actions (organiser
  cards, artists, communities); who's-going avatar proof on event pages;
  waitlist/remind-me as demand capture when sold out or not-yet-on-sale; the
  feed as a designed destination, not a list.
- RETENTION LOOP: designed empty states that invite the next action; alerts
  opt-in framed at moments of intent (post-purchase, post-follow); the account
  surface as a "your next night out" surface, not an order archive.

## Register (what EventLinqs sounds like, learned from the field)
- Prices always all-in, always visible before commitment, stated plainly at
  the buy button.
- Trust copy inline at the point of decision, never in a compliance wall.
- Australian English, community-first, no hype punctuation: confidence through
  specificity (exact fees, exact payout days, real counts) not superlatives.
- Never render a number that argues against you (empty-city counts); never
  render junk data (Oztix's 2020 cards): honest curation over raw feeds.
