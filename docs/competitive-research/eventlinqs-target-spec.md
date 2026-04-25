# EventLinqs Target Spec — Per-Surface Specification

**Captured:** 2026-04-26
**Calibration:** Apple / Stripe / Linear / Aesop / Net-a-Porter premium restraint. Quiet confidence, cultural warmth, no spectacle.
**Inputs:** `homepage.md`, `category-page.md`, `city-page.md`, `event-detail.md`, `search.md`, `synthesis.md`
**Token system:** see `docs/DESIGN-SYSTEM.md` for full scale.

This document is the per-surface target. Each section specifies typography, spacing, motion, imagery, and trust signals. Component primitives that already exist (`CityTile`, `ThisWeekStrip`) define the aesthetic floor — surfaces using new components must match or exceed their fidelity.

---

## Universal Tokens (referenced throughout)

| Token | Value | Use |
|---|---|---|
| `canvas` | `#FAFAF7` | Default page background |
| `ink-900` | `#0A1628` | Primary text, primary CTA fill |
| `ink-600` | mid-slate | Secondary text |
| `ink-400` | slate | Tertiary text, metadata |
| `ink-200` | hairline | Dividers, card borders |
| `gold-500` | `#C9A24A` | Primary accent — eyebrow text, CTA fill, hover ring |
| `gold-100` | gold tint | Card hover background, focus ring |
| `coral-500` | warm coral | Save state, secondary warm actions |
| `font-display` | Manrope, weight 700-800 | Headings, eyebrow, CTA labels |
| `font-body` | Inter, weight 400-500 | Body, metadata, prices |
| Easing | `cubic-bezier(0.16, 1, 0.3, 1)` | All interactive transitions |
| Motion duration | 200-300ms interactive, 1400ms cinematic | Honour `prefers-reduced-motion` |
| Spacing scale | 4px base — 8/16/24/40/64/96 | Vertical rhythm |
| Min touch target | 44x44px | All interactive |
| Min form input | 16px font-size | iOS auto-zoom prevention |

---

## 1. Homepage

### Hero
- **Pattern:** cinematic full-bleed photo, 70vh on desktop, 56vh on mobile (clamped to ~640px max).
- **Imagery rotation:** 4-frame Ken Burns crossfade (12s per frame, 3s crossfade) of real diaspora events. Frame 1 Owambe wedding, Frame 2 Amapiano warehouse Sydney, Frame 3 mehndi/Diwali concert Melbourne, Frame 4 gospel revival Auckland. Honour `prefers-reduced-motion` (static frame 1).
- **Overlay gradient:** `linear-gradient(180deg, rgba(10,22,40,0) 35%, rgba(10,22,40,0.65) 100%)`.
- **Headline:** display, `font-display` weight 800, white. Desktop ~88px line-height 0.95, mobile ~48px line-height 1.0. `WHERE THE CULTURE GATHERS`.
- **Sub-line:** body, weight 500, white/90. Desktop ~20px, mobile ~16px. One sentence — `Live events, all-in pricing, the moments that matter.`
- **CTA primary:** ink-900 fill, gold-500 hover ring, white text, 56px height desktop / 52px mobile, label `Find tickets`. Single CTA only.
- **Trust micro-line below CTA:** ~13px, white/75, weight 500. `All-in pricing. No fees added at checkout.`

### Geo-aware section header
- Below hero, full-width canvas band, 64px vertical padding.
- Pattern: small gold-500 accent bar (32x2px) above eyebrow text (`font-display` 11px caps tracking-widest gold-500), then H2 (`font-display` 32px weight 700 ink-900) `Live in Melbourne`, then a chevron-button `Change city` (text gold-600, no background).
- Falls back to `Live this week` if no geolocation.

### `ThisWeekStrip`
- Existing component. Renders directly under the geo-aware header.
- Strip: 280px snap-start cards, 16px gap, 4px scrollbar-hidden gradient fade right edge.
- Per card: 16:9 cover with category eyebrow chip, gold-500 date label, ink-900 title (`line-clamp-2`), ink-400 venue, gold-600 price.

### Featured rail
- Full-bleed editorial 1+2 layout. One large hero card (60% width desktop) + two stacked half-height cards (40% width).
- Hero card 4:3 image, ink-900 gradient overlay 50% from bottom, gold-500 eyebrow `FEATURED`, white H3 title, white sub-line + venue + date.
- Hover: scale image 1.04, 1400ms ease, no card lift.

