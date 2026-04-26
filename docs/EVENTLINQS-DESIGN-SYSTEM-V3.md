# EventLinqs Design System v3.0 - The Ticketmaster-Grade Spec

> Authored: 2026-04-18 by Claude (CTO / Chief Graphic Officer for the EventLinqs build).
> Based on: forensic study of 40 mobile reference screenshots (Airbnb, DICE, Ticketmaster) plus full read of `github.com/eventlinqs/eventlinqs-app` git head on `main`.
>
> **Status: locked. This is the visual contract.** Any Claude Code stream working on Module 4.5 obeys this document. If a token, ratio, or pattern is not in this doc, do not invent it - propose a change and update the doc first.

---

## 0. Preamble - what we are competing against

| Property | Airbnb | DICE | Ticketmaster | EventLinqs target |
|---|---|---|---|---|
| Hero typography | Search-first, no display H1 | Massive display sans, all caps | Serif italic over photo | Editorial display sans (Manrope), 7rem peak |
| Card density | 2-up horizontal scroll rails | Poster grid | Full-width stacked + horizontal rails | Full-width feature card + 2-up grid |
| Image carousel | Yes, dot indicators | No | Yes, arrows + counter | Yes, dot indicators (Airbnb pattern) |
| Heart / favourite | Yes, top-right | Yes, bottom-right of poster | Yes, beneath hero | Yes, bottom-right of card image |
| Social proof | Guest favourite pill | Venue logo grid + app ratings | Star ratings on app banner | Trending pill + Organiser favourite pill + venue logo grid |
| Empty states | None - only show populated | None - only show populated | "0 RESULTS" with refinement | Hide empty rails entirely |
| Sticky action bar | No on mobile | Yes - Purchase Ticket | Yes - Buy Tickets / Price / More Info | Yes - Get tickets / Price / Availability dot |

**The bar to clear: any fan or organiser landing on EventLinqs must believe within 3 seconds that this platform is at least as well-built as DICE.** No exceptions.

---

## 1. Brand foundation - locked tokens

These are already in `src/app/globals.css` and Tailwind v4 theme block. Any divergence is a bug.

### Primary palette

| Token | Hex | Use |
|---|---|---|
| `gold-100` | `#FBF4DC` | Soft accent backgrounds, badge fills |
| `gold-400` | `#E8B738` | Hover states, accent text on dark surfaces |
| `gold-500` | `#D4A017` | Brand accent - CTAs, eyebrows, the dot in EVENTLINQS• |
| `gold-600` | `#B88612` | Active/pressed states |
| `coral-500` | `#FF4E3A` | Trending / urgency - sparingly |
| `coral-600` | `#E63E2C` | Coral hover |
| `navy-950` | `#0A0E1A` | Hero base, dark surface |
| `ink-900` | `#0A1628` | Primary text, dark surface secondary |
| `ink-800` | `#1A1A1A` | Tertiary dark surface |
| `ink-600` | `#4A4A4A` | Body secondary text |
| `ink-400` | `#8A8A8A` | Muted text, icon strokes |
| `ink-200` | `#D9D9D6` | Borders, dividers |
| `ink-100` | `#EFEDE8` | Soft surface, alternate band background |
| `canvas` | `#FAFAF7` | Default page background - warm off-white |
| `white` | `#FFFFFF` | Card surfaces, on-image text |

**Gold usage rule.** Gold is an *accent*, not a flood. The visible gold per viewport must not exceed roughly 5% of the visible area. Gold appears in: (a) the EVENTLINQS• logo dot, (b) primary CTAs, (c) eyebrow labels above section headers, (d) date stamps on event cards, (e) the View event arrow on the hero featured card. Gold never fills a section background. Gold never fills a card body.

### Typography

| Family | Use |
|---|---|
| Manrope (`--font-display`) | All H1, H2, H3, eyebrows, CTAs, prices, dates |
| Inter (`--font-body`) | All body copy, lists, form labels, captions |

### Type scale (locked, fluid)

