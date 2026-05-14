# Batch 9.1 GATE 2 - Existing SiteHeader Audit

Date: 2026-05-09
Branch: redesign/world-class-rebuild-2026-05-03

## File locations

The brief notes "or wherever the audit gate locates the current header".
Located at:

- Server wrapper: `src/components/layout/site-header.tsx` (19 lines)
- Client inner: `src/components/layout/site-header-client.tsx` (~340 lines)
- Search trigger: `src/components/layout/nav-search.tsx`

These differ from the brief's hypothetical path
(`src/components/features/navigation/site-header.tsx`); we work in the
established layout/ directory and document the deviation here.

## Section-by-section verdict

### 1. Header container element + positioning

**Current:**
```html
<header className="sticky top-0 z-50 w-full border-b border-ink-100 bg-white/95 backdrop-blur-sm">
  <div className="mx-auto flex h-16 max-w-7xl items-center gap-5 px-4 sm:px-6 lg:px-8">
```

Single state - white/95 + backdrop-blur-sm at every scroll position. No
scroll intelligence. No transparent-over-hero treatment.

**Verdict: REBUILD.** Violates Section 6.2 (State A transparent over
hero) of the brief. Need dual-state with sentinel-based detection.

### 2. Logo render component

**Current:** `<EventlinqsLogo asLink size="md" />` from
`@/components/ui/eventlinqs-logo`. Wordmark + gold dot, links to home.

**Verdict: PRESERVE.** Existing brand component. The brief mandates
white wordmark + gold dot in both states; the existing logo already
supports a `colour` prop and we can pass `white` from the new header.

### 3. Primary nav items

**Current:**
- Browse Events -> `/events`
- For Organisers -> `/organisers`

Two items only. Brief calls for: Browse / Cultures / Cities / For
Organisers (four items).

**Verdict: REBUILD (partial).** Add Cultures and Cities entries.

### 4. Mobile hamburger + drawer

**Current:** Focus trap, Escape close, body scroll lock, backdrop click,
44px touch target, `aria-expanded` + `aria-controls`. Solid white sheet.

**Verdict: PRESERVE.** Well built. Mobile drawer ergonomics meet WCAG.
The sheet's bg can stay white; only the trigger/header colours need to
adapt to State A vs State B.

### 5. Inline search

**Current:** `<NavSearch variant="desktop" />` always visible in
desktop centre + `<NavSearch variant="mobile" />` always visible as a
second row below the nav on mobile.

**Verdict: REBUILD.** Brief Section 6.3 mandates conditional display:
hidden in State A so the hero breathes, visible only in State B on
desktop. Mobile loses the second row entirely; mobile search lives in
the new search overlay accessed via header search icon.

### 6. Sign-in + auth

**Current:** Plain anonymous Link to `/login`. No authenticated avatar
state surfaced.

**Verdict: PRESERVE for v1.** Authenticated avatar dropdown is a future
enhancement; the brief does not require it for 9.1.

### 7. Get-tickets primary CTA

**Current:** `Button href="/signup" variant="primary" size="sm"` labelled
"Get Started" - routes to organiser signup.

**Verdict: REBUILD.** Brief Section 6.7 calls for "Get Tickets" routing
to `/events`. The signup CTA is the organiser-acquisition flow which
already lives in the dedicated For Organisers nav entry; the primary
CTA should drive ticket buyers to event browsing.

### 8. Scroll listener / observer / scroll-state hook

**Current: none.** No scroll-driven behaviour anywhere in the header.

**Verdict: NET-NEW.** Build IntersectionObserver-based sentinel + React
hook per Section 6.5 of the brief.

### 9. Z-index strategy

**Current:**
- Header: z-50
- Mobile drawer backdrop: z-40
- Mobile drawer sheet: z-50

The MobileBottomNav shipped Batch 9 V2 also uses z-40. SurpriseMe modal
uses z-[60]. No conflict between header and bottom-nav (they occupy
different bands).

**Verdict: PRESERVE.** Header at z-50 is correct. Search overlay (new
in 9.1) needs to sit at z-60 to overlay both header and bottom-nav.

### 10. Focus management + skip-to-content

**Current:**
- Focus trap inside mobile drawer: yes
- Escape closes drawer + restores focus to hamburger: yes
- Skip-to-content link: NOT FOUND in the layout chain. App layout has
  no `<a href="#main-content" class="sr-only focus:not-sr-only">`.

**Verdict: REBUILD (partial).** Add skip-to-content link as the first
focusable element on every page; existing focus trap and escape
handling are PRESERVE.

## Token + system audit

### Typography

Existing nav uses `text-sm font-medium`. Matches Design System Section
4. PRESERVE.

### Colour values

Existing uses Tailwind palette aliases (`text-ink-600`, `text-gold-600`,
`bg-white/95`, `border-ink-100`, `text-ink-700`, `text-ink-900`). No
hardcoded hex. PRESERVE for current colours; new dual-state values
introduce `rgba(10, 22, 40, 0.72)` (navy with alpha) and
`rgba(212, 164, 55, 0.30)` (gold edge) which need documenting in
Section 6.4 of the Design System.

### Spacing tokens

`gap-5`, `gap-6`, `gap-3`, `px-4 sm:px-6 lg:px-8`, `h-16`, `h-9`, `h-11`
- all on the 4px grid. PRESERVE.

### Media Architecture

Header carries no images. EventlinqsLogo is an SVG-via-component
(no raster). PRESERVE.

### MobileBottomNav coexistence

Current mobile header carries: logo + Get Started + hamburger + a
mobile search row.

MobileBottomNav (shipped Batch 9 V2) carries: Home / Browse / Search
/ Saved / Account.

Brief mandates de-duplication:
- Mobile header drops the always-visible NavSearch (now lives in the
  search overlay accessed by an icon).
- Mobile drawer drops Browse, Saved, Tickets, Account (already in
  bottom nav). Drawer keeps Cultures, Cities, For Organisers, Pricing,
  Help.

**Verdict: REBUILD.** Mobile drawer items must change; the always-
visible mobile NavSearch row must go.

## Verdict summary

| Section | Verdict |
|---------|---------|
| Header container + scroll intelligence | REBUILD |
| Logo | PRESERVE |
| Primary nav items | REBUILD (add Cultures + Cities) |
| Mobile drawer mechanics | PRESERVE |
| Inline search visibility | REBUILD (State B desktop only) |
| Sign-in flow | PRESERVE |
| Primary CTA | REBUILD (Get Tickets -> /events) |
| Scroll observer | NET-NEW |
| Z-index strategy | PRESERVE (search overlay = NET-NEW at z-60) |
| Focus management | PRESERVE (focus trap) + REBUILD (skip-to-content) |
| Mobile drawer items | REBUILD (de-dup with MobileBottomNav) |
| Mobile NavSearch row | REMOVE |

## Blockers / coordination

None. All proposed changes stay inside the Section 7 authorised paths.
HeroPresenceProvider integration with HeroMedia uses composition only -
HeroMedia itself is not mutated.