### Browse by city (CityTile bento)
- Existing component. 3-col desktop, 2-col tablet, 1-col mobile.
- 4 cities visible above-the-fold scroll (Melbourne, Sydney, Brisbane, Perth) + `View all cities` ghost button below.

### Culture rails
- Three rails stacked: `Afrobeats Tonight` / `Amapiano This Month` / `Comedy in Your Language`.
- Each rail uses the same `ThisWeekStrip` pattern with a section header (gold accent bar + eyebrow + H2).
- Each event card identical shape — repetition reinforces editorial rhythm.

### Marketing band — Why EventLinqs
- Canvas band, 96px vertical padding.
- 3-column 1:1:1 with hand-drawn line illustrations (no stock photos).
- Three promises: `All-in pricing` / `Verified organisers` / `WhatsApp-native sharing`.
- Each: illustration top, `font-display` 18px ink-900 weight 700 title, body 14px ink-600 sub-line.

### Footer
- Standard footer, ink-900 fill, white text. Three columns: For Fans / For Organisers / Company. Plus newsletter input, social icons, country switcher.

### Anti-patterns (do not ship on homepage)
- No banner ads. No `Promoted` cards. No urgency pills (`Almost full`). No royal blue. No italic display type. No stock-vector hero illustrations.

---

## 2. Category Page (e.g. `/c/concerts`, `/c/comedy`)

### Hero
- Cinematic image hero, 480px desktop / 360px mobile.
- Single noun H1 (`MUSIC` / `COMEDY` / `NIGHTLIFE`) — `font-display` 88px weight 800 white, line-height 0.95.
- Sub-line below: `Live music in Melbourne. {N} events this week.` — geo-aware, count rendered server-side.
- ink-900 50% gradient from bottom.

### Sticky filter row
- 4 controls only above the fold: When | Date | Price | Culture-Language.
- Pill chips, `font-display` 13px weight 600, ink-900 text, 1px ink-200 border, gold-500 ring on focus.
- Sticky to top after 80px scroll, with 1px ink-200 bottom border.

### Sub-genre / culture carousel
- Section header (gold accent bar + eyebrow `EXPLORE BY CULTURE` + H3 `Afrobeats. Amapiano. Highlife. And more.`).
- Square 4:3 cover-art tiles, 220px wide desktop, 160px mobile, snap-scroll.
- Per tile: cover image with ink-900 gradient bottom 40%, white tile name, white event count.
- Hover: gold-500 1.5px ring, scale 1.03, 200ms ease.

### Event grid
- 3-col desktop, 2-col tablet, 1-col mobile.
- Existing event-bento-tile component. 4:3 cover desktop, 16:9 mobile.
- Hover: image scale 1.05 (1400ms), card lift 4px max, gold-500 ring 1px, title shifts ink-900 → gold-600.
- Save heart top-right: idle ink-600/40, saved coral-500 fill, 200ms ease.

### Pagination / load-more
- Server-side cursor pagination. `Load more` ghost button (gold-600 text, no fill, 1px ink-200 border, gold-500 ring on hover).

---

## 3. City Page (e.g. `/cities/melbourne`)

### Hero
- Cinematic full-bleed local photography, 56vh desktop / 48vh mobile.
- Imagery: real local diaspora event or venue (Bambi Sundays, Brown Alibi, Hummingbird, etc.) — never generic stock.
- H1 city name (`Melbourne`) — `font-display` 96px weight 800 white.
- Sub-line: `Live events in Melbourne. {N} this week. {M} verified organisers.`
- CTA pair: primary `Find tickets` (ink-900 fill) + ghost `For organisers` (white outline).

### Trust signal strip
- Below hero, canvas band 24px vertical padding.
- 3 inline metrics, separated by vertical hairlines (`ink-200`):
  - `{N} verified organisers`
  - `{M} tickets sold this month`
  - `Average all-in price shown on every event`
- Each metric: gold-500 accent number, ink-900 weight 600 caption.

### `ThisWeekStrip` — `What's on this week`
- Existing component. Same pattern as homepage.

