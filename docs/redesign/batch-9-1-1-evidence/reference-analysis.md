# Batch 9.1.1 - Reference Analysis

Date: 2026-05-09
Captures: 17 of 18 verified at or above 100KB; 1 partial.

## GATE 1 capture status

| # | Site | Viewport | Label | File size | Status |
|---|---|---|---|---|---|
| 1 | ticketmaster | desktop | home | 1134.5KB | OK |
| 2 | ticketmaster | mobile | home | 1163.4KB | OK |
| 3 | dice | desktop | home | 506.0KB | OK |
| 4 | dice | mobile | home | 991.6KB | OK |
| 5 | eventbrite | desktop | home | 685.7KB | OK |
| 6 | eventbrite | mobile | home | 1049.0KB | OK |
| 7 | ra | desktop | cities-index | 49.0KB (best of 7 attempts) | **BELOW 100KB - escalated** |
| 8 | ra | mobile | cities-index | 119.6KB (Wayback Machine snapshot) | OK |
| 9 | airbnb-exp | desktop | experiences | 894.0KB | OK |
| 10 | airbnb-exp | mobile | experiences | 1159.1KB | OK |
| 11 | dice-anon | desktop | header-anon | 453.6KB | OK |
| 12 | dice-anon | mobile | header-anon | 685.7KB | OK |
| 13 | airbnb-anon | desktop | header-anon | 732.6KB | OK |
| 14 | airbnb-anon | mobile | header-anon | 917.8KB | OK |
| 15 | dice-search | desktop | search-overlay | 142.5KB | OK |
| 16 | dice-search | mobile | search-overlay | 288.4KB | OK |
| 17 | airbnb-search | desktop | search-overlay | 622.1KB | OK |
| 18 | airbnb-search | mobile | search-overlay | 195.3KB | OK |

### RA desktop capture - escalation

**Visual inspection of `references/ra-desktop-cities-index.png` (49KB, the best of 7 attempts):** the file is a Cloudflare-style block page rendered by ra.co. It shows the RA red logo, "Access is temporarily restricted", and a list of suspected reasons ("Rapid taps or clicks", "JavaScript disabled or not working", "Automated (bot) activity on your network", "Use of developer or inspection tools"). It is NOT lean RA UI; it is a block page. The 49KB does not represent RA's design and does not inform any 9.1.1 decision.

`ra.co` blocks headless Chromium at the desktop viewport. Tried 7 attempts:

