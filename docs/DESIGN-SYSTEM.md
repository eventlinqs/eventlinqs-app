# EventLinqs Design System - v2.1

> **SUPERSEDED - historical reference only.** This v2.1 document (4 May 2026)
> predates the community-first repositioning and is no longer the constitution.
> The live laws are in `CLAUDE.md`, and the binding token/pattern source of truth
> is the code (`src/app/globals.css`, `src/app/page.tsx`). Use this file only for
> legacy component detail, and only where it does not conflict with `CLAUDE.md` or
> the code. On every conflict, `CLAUDE.md` and the code win.
>
> **This document is overridden on the following (do not follow it here):**
> - **Mission and audience.** It frames EventLinqs as an "African diaspora"
>   platform. The platform is a complete, general Australian ticketing platform;
>   community is a 10-20% layer, never the identity (`CLAUDE.md`: What EventLinqs
>   is, Law 1). "Diaspora" is a banned word.
> - **Tagline.** "WHERE THE CULTURE GATHERS" is retired - it is culture-first,
>   which `CLAUDE.md` (Copy and banned content) forbids.
> - **Font stack.** The live stack is Archivo display / Hanken Grotesk body /
>   Manrope UI (`globals.css`), not the "Manrope + Inter" named here. Inter is not
>   used.
> - **Competitor bar.** The bar is the fusion of Ticketmaster and Eventbrite,
>   surpassed. DICE is a typography influence only, never the bar and never a
>   resemblance target (`CLAUDE.md`: What EventLinqs is, Design system).
> - **Colour hexes.** Where a hex here differs from the `globals.css` token, the
>   token wins (`CLAUDE.md`: Design system).
> - **Glassmorphism / dark surfaces.** Any frosted-glass or flat-dark pattern
>   described here is overridden by the light-and-airy, no-glassmorphism,
>   no-flat-dark boundary in `CLAUDE.md` (Design system).
> - **Hero scale + chrome.** The binding hero-scale law (one system, two capped
>   tiers: `.hero-marketing` = homepage scale, `.hero-content` = cinematic cap;
>   gold eyebrow not white; homepage display scale; one shared dual-state navy
>   header, no per-page variants) lives in `CLAUDE.md` (Design system: Hero
>   scale, Chrome consistency) with tokens in `globals.css`. Any hero or header
>   heights described below are superseded by it.

**Status:** SUPERSEDED v2.1 - retained for historical/component reference only
**Last updated:** 4 May 2026
**Owner:** Lawal Adams + Claude
**Enforcement:** `CLAUDE.md` is the constitution and supersedes this document. Every UI decision references `CLAUDE.md` and the code first; this file is consulted only for legacy component detail that does not conflict.
**Changelog from v2.0 (Redesign Batch 3, 2026-05-04):** Section 6.2.1 added - canonical separated-card tile pattern + the one allowed image-band overlay (place-name on darkened gradient on city/venue tiles). Anti-Patterns updated to forbid event-meta text on photography and gold-400 on light surfaces. Sub-tagline polished elsewhere; the "WHERE THE CULTURE GATHERS" tagline stays locked.
**Changelog from v1.0:** Mobile-first patterns rewritten after live TM/DICE mobile analysis. Brand voice section added. Page-by-page templates added. Social proof patterns added. Illustration strategy added. Anti-patterns expanded.

---

## Table of Contents

1. Brand Identity
2. Brand Voice & Tone
3. Colour System
4. Typography
5. Spacing Scale
6. Components
7. Page-by-Page Templates
8. Imagery & Illustration Strategy
9. Social Proof Patterns
10. Content Patterns (Headers, Eyebrows, Microcopy)
11. Motion
12. Accessibility
13. Performance
14. Analytics + A/B Testing
15. Anti-Patterns
16. Flexibility Clause
17. Reference Annotations
18. Enforcement

---

## 1. Brand Identity

### Mission
Build the ticketing and events platform for the African diaspora and the communities that gather with them - Melbourne, Sydney, London, Toronto, Lagos, Accra, Johannesburg, New York - with a product experience that surpasses Ticketmaster, Eventbrite, and DICE.

### Audience
- **Primary:** African diaspora aged 22-55 in Australia, UK, Canada, and Europe
- **Secondary:** Event organisers, DJs, community leaders, promoters serving diaspora audiences
- **Tertiary:** Western attendees drawn to diaspora culture (music, food, art, conferences, weddings, business)

### Tagline
> **WHERE THE CULTURE GATHERS**

Sub-hero copy: *Tickets for the events that matter to you. Melbourne. Lagos. London. Toronto.*

### Mood Words (pick-3 enforcement)
Every design decision must honour at least three of these six, never violate any:
**Premium · Confident · Cultural · Sleek · Refined · Celebratory**

### Strategic Positioning vs Competitors

| Platform | Vibe | Mobile strength | Mobile weakness | Our differentiation |
|---|---|---|---|---|
| Ticketmaster | Trusted, commercial, soulless | Big edge-to-edge cards, clear hierarchy | Aggressive ads, generic stock photos, "Open in App" banner | Match polish, kill the ads, cultural soul |
| Eventbrite | Warm, DIY, earnest | Friendly tone | Cream/orange palette feels twee, generic typography | More premium, less generic |
| DICE | Underground, punk, niche | Massive bold display type, zero ads, hand-drawn personality, confident minimalism | All-black alienates 40+, US/UK only, no presence in AU | Broader cultural appeal, refined not punk, multi-region |
| **EventLinqs** | **Premium cultural with mass appeal** | **TBD - we're building it** | **TBD** | **Nobody owns this space** |

---

## 2. Brand Voice & Tone

### Voice Pillars

**Confident, never corporate.**
Say "Tickets for the events that matter to you" - not "Discover a curated selection of events tailored to your interests."

**Warm, never twee.**
Say "Welcome back, Lawal. Three events you saved are happening this week." - not "Hey there! 👋 We've got some fab events coming up just for you!"

**Cultural, never tokenistic.**
Use real cultural terms ("Owambe", "Detty December", "Afrobeats", "Amapiano") where they fit. Don't slap a kente pattern on everything.

**Honest, never gimmicky.**
"Sold out" not "Last few tickets!". "From AUD $25" not "Starting at just $25!".

### Tone Calibration

| Context | Tone | Example |
|---|---|---|
| Hero / Marketing pages | Confident, bold | "WHERE THE CULTURE GATHERS" |
| Event listings | Informational, clean | "Sat 19 Apr · The Forum, Melbourne · From AUD $45" |
| Empty states | Warm, helpful | "No events here yet - try widening your filters or browse by city" |
| Errors | Honest, owning it | "Payment didn't go through. Your card wasn't charged. Try again or use a different card." |
| Confirmation | Celebratory, brief | "You're in. Tickets sent to lawal@example.com" |
| Onboarding | Clear, no friction | "Add your phone - we'll text your ticket QR" |
| Organiser dashboard | Professional, data-led | "23 tickets sold today. Up 41% vs same time last week." |
| Cookie banner / Legal | Plain English, never dark patterns | "We use cookies for analytics. Decline or accept - both work fine." |

### Words We Use
Get tickets · Save · Following · Trending · This week · Sold out · From AUD $X · Free · Organiser · Venue · Doors open · Lineup · About this event · You're in

### Words We Don't Use
- "Awesome", "Amazing", "Epic", "Incredible" (overused)
- "Curated", "Bespoke", "Tailored" (corporate filler)
- "Hey there!", "Hi friend!" (try-hard)
- Emoji in body copy or CTAs (allowed in microcopy like confirmation toasts only)
- "Click here", "Learn more" (lazy CTAs - use specific verbs)
- "Just" / "Simply" ("just sign up" is condescending)
- "World-class", "Best-in-class", "Industry-leading" (claims without proof)

---

## 3. Colour System

### Primary palette