### City-scoped culture rails
- `Afrobeats in Melbourne` / `Amapiano in Melbourne` / `Comedy in Melbourne` / `Owambe in Melbourne`.
- Each a 7-card horizontal rail.
- If a culture has zero events that week, the rail is hidden, not empty.

### Featured venues block
- 3-col grid of venue cards (logo + photo + upcoming-event count).
- Per card: 1:1 photo, gold-500 eyebrow `VENUE`, ink-900 venue name, ink-600 sub-line `12 upcoming events`, gold-600 link `View venue`.

### `Are you organising in Melbourne?` band
- Canvas band, 96px padding.
- Left: H3 `Trusted in Melbourne. Verified by EventLinqs.` + 2-line sub-line.
- Right: ink-900 fill CTA `Become an organiser` + ghost link `How verification works`.

### SEO
- Breadcrumb: `Home / Cities / Melbourne`.
- schema.org `Place` + `Event` markup, dynamic OG image (Melbourne hero crop + event count).

---

## 4. Event Detail (e.g. `/events/[slug]`)

### Backdrop
- CSS custom property `--event-tint` set server-side from cover-art dominant colour (extracted at upload time, stored on `events.tint_hex`).
- Backdrop: `linear-gradient(180deg, var(--event-tint) 0%, var(--event-tint) 360px, var(--canvas) 720px)`.
- Tint never overrides text contrast — header text always reads on tint, body always on canvas.

### Desktop two-column layout
- **Left column (~440px):**
  - Square poster `aspect-square` `object-contain` on `bg-ink-900/5` to honour organiser flyer.
  - Below image: heart-save (coral-500 when saved) + share icon row.
  - Trust strip card: ink-200 hairline, 16px padding. `font-display` 13px caps `EVENTLINQS PROTECTS BUYERS`, then 14px body `Tickets are securely stored in your account. All-in price shown — no fees added at checkout.`
  - `Got a code?` ghost link below.

- **Right column (rest):**
  - H1 event title, `font-display` 64px weight 800 ink-900 line-height 1.0, max ~2 lines.
  - Date row: gold-500 caps eyebrow + ink-900 date string + venue + city (icon-led).
  - Category chip + culture chip inline below date.
  - **Inset price card:**
    - Background `surface` (white) on canvas, ink-200 hairline, 24px padding, 16px radius.
    - Left: `font-display` 11px caps `FROM` ink-400 + 32px weight 700 `AUD $48` + 13px ink-600 `All-in. No fees added at checkout.`
    - Right: ink-900 fill CTA pill 56px tall, gold-500 ring on hover, white label `Get tickets`.
  - About section below: rich text, body 16px ink-900, 24px line-height.

### Sticky right rail (desktop ≥ 1024px)
- Once user scrolls past the inline price card, a sticky 360px right-rail mirror appears: same price + same CTA, condensed.
- Sticky position 96px from top.

### Mobile sticky bottom CTA
- 72px tall sticky drawer, surface white, ink-200 top border, 16px horizontal padding.
- Left: ` $48 / All-in` two-line stack.
- Right: ink-900 fill pill, full-height, label `Get tickets`.
- Tap opens checkout sheet (Phase 2 — current ship is Stripe-redirect).

### Sections (no tabs, vertical scroll)
1. About
2. Lineup (organiser-edited list)
3. Venue + map (Mapbox / OSM static at first ship)
4. FAQs
5. Refund policy (sourced from organiser_settings)
6. Related events (3-card grid same city + culture)

### Share menu
- WhatsApp first, then X, Instagram Story, Copy link. Diaspora primary.

### Schema
- schema.org `Event` markup, `Offer` block reflecting all-in price, `Place` block for venue.
- Dynamic OG image (event cover + title + date + city).

---

## 5. Search

### Header search component
- Single text input + paired location chip (`Melbourne`) inline.
- Input: 48px tall, ink-200 1px border, gold-500 ring on focus, 16px font-size, magnifier icon left.
- Location chip: 48px tall, ink-200 border, ink-900 city name, gold-500 ring on focus.
- Mobile: tap input expands to full-screen sheet.

### Autosuggest panel (on focus)
- Width matches input + chip combined, drops 8px below.
- Three sections in order:
  - **Recent searches** (signed-in or session) — text rows with clock icon.
  - **Popular in Melbourne** — text rows with trending icon.
  - **Suggested events** — 4 rows with 56x56 cover thumbnail, ink-900 title, ink-400 date + venue.