| Token | clamp | Use |
|---|---|---|
| `text-display-3xl` | `clamp(4rem, 8vw, 6.5rem)` | Hero H1 only - once per page |
| `text-display-2xl` | `clamp(3.5rem, 6vw, 5.5rem)` | Category landing page H1 |
| `text-display-xl` | `clamp(2.75rem, 4.5vw, 4rem)` | Event detail page H1 |
| `text-display-lg` | `clamp(2rem, 3.5vw, 3rem)` | Section H2 |
| `text-heading-xl` | `clamp(1.5rem, 2.25vw, 2rem)` | Card title (large), section subhead |
| `text-heading-lg` | `1.25rem` | Card title (default) |
| `text-heading-md` | `1.125rem` | Card title (small) |
| `text-body-lg` | `1.125rem` | Lead paragraphs |
| `text-body` | `1rem` | Default body |
| `text-body-sm` | `0.875rem` | Secondary body, card metadata |
| `text-caption` | `0.75rem` | Eyebrows (tracking-widest), legal, footnotes |

**Weight rules.** Display: 700 / 800 only. Body: 400 / 500 / 600. Never use 900 (too brutal). Never set body copy below 14px.

### Spacing - 4px grid

All margins, padding, gaps use the `--space-N` token where N corresponds to `4 * N` pixels. The grid is non-negotiable. No magic numbers like `padding: 13px`.

### Radii

| Use | Value |
|---|---|
| Pills (search, eyebrow, category) | `rounded-full` (9999px) |
| Cards (event, organiser, city) | `rounded-2xl` (16px) |
| Buttons | `rounded-lg` (8px) |
| Form inputs | `rounded-lg` (8px) |
| Image inside card | `rounded-t-2xl` (top corners only - body extends to bottom) |

### Shadows

| Use | Class |
|---|---|
| Card resting | `shadow-sm` |
| Card hover | `shadow-md` (with translate-y-1 lift) |
| Sticky bottom action bar | `shadow-[0_-4px_20px_rgba(10,22,40,0.08)]` |
| Modal | `shadow-2xl` |

---

## 2. Logo - EVENTLINQS•

The wordmark is `EVENTLINQS` set in Manrope ExtraBold (800), tracking `tracking-tight` (-0.02em), followed by a gold dot - the "lockup full stop". This is the lockup spec from Concept A Option 2.

```tsx
// components/ui/eventlinqs-logo.tsx
export function EventLinqsLogo({ size = 'md', variant = 'dark' }: Props) {
  const colour = variant === 'dark' ? 'text-ink-900' : 'text-white'
  const sizes = { sm: 'text-base', md: 'text-lg', lg: 'text-2xl' }
  return (
    <span className={`font-display font-extrabold tracking-tight ${sizes[size]} ${colour}`}>
      EVENTLINQS<span className="text-gold-500">.</span>
    </span>
  )
}
```

The dot is `text-gold-500`. Always. Even on dark surfaces.

---

## 3. Navigation - Airbnb pill search bar (decision 1 from top 10)

### Desktop (≥ md)

```
┌──────────────────────────────────────────────────────────────────────┐
│  EVENTLINQS•      ┌─────────────────────────────────┐    Sign in  ┐  │
│                   │ 🔍 Search events, artists ...    │ Get Started│  │
│                   └─────────────────────────────────┘             ┘  │
└──────────────────────────────────────────────────────────────────────┘
```

- Logo left (linked to `/`)
- Centre: pill search bar - `rounded-full bg-canvas border border-ink-200 hover:shadow-sm`
- Right: ghost Sign in button + gold Get Started button
- **No location pin pill. Anywhere.**
- Sticky on scroll: header shrinks to 56px and search pill stays centred.

### Mobile (< md)

```
┌────────────────────────────────────┐
│ EVENTLINQS•           Get Started ☰│
└────────────────────────────────────┘
┌────────────────────────────────────┐
│ 🔍 Search events, artists ...       │   ← second row, full width pill
└────────────────────────────────────┘
```