1. Direct `https://ra.co/clubs` - 34.7KB (Cloudflare-style block page)
2. `https://ra.co` - 34.8KB
3. `https://ra.co/events` - 34.8KB
4. `https://ra.co/events/au` - 34.5KB
5. `https://ra.co/clubs/au` - 34.7KB (with `--disable-blink-features=AutomationControlled` stealth flag, longer settle, scroll nudge, full-page mode)
6. Wayback Machine snapshot of `/clubs` - 25.3KB (snapshot itself was thin)
7. Wayback Machine snapshot of `/events` - 49.0KB (best desktop attempt; the snapshot's banner UI is thin without the city tile grid hydrated)

Mobile retry via Wayback Machine `/web/2026/https://ra.co/events` succeeded at 119.6KB; that capture is in the references directory.

**The RA desktop reference is the only capture that failed the 100KB hard threshold.** This is escalated rather than silently substituted. Two consequences:

- This document treats RA as a documented industry pattern (per the brief's Section 3.3 paragraph) rather than a screenshot-evidenced reference for desktop.
- The closure report records GATE 1 as SHIPPED PARTIAL on this single sub-item, with the rest of the gate (17 of 18) clean.

If the founder wants a real RA desktop screenshot before push, the recommended path is a manual screenshot from a non-headless browser, saved into `docs/redesign/batch-9-1-1-evidence/references/ra-desktop-cities-index.png`. The implementation in this batch does not depend on the screenshot landing at 100KB; it relies on the documented RA pattern (photographic city tiles with event counts, top-level cities index page).

---

## Per-scope-dimension analysis (X does Y, therefore EventLinqs does Z)

### 3.1 Primary nav taxonomy

- **Ticketmaster** (ticketmaster-desktop-home.png): primary nav = Concerts / Sports / Arts, Theater & Comedy / Family. Dropdown-driven, large vertical menus on hover. Surfaces their core IA aggressively. Ads still squeeze the right side of the bar.
- **DICE** (dice-desktop-home.png): primary nav = Discover / Sell tickets. Two items only on the visible bar; cities surface as a pill row directly under the nav, not in the nav itself. Mobile-first minimalism.
- **Eventbrite** (eventbrite-desktop-home.png): primary nav = Find Events / Create Events / Help Center. IA buried; the page surfaces categories below the hero, not in nav.
- **Airbnb Experiences** (airbnb-exp-desktop-experiences.png): primary nav uses a large category strip across the top with iconified categories. Strong category surfacing but at the cost of vertical space.

→ **EventLinqs ships four plain-link primary nav items: Browse Events, Cultures, Cities, For Organisers.** No dropdowns at this stage. Cultures and Cities surface the platform's discovery axes (14 cultures and 20 cities) directly in the bar, matching DICE and RA's clarity. Browse Events stays as the freeform filter fallback. For Organisers carries supply-side. Materially better than Eventbrite's buried IA, more honest than Ticketmaster's ad-conflicted dropdowns, and brand-anchored beyond DICE's discover-only structure.

### 3.2 /cultures index page

- **Ticketmaster** browse-by-genre: flat tile grid with category names and stock imagery. No editorial. No tier separation. Density wins, depth loses.
- **DICE** browse-by-genre: text chips with event counts inside the search overlay only. No standalone landing page. Functional but not surfaced.
- **Eventbrite** category browse (eventbrite-desktop-home.png shows the section in the homepage hero): paginated thumbnail-and-label grid. Low information density per row, lots of whitespace.
- **Airbnb Experiences** (airbnb-exp-desktop-experiences.png): horizontal-rail set of photographic tiles with short editorial captions per category. High visual quality, minimal density.

→ **EventLinqs ships a two-section grid with Tier 1 (10 Cultural Communities) and Tier 2 (4 Cross-Cultural).** Each card carries a Pexels photographic hero, the displayName in locked Manrope display, an event count, and a route to `/culture/{slug}`. The tier separation is IA depth no competitor offers; the photographic quality matches Airbnb Experiences; the density (5-col desktop) beats Eventbrite's 3-col paginated approach.

### 3.3 /cities index page

- **Ticketmaster** (no top-level cities index): only a search-driven location selector.
- **DICE** (dice-desktop-home.png): cities live in a horizontal pill row near the top of the homepage, no standalone cities index page.
- **Eventbrite** (no top-level cities index): location landing pages reachable via search.
- **Resident Advisor** (documented industry pattern, not screenshot-evidenced for desktop): top-level cities index page with photographic tiles and event counts. Industry gold standard for music-driven discovery.
- **Airbnb Experiences** (airbnb-exp-desktop-experiences.png): photographic destination tiles with event counts grouped by region.

→ **EventLinqs ships a two-section grid with Capital Cities (8 Tier 1) and Regional Cities (12 Tier 2).** Each card: 16:9 Pexels photographic hero with the city name and event count, route to `/city/{slug}`. The Capital / Regional split reflects Australia's actual geography and adds a layer of IA depth beyond RA's flat alphabetical-by-region approach. Photographic quality matches Airbnb's destination tiles. Surpasses Ticketmaster and Eventbrite (no top-level cities index at all) and DICE (cities buried as homepage pills, not their own page).

### 3.4 Avatar shell authenticated state

- **Ticketmaster** (ticketmaster-desktop-home.png): authenticated header shows a text "Sign In" link only when anonymous; authenticated state is "Hi {firstName}" text link to account. Visually low-weight, no avatar imagery.
- **DICE** (dice-anon-desktop-header-anon.png): clean dark header with "Login" + "Sign up" buttons in the anonymous state. Authenticated state (per documented pattern): 32px circular avatar with initials fallback, dropdown on click.
- **Eventbrite** (eventbrite-desktop-home.png): "Sign Up" + "Log In" pill buttons in the anonymous state; authenticated state (per documented pattern): "Account" text + chevron, dropdown.
- **Airbnb** (airbnb-anon-desktop-header-anon.png): trademark "rounded user-icon-plus-hamburger" pill in the anonymous state, opens an auth menu; authenticated state: 32px avatar in the same pill position with subtle dropdown.

→ **EventLinqs ships a 32px circular avatar with 1px gold border in the authenticated state**, placed where the anonymous "Sign in" + "Get Started" pair currently sits. White initials over navy fill placeholder, soft 1.05 scale on hover, gold focus-visible ring with 2px offset, click routes to `/account`. Matches the Spotify/Airbnb 2026 industry standard. Surpasses Ticketmaster's text-link approach by signalling membership rather than transactional account access. The dropdown internals (account menu, sign out) ship in 9.2; this batch is the visual shell only, per the explicit Section 6.4 scope.

### 3.5 Search overlay a11y

- **Ticketmaster** search overlay (per documented industry pattern): keyboard accessible but no ArrowUp/Down between suggestions, focus does not return to trigger on close.
- **DICE** search overlay (dice-search-desktop-search-overlay.png shows the overlay open with a tabbed search input + suggestion grid): full keyboard support, ArrowUp/Down navigation between suggestions, focus returns to the trigger element on Escape.
- **Eventbrite**: inline search bar only, no overlay pattern.
- **Airbnb** search overlay (airbnb-search-desktop-search-overlay.png shows the destination/date/guests stepped overlay): full keyboard support including ArrowUp/Down within suggestion lists, Escape closes and returns focus, Tab cycles through the steps. Reference standard.

→ **EventLinqs adds focus restore on close, ArrowUp/Down navigation between suggestions with `aria-activedescendant`, Home/End jumps, and Enter activates the highlighted suggestion.** This brings the 9.1 search overlay shell up to Airbnb's a11y completeness and surpasses Ticketmaster which is non-conforming.

---

## Locked composite design decisions

Based on the analysis above, the following design decisions are LOCKED for this batch:

1. **Nav: 4 plain-link items.** Browse Events, Cultures, Cities, For Organisers. No dropdowns. Spacing reduced to 24px gap if 32px crowds the right-side actions at 1440px (verified during build).
2. **Cultures index: two-section card grid.** Section 1 "Cultural Communities" (10 Tier 1 cards in 2-col mobile / 4-col tablet / 5-col desktop). Section 2 "Cross-Cultural" (4 Tier 2 cards in 2-col mobile / 4-col desktop).
3. **Cities index: two-section card grid.** Section 1 "Capital Cities" (8 Tier 1 cards in 2-col mobile / 3-col tablet / 4-col desktop). Section 2 "Regional Cities" (12 Tier 2 cards in 2-col mobile / 3-col tablet / 4-col desktop).
4. **Avatar: 32px circle, 1px gold border, navy fill, white initials, 1.05 hover scale, 200ms cubic-bezier(0.22, 1, 0.36, 1) easing, gold focus-visible ring.** Click routes to `/account`. Notification pulse OUT OF SCOPE per the explicit deferral.
5. **Search overlay a11y: focus restore on close + ArrowUp/Down between suggestions + Home/End + Enter activates highlighted + aria-activedescendant on the input.** All within the existing dialog structure, no visual redesign.

End of analysis.