- All rows 44px+ tall, hover gold-100 fill, gold-500 left border on keyboard focus.

### Results page
- H1 geo-aware: `"{query}" events in Melbourne` — `font-display` 40px weight 700 ink-900.
- Result-type tabs (only render those with results): Events | Artists | Organisers | Venues | Cities.
- Tab pattern: `font-display` 14px caps tracking-widest, gold-500 underline marker on active, ink-900 text, ink-400 inactive.
- Filter row identical to category page: When | Date | Price | Culture-Language.
- Grid identical to category page (3-col desktop).
- Date chip overlaid top-left on each cover (`font-display` 11px caps gold-500 / ink-900 fill).

### Empty state
- Cultural illustration (organiser archetype) + `No exact matches for "XYZ".`
- `Did you mean...?` 3 suggestions as ghost pills.
- Below: `Popular in Melbourne` rail (existing component).

---

## 6. Trust Signals (cross-surface)

| Signal | Surface | Copy |
|---|---|---|
| All-in pricing promise | Hero, Card, Buy card, Sticky CTA | `All-in. No fees added at checkout.` |
| Buyer protection | Event detail trust strip | `EventLinqs protects buyers. Tickets stored securely in your account.` |
| Verified organiser tier | Organiser row, organiser profile | `Verified by EventLinqs` (top tier) > `TOP ORGANIZER` (volume tier) |
| City trust strip | City page below hero | `{N} verified organisers` / `{M} tickets sold this month` |
| WhatsApp-native share | Event detail share menu | First-position WhatsApp icon, primary action |

---

## 7. Cultural Representation Mandate

Every public surface must satisfy at least one of these on every render:

- Cover art / hero photography depicts a diaspora event or venue.
- Sub-genre tags surface at least one culturally-specific genre (Afrobeats, Amapiano, Bollywood, Reggaeton, K-pop, Highlife, Comedy in language) above generic parents.
- Featured rails / city rails lead with diaspora promoters where they exist locally.
- Empty states use the cultural illustration set, not a generic spinner or sad face.

This is enforced at the editorial layer — admin curation tools surface a `Cultural representation: {strong / weak / absent}` audit per page, surfacing surfaces that drift toward generic.

---

## 8. Motion Library

| State | Duration | Easing | Notes |
|---|---|---|---|
| Card image hover scale 1.05 | 1400ms | `cubic-bezier(0.16, 1, 0.3, 1)` | Cinematic |
| Card title colour shift ink-900 → gold-600 | 200ms | `ease-out` | Fast |
| Save heart fill | 200ms | `ease-out` | + 1.1 scale bounce honoured only without `prefers-reduced-motion` |
| Hero Ken Burns zoom | 12s per frame | linear | 3s crossfade |
| Filter pill ring on focus | 150ms | `ease-out` | gold-500 ring |
| Sticky CTA appear | 250ms | `ease-out` | Slide-up + fade-in |
| Modal / sheet open | 300ms | `cubic-bezier(0.16, 1, 0.3, 1)` | Slide-up |
| Skeleton shimmer | 1200ms | linear, infinite | ink-100 → ink-200 → ink-100 |

All motion respects `prefers-reduced-motion: reduce` — animations either disabled or reduced to opacity-only.

---

## 9. Component Floor (reference implementations)

These existing components are the aesthetic floor. Any new surface must match or exceed their fidelity:

- `src/components/features/events/city-tile.tsx` — bento city tile with gold-400/60 hover ring, scale-105 image, ink-900 gradient.
- `src/components/features/events/this-week-strip.tsx` — horizontal scroll strip, 280px cards, gold-500 date label, scrollbar-none, gradient edge fade.

Outstanding cleanup (Phase 1B):
- `city-tile.tsx` references `text-gold-300` which is not defined in `globals.css`. Resolve to `gold-400` or define `gold-300` token in design system.

---

## 10. What This Spec Is Not

This spec governs **public attendee surfaces**. Organiser dashboard, admin panel, and checkout are separate surfaces with their own design specs in `docs/DESIGN-SYSTEM.md`. The aesthetic principles (premium restraint, cultural warmth, no-spectacle) carry over, but layouts and density rules change for back-office work.
