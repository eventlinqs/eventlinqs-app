# EventLinqs Homepage - Interaction Map

> **Purpose:** for every clickable / interactive element on the target homepage, this document specifies: what the user sees, what the click does, what state transitions occur, and what happens in every edge case. This is the acceptance test document. When Claude Code builds a component, it must satisfy every interaction listed here.

---

## Global interaction principles

- **Every interactive element has a visible hover state.** On desktop, the cursor changes AND the element visually responds (lift, colour change, underline, scale, border change).
- **Every interactive element has a visible focus state.** Keyboard users see a 2px gold-400 focus ring with 2px offset. Never rely on colour alone.
- **Every interactive element has a visible active/pressed state.** Button press = scale(0.98) + darker gold. Card press = same.
- **No dead ends.** Every click takes the user somewhere useful. If a feature isn't built yet, the click shows a "Coming in May" toast, not silence.
- **Loading states are never blank screens.** Skeleton loaders for cards, pulse animations for text, never a spinner on an empty page.
- **Error states are never generic.** "Something went wrong" is forbidden. Always say what happened and offer a retry.
- **Nothing requires JavaScript to render initial content.** Every section is SSR/RSC - SEO works, first paint is fast.

---

## 1 - Nav bar interactions

### 1.1 Logo (`EVENTLINQS.`)
- **Click:** navigate to `/`
- **Hover:** letters stay black, gold dot pulses subtly (no other colour change)
- **Keyboard focus:** 2px gold-400 ring around the full wordmark including dot
- **Edge case:** if user is already on `/`, clicking logo does nothing visible but causes a subtle scroll-to-top if page is scrolled > 100px

### 1.2 "Events" link
- **Click:** navigate to `/events`
- **Hover:** colour transitions from ink-600 to gold-700 over 150ms
- **Active page indicator:** if pathname starts with `/events`, link colour is gold-700 (not ink-600)
- **Keyboard:** Enter + Space both activate