| Token | Hex | HSL | Use |
|---|---|---|---|
| `--gold-500` | `#D4A017` | `44, 81%, 46%` | Primary accent - CTAs, links, key highlights |
| `--gold-600` | `#B88612` | `44, 82%, 39%` | Hover state for gold CTAs |
| `--gold-400` | `#E8B738` | `43, 79%, 57%` | Focus ring, decorative accents |
| `--gold-100` | `#FBF4DC` | `46, 79%, 92%` | Tinted backgrounds, badges |
| `--coral-500` | `#FF4E3A` | `6, 100%, 62%` | Secondary accent - celebratory moments, "trending", "live now" |
| `--coral-600` | `#E63E2C` | `6, 78%, 54%` | Hover for coral CTAs |
| `--coral-100` | `#FFE4DF` | `8, 100%, 94%` | Coral-tinted pills, badges |

### Neutrals (warm-biased - critical)

| Token | Hex | Use |
|---|---|---|
| `--ink-900` | `#0A1628` | Deep navy-black - headlines, footer, high-contrast moments |
| `--ink-800` | `#1A1A1A` | Body text primary |
| `--ink-600` | `#4A4A4A` | Body text secondary |
| `--ink-400` | `#8A8A8A` | Tertiary text, disabled states |
| `--ink-200` | `#D9D9D6` | Dividers, borders |
| `--ink-100` | `#EFEDE8` | Subtle section backgrounds |
| `--canvas` | `#FAFAF7` | Page background - warm off-white (NOT pure white) |
| `--white` | `#FFFFFF` | Cards, modals only |

### Semantic

| Token | Hex | Use |
|---|---|---|
| `--success` | `#0F9D58` | Order confirmed, payment success |
| `--warning` | `#F59E0B` | Low stock, queue warnings |
| `--error` | `#DC2626` | Failed payments, errors |
| `--info` | `#0EA5E9` | Informational toasts |

### Contrast (WCAG 2.2 AA - MANDATORY)

| Combination | Ratio | Pass |
|---|---|---|
| `--ink-800` on `--canvas` | 15.8:1 | AAA |
| `--ink-600` on `--canvas` | 7.2:1 | AAA |
| `--white` on `--gold-500` | 3.1:1 | AA Large only - use for headings/buttons 18px+ bold |
| `--ink-900` on `--gold-500` | 7.4:1 | AAA - preferred combo for gold buttons |
| `--white` on `--coral-500` | 3.4:1 | AA Large only - 16px+ bold only |
| `--white` on `--ink-900` | 17.6:1 | AAA |

**Rule:** Gold buttons use `--ink-900` text, NOT white. Coral buttons use white text but only at 16px+ bold.

### Dark mode (Phase 2)
Tokens mirror light mode with inverted canvas (`#0A1628`) and adjusted gold/coral saturation. Deferred until A/B data shows demand.

---

## 4. Typography

### Font stack

```
--font-display: 'Manrope', system-ui, -apple-system, sans-serif;
--font-body: 'Inter', system-ui, -apple-system, sans-serif;
--font-mono: 'JetBrains Mono', ui-monospace, monospace;
```

Both Manrope and Inter as variable fonts from Google Fonts with `display=swap`.

### Scale (fluid, clamp-based)

| Token | Desktop | Mobile | Weight | Use |
|---|---|---|---|---|
| `--display-3xl` | `clamp(4rem, 8vw, 6.5rem)` | 64px | 800 | Marketing hero only (DICE-style "WELCOME TO THE ALTERNATIVE" pattern) |
| `--display-2xl` | `clamp(3.5rem, 6vw, 5.5rem)` | 56px | 800 | Homepage hero H1 |
| `--display-xl` | `clamp(2.75rem, 4.5vw, 4rem)` | 44px | 800 | Section heroes |
| `--display-lg` | `clamp(2rem, 3.5vw, 3rem)` | 32px | 700 | Page titles, event detail title |
| `--heading-xl` | `clamp(1.5rem, 2.25vw, 2rem)` | 24px | 700 | Section headers ("POPULAR EVENTS") |
| `--heading-lg` | `1.25rem` | 20px | 700 | Card titles, modal headings |
| `--heading-md` | `1.125rem` | 18px | 600 | Subsections |
| `--body-lg` | `1.125rem` | 18px | 400 | Lead paragraphs |
| `--body` | `1rem` | 16px | 400 | Body default |
| `--body-sm` | `0.875rem` | 14px | 400 | Meta, captions |
| `--caption` | `0.75rem` | 12px | 500 | Category pills, eyebrow labels (uppercase) |

### Letter spacing

| Size | Tracking |
|---|---|
| Display (2rem+) | `-0.02em` (tight - the "sharpen" effect) |
| Headings | `-0.01em` |
| Body | `0` |
| Caption uppercase | `+0.08em` |

### Line height

| Context | Value |
|---|---|
| Display | `1.05` |
| Headings | `1.2` |
| Body | `1.6` |
| UI (buttons, labels) | `1.4` |

### Rules
- Sentence case for body, buttons, titles
- UPPERCASE reserved for category pills, eyebrow labels, hero display (sparingly)
- Never mix Manrope and Inter in the same element
- Never use font weights below 400 on body text
- Never centre-align body text longer than 2 lines

---

## 5. Spacing Scale (4px base)

```
--space-1:  4px       --space-10: 40px
--space-2:  8px       --space-12: 48px
--space-3:  12px      --space-16: 64px
--space-4:  16px      --space-20: 80px
--space-5:  20px      --space-24: 96px
--space-6:  24px      --space-32: 128px
--space-8:  32px
```

**Default gap between major sections: `--space-8` (32px) mobile, `--space-12` (48px) desktop. Never eyeball spacing - always reference a token.**

### Container widths

| Token | Value | Use |
|---|---|---|
| `--container-sm` | 640px | Forms, auth pages |
| `--container-md` | 960px | Event detail content |
| `--container-lg` | 1280px | Default page width |
| `--container-xl` | 1440px | Wide layouts (dashboards) |

### Viewport breakpoints (mobile-first - MANDATORY)

```
sm:  640px   (large phones landscape)
md:  768px   (tablets)
lg:  1024px  (small laptops - sidebar appears here)
xl:  1280px  (desktop)
2xl: 1536px  (wide desktop)
```

---

## 6. Components

### 6.1 Buttons

| Variant | Background | Text | Border | Use |
|---|---|---|---|---|
| Primary | `--gold-500` | `--ink-900` | none | Default CTA ("Get Tickets", "Sign Up") |
| Primary-dark | `--ink-900` | `--white` | none | On gold backgrounds, hero CTAs (DICE "GET THE APP" pattern) |
| Secondary | transparent | `--ink-900` | `1px solid --ink-200` | Secondary actions ("Cancel", "Learn More") |
| Ghost | transparent | `--gold-600` | none | Inline links, tertiary actions |
| Danger | `--error` | `--white` | none | Delete, cancel order |

**Sizes:**
- `sm`: 36px height, `--space-3` h-padding
- `md` (default): 44px height, `--space-5` h-padding
- `lg`: 52px height, `--space-6` h-padding
- `xl`: 60px height, `--space-8` h-padding (hero only)

**Rules:**
- Border radius: `9999px` (pill) for primary CTAs, `8px` for secondary
- Min touch target: 44x44px (WCAG 2.2 AA)
- Font: Manrope 600 (14px-16px)
- Hover: lift 2px + shadow, 150ms ease
- Active: press 1px, 80ms
- Focus-visible: 2px ring in `--gold-400`

### 6.2 Event Cards - THE MOST IMPORTANT COMPONENT

**Desktop (1024px+):**
- Image aspect: **4:3 landscape** (cinematic, like Ticketmaster)
- Image overlay: category pill top-left, heart icon bottom-right
- Below image: title (Manrope 700, 20px, 2 lines max), date (Inter 500, 14px, `--gold-600`), venue (Inter 400, 14px, `--ink-600`), price (Manrope 700, 16px) - left-aligned, `--space-4` padding
- Background: `--white`
- Border: `1px solid --ink-200`
- Radius: `16px`
- Shadow resting: `0 1px 3px rgba(10, 22, 40, 0.05)`
- Shadow hover: `0 12px 32px rgba(10, 22, 40, 0.12)`, lift 4px
- Transition: `all 200ms cubic-bezier(0.4, 0, 0.2, 1)`

