# Homepage — Competitive Teardown

**Captured:** 2026-04-26
**Viewports:** 1280x800 desktop, 375x667 mobile
**Sources:** ticketmaster.com.au, dice.fm, eventbrite.com.au
**Screenshots:** `.playwright-mcp/current/{tm,dice,eb}-home-{desktop,mobile}.jpeg`

---

## Ticketmaster.com.au

### Desktop (1280x800)
- **Top utility bar:** dark band with country switcher (AU), location ("All of Australia"), Gift cards / Group Bookings / Help / Sell Tickets / PayPal partner badge.
- **Header:** royal blue (#0265F0-ish) full-bleed band, italic "ticketmaster" wordmark left, primary nav (Music / Sport / Arts, Theatre & Comedy / Family & Attractions / Cities) centre, Sign In/Register right.
- **Search panel:** sits inside the blue band — three white pill cards (Location / Dates / Search input) with a dark blue "Search" pill on the right. Heavy real estate spend on search.
- **Hero:** full-bleed cinematic photo (artist Anyma) about 60% viewport height. Text block left-aligned at about 8% horizontal inset: artist name (italic, white, ~64px), one-line description, dark blue "Find tickets" pill CTA. No motion observed on initial load.
- **Card grid (below fold):** 3-column event tiles (4:3 cover, no padding around image, category eyebrow + title underneath). To the right of the grid sits a 300px sidebar with a leaderboard ad slot and a "FEATURED" rail.
- **Section-header pattern:** small black bar (~32px x 2px) above caps eyebrow ("POPULAR TICKETS", "DISCOVER"). 
- **Ad pollution:** in-page banner ad ("GIFT CARDS GIVE THE GIFT OF LIVE") between rails, sidebar ad units always visible.
- **Console:** 7+ JS errors on load (third-party scripts).

### Mobile (375x667)
- Top utility bar collapses to country chip + location.
- Hamburger | wordmark | account icon header.
- Search becomes three stacked rows (Location / Dates / Search-with-magnifier).
- Hero is an edge-to-edge 16:9 card with title/CTA overlaid on dark gradient.
- Below the fold: Google AdSense banner ad immediately ("The wrong hire can cost small businesses big") — intrusive.

### Strengths
- Cinematic photo hero, generous card grid (image dominates), explicit eyebrow + section-title rhythm.
- Search-first interaction model — triple field is unmistakable.

### Weaknesses
- Ads everywhere (sidebar, banner, mobile interstitials) corrode trust.
- Royal-blue brand reads aggressive and dated.
- Console errors on load = unprofessional.
- Hero text feels disconnected (italic name, generic description, single CTA).

---

## DICE.fm

### Desktop (1280x800)
- **Header:** white canvas, ghost-mascot wordmark left, large search input ("Search by event, venue or city") centre, nav (Browse events / Get help / Work with us / Log in/Sign up / GET THE APP pill) right.
- **Hero:** bold-display pattern, NO photography. Left half: massive black caps display type "WELCOME TO THE ALTERNATIVE" (~120px, line-height ~1.0, weight 800). Sub-line: "Incredible live shows. Upfront pricing. Relevant recommendations. DICE makes going out easy." Single black pill CTA "GET THE APP".
- **Right half:** rendered iPhone mockup on dark canvas showing a Boiler Room ticket UI with neon-yellow PURCHASE TICKETS button. Acts as decorative product proof, not a real card.
- **Below fold:** "Weirdly easy ticketing" black band with three hand-drawn punk illustrations + caption pairs ("Get tickets in less time than it took to read this", "See the full price upfront, with no surprises at checkout", "Personalised recommendations on your unique Home feed"). White-on-black, illustration-led.
- **No event grid above the fold on desktop or mobile homepage.** DICE treats the site as a marketing surface and the app as the product.

### Mobile (375x667)
- Logo left, search icon + hamburger right.
- Hero collapses to phone mockup full-width (the "YOU'RE GOING" success state, neon green).
- Cookie banner takes the bottom third.
- No browseable events on the homepage at all on mobile.

### Strengths
- Confident restraint — no ads, no clutter. One message, one CTA.
- Bold display typography is the hero. The visual identity is the product.
- Hand-drawn illustrations carry brand personality without falling into corporate stock.
- Explicit anti-fee promise ("See the full price upfront, with no surprises at checkout").

### Weaknesses
- App-first to a fault — fans landing for browsing get nothing.
- All-black with a single neon (yellow / green) excludes audiences who don't read as "underground".
- US/UK skew, no AU presence.

---

## Eventbrite.com.au

### Desktop (1280x800)
- **Header:** white, coral wordmark, search input + location chip ("Melbourne") with red search pill, nav (Updates / Find Events / Create Events / Help Centre / Find my tickets / Sign in).
- **Hero:** full-bleed photo (singer with mic), warm orange tint. Inset eyebrow pill "GET INTO IT", display type "FROM POP BALLADS TO EMO ENCORES" with pink-to-purple gradient highlight, white pill CTA "Get Into Live Music".
- **Category strip:** eight horizontally-scrollable circular icon tiles below the hero (Music, Nightlife, Performing & Visual Arts, Holidays, Dating, Hobbies, Business, Food & Drink). Visible scrollbar.
- **"Browsing events in Melbourne":** geo-aware section header with chevron change-city.
- **Card grid:** 4-column dense rows with "Almost full" / "Sales end soon" / "Promoted" pill badges baked in.

### Mobile (375x667)
- Same hero treatment scales to full-width.
- Category strip becomes 2-row 4-col grid (8 categories visible without scroll).
- Sign-up / sign-in icons in header take precedence (tickets icon visible).

### Strengths
- Genuine geo-personalisation — "Browsing events in Melbourne" with a switch.
- Category circles surface eight discoverable verticals immediately.
- Pricing clarity per card (Free / "From $XX") right below title.

### Weaknesses
- Coral + cream + purple gradient feels twee, low-trust for premium artists.
- "Almost full" / "Promoted" pills crowd cards and read like manipulation.
- 4-col density on desktop sacrifices image scale.

---

## Patterns to Carry Forward (EventLinqs)

| Pattern | Source | Why we want it |
|---|---|---|
| Cinematic hero with left-side text + single primary CTA | Ticketmaster | Image-led emotional hook |
| Confident bold-display alternative for marketing pages | DICE | Trust through restraint |
| Geo-aware "X in [city]" section header | Eventbrite | Personalisation that costs nothing |
| Eyebrow + small accent bar + section title | Ticketmaster (refined to gold) | Editorial rhythm |
| Pricing transparency promise on hero | DICE ("upfront pricing") | Differentiator copy |
| Hand-drawn illustration in marketing band | DICE | Brand personality without stock-photo trap |
| Sub-genre / culture pill row | Eventbrite circles + DICE pills | Discoverability without wasting hero space |

## Patterns to Reject

- Ad slots inside event content (Ticketmaster).
- Manipulative urgency pills like "Almost full" / "Promoted" without ceiling (Eventbrite).
- App-only homepage with no browseable events (DICE mobile).
- Royal blue / coral-orange palettes — both read transactional, not aspirational.
- Visible horizontal scrollbars on category strips (Eventbrite desktop).