### 1.3 "For organisers" link
- **Click:** navigate to `/organisers`
- **Hover/active:** same pattern as Events
- **Edge case:** if logged-in user has `role: organiser`, clicking this link instead navigates to `/dashboard` (they don't need the landing page, they need the dashboard)

### 1.4 Melbourne pill (LocationPicker)
- **Click:** opens searchable location modal (existing `LocationPicker` component with `variant="modal"`)
- **Hover:** border changes from `ink-200` to `ink-400`, subtle shadow appears
- **Visual:** gold pin icon + city name + down chevron signals dropdown
- **Modal content:** search input at top, list of 14 cities (Melbourne, Sydney, Brisbane, Perth, Adelaide, Auckland, London, Manchester, Toronto, New York, Houston, Atlanta, Lagos, Accra), "Detect my location" button
- **On city select:** modal closes with 200ms fade, pill text updates to new city, page data refetches for new city, cookie `el_location` updates
- **Edge case - location not detected:** pill defaults to "Melbourne" with lighter colour + tooltip "Set your city for personalised events"
- **Edge case - no events in chosen city:** rail sections show "No events in [city] yet" with CTA "Be the first to host in [city]" + "Browse events in other cities" link

### 1.5 "Sign in" ghost link
- **Click:** navigate to `/login`
- **Hover:** text colour transitions ink-700 → gold-700
- **Edge case - already logged in:** the "Sign in" link is replaced with the user's avatar + initials, clicking opens account menu (Dashboard, My tickets, My squads, Sign out)

### 1.6 "Get started" gold button
- **Click:** navigate to `/signup`
- **Hover:** bg gold-500 → gold-400, translate-y -1px, gold-tinted shadow grows
- **Active/pressed:** scale(0.98)
- **Edge case - already logged in:** button changes to "Dashboard" and navigates to `/dashboard`

---

## 2 - Hero interactions

### 2.1 Background video / Ken Burns still
- **Not interactive** - decorative
- **Behaviour:** autoplay muted loop (video) OR 24-second Ken Burns zoom (still)
- **Prefers-reduced-motion:** video still plays (no animation); Ken Burns disables scale animation
- **Source priority:** (1) featured event's organiser-uploaded video, (2) Pexels category video for featured event category, (3) curated crowd still + Ken Burns
- **Never uses:** organiser's cover image as hero background

### 2.2 "Made for the diaspora" eyebrow pill
- **Not interactive** - brand decoration only

### 2.3 H1 "Where the culture gathers."
- **Not interactive**
- **Typography:** `clamp(3.5rem, 8vw, 6.5rem)` - 56px mobile, 104px desktop
- **Gold accent:** "culture" is `text-gold-400`
- **Mobile behaviour:** sits above the ribbon card (which drops below subcopy)

### 2.4 Live count strip ("156 events live · 23 cities · This week")
- **Click:** navigate to `/events` (implicit: "show me all live events")
- **Hover:** subtle underline on the count numbers
- **Data source:** live count of events where `status='published'` AND `visibility='public'` AND `start_date >= now`
- **Edge case - 0 events:** strip hides entirely (never show "0 events live now")
- **Edge case - < 10 events:** strip shows "[N] events live now · [M] cities" and drops "This week" (too granular to be impressive at low counts)

### 2.5 "Get tickets" gold CTA
- **Click:** if featured event exists → `/events/[featuredEvent.slug]`; else → `/events`
- **Hover:** gold-500 → gold-400, translate-y -2px, shadow grows to `rgba(212,160,23,0.45)`
- **Mobile:** full-width on screens < 640px (stacks below outline CTA)

### 2.6 "Browse all events" outline CTA
- **Click:** `/events`
- **Hover:** border white/25 → white/50, bg white/5 → white/10

### 2.7 "Happening soon" ribbon card
- **Click anywhere on card body:** `/events/[featuredEvent.slug]`
- **Click "View event →" CTA specifically:** same destination, card-level click extends hit area
- **Hover:** no lift (fixed position), the CTA button inside hovers normally (gold-500 → gold-400)
- **Edge case - no featured event:** card hides entirely; H1 + subcopy + live count + CTAs expand to fill available space
- **Edge case - featured event sold out:** ribbon becomes `Sold out` state with `View event` replaced by `Join waitlist` (coral outline CTA)
- **Coral pulse dot:** shows count of tickets sold *today* - if 0, dot hides and "tickets sold today" line removed
- **Mobile:** card drops full-width below the CTAs, becomes a stacked block

---

## 3 - Bento grid interactions

### 3.1 Event tile (any size - hero, wide, standard, compact)
- **Click anywhere on tile:** navigate to `/events/[slug]`
- **Hover:** tile lifts 4px (translate-y -4), shadow grows, inner image scales 108%
- **Hover on tiles with video:** after 500ms hover delay, SmartMedia swaps image → video, autoplay muted. On mouse leave, video pauses, currentTime resets to 0. Uses existing `kind: 'video'` + `hovered` state in SmartMedia.
- **Keyboard focus:** gold-400 ring 2px with 2px offset, no other change. On Enter/Space → navigate to event
- **Mobile tap-to-open video preview:** long-press (500ms) on tile plays video inline; release exits

### 3.2 Category pill (e.g. "Music", "Nightlife")
- **Click propagation:** pill is `pointer-events: none` - click passes through to tile (tile navigates to event, not to category). Category filtering happens from `/events` page, not from homepage pills.

### 3.3 "Featured" gold pill (hero tile only)
- **Not interactive**
- **Logic:** only appears on the hero tile. Never on other tiles.

### 3.4 "Trending" coral pill (on wide tile when applicable)
- **Click:** `/events?sort=trending` (optional - can be non-interactive)
- **Logic:** appears when event's `percent_sold > 70%`

### 3.5 Heart save button (top-right of every tile)
- **Click (not logged in):** opens auth modal "Sign in to save events" with Google + email options
- **Click (logged in):** toggles saved state
  - Empty heart → filled gold heart with 200ms scale pop
  - Calls `POST /api/saved-events` with event ID
  - Optimistic UI update (heart fills immediately, reverts on API failure)
  - Toast "Saved to your list" with "View saved" action link
- **Click on already-saved:** removes save, heart goes empty, toast "Removed from saved"
- **Event propagation:** `e.preventDefault()` + `e.stopPropagation()` - clicking heart does NOT navigate to event
- **Keyboard:** Tab-focusable, Enter/Space toggle. aria-pressed reflects state, aria-label is "Save [event title]" or "Remove [event title] from saved"
- **Edge case - heart spam click:** debounced to 300ms between calls

### 3.6 Free Weekend tile (brand gradient, no image)
- **Click:** navigate to `/events?price=free` (filter)
- **Hover:** tile lifts same as other bento tiles; gold "FREE" tag subtly pulses (200ms brightness boost)
- **Logic:** tile is always present if there are any free events upcoming; hides entirely if zero free events exist (rare given 0% platform fee incentive)

---

## 4 - Section header (used across all sections)

### 4.1 Eyebrow text (e.g. "This week", "By city")
- **Not interactive** - always gold-600, tracking-widest, uppercase caption

### 4.2 Section title (H2, e.g. "What's happening near you")
- **Not interactive**

### 4.3 "View all events →" / "Explore culture →" section link (top-right)
- **Click:** navigate to section-appropriate URL - `/events`, `/events?date=week`, `/events?date=weekend&price=free`, `/events?sort=trending`, etc.
- **Hover:** gold-600 → gold-700
- **Arrow:** slides right 2px on hover

---

## 5 - Horizontal rail interactions (applies to This Week, Cultural Picks, By City, Fans also viewed)

### 5.1 Rail itself (scroll container)
- **Touch/trackpad:** native horizontal scroll with CSS scroll-snap
- **Mouse drag:** click-drag not supported (conflicts with card click) - mouse users use arrow buttons instead
- **Keyboard:** arrow keys Left/Right scroll the rail one card-width at a time when rail has keyboard focus. `Home` key scrolls to start. `End` key scrolls to last card.

### 5.2 Scroll progress bar (bottom of rail)
- **Not interactive** (display only)
- **Behaviour:** thumb width represents visible portion of total rail width. Thumb position reflects `scrollLeft` percentage. Updates live via scroll event listener (throttled to 16ms for 60fps).

### 5.3 Arrow buttons (top-right of rail, desktop only)
- **Left arrow click:** scrolls rail one card-width (280px + 16px gap = 296px) to the left
- **Right arrow click:** scrolls rail one card-width to the right
- **Hover:** border ink-200 → gold-500, chevron colour ink-700 → gold-600
- **Disabled state:** left arrow at scrollLeft=0 → opacity 0.4, cursor not-allowed. Right arrow at scrollLeft=max → same.
- **Keyboard:** Tab-focusable, Enter/Space activates
- **Mobile:** arrows hidden (`display: none` below 640px) - swipe only

### 5.4 Rail card (any card in any rail)
- **Click anywhere on card body:** navigate to `/events/[slug]`
- **Hover:** lift translate-y -4, shadow grows, inner image scales 106%
- **Heart button:** top-right on image. Same behaviour as bento heart button (Section 3.5).
- **Focus:** gold-400 ring 2px
- **Edge case - sold out:** "Selling fast" urgency tag replaced with "Sold out" in ink-500. Card still clickable; leads to event detail which shows sold-out UX.
- **Edge case - free event:** price row shows "Free" in gold-600 (instead of "From AUD $X")

---

## 6 - Cultural Picks tab interactions

### 6.1 Tab buttons (All, Afrobeats, Amapiano, Gospel, Owambe, Caribbean)
- **Click inactive tab:** 200ms opacity crossfade of rail content, URL updates to `#culture-[slug]`, tab pill fills gold-500
- **Hover:** border ink-200 → gold-400, text → gold-700
- **Active state:** `bg-gold-500 text-ink-900 border-gold-500 font-weight-700`
- **Keyboard:** Tab-focusable, Enter/Space activates, Arrow Left/Right cycles through tabs
- **ARIA:** `role="tab"`, `aria-selected` reflects active, `aria-controls="culture-rail"` points to the rail below

### 6.2 Rail beneath tabs
- **Updates based on active tab:** filters events by `tags` array containing the tab's slug
- **Edge case - 0 events for tab:** tab hides entirely (does not render). If All is empty AND no tabs remain, entire Cultural Picks section hides.
- **Edge case - network error loading:** rail shows 6 skeleton cards with pulse animation; after 10s failed retry, empty state with "Try again" button

---

## 7 - Live Vibe marquee interactions

### 7.1 Marquee strip
- **Hover on any part:** animation pauses (CSS `animation-play-state: paused`)
- **Keyboard focus within:** animation pauses
- **Reduced motion:** animation disabled entirely (`@media (prefers-reduced-motion: reduce)`)
- **Mobile tap-to-pause:** not implemented - users can scroll naturally; marquee continues

### 7.2 Individual vibe items (each link)
- **Click:** navigate to the linked event's `/events/[slug]`
- **Hover:** colour transitions white/90 → gold-400
- **Focus:** gold-400 colour + gold-400 underline
- **Edge case - no signals generated:** marquee renders fallback signals ("New events dropping every week in Melbourne, Sydney, London and Lagos") - never renders empty
- **Edge case - < 4 signals:** signals array is duplicated 3x instead of 2x to maintain marquee rhythm

---

## 8 - By City carousel interactions

### 8.1 City tile
- **Click:** navigate to `/events?city=[citySlug]`
- **Hover:** tile lifts translate-y -4, shadow grows, inner image scales 110%
- **Focus:** gold-400 ring
- **Edge case - 0 events in city:** count line reads "Coming soon" instead of "0 upcoming events" - tile still clickable but destination shows empty-city state with "Be the first to host in [city]" CTA

### 8.2 Rail mechanics
- **Identical to Section 5** (scroll, arrow buttons, progress bar, keyboard)

---

## 9 - Social proof interactions

### 9.1 Organiser logo wordmark
- **Click:** navigate to `/organisers/[organiserSlug]` (public profile page with their events)
- **Hover:** opacity 0.7 → 1.0, text white
- **Focus:** 2px gold-400 ring outlined around the wordmark bounds
- **Edge case - fewer than 6 organisers have logos:** entire section hides (rendered as `return null`)

---

## 10 - For Organisers section interactions

### 10.1 "Start selling tickets" gold CTA
- **Click:** `/organisers/signup`
- **Hover:** gold-500 → gold-400, translate-y -1, shadow grows
- **Edge case - already logged in as organiser:** CTA text changes to "Create event", navigates to `/dashboard/events/create`

### 10.2 "View pricing" outline CTA
- **Click:** `/pricing`
- **Hover:** border white/20 → white/40

### 10.3 Feature bullet rows (the 5 checkmarked items)
- **Not interactive** - read-only

### 10.4 Stat cards (0%, 2-tap, 5+, 24/7)
- **Not interactive** - read-only. Could become clickable in v2 (each stat deep-links to a pricing-explainer anchor), but not required for M4.5.

### 10.5 Testimonial card
- **Click:** navigate to `/events/[testimonialEvent.slug]` (the event referenced in the quote)
- **Hover:** subtle border-left width 3 → 4px, text slightly brightens
- **Edge case - no testimonial available:** hide card entirely

---

## 11 - Footer interactions

### 11.1 Logo
- **Click:** `/`
- **Hover:** gold dot pulses, rest unchanged

### 11.2 Social icons (Instagram, TikTok, X)
- **Click:** open respective platform in new tab with `rel="noopener noreferrer"`
- **Hover:** border gold-500, icon colour gold-400
- **Focus:** 2px gold-400 ring

### 11.3 Footer column links (Browse events, Afrobeats, etc.)
- **Click:** navigate to respective URL
- **Hover:** white/75 → gold-400

### 11.4 "© 2026 EventLinqs" / tagline line
- **Not interactive**

---

## 12 - Global error & edge-case states

### 12.1 Page-level data fetch failure
- **Behaviour:** each section handles its own fetch independently. A failure in "This Week" rail does NOT prevent the Hero, Bento, or Cultural Picks from rendering.
- **Visual:** failing section shows minimal error state - small text "We couldn't load this right now. Refresh to try again." in ink-500, with retry button in gold-outline style
- **Never:** a blank page. Never a full-page error.

### 12.2 Slow connection (throttled 3G)
- **Hero:** SSR delivers HTML immediately; background image/video lazy-loads after initial paint
- **Rails:** SSR delivers card text + placeholder image blurs; images stream in as they load
- **Target:** LCP < 2.5s on 3G. FID < 100ms.

### 12.3 User has JavaScript disabled
- **What works:** all SSR content visible (hero, bento, all rails, text). All navigation links work.
- **What breaks:** heart save buttons (shown but clicking does nothing - noscript fallback: links to `/login` with toast "Save events after signing in"), horizontal rail arrow buttons (hidden via `noscript` CSS - users scroll natively), tab interactions (tabs become `<a href="#culture-afrobeats">` anchor links with SSR-rendered all-content-visible fallback).
- **Target:** entire homepage is browsable and events purchasable with JS off.

### 12.4 Screen reader user
- **Every image has alt text** (auto-generated from event title + " - " + category if not provided)
- **Every interactive element has accessible name** (either visible text or aria-label)
- **Section landmarks:** `<header>`, `<main>`, `<nav>`, `<footer>`, `<section aria-labelledby="...">`
- **Skip link:** "Skip to main content" hidden link at top of DOM, visible on Tab focus
- **Announce changes:** tab switches in Cultural Picks use `aria-live="polite"` on rail container

### 12.5 User at 320px width (iPhone SE)
- **Nav:** logo + hamburger only. Melbourne pill hidden. "Get started" moves into hamburger sheet.
- **Hero:** stacked vertically. H1 → subcopy → live count → CTAs → ribbon card (full width).
- **Bento:** becomes single-column stack, each tile full width, 4:3 aspect.
- **Rails:** full-bleed scroll, 240px card width, arrow buttons hidden.
- **By City:** 220px card width.
- **Social proof:** logo grid becomes 2 columns × 6 rows.
- **For organisers:** stack vertical, stats grid 2×2.
- **Footer:** columns stack vertical.

### 12.6 User at 1920px+ ultra-wide
- **Container:** `max-width: 1280px` remains - content never exceeds this width. Outer margins grow.
- **Background sections (ink-900, gradient):** full-bleed. Content contained at 1280px centred.

### 12.7 User sees a "Coming soon" or not-yet-built feature
- **Pattern:** interaction shows a branded toast "Coming in May" with a "Notify me" button that collects email via Resend
- **Never:** clicking does nothing silently. Never shows "Not implemented" error.

---

## 13 - Performance budgets

| Metric | Target | Budget |
|---|---|---|
| First Contentful Paint | < 1.2s | P95 |
| Largest Contentful Paint (hero) | < 2.5s | P95 |
| Cumulative Layout Shift | < 0.05 | P95 |
| First Input Delay | < 100ms | P95 |
| Total bundle (JS, gzipped) | < 150KB | First load |
| Hero image | < 200KB | WebP, lazy after LCP |
| Rail card images | < 50KB each | WebP, lazy below-fold |
| Pexels fallback | Cached 24h | unstable_cache |

---

## 14 - Acceptance criteria

The homepage is "done" when:

1. Every interaction in this document works as specified on desktop and mobile
2. Every edge case in Section 12 is handled gracefully
3. Every button/link has a visible hover, focus, and active state
4. No dashed-border empty boxes exist anywhere
5. No stale Tailwind tokens (bg-gray-50, bg-blue-*, etc.) - only design system tokens
6. No unicode escapes rendered as literal text
7. No em-dashes or en-dashes as punctuation in copy
8. No exclamation marks anywhere
9. Australian English throughout (organiser, favourite, colour)
10. Gold appears on < 5% of visible viewport at any scroll position
11. Every horizontal rail has a scroll progress bar
12. Every section either shows real content or hides entirely - never a dashed empty state
13. Lighthouse scores: Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 95, Performance ≥ 85 on mobile
14. `npm run lint` passes, `npm run build` passes, `npx tsc --noEmit` passes

---

End of interaction map.