**Mobile (<1024px) - confirmed against TM mobile pattern:**
- Image aspect: **16:9 landscape, edge-to-edge** (TM mobile pattern - cards dominate viewport, single-column scroll)
- For homepage carousels: square 1:1 with horizontal scroll + peek (DICE pattern)
- Padding `--space-4`
- Same component spec otherwise

**Category pill:**
- Background: `rgba(255, 255, 255, 0.95)` with `backdrop-filter: blur(8px)`
- Text: `--ink-900`, Inter 500, 12px, uppercase, `+0.08em` tracking
- Padding: `6px 12px`
- Radius: `6px`
- Position: absolute, top `--space-3` left `--space-3`

**Heart icon (save):**
- 40x40px tap target, 20x20px icon
- Background: `rgba(255, 255, 255, 0.95)` with blur
- Unsaved: `--ink-600`
- Saved: `--coral-500`, fill 100%
- Animation on save: scale 1.2 to 1, 180ms ease-out
- Position: absolute, bottom `--space-3` right `--space-3`

**Price tag:**
- Always lead with "From AUD $X" (international diaspora - currency essential)
- Free events: "Free" in `--gold-600`
- Sold out: strike through + "SOLD OUT" pill in `--ink-900`
- Low stock: "Only 8 left" in `--coral-500` (only when 10 or less remaining)

### 6.2.1 Tile Patterns (Redesign Batch 3 - 2026-05-04)

The canonical tile shape is **separated-card**: image at the top, white card body below carrying every text field. Event photography is sacred; we do not paint copy on top of it.

**Separated-card layout (event tiles, city tiles, venue tiles, weekend tile):**
- Image frame: `aspect-[3/2]` for rail tiles, `aspect-[4/3]` for grid event cards, `aspect-video` on mobile.
- White card body below the image: `bg-[var(--surface-0)]`, padding `--space-4`, holds eyebrow + title + meta + price/CTA.
- Border: `1px solid var(--surface-2)`. Radius: `8px` (rounded-lg). Resting shadow: `0 1px 2px rgba(10,22,40,0.06)`. Hover: lift 2px + `0 10px 25px rgba(10,22,40,0.10)`.
- Hover transition on image: `scale(1.05)` over `700ms ease-out`. Hover transition on card: `translateY(-2px)` over `200ms`.
- Focus-visible: 2px `--color-gold-400` ring with `ring-offset-2`.

**Allowed image-band overlays (the ONE acceptable on-photo pattern):**

For **place** tiles - city, venue - where the place identity itself is the headline, render the place name on a darkened-gradient label band along the lower edge of the image:

```
linear-gradient(180deg, rgba(10,22,40,0) 0%, rgba(10,22,40,0.85) 100%)
```

The band occupies the bottom 40% of the image (`h-2/5`, `inset-x-0 bottom-0`). White display type (Manrope 700+ at 18-24px) sits inside the bottom padding zone. The same pattern is allowed for the gold "Free" pill on the FreeWeekendTile because the pill is a status badge, not a label of the photo's subject.

**Forbidden image-band overlays:**
- Event titles, dates, venue names, or prices on top of event photography. These belong in the white card body below.
- Full-bleed dark photo cards with all copy stacked on top (the pattern City/FreeWeekend tiles used pre-batch-3).
- Multi-line copy inside the gradient band - 1 line, 1 piece of identity only.

**Eyebrow / pill / category-chip pattern inside card body:**
- Eyebrow text (date, "JUST ADDED", "EDITOR'S PICK"): `text-[var(--brand-accent-strong)]`, Manrope 600, 11px, `uppercase`, `tracking-widest`.
- Category pill on photo (when shown): `bg-[var(--surface-0)]/95` (white-ish), `text-[var(--text-primary)]`, 10px Manrope 700 uppercase tracking-widest, top-left. The white pill replaces the prior dark `bg-ink-900/75` so we never stack white text on potentially-light photography.
- Status pill (Free, Sold out): solid `--color-gold-400` background, `--color-navy-950` text, top-left, sits *over* the image but only carries 1-2 words.

**Gold on light surfaces:**
- `--brand-accent` (gold-400) is permitted on dark surfaces only (`--color-navy-950` and below). On light card bodies use `--brand-accent-strong` (gold-800), which carries enough contrast for 4.5:1 against `--surface-0`.
- Focus rings keep `--color-gold-400` because they paint with `ring-offset-2` so the ring sits on a white halo, restoring contrast.

### 6.3 Rails (Horizontal Scroll) - Rail Standard v2.0

**Locked pattern as of Batch 6.6 (2026-05-09).** Every horizontal rail
on EventLinqs MUST follow this contract. Single source of truth:
`src/components/ui/snap-rail.tsx` exports `SnapRail` (full-chrome) and
`SnapRailScroller` (compose-your-own-header with optional `header` prop).

**Layout (locked):**

```
[eyebrow]                                       [< >] [progress ──]
[TITLE]
[ tile ][ tile ][ tile ][ tile ][ tile ][ tile ] →
```

- Eyebrow: `text-xs font-semibold uppercase tracking-[0.18em]` in `--brand-accent-strong` (gold-800)
- Title: `font-display text-2xl sm:text-3xl font-bold` in `--text-primary`
- Header row uses `flex items-end justify-between gap-4` so the
  controls cluster sits TOP-RIGHT, on the same horizontal line as the
  title. NEVER place arrows or progress below the scroller.

**Controls (top-right cluster):**

- Progress indicator first: `h-0.5 w-32 lg:w-40` rounded gray track
  with `--brand-accent-strong` fill that animates with scroll position.
- Two arrow buttons next to the progress, 36x36 circular, navy icon
  on white surface with surface-2 border. Disabled state when canPrev
  / canNext is false. `hidden md:flex` - mobile relies on swipe.

**Scroll mechanics:**

- `scroll-snap-type: x mandatory` on container
- `scroll-snap-align: start` on each card
- `overflow-x: auto` with hidden scrollbar
- 280px card width (240px mobile minimum, 280px desktop preferred),
  16px gap, `flex-shrink: 0`, `snap-start`
- Drag-to-scroll on desktop with cursor: grab (via `useDragScroll` hook)
- Native swipe on mobile (375px and up), peeks 1.5 cards on mobile
- Visible: minimum 4 tiles desktop, 1.5 tiles mobile
- Keyboard accessible: arrow keys navigate, Tab moves between cards

**Optional headerLink** (e.g. "View all"):
- Right of header, before the controls cluster
- `text-sm font-medium` in `--brand-accent-strong`, hidden on mobile

**Components:**

- `<SnapRail>`: opinionated full-chrome rail. Use this on the homepage
  and anywhere you can adopt the standard eyebrow + title + headerLink.
- `<SnapRailScroller header={{ eyebrow, title, headerLink? }}>`: same
  output as `<SnapRail>` but tuned for nested ContentSection callers.
  Pass `header` to render the standard top-right controls cluster
  inline with the title; omit `header` only when the parent provides
  custom header content (e.g. a tab bar) and the compact controls
  should sit just above the scroll track.

**When NOT to use a rail:**

- Browse / paginated grids (e.g. "All [City] events"): use a regular
  responsive grid with proper page navigation at the bottom. The rail
  pattern is for curated horizontal slices, not full catalogues.