The search pill drops to a second row on mobile. Tapping the pill opens a full-screen search modal (Module 5 territory - for now, links to `/events`).

### Search modal (built in M5, stub for M4.5)

The pill click opens a sheet:
- Top input: "Search events, artists, venues"
- Below: "Where" location input (autocomplete, defaults to user's city)
- Below: "When" date picker (Today / This weekend / This week / Custom)
- Recent searches strip
- Trending searches strip

For M4.5: clicking the pill navigates to `/events?focus=search` and the events page autofocuses the filter input. Modal proper ships in M5.

---

## 4. Section header anatomy

The pattern across Airbnb (image 1: "Popular homes in Sydney →"), Ticketmaster (image 4: "POPULAR TICKETS / See All"), and DICE (image 9: "Familiar favs, new crushes"):

```
┃ EYEBROW IN GOLD CAPS                                          View all →
┃ Section title in display, large, ink-900
```

Markup (already exists in `page.tsx`, refine):

```tsx
<div className="flex items-end justify-between gap-4">
  <div className="flex items-start gap-3">
    {/* Vertical gold accent bar - 2px wide, 32px tall */}
    <div className="mt-1 h-8 w-0.5 shrink-0 bg-gold-500" aria-hidden="true" />
    <div>
      <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-gold-500">
        {eyebrow}
      </p>
      <h2 className="font-display text-3xl font-bold text-ink-900 sm:text-4xl">
        {title}
      </h2>
    </div>
  </div>
  <Link href={href} className="shrink-0 text-sm font-medium text-gold-600 hover:text-gold-700 transition-colors whitespace-nowrap">
    {linkLabel} →
  </Link>
</div>
```

**Mandatory.** Every horizontal section uses this header. Never deviate.

---

## 5. Event card anatomy - the most important atom

This is the visual workhorse. It must be perfect.

### Default card (used in 2-up and 3-up grids)

```
┌─────────────────────────────────────┐
│ ┌─────────────────────────────────┐ │
│ │ NIGHTLIFE          ◯  ◯  ◯  ◯   │ │  ← category pill TL, dot indicators BL when carousel
│ │                                  │ │
│ │           [hero image]           │ │  ← 4:3 desktop, 16:9 mobile
│ │                                  │ │
│ │                          ❤       │ │  ← heart bottom-right
│ └─────────────────────────────────┘ │
│ SUN, 19 APR                         │  ← date in gold caps, tracking-widest, 11px
│ Stripe Test Event                   │  ← title, display bold, 18px mobile / 20px desktop
│ 📍 Melbourne                        │  ← location, ink-500, 13px
│                                     │
│ From AUD $1            🔥 Trending  │  ← price + social proof badge
└─────────────────────────────────────┘
```

### Specs

| Element | Value |
|---|---|
| Card | `rounded-2xl bg-white border border-ink-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200 ease-out` |
| Image aspect | 4:3 desktop, 16:9 mobile - `aspect-video md:aspect-[4/3]` |
| Image radius | `rounded-t-2xl overflow-hidden` |
| Category pill | `absolute left-3 top-3 rounded-full bg-ink-900/80 backdrop-blur-sm px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white` |
| Carousel dots | `absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5` - only renders when `gallery_urls.length > 1` |
| Heart button | `absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-ink-900 shadow-sm hover:scale-110 transition-transform` |
| Body padding | `p-4 md:p-5` |
| Date | `font-display text-[11px] font-semibold uppercase tracking-[0.15em] text-gold-600` |
| Title | `mt-1.5 font-display text-lg md:text-xl font-bold leading-tight text-ink-900 line-clamp-2 group-hover:text-gold-700 transition-colors` |
| Location | `mt-2 flex items-center gap-1 text-sm text-ink-500` with map pin icon at `h-3.5 w-3.5` |
| Price row | `mt-auto flex items-end justify-between gap-2 pt-4` |
| Price | `font-display text-base font-bold text-ink-900` - currency code in `text-xs font-medium text-ink-500` |
| Social proof badge | from `SocialProofBadge` component, `compact` variant |

### Featured card (used as first card on grids)

Twice the height of a default card. Title at `text-display-lg`. Subtitle line below ("Melbourne · Friday 24 May"). Used as the first card in the Trending grid on the homepage.

### Card hover motion

`hover:-translate-y-1` lifts the whole card by 4px. `transition-all duration-200 ease-out`. The image inside applies `group-hover:scale-105` over `duration-500` - a slow inner zoom, classic Airbnb.

---

## 6. Carousel primitive

Used in 3 places: card image (when `gallery_urls.length > 1`), event detail hero, "Fans also viewed" rail.

### Card-level carousel

- Swipe gesture on touch devices
- Dot indicators bottom-centre on the image (white `bg-white/40` dots, active is `bg-white`, 6px diameter, 6px gap)
- No arrow buttons on cards (too cluttered)
- Lazy-load all images beyond index 0

### Detail-level carousel

- Full-bleed on mobile, contained max-w-7xl on desktop
- Aspect 16:9 desktop, 4:5 mobile (taller, more poster-like)
- Arrow buttons on desktop (left/right, white circles with ink-900 chevron)
- Counter "1 / 5" bottom-right
- Dot indicators bottom-centre
- Tap to open lightbox (M5 - for M4.5, just enlarges modal)

### Implementation

```tsx
// components/ui/image-carousel.tsx
'use client'
export function ImageCarousel({ images, alt, aspectRatio = '4/3', showArrows = false }: Props)
```

Uses native CSS scroll-snap (`snap-x snap-mandatory`) for swipe behaviour, no JS dependency. Only the index tracker needs state.

---

## 7. Hero anatomy - homepage

```
┌───────────────────────────────────────────────────────────────────┐
│  [Pill search bar overlaid on top - see Nav]                      │
│                                                                    │
│                                                                    │
│   [video backdrop - crowd at an event, 60% darkened]              │
│                                                                    │
│   ┃ MADE FOR THE DIASPORA                                         │
│   ┃                                                                │
│   ┃  Where the                                                    │
│   ┃  culture gathers.        ┌──────────────────────────────┐    │
│   ┃                          │ HAPPENING SOON                │    │
│   ┃  Tickets for events       │                              │    │
│   ┃  that move you.           │ Stripe Test Event            │    │
│   ┃                          │ Sun 19 Apr · Melbourne · by  │    │
│   ┃  [Get tickets] [Browse]  │ Tasknora                     │    │
│   ┃                          │ From AUD $1                  │    │
│   ┃                          │                              │    │
│   ┃                          │ [View event →]               │    │
│   ┃                          └──────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────┘
```

### Specs

| Element | Spec |
|---|---|
| Section min-height | `min-h-[75vh] md:min-h-[85vh]` |
| Background | `bg-navy-950` with `<video autoplay muted loop playsInline>` overlay |
| Video overlay | `linear-gradient(to bottom, rgba(10,14,26,0.55) 0%, rgba(10,14,26,0.70) 50%, rgba(10,14,26,0.95) 100%)` |
| Eyebrow | `inline-flex rounded-full border border-gold-500/40 bg-gold-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-gold-400` |
| H1 | `font-display font-extrabold leading-[0.95] tracking-tight text-white` size `clamp(3.5rem, 8vw, 7rem)` |
| H1 accent word | `text-gold-400` on "culture" |
| Subhead | `text-base sm:text-lg text-white/75 max-w-lg` |
| CTA primary | gold filled, `Get tickets` |
| CTA secondary | white outline, `Browse all events` |
| Featured card | `bg-ink-900 border border-gold-500/30` - solid, NOT glassmorphism (decision 7) |

### The featured card - solid, not glass (CRITICAL FIX)

Current (wrong): translucent glass card vanishing into the dark video.

New (right):
```tsx
<div className="rounded-2xl border border-gold-500/30 bg-ink-900 p-6 shadow-xl backdrop-blur-md">
  <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-gold-400">
    Happening soon
  </p>
  <h3 className="mt-3 font-display text-2xl font-bold text-white">{event.title}</h3>
  <div className="mt-3 space-y-1 text-sm text-white/80">
    <p>{formattedDate}</p>
    <p>{event.venue_city}</p>
    <p>by {event.organisation.name}</p>
  </div>
  <p className="mt-4 font-display text-base font-bold text-gold-400">From {currency} ${price}</p>
  <p className="mt-3 flex items-center gap-1.5 text-xs text-white/50">
    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-400" />
    247 people viewing
  </p>
  <Link
    href={`/events/${event.slug}`}
    className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-gold-500 px-4 py-3 text-sm font-semibold text-ink-900 hover:bg-gold-400 transition-colors"
  >
    View event →
  </Link>
</div>
```

`bg-ink-900` (solid near-black), gold-500/30 border, gold pulse dot for live signal, gold-filled CTA. The card now reads as a featured ribbon, not a smudge.

---

## 8. Cultural Picks - eliminate empty states (decision 3)

Current (wrong): six dashed grey boxes saying "Be the first to host a [X] event".

New: **only render tabs that have at least 1 published event**. The Cultural Picks section reads from `hero_categories` joined to `events` count. Tabs render only where `count > 0`. If zero categories have events, the entire section hides.

If the user clicks a tab and the event count drops to zero between hover and click (race condition), they land on the category page which has its own well-designed empty state (single illustration + single CTA, never a dashed box).

---

## 9. By City rail - editorial photography (decision 9)

```
BY CITY                                                       View all →
Wherever you are, the culture follows
┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│ [photo]    │ │ [photo]    │ │ [photo]    │ │ [photo]    │
│            │ │            │ │            │ │            │
│ Melbourne  │ │ Sydney     │ │ London     │ │ Lagos      │
│ 4 events   │ │ 2 events   │ │ 1 event    │ │ 0 events   │
└────────────┘ └────────────┘ └────────────┘ └────────────┘
```

Each tile is `aspect-[4/5]` (taller than wide), with a real city photograph. Bottom-up dark gradient. City name in white extrabold display 28px. Event count in white/70 14px below. Cities with 0 events still show - the count just reads "Coming soon" instead of "0 events".

Photography source priority:
1. **Licensed editorial photo** (preferred, paid)
2. **Pexels API with city query** (fallback) - query template: `"{city} skyline {evening|night|aerial}"` rotating
3. **Brand-coloured fallback** (last resort) - full-bleed city colour from a curated palette, with a city silhouette SVG, NEVER plain "[CITY NAME]" ghost text

Pexels query examples:
- Melbourne: `"Melbourne skyline night"`, `"Melbourne city evening"`, `"Melbourne CBD aerial"`
- Lagos: `"Lagos Nigeria skyline"`, `"Lagos city night"`, `"Lagos Victoria Island"`

---

## 10. Social proof layer - venue/promoter logos + ratings (decision 8)

New section between By City and For Organisers on the homepage:

```
TRUSTED BY ORGANISERS BUILDING CULTURE

┌─────────────────────────────────────────────────────────────┐
│   AVANT       AMAPIANO     OWAMBE      AFROBEATS    BEAVS  │
│   GARDNER     COLLECTIVE   SOCIETY     MELBOURNE           │
│                                                             │
│   GOSPEL      SOCA         CARIBBEAN   NAIJA      DIASPORA │
│   AUSTRALIA   COUNCIL      VIBES       NIGHTS     CULTURE  │
└─────────────────────────────────────────────────────────────┘

Loved by fans

┌─────────────────────┐  ┌─────────────────────┐
│       iOS           │  │      Android        │
│       4.9           │  │       4.8           │
│      ★★★★★          │  │      ★★★★★          │
└─────────────────────┘  └─────────────────────┘
```

For launch (M4.5 finishing pass), populate with real organisers who have signed up, even if it's only 4-6 names. Monochrome white wordmarks on `bg-ink-900`. Ratings panel shows iOS/Android stars only when the apps actually exist (M6 territory) - until then, omit the ratings panel and let the logo grid stand alone.

If you have fewer than 6 organiser logos, do not ship this section. Empty social proof is worse than no social proof.

---

## 11. Live Vibe marquee

Current implementation (per your screenshots): horizontal scrolling pink-pin items "New in London: Afrobeats All Night - London", "New in Sydney: Amapiano Takeover - Sydney" etc.

Keep the marquee. Tighten:
- Position: between Cultural Picks and By City
- Background: `bg-ink-900`
- Eyebrow: `LIVE ON EVENTLINQS` in gold caps, tracking-widest
- Items: pin emoji 📍 + event title + city, all in white, animation `animate-marquee` with `prefers-reduced-motion: reduce` honoured
- Speed: 60s per full loop, slow and confident
- On hover: pause animation
- On click of item: navigate to event detail

---

## 12. Event detail page - full lift

Current state: stale Tailwind (`bg-gray-50`, `bg-blue-100`), object-contained small hero, no SiteHeader/SiteFooter wrapper, ad-hoc nav. **This page is the worst-shape page in the app right now.** Full rebuild required.

### Anatomy (mobile-first)

```
┌─────────────────────────────────────┐
│ [SiteHeader]                        │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │                                 │ │
│ │      [carousel hero]            │ │  ← 4:5 mobile, 16:9 desktop
│ │      with dot indicators        │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│ NIGHTLIFE                           │  ← eyebrow
│ Stripe Test Event                   │  ← H1 display-xl
│ 📍 Melbourne · Sun 19 Apr           │
│                                     │
│ ABOUT                               │  ← section
│ Lorem ipsum dolor sit amet ...      │
│                                     │
│ WHEN & WHERE                        │
│ ┌─────────────────────────────────┐ │
│ │ [venue map embed - Google Maps] │ │
│ └─────────────────────────────────┘ │
│ Venue Name                          │
│ 123 Example St, Melbourne           │
│ Open in Google Maps →               │
│                                     │
│ ORGANISER                           │
│ ┌──────┐                            │
│ │  TN  │ Tasknora                   │
│ └──────┘ View other events →        │
│                                     │
│ SHARE                               │
│ [WhatsApp] [Copy link] [Calendar]   │
│                                     │
│ FANS ALSO VIEWED                    │
│ [card] [card] [card] →              │
│                                     │
│ [SiteFooter]                        │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐  ← FIXED bottom action bar (mobile only)
│ From AUD $1   🟢 Good   [Get tickets]│
└─────────────────────────────────────┘
```

### Desktop layout

Two-column on `lg:`:
- Left (60%): hero carousel, About, When & Where, Organiser, Share, Fans also viewed
- Right (40%): sticky ticket selector card - `lg:sticky lg:top-24` - contains the existing `TicketSelector` component

### Sticky bottom action bar (mobile only - decision 10)

```tsx
<div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-ink-100 shadow-[0_-4px_20px_rgba(10,22,40,0.08)] pb-[max(0.75rem,env(safe-area-inset-bottom))] px-4 pt-3">
  <div className="flex items-center justify-between gap-3">
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-widest text-ink-500 font-semibold">From</span>
      <span className="font-display text-base font-bold text-ink-900">{currency} ${price}</span>
    </div>
    <div className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${availabilityColour}`} aria-hidden="true" />
      <span className="text-xs font-medium text-ink-600">{availabilityLabel}</span>
    </div>
    <a href="#tickets" className="rounded-lg bg-gold-500 px-6 py-3 text-sm font-bold text-ink-900 hover:bg-gold-400 transition-colors">
      Get tickets
    </a>
  </div>
</div>
```

Availability dot colours follow Ticketmaster's GOOD / LOW / NONE pattern (image 11):
- `bg-success` (green) when > 50% available
- `bg-warning` (amber) when 10-50% available
- `bg-error` (red) when < 10% available
- `bg-ink-400` when sold out

---

## 13. Motion system

| Pattern | When | Implementation |
|---|---|---|
| Card hover lift | Hover on EventCard | `hover:-translate-y-1 hover:shadow-md transition-all duration-200 ease-out` |
| Image inner zoom | Hover on EventCard image | `group-hover:scale-105 transition-transform duration-500 ease-out` on the `<Image>` |
| Ken Burns | Hero video alternative when video fails | `animate-[ken-burns_20s_ease-in-out_infinite]` keyframes scale 1 → 1.1 + translate |
| Marquee | Live Vibe strip | `animate-[marquee_60s_linear_infinite]` |
| Fade-in on scroll | Section enters viewport | IntersectionObserver + `opacity-0 → opacity-100` over 600ms ease-out |
| Carousel snap | Card image carousel swipe | CSS `snap-x snap-mandatory` - no JS |
| CTA pulse | Pulse dot on Happening Soon | `animate-pulse` Tailwind built-in |

**Reduced-motion override** is already in `globals.css`. Honour it. Anything that `transform` or `animate` must check the media query.

---

## 14. Image pipeline - Pexels API tuned per category

Schema is set. `gallery_urls: string[]` exists on events. Upload component handles 1 image today - needs to support up to 10.

### Smart fallback hierarchy

For any event card where `cover_image_url` is null:
1. Use first `gallery_urls[0]` if present
2. Fall back to a category-tuned Pexels image based on `event.category.slug`
3. Final fallback: brand gradient with category icon overlay (no broken image, no white box)

### Pexels query map (lib/images/pexels-queries.ts)

```ts
export const CATEGORY_PEXELS_QUERIES: Record<string, string[]> = {
  afrobeats: ['Afrobeats concert', 'African music festival night', 'Lagos club night dancing'],
  amapiano: ['Amapiano dance party', 'South African club night', 'amapiano festival'],
  gospel: ['gospel concert lights', 'church praise worship', 'gospel choir performance'],
  comedy: ['comedy club stand up', 'comedian on stage spotlight', 'comedy show audience'],
  owambe: ['Nigerian wedding celebration', 'Yoruba traditional party', 'African celebration'],
  business: ['conference event Melbourne', 'business networking event', 'professional summit'],
  caribbean: ['Caribbean carnival', 'soca dance party', 'reggae festival'],
  nightlife: ['nightclub crowd lights', 'DJ booth crowd', 'club dancing'],
  music: ['live music concert', 'concert crowd hands', 'festival lights'],
  default: ['event crowd celebration', 'concert lights audience'],
}
```

Cache Pexels responses per query for 24h to stay under rate limits.

### Smart Media component

```tsx
// components/ui/smart-media.tsx
export function SmartMedia({ src, fallbackCategory, alt, ...rest }: Props) {
  // 1. If src provided, render Image
  // 2. If no src and fallbackCategory provided, fetch Pexels image for category (server component, RSC)
  // 3. If both fail, render BrandGradientFallback with category icon
}
```

---

## 15. Empty states - proper, not dashed

Replace every dashed-border empty state with one of:

### Pattern A - Discovery empty (events page with no results matching filters)

```
        [SVG illustration: a person looking at a map with a magnifying glass]

              No events match your filters

        Try widening your date range or removing a category.

                   [Reset filters]   [Browse all events]