- Small fixed sets that fit in a single viewport (e.g. 3-up "Adjacent
  scenes" on culture pages): use a simple grid. Don't force a rail
  when scrolling adds no value.

**Migration audit (Batch 6.6):**

City pages: This Weekend, This Week, Popular this month, By Suburb,
Other Australian cities, Browse by Culture, Browse by Event Type - all
converted to the standard. Suburb pages: This week + weekend, Other
suburbs - converted. Culture pages: Cities rail, Sub-cultures (kept as
6-tile grid - fits single viewport), Adjacent scenes (kept as 3-tile
grid - fits single viewport). Homepage rails (this-week, this-weekend,
city-rail, featured-venues): use `<SnapRail>` directly, picked up the
new top-right controls automatically.

### 6.4 Filter Sidebar (Desktop) - THE FIX

**Problem:** Current `/events` shows ~15 items expanded vertically. Amateur. Kills the grid.

**New behaviour:**

| Group | Default | Items shown | Show more? |
|---|---|---|---|
| WHEN | Expanded | 4 (Any time, Today, This week, This month) | No |
| CATEGORY | Expanded | Top 5 | Yes - "+ 8 more" link |
| PRICE | Collapsed | Range slider + quick pills | N/A |
| VENUE | Collapsed | Search input + recent | N/A |
| **CULTURE / LANGUAGE** | Collapsed | Top 6 (Afrobeats, Amapiano, Highlife, Gospel, Comedy, Business) | Yes - "+ 10 more" |

**CULTURE/LANGUAGE is our moat.** TM/EB/DICE don't have it.

**Visual spec per group:**
- Group header: Manrope 700, 14px, uppercase `+0.08em`, `--ink-900`
- Chevron (`lucide-react ChevronDown`): 16x16px, `--ink-600`, rotates 180 deg on expand, 200ms ease
- Active filter count badge: pill next to chevron, `--gold-500` bg, `--ink-900` text, 11px Manrope 600 - shows "2" if 2 filters active in collapsed group
- Option row: Inter 400, 14px, checkbox 16x16px with `--gold-500` fill when checked, 8px gap
- Selected row: bg `--gold-100` on hover
- "Show more" link: Inter 500, 13px, `--gold-600`, underline on hover

**Active filter summary (sticky top of sidebar):**
- "X filters active" + "Clear all"
- Horizontal chip strip showing each active filter with x to remove individually

**Height transition:** `max-height` animated 250ms ease-out

### 6.5 Filter Drawer (Mobile) - preserve Session 1 work

Keep everything from commit `d0c71ba`:
- Closed by default
- Backdrop tap, close button, Escape dismiss
- Focus management + body scroll lock
- `pb-safe` for iOS

Additions for v2.0:
- Sticky "Show X results" button at bottom (primary gold)
- Active filter count badge on "Filters" trigger button
- Same group/chevron/show-more pattern as desktop

### 6.6 Hero Sections (TWO patterns - pick per page)

**Pattern A: Cinematic Hero (Homepage, Category landing pages)**
- Height: `clamp(560px, 70vh, 720px)` desktop, `520px` mobile
- Background: Unsplash API image (culturally relevant) with gradient overlay
- Gradient: `linear-gradient(90deg, rgba(10,22,40,0.75) 0%, rgba(10,22,40,0.3) 60%, transparent 100%)`
- Text block: absolute, left `--space-12` top 50%, max-width `640px`
- H1: `--display-2xl`, Manrope 800, `--white`, `-0.02em`
- Sub-hero: `--body-lg`, Inter 400, `rgba(255,255,255,0.9)`, max-width `480px`, mt `--space-4`
- CTA: Primary gold pill, `lg`, "Explore Events >"
- Secondary CTA: Ghost on dark, "List Your Event"

**Pattern B: Bold Display Hero (Marketing/About pages - DICE-inspired)**
- Background: `--canvas` (no photo)
- Padding: `--space-20` top + bottom
- H1: `--display-3xl`, Manrope 800, `--ink-900`, line-height 1.0, max-width `900px`
- Sub-hero: `--body-lg`, Inter 400, `--ink-600`, max-width `560px`, mt `--space-6`
- CTA: Primary-dark pill, `lg` ("GET THE APP" / "EXPLORE EVENTS")
- Use sparingly - ONE bold display hero per user journey

**Below hero - search bar (sticky on scroll, Pattern A only):**
- White card, `--space-4` padding, `16px` radius, shadow
- Location picker | Date picker | Search input | Gold search button
- Horizontal desktop, stacked mobile

### 6.7 Editorial 3-Column

- 3 columns desktop, 1 mobile
- Each: image (16:9) + category eyebrow + title (`--heading-lg`) + 3-line excerpt + "Read more >"
- No card background - content only
- `--space-8` gap

### 6.8 Footer (REVISED - DICE-inspired minimalism, not TM clutter)

**Mobile (<1024px) - DICE pattern:**
- Background: `--canvas` (white-ish, NOT black)
- Logo top-left, `--space-12` padding
- 3 collapsed accordions: "Company" / "Support" / "Legal"
- Below accordions: language picker (`English (AU)` with chevron)
- Social icons row (Instagram, TikTok, X, YouTube)
- iOS + Android pill buttons (when apps ship)
- Tiny copyright line at bottom: "(c) 2026 EventLinqs Pty Ltd"
- Total footer height target: 600px or less expanded

**Desktop (1024px+):**
- Background: `--ink-900` (dark, premium)
- 4-column grid:
  1. **App** - logo + tagline + iOS/Android badges
  2. **Attend** - Your tickets, My events, Following, Gift cards
  3. **Organise** - Sell tickets, Manage events, Pricing, Organiser guide
  4. **Company** - About, Careers, Press, Contact, Accessibility, Help
- Sub-footer: social icons + copyright + legal links (Terms, Privacy, Cookie)
- Top padding `--space-20`, bottom `--space-12`

**Why two patterns:** Mobile users want minimal footer (DICE proves it). Desktop users have screen real estate and expect richer architecture (TM proves it).

### 6.9 Search Bar Component

- Background: `--white`
- Border: `1px solid --ink-200`, focus `2px solid --gold-500`
- Radius: `12px`
- Padding: `--space-4`
- Icon left (search glass, `--ink-400`)
- Placeholder: "Artist, event, or venue" (Inter 400, 16px, `--ink-400`)
- Mobile: full-width sticky on listing pages
- Desktop: max-width `640px`, centred or in hero overlay

### 6.10 Toast / Notification

- Position: bottom-right desktop, top mobile
- Background: `--ink-900`, text `--white`
- Radius: `12px`
- Padding: `--space-4` `--space-5`
- Shadow: `0 8px 24px rgba(10, 22, 40, 0.15)`
- Auto-dismiss: 4s default, 8s for errors, persistent for confirmations
- Max-width: `400px`
- Icon left (success/warning/error/info), close x right

### 6.11 Modal / Dialog

- Backdrop: `rgba(10, 22, 40, 0.6)` with blur
- Container: `--white`, `--container-sm` max-width, `24px` radius, `--space-8` padding
- Title: `--heading-lg`, Manrope 700
- Body: `--body`, Inter 400, `--ink-600`
- Actions: right-aligned button row (Secondary "Cancel" + Primary "Confirm")
- Animation: backdrop fade 200ms, container scale 0.95 to 1 + fade 250ms ease-out
- Escape key dismisses, click backdrop dismisses, focus trap inside

### 6.12 Form Inputs

- Height: 44px min
- Background: `--white`
- Border: `1px solid --ink-200`, focus `2px solid --gold-500`
- Radius: `8px`
- Padding: `--space-3` `--space-4`
- Font: Inter 400, 16px (16px prevents iOS zoom on focus)
- Label: Inter 500, 14px, `--ink-800`, mb `--space-2` - ALWAYS visible above input (never placeholder-only)
- Helper text: Inter 400, 13px, `--ink-600`, mt `--space-1`
- Error state: border `--error`, helper text `--error`

### 6.13a Site Header - Dual-State Glassmorphism (Batch 9.1, 2026-05-09)

The site header is a single component with two visual states. Which state renders is a function of `(scrolled past sentinel) OR (page has no hero)`.

**State A - Transparent (top of hero-bearing routes)**
- Background: `transparent`
- Border-bottom: `transparent`
- Backdrop filter: `none`
- Wordmark: `--white` with gold dot (`--gold-500`)
- Nav links: `rgba(255,255,255,0.85)` → hover `--brand-accent`
- No inline search (the hero owns primary search)

**State B - Navy frosted glass (scrolled past 80px, OR no-hero route)**
- Background: `rgba(10, 22, 40, 0.72)`
- Backdrop filter: `blur(20px) saturate(180%)` (with `-webkit-` prefix)
- Border-bottom: `1px solid rgba(212, 164, 55, 0.30)` (gold edge)
- Compact 360px desktop search pill becomes visible (placeholder "What are you in the mood for?")
- Mobile retains an icon-only search trigger (44×44, always visible)
- Degraded fallback for browsers without `backdrop-filter`: `rgba(10, 22, 40, 0.95)` solid navy via `@supports not` rule

**Transition**
- Duration: `300ms`
- Easing: `cubic-bezier(0.22, 1, 0.36, 1)`
- Properties: `background-color, backdrop-filter, border-color, box-shadow`
- `prefers-reduced-motion: reduce`: instant (no transition)

**Mechanics**
- `data-scrolled="0|1"` and `data-no-hero="0|1"` attributes on the header element drive styling via CSS, so React does NOT re-render per scroll frame.
- A 1px / `h-20` `HeaderScrollSentinel` is mounted in `app/layout.tsx` immediately above page content. An IntersectionObserver in `useHeaderScrollState` flips `data-scrolled` when the sentinel leaves the viewport.
- A `HeroPresenceProvider` (root layout) lets each hero-bearing page register itself by rendering a `<HeroPresenceMarker />` near its `<HeroMedia>` instance. Pages without a hero never register and force State B from initial paint, avoiding an SSR transparent flash.
- HeroMedia itself is **not mutated** (DO NOT TOUCH); registration uses the marker sibling pattern.

**Accessibility**
- Skip-to-content link mounted in `app/layout.tsx`, hidden until focused; jumps to `#main-content`.
- Focus-visible rings use `--brand-accent` with offset against `--color-navy-950` background colour.
- All touch targets ≥44px (mobile search icon, hamburger, sheet items).
- Mobile drawer retains existing focus trap, Escape close, scroll lock.

**Search overlay**
- Triggered by header pill click, mobile search icon click, or global `/` keyboard shortcut (suppressed inside text inputs and contenteditable).
- Full-screen modal: `rgba(10, 22, 40, 0.92)` + `blur(40px) saturate(160%)`.
- 4 tabs (Cultures, Cities, Events, Organisers) with hand-curated fallback suggestions; trending/typeahead data layer is deferred to a follow-up batch.
- `role="dialog"`, `aria-modal="true"`, focus trap, Escape closes, body-scroll lock while open.
- Keyboard navigation (Batch 9.1.1): the search input carries `role="combobox"` with `aria-controls`/`aria-expanded`/`aria-autocomplete="list"`/`aria-activedescendant`. ArrowDown / ArrowUp move a roving "active" suggestion in the listbox; Home / End jump to first / last; Enter on a highlighted suggestion activates its link; Enter without a highlight submits the search query. Escape closes and restores focus to the trigger element that opened the overlay (captured at open time via `document.activeElement`).

### 6.13b Site Header - Account Button (Batch 9.1.1, 2026-05-09)

Avatar shell rendered in the SiteHeader for authenticated visitors, replacing the anonymous Sign In + Get Started pair.

**Visual**
- 32px circular at the desktop/mobile header (40px in the mobile drawer).
- Background: `--color-navy-950` (`#0A0E1A`).
- Border: `1px solid --brand-accent` (gold, `#E8B738`).
- Initials: white, Manrope display semibold uppercase, derived as first-initial + last-initial from `user_metadata.full_name`, with the first two characters of the email local-part as the fallback when no name is available.
- Hover: `transform: scale(1.05)` over 200ms `cubic-bezier(0.22, 1, 0.36, 1)`. Suppressed under `prefers-reduced-motion: reduce`.
- Focus-visible: 2px gold outline with 2px offset against the `--color-navy-950` header background.
- Click: routes to `/account` (full-page navigation, not a dropdown). The dropdown menu (account, sign out, settings) ships in 9.2 alongside the notification data layer.

**Server-side auth detection**
- `SiteHeader` (server component) calls `await supabase.auth.getUser()` from `@/lib/supabase/server` and passes a minimal `AccountUser` shape (initials + display name) across the client boundary. The full Supabase user record never reaches the client bundle.
- Anonymous visitors receive `user={null}` and the SiteHeader falls back to the Sign In + Get Started pair (Batch 9.1 behaviour).

**Mobile placement**
- The mobile header places the avatar to the left of the hamburger so the drawer remains the canonical mobile-nav surface and the drawer footer surfaces a 40px avatar with the user's display name beside it plus a "View account" primary button.

**Out of scope for 9.1.1 (queued for 9.2)**
- Notification pulse / unread indicator. Requires the notification data layer.
- Dropdown menu internals (account, sign out, settings).
- Authenticated-only nav items (e.g. "My tickets").

### 6.13 Badges & Pills

| Pill | Background | Text | Use |
|---|---|---|---|
| Category | `rgba(255,255,255,0.95)` | `--ink-900` | On image overlays |
| Trending | `--coral-500` | `--white` | Hot events |
| New | `--gold-500` | `--ink-900` | Recently listed |
| Sold Out | `--ink-900` | `--white` | Inventory zero |
| Free | `--gold-100` | `--gold-600` | Free events |
| Following | `--ink-900` | `--white` | Followed organisers |

All pills: `4px 10px` padding, `9999px` radius, Inter 500, 12px

### 6.14 Bento Grid Standard (Batch 9.2, 2026-05-09)

Asymmetric content grids used for the homepage Trending events and Cultural Moments sections.

**Layout**
- Desktop (>=1024px): 4-col x 2-row CSS grid with one 2-col x 2-row featured cell + smaller cells filling the remaining slots.
- Mobile (<1024px): 2-col grid, featured cell spans both columns and 2 rows; remaining cells in a 2-col row beneath.
- Gap: `gap-3` (12px) on mobile, `gap-4` (16px) on desktop.
- Card radius: `rounded-2xl` (16px) for all cells.

**Card content**
- Photographic hero (Pexels via the existing image helpers) with brand gradient mask: `linear-gradient(180deg, rgba(10,22,40,0.0) 35%, rgba(10,22,40,0.55-0.65) 70%, rgba(10,22,40,0.92) 100%)`.
- Date badge (top-left): white background pill or gold pill depending on context.
- Card title: white Manrope 800, sized per featured/medium role.
- Optional metadata pill (bottom-right): frosted-glass navy background (`rgba(10,22,40,0.55)` + `backdrop-filter: blur(12px)`).
- Hover: `transform: scale(1.04)` over 500ms with `prefers-reduced-motion: reduce` suppressed.

**Accessibility**
- Card root is `<a>` with descriptive `aria-label`.
- Focus-visible ring uses `--brand-accent` with 2px offset.
- Photographic alt text describes the event/moment (not generic).

**Locked components**
- `src/components/features/home/trending-events-bento.tsx`
- `src/components/features/home/cultural-moments-bento.tsx`

### 6.15 Category Chip Strip Standard (Batch 9.2, 2026-05-09)

Horizontal quick-filter pill row beneath the homepage hero.

**Layout**
- Desktop: chips fit within max-width container, no scroll.
- Mobile: `scroll-snap-type: x mandatory` with peek-next pattern (next chip's left edge intentionally inside viewport).
- Each chip: `h-11` (44px), pill shape, gap-2 between icon and label.

**Visual**
- Default: navy `--color-navy-950` background, white text, gold `--brand-accent` icon.
- Active: gold background, navy text (used when a filter equivalent to the chip is currently applied to the destination route).
- Hover: `transform: translateY(-1px)`, `box-shadow: 0 8px 24px rgba(10,22,40,0.18)`. Suppressed under `prefers-reduced-motion: reduce`.
- Cultural Communities expandable (last chip): outlined style, gold border on transparent background.

**Plausible**
- Each chip carries `plausible-event-name=category_chip_click` plus `plausible-event-category={Label}` for the chip taxonomy attribution. The cultures expandable fires `nav_cultures_click` instead.

**Locked component**
- `src/components/features/home/category-chip-strip.tsx`

### 6.16 Plausible Event Naming Convention (Batch 9.2, 2026-05-09)

EventLinqs uses Plausible cookieless analytics. Event names follow these conventions:

**Pattern**: `{surface}_{action}` in lowercase snake_case.

- `surface`: where the event happens. Examples: `hero`, `nav`, `category_chip`, `trending_card`, `cultural_moment`, `culture_card`, `city_card`, `email_signup`, `header_search`, `account_avatar`, `surprise_me`.
- `action`: what happened. Examples: `click`, `open`, `submit_success`, `submit_error`, `pick_click`.

Compound examples: `hero_browse_click`, `email_signup_submit_success`, `cultural_moment_click`, `header_search_open`.

**Properties** (when needed) live on the same event with key/value pairs. Only include props that are useful for filtering/grouping in Plausible's dashboard. Keep prop values low-cardinality (slugs, taxonomy categories, error reasons).

**Sources**
- Static links: tagged-events class on the `<a>` (`className="plausible-event-name=foo plausible-event-prop=value"`). No JS round-trip required.
- Dynamic actions (form submit, modal open): `trackEvent(name, props?)` from `@/lib/analytics/plausible`.
- Server actions and webhook conversions: `trackEventServer(name, url, props?)` (fire-and-forget; never throws).

The full event matrix lives at `docs/PLAUSIBLE-EVENTS.md`.

---

## 7. Page-by-Page Templates

### 7.1 Homepage (`/`)

**Above the fold:**
1. Top nav (sticky): Logo · Browse · For Organisers · Sign in · Get Started CTA
2. Hero (Pattern A - cinematic photo) with rotating Unsplash-fed bg
3. Sticky search bar (Location + Date + Query + Search)

**Below the fold (in order):**
4. **TRENDING NOW** carousel (8 events, horizontal scroll, large square cards)
5. **THIS WEEK IN MELBOURNE** (geo-personalised carousel - fallback to Sydney/Brisbane based on user location)
6. **CULTURE PICKS** - diaspora differentiator. Sub-tabs: Afrobeats · Amapiano · Highlife · Comedy · Business · Gospel
7. **FEATURED ORGANISERS** - 6 organiser cards (logo + name + follower count + 2 upcoming events each)
8. **EDITORIAL 3-COLUMN** - "Stories from the culture" (blog teasers)
9. **SOCIAL PROOF BAND** (see Section 9) - app ratings + community count + organiser logos
10. **FOR ORGANISERS** - split section, image left + copy right ("Sell tickets in minutes. Keep your community close.")
11. Footer

**Mobile order:** same, but hero shrinks to `520px`, all carousels become 1.25-card peek pattern, social proof band stacks vertically.

### 7.2 Events Listing (`/events`)

**Layout:**
- Desktop: 280px sidebar left + cards grid right (3-col grid, gap `--space-6`)
- Tablet: filter chip strip top + cards grid (2-col)
- Mobile: filter chip strip top + cards stack (1-col, edge-to-edge)

**Top section:**
- Page H1: "Discover events" (`--display-lg`)
- Sub-line: "X events near you" (or "in [city]")
- Sort dropdown right: "Most popular" / "Soonest" / "Price: low to high" / "Newest"

**Sidebar (Desktop) - see Section 6.4 for spec**

**Empty state:**
- Centred Manrope 600 18px: "No events match your filters"
- Inter 14px `--ink-600`: "Try widening your date range or removing a category"
- Ghost button: "Clear all filters"

**Loading state:**
- Skeleton cards (6 of them), pulse animation 1500ms loop, `--ink-100` bg

**Pagination:**
- Infinite scroll (load 12 more on near-bottom intersection observer)
- "Load more" button as fallback
- Sticky "Back to top" pill bottom-right after scroll 2000px+

### 7.3 Event Detail (`/events/[slug]`)

**Above the fold:**
- Breadcrumb: Home > Events > [Category] > [Event Title]
- Cover image hero (16:9, full-width, max-height `560px`)
- Image overlay bottom-left: Category pill + Date eyebrow

**Below cover:**
- **Left column (max-width 640px):**
  - H1: Event title (`--display-lg`)
  - Meta row: Date · Venue · Capacity (icons in `--ink-600`)
  - Organiser card: logo + name + follow button + verified tick
  - "About this event" section: rich text description
  - Lineup section (if applicable): artist cards
  - Venue section: map embed + address + getting there
  - FAQs accordion
  - Refund policy
- **Right column (sticky 380px, desktop only):**
  - Ticket selector card (`--white`, shadow, `16px` radius)
  - Ticket types listed with +/- counter
  - Price summary
  - "Get tickets - AUD $XX" primary gold pill button (full-width)
  - "Save event" ghost button below

**Mobile:**
- Sticky "Get tickets" bar at bottom of viewport (above bottom nav, gold bg, ink-900 text)
- Tap to expand into ticket selector drawer (bottom sheet, full-screen on small viewports)

### 7.4 Checkout (`/checkout/[order_id]`)

**Layout:** single-column max-width `--container-sm`, no sidebar, focus mode

**Order:**
1. Top: minimal header with logo + "Secure checkout" (no nav distractions)
2. Stepper: 1. Tickets · 2. Details · 3. Payment · 4. Confirmation
3. Step 1: ticket types + qty (already selected from event page)
4. Step 2: name, email, phone (Stripe Elements style)
5. Step 3: payment (Stripe card element + Apple Pay/Google Pay buttons up top)
6. Step 4: success - confetti animation (subtle), order summary, "Tickets sent to email" + "Add to wallet" buttons

**Sticky bottom bar (mobile):**
- Total: AUD $XX
- "Pay $XX" primary gold button

**Anti-distraction rule:** NO bottom nav, NO marketing CTAs, NO upsells visible during checkout. Recover after success.

### 7.5 Order Confirmation (`/orders/[order_id]`)

- Top: green check icon (animated draw on load) + H1 "You're in"
- Order summary card
- "Tickets sent to lawal@example.com" with resend link
- QR code preview
- "Add to Apple Wallet" / "Add to Google Wallet" buttons
- Calendar links: "Add to Google Calendar" / "Add to Apple Calendar"
- Share section: "Tell your crew" with WhatsApp / X / Instagram Story share buttons
- Bottom: "Browse more events" ghost link

### 7.6 Organiser Dashboard (`/dashboard`)

**Layout:** Left nav (240px) + main content
**Left nav items:** Overview · Events · Orders · Attendees · Marketing · Payouts · Settings

**Overview page:**
- 4 stat cards in row: Total revenue · Tickets sold (last 30d) · Upcoming events · Active waitlists
- Each stat: large number (`--display-lg`), label below, up/down X% delta vs last period in `--success` or `--error`
- Revenue chart (last 90 days, line chart, `--gold-500`)
- Recent orders table (last 10)
- Quick actions row: "Create event" + "View public profile" + "Share organiser link"

### 7.7 Login / Sign up (`/auth/login`, `/auth/signup`)

**Layout:** centred max-width `--container-sm`, no nav, no footer (focus mode)
- Logo top
- H2: "Welcome back" or "Join EventLinqs"
- One-tap social: Continue with Google / Apple (full-width pill buttons)
- Divider: "or"
- Email + password inputs
- Primary gold CTA
- Below: "Don't have an account? Sign up" link
- Bottom right tiny: language picker

**Why this matters:** TM/EB/DICE all have garbage auth pages. Ours feels premium from the first interaction.

### 7.8 Profile (`/profile`)

**Tabs:** My Tickets · Following · Saved Events · Settings
- Avatar + name + member-since up top
- Each tab a different content area
- "My Tickets" shows upcoming events with QR codes accessible

### 7.9 Public Organiser Page (`/o/[slug]`)

- Cover banner image (3:1 aspect)
- Avatar + Org name + Verified tick + Follower count + Follow button
- Bio (3-line max with "read more")
- Stats row: X events hosted · Y followers · Member since
- Tabs: Upcoming · Past · About
- Upcoming = card grid of their events

### 7.10 About / Marketing pages (`/about`, `/for-organisers`)

- Pattern B Bold Display Hero
- Long-form content with editorial 3-columns, social proof bands, bold callouts
- Confident, brand-led, NOT corporate

---

## 8. Imagery & Illustration Strategy

### Photography cascade (events)

1. **Organiser upload** (Supabase Storage) - if present, use
2. **Curated manual upload** (admin-seeded heroes) - if no organiser upload
3. **Unsplash API** - auto-fetch by event category keywords, cache, attribute photographer per Unsplash terms

### Illustration style

**Use illustrations when photos won't do:**
- Empty states · Onboarding screens · Marketing pages · 404/error pages

**Style guide:**
- **Hand-drawn, organic line work** - inspired by DICE's punk illustration approach (the "Weirdly easy ticketing" dancing tickets)
- **Cultural pattern motifs** - subtle adinkra symbols, Ankara textile patterns, geometric African line art (NEVER as decoration overlay on faces or skin - only as supporting motifs)
- **Limited palette** - use brand colours only (gold + coral + ink-900 + canvas)
- **Personality over perfection** - slightly imperfect line weights feel human

**Stock illustration libraries permitted:**
- Custom commissioned (preferred - Lawal's brief)
- Open Doodles, Humaaans (when customised to brand palette)

**Rejected:**
- Generic Storyset / unDraw illustrations (overused, no personality)
- AI-generated illustrations (degrades trust)
- Stock photo of diverse business people in suits

### Photo specs

| Context | Aspect | Min dimensions | Max file |
|---|---|---|---|
| Event cover desktop | 4:3 | 1200x900 | 10MB pre-compress |
| Event cover mobile | 16:9 | 1600x900 | (same source, srcset) |
| Hero background | 16:9 | 2400x1350 | 10MB |
| Organiser logo | 1:1 | 400x400 | 2MB |
| Avatar | 1:1 | 200x200 | 1MB |
| Cover banner (organiser page) | 3:1 | 1800x600 | 10MB |

### Image rules

- All via Supabase Storage CDN with `?width=` transforms (responsive srcset)
- Format cascade: AVIF then WebP then JPEG fallback
- `loading="lazy"` on below-fold
- `decoding="async"` always
- Always set `width` + `height` to prevent CLS
- Alt text mandatory - organiser upload enforces it, Unsplash API populates from photo metadata
- **Never AI-generated images** - degrades trust

---

## 9. Social Proof Patterns

**Lesson from DICE:** Social proof front-and-centre builds trust faster than any feature copy.

### Pattern 1: App Rating Cards (DICE-inspired)

- Two large cards side-by-side: iOS [4.9 stars] | Android [4.8 stars]
- Card bg `--white`, large rating number `--display-xl` Manrope 800
- Use on: marketing pages, footer above (post-app-launch only - don't fake ratings)

### Pattern 2: Community Count Strip

- Single horizontal band: "Trusted by 12,400 fans across Melbourne, Sydney, London, and Lagos"
- Background: `--ink-100`
- Centre text: Inter 500, 18px, `--ink-800`
- Numbers updated dynamically from Supabase

### Pattern 3: Organiser Logo Wall (DICE-inspired)

- Title: "A growing network of venues and promoters"
- Grid of 12+ organiser logos, monochrome (white-on-dark or ink-on-canvas)
- Background: `--ink-900` for contrast (DICE pattern) OR `--canvas` for lightness
- Use on: homepage above-fold #2, /for-organisers page

### Pattern 4: Testimonial Cards

- Customer quote (30 words or less) + name + photo + event attended
- Card bg `--white`, gold quote mark watermark
- 3-column on desktop, swipeable on mobile
- Use on: /about page, organiser-recruitment landing pages

### Pattern 5: Press Mentions (post-PR)

- "As featured in" + logos of any press (SBS, ABC, AfroTech, etc.)
- Reserved for actual press wins - never fake

---

## 10. Content Patterns

### Section Header Pattern

```
[gold bar 32x2px]
[EYEBROW LABEL]                    [View all >]
[Section Title in Manrope 700 24px]
[Optional sub-text in Inter 400 16px ink-600]

[Component below]
```

The gold bar is 32px wide, 2px tall `--gold-500` above the eyebrow - borrowed from TM, refined.

### Eyebrow Labels (Inter 500, 12px uppercase, `+0.08em`, `--ink-600`)

`TRENDING NOW` · `THIS WEEK` · `EDITOR'S PICKS` · `CULTURE PICKS` · `FOR ORGANISERS` · `STORIES` · `GUIDES` · `NEAR YOU`

### Section Titles (Manrope 700, 24-32px, `--ink-900`)

- "Trending now" not "Hot Events" or fire-emoji "Trending"
- "This week in Melbourne" - geo-aware
- "Culture picks" - diaspora differentiator
- "From the community" - testimonials/stories
- "Featured organisers" - promoter discovery

### Microcopy

| Context | Copy |
|---|---|
| Empty cart | "Your basket is empty. Browse events to add tickets." |
| Empty saved | "No saved events yet. Tap heart on any event to save it." |
| Empty followed | "You're not following anyone yet. Find organisers you love." |
| Search no results | "No events match '[query]'. Try a different keyword or browse by category." |
| Loading | "One moment..." (NOT "Loading...") |
| Error generic | "Something went wrong. Try again, or contact us if it keeps happening." |
| Success ticket purchase | "You're in. Tickets sent to [email]." |
| Card saved | "Saved" (toast, 2s) |
| Card unsaved | "Removed" (toast, 2s) |
| Newsletter signup | "Get the weekly drop - new events every Thursday." |
| Cookie banner | "We use cookies for analytics. Decline or accept - both work fine." [Decline] [Accept] |

---

## 11. Motion

### Timing curves

```
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);        /* entrances */
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);      /* state changes */
--ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1); /* playful micro */
```

### Durations

| Action | Duration |
|---|---|
| Micro (hover, press) | 100-150ms |
| Component state (drawer, accordion) | 200-250ms |
| Page-level transition | 300-400ms |
| Loading skeleton pulse | 1500ms loop |
| Hero rotation | 8000ms cross-fade |

### Rules
- `prefers-reduced-motion` respected - all non-essential animation disabled
- Only animate `transform` and `opacity` - never `width`, `height`, `top`, `left`
- Stagger list reveals 40-60ms per item on first render
- Card hover lift = signature micro-interaction - must feel smooth

---

## 12. Accessibility (WCAG 2.2 AA - floor)

- All interactive elements 44x44px or larger
- All colour combinations 4.5:1 contrast minimum (3:1 for large text)
- `:focus-visible` ring on every interactive element (gold, 2px, 2px offset)
- Semantic HTML first, ARIA second
- Keyboard-navigable everything (Tab, Enter, Escape, arrow keys in lists)
- Screen-reader announcements for filter changes, loading, toasts
- Skip-to-content link at top of every page
- Reduced-motion block in `globals.css`
- Language attribute on `<html>` + per-section when mixed
- Form labels always visible (not placeholder-only)
- Error messages explicit and tied to inputs via `aria-describedby`

---

## 13. Performance

### Core Web Vitals targets (mobile 4G - MANDATORY)

| Metric | Target |
|---|---|
| LCP (Largest Contentful Paint) | <2.5s |
| INP (Interaction to Next Paint) | <200ms |
| CLS (Cumulative Layout Shift) | <0.1 |
| FCP (First Contentful Paint) | <1.8s |
| TTFB (Time to First Byte) | <800ms |

### Implementation rules
- Hero image: priority + preload + AVIF
- Below-fold images: lazy load
- Fonts: preload Manrope 700/800 + Inter 400/500 only, swap others
- JS: code-split per route, tree-shake aggressively
- CSS: critical inline, rest deferred
- Third-party scripts (PostHog, Stripe): defer loading
- `width` + `height` on every image to prevent CLS
- Bundle size budget: <200KB JS first load per route

---

## 14. Analytics + A/B Testing (Session 2.5)

**Purpose:** Data, not opinions.

### Stack
- **Vercel Analytics** (Web Vitals + page views)
- **PostHog** (free <1M events/mo) - heatmaps, recordings, funnels, feature flags, A/B variants
- **Sentry** - error tracking

### Events to track (minimum)
- `page_view` (path, referrer)
- `event_card_click` (event_id, position, source section)
- `search_performed` (query, result_count)
- `filter_applied` (filter_type, value)
- `checkout_started` (event_id, ticket_count, total)
- `checkout_completed` (order_id, amount)
- `checkout_abandoned` (stage)
- `save_event` (event_id)
- `organiser_followed` (org_id)
- `share_clicked` (event_id, channel)

### Funnels (PostHog)
1. Homepage > Events listing > Event detail > Checkout > Order complete
2. Homepage > Search > Event detail > Checkout > Order complete
3. Category page > Event detail > Checkout > Order complete
4. Organiser page > Event detail > Checkout > Order complete

### A/B test framework
- PostHog feature flags drive variant assignment (50/50)
- Tests queued:
  - **T1:** Filter sidebar Layout A (all expanded, show-more) vs B (top 2 expanded, rest collapsed)
  - **T2:** Hero tagline "WHERE THE CULTURE GATHERS" vs "YOUR NIGHT. OUR PLATFORM."
  - **T3:** Card aspect 4:3 landscape vs 1:1 square on mobile homepage carousel
  - **T4:** Primary CTA gold vs coral
  - **T5:** Hero pattern A (cinematic photo) vs Pattern B (bold display) on `/about`
  - **T6:** Footer mobile DICE-style (3 accordions) vs TM-style (5 accordions)
- Min sample: 500 users per variant for statistical significance
- Winner: higher conversion (card_click > checkout_completed)
- Winning variant promoted to default, doc updated, loser archived

### Privacy
- GDPR-compliant cookie banner before tracking fires
- PostHog EU region for AU/EU users
- No PII in event properties

---

## 15. Anti-Patterns - Claude Code must NEVER do these

### Visual
- Generic Bootstrap blue (`#007BFF`, `#2563EB`) - we use gold
- Pure white `#FFFFFF` as page background - we use `--canvas`
- Centre-aligned body paragraphs longer than 2 lines
- Hero sections without photography OR bold display type (no empty coloured blocks)
- Filter sidebar with more than 5 items expanded per group
- Event cards smaller than 280px wide on desktop
- More than 2 font families on any page
- Drop shadows heavier than spec
- Borders on cards when a shadow would do
- Rounded corners larger than 16px on cards (toy-ish)
- Square corners on buttons (we are pill-first for primary CTAs)
- **Text overlaid on event photography** - titles, dates, venues, prices stacked on a photo. Use the separated-card pattern (image top, white card body below). Section 6.2.1.
- **Multi-line copy inside an image gradient band** - the darkened-gradient band on city/venue tiles is allowed but only carries the place name (1 line). No event meta in the band.
- **Gold (`--gold-400` / `--brand-accent`) text or fills on light card bodies** - use `--brand-accent-strong` (gold-800) on white. Gold-400 stays on dark surfaces and on focus rings (which use ring-offset).

### Content
- Stock photography of diverse people in suits handshaking
- AI-generated images
- Generic Storyset/unDraw illustrations
- Emoji in headlines (allowed in microcopy only)
- Words from the "Words We Don't Use" list in Section 2
- "Click here", "Learn more" CTAs

### Behaviour
- Auto-playing video or audio
- Modal popups within 5 seconds of page load (cookie banner exempt)
- "Open in App" banners that block content (TM does this - we don't)
- Newsletter modals on first visit
- Aggressive monetisation banners between content
- More than ONE primary CTA above the fold
- Sticky header that's more than 80px tall (eats viewport)
- Banner ads anywhere - we have no ads

### Accessibility
- Icon-only buttons without accessible name
- Placeholder text as the only label for inputs
- Red-green only distinction for status (colourblind-hostile)
- Touch targets less than 44x44px
- Auto-focus inputs that hijack mobile keyboards
- Animation without `prefers-reduced-motion` respect

### Performance
- Images without explicit width/height (causes CLS)
- Loading non-critical fonts blocking
- Loading PostHog/Stripe synchronously
- Unoptimised images (must be AVIF/WebP cascade)

---

## 16. Flexibility Clause

Claude Code is permitted - and encouraged - to propose variations within this system when:
- User testing or A/B data suggests a better direction
- A new pattern emerges that honours mood words + accessibility + performance
- A specific page has a clear rationale for deviation

**Process for proposed deviations:**
1. Build the variant
2. Capture screenshots at 5 viewports (375, 393, 414, 768, 1280)
3. Document rationale in session report
4. A/B test for 500+ users before committing as default
5. Wins: doc updated. Loses: reverted. No ego.

**What Claude Code cannot change without explicit Lawal approval:**
- Primary gold colour `--gold-500`
- Tagline "WHERE THE CULTURE GATHERS"
- Font families (Manrope + Inter)
- Anti-patterns list (Section 15)
- Accessibility floor (WCAG 2.2 AA)
- Performance targets (Section 13)

---

## 17. Reference Annotations

### What we steal from Ticketmaster
- Hero full-bleed cinematic photography + left-side text + primary CTA (Pattern A)
- Carousel arrow controls + category pills above titles
- Card grid generosity - cards are BIG, images dominate
- Editorial 3-column content sections (homepage)
- Mobile single-column edge-to-edge card stack
- Eyebrow + section title + gold bar pattern

### What we steal from DICE
- Massive bold display type heroes (Pattern B)
- Horizontal scroll-snap with peek-of-next-card
- Heart-save interaction
- Hand-drawn personality illustrations
- App rating social proof cards
- Organiser logo wall on dark background
- Minimal mobile footer (3 accordions vs TM's 5+)
- Confidence through restraint

### What we reject
- **From TM:** generic blue, "Open in App" interrupting banner, aggressive ad placements, stock photo people, monetisation between content
- **From EB:** cream + orange palette (too warm, too earnest), DIY tone
- **From DICE:** all-black-everything (alienates 40+), US/UK-centric copy, app-only mentality

### What's uniquely ours
- **Culture/Language filter** - diaspora differentiator, no competitor has it
- **Gold + Coral palette** against warm off-white
- **"Where the culture gathers" positioning**
- **Multi-currency display** (AUD, GBP, CAD, NGN, GHS from day one)
- **Unsplash API cascade for seed events** - fixes cold-start content problem
- **Geo-personalised "This week in [city]"** sections
- **Cultural illustration motifs** (subtle, brand-coloured)
- **Brand voice** that's confident-cultural-warm - neither punk (DICE) nor corporate (TM) nor twee (EB)

---

## 18. Enforcement

- Every session report (per `BUILD-STANDARDS.md`) must reference this doc
- Every card, button, hero, filter, page touched must use tokens - never raw hex, raw px (except where specified), raw font names
- Deviations caught in review: revert + document
- A/B test results update this doc monthly
- Version this file in git - it is the visual constitution

**Signed off:** Lawal Adams + Claude, 13 April 2026
**Next review:** After Session 5 (Login polish) - based on first batch of A/B test data

---

## Appendix: Quick reference for Claude Code

### When building any new component, check:
- Uses tokens from Section 3 (colour) and Section 4 (typography)
- Spacing references Section 5 tokens
- Honours mood words from Section 1
- Voice/tone matches Section 2
- Doesn't violate any anti-pattern in Section 15
- Meets WCAG 2.2 AA per Section 12
- Performance targets in Section 13 not regressed
- Has matching mobile + desktop spec
- Tested at 5 viewports (375, 393, 414, 768, 1280)
- Benchmarked against TM + DICE per Rule A in BUILD-STANDARDS.md

### When unsure, ask:
- Would TM or DICE do this on mobile? If neither, why?
- Does this honour at least 3 mood words?
- Will a 22yo Melbourne uni student AND a 45yo Lagos-born accountant both find this comfortable?
- Would I screenshot this and be proud to show Lawal?