```

### Pattern B - Category landing empty (Cultural Picks tab with no events)

```
              [SVG illustration: a stage with stage lights and a microphone]

                Be the first to host an Afrobeats event in Melbourne

        Zero platform fees on your first event. Get listed in five minutes.

                              [Start hosting]
```

### Pattern C - Section hide entirely (Cultural Picks on homepage)

If the section has no content, **hide the entire section**. Do not render the header, the tabs, or the dashed boxes.

SVG illustrations to be sourced or commissioned. For M4.5, use simple line illustrations from Lucide-react or undraw.co (open licence). Rendered at 200x200 in `text-ink-300` strokes.

---

## 16. Responsive breakpoints

```
sm:   640px   ← phone landscape, small tablet portrait
md:   768px   ← tablet portrait
lg:   1024px  ← tablet landscape, small desktop
xl:   1280px  ← desktop
2xl:  1536px  ← large desktop
```

All grids:
- Default: 1 column
- `sm:` 2 columns
- `lg:` 3 columns
- `xl:` 4 columns (city tiles, organiser logos)

Container: `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8` - non-negotiable.

---

## 17. Accessibility - WCAG 2.2 AA, no compromises

- All interactive elements `min-h-[44px]` and `min-w-[44px]` (already in tokens)
- Focus ring: gold-400, 2px, 2px offset (already in `globals.css`)
- All icons have `aria-hidden="true"` when decorative, `aria-label` when interactive
- Heart button: `aria-label="Save {title}"` and `aria-pressed={isSaved}`
- Carousel: keyboard navigation (left/right arrows), aria-roledescription="carousel"
- Sticky bottom bar: doesn't trap focus; `role="region"` with `aria-label="Ticket actions"`
- Colour contrast: gold-500 on white passes AA for large text (3:1) - gold-600 used for body-size text on white (4.5:1)
- Reduced motion: respected on every animation

---

## 18. The "Apple test"

Before any change ships, ask: "If Tim Cook scrolled this page on an iPhone 16 Pro, would he say 'this looks correct' or 'this looks like a side project'?"

If the answer is the latter, it does not ship.

The Apple test fails on:
- Any element with `padding: 13px` style magic numbers
- Any text rendered as a literal `\u2026`, `\u2014`, `\u2013` (mojibake)
- Any image rendering at object-contain instead of object-cover unless intentional
- Any colour that doesn't appear in the token list above
- Any spacing that isn't on the 4px grid
- Any state where the user sees a dashed grey rectangle
- Any nav with a non-functional pin pill
- Any button labelled in mid-sentence case ("Get started" not "Get Started" - Australian English follows sentence case for inline labels, title case for proper noun CTAs only)

---

## 19. Australian English copy rules

- Sentence case for body, headings, and inline labels: "Get tickets", "Browse all events"
- Title case only for proper nouns: "EventLinqs", "Cultural Picks" (section title), "Made for the Diaspora" (eyebrow)
- Spelling: organiser (not organizer), favourite (not favorite), colour (not color)
- No em-dashes ( - ) or en-dashes (-) as punctuation. Use hyphens for compound words only. Sentences end with full stops.
- No exclamation marks. Anywhere. Even in CTAs. "Get tickets" not "Get tickets!".
- Numerals: "5+ payment gateways", "24/7 ticket scanning", "$44" - no spelled-out numbers in UI
- Date format: "Sun, 19 Apr" (short) or "Sunday 19 April 2026" (long) - never US format

---

## 20. What ships in M4.5 vs what waits

### Ships in M4.5 (this design system applied):

1. New SiteHeader with pill search bar (no Melbourne pin pill)
2. New EventCard with carousel support and updated typography
3. ImageCarousel primitive
4. Hero - solid Happening Soon card replacing glass
5. Cultural Picks - empty-tab hiding logic
6. By City rail with editorial photography
7. Live Vibe marquee tightened
8. Social proof / venue logos section (only if 6+ logos available)
9. Event detail page full rebuild (carousel hero, sticky bottom bar, proper sections, design system tokens)
10. Multi-image upload (up to 10 per event)
11. Mojibake / unicode escape audit and fix
12. SmartMedia component with Pexels fallback
13. EventLinqsLogo component (extracted, single source of truth)

### Waits for M5+:

- Search modal (sheet) - pill links to `/events?focus=search` for now
- Saved events functionality (heart button is wired to noop in M4.5)
- iOS / Android app store ratings panel (apps don't exist yet)
- Lightbox on detail carousel
- Add to Calendar / .ics file generation
- WhatsApp / Twitter native share intents

---

## End of design system v3.0

This document is the contract. Any divergence from this spec in shipped code is a bug. The Module 4.5 manifest implements every section above across three parallel Claude Code streams.
