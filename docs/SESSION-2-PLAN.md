# Session 2 Build Plan - Design System Token Rollout + Homepage + Events Listing

**Date:** 13 April 2026
**Scope:** Apply DESIGN-SYSTEM.md v2.0 to the foundation layer and two public pages
**Do not write any code during planning - this document is the approved blueprint**

---

## 0. Context: Where We Are

The codebase is functional but pre-brand. Current state:

| Layer | Current state | Problem |
|---|---|---|
| CSS tokens | Old v1 palette in `globals.css` (accent `#4A90D9`, no gold) | Wrong brand - everything is blue |
| Fonts | Inter only, via `next/font/google` | Manrope missing - no display type |
| Homepage (`/`) | Placeholder div, hardcoded hex values | Not a real page - no hero, no sections |
| Events listing (`/events`) | Functional but blue/gray, no design tokens | Wrong palette, sidebar doesn't match spec |
| Event cards | `aspect-video` 16:9, blue accents, no category pill on overlay | Doesn't match card spec in §6.2 |
| Bottom nav | Exists | Keep, apply new tokens |
| Filter drawer | Session 1 - complete (`d0c71ba`) | Extend per §6.5 additions |

---

## 1. Dependencies

### 1a. New npm packages required

None. All needed dependencies are already installed:
- `next/font/google` - handles Manrope + Inter loading (no new package)
- `lucide-react` - already installed, needed for ChevronDown, Heart, MapPin icons
- Tailwind CSS 4 - already installed, CSS-variable token approach works with `@theme inline`

### 1b. Google Fonts - Manrope

Loading strategy in `src/app/layout.tsx`:

```ts
import { Inter, Manrope } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
  weight: ['400', '500'],
})

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['600', '700', '800'],
})
```

Both passed as `className` to `<body>`. This triggers `next/font` to self-host and preload - no Google CDN request at runtime. Preloads only the weights specified (performance §13 compliance).

**Risk:** Manrope is a variable font; `next/font` will download the full variable axis range for the listed weights. Budget impact: ~40KB additional WOFF2. Acceptable within the 200KB JS first-load budget (this is CSS, not JS).

---

## 2. Token Plan

### 2a. What changes in `src/app/globals.css`

The entire `@theme inline` block is replaced. New tokens follow DESIGN-SYSTEM.md §3-5 exactly.

**Colour tokens (§3):**

```css
/* Primary palette */
--color-gold-500: #D4A017;
--color-gold-600: #B88612;
--color-gold-400: #E8B738;
--color-gold-100: #FBF4DC;
--color-coral-500: #FF4E3A;
--color-coral-600: #E63E2C;
--color-coral-100: #FFE4DF;

/* Neutrals */
--color-ink-900: #0A1628;
--color-ink-800: #1A1A1A;
--color-ink-600: #4A4A4A;
--color-ink-400: #8A8A8A;
--color-ink-200: #D9D9D6;
--color-ink-100: #EFEDE8;
--color-canvas: #FAFAF7;
--color-white: #FFFFFF;

/* Semantic */
--color-success: #0F9D58;
--color-warning: #F59E0B;
--color-error: #DC2626;
--color-info: #0EA5E9;
```

**Typography tokens (§4):**

```css
--font-display: var(--font-manrope), system-ui, -apple-system, sans-serif;
--font-body: var(--font-inter), system-ui, -apple-system, sans-serif;
--font-mono: 'JetBrains Mono', ui-monospace, monospace;

/* Fluid type scale - clamp(mobile, fluid, desktop) */
--text-display-3xl: clamp(4rem, 8vw, 6.5rem);
--text-display-2xl: clamp(3.5rem, 6vw, 5.5rem);
--text-display-xl: clamp(2.75rem, 4.5vw, 4rem);
--text-display-lg: clamp(2rem, 3.5vw, 3rem);
--text-heading-xl: clamp(1.5rem, 2.25vw, 2rem);
--text-heading-lg: 1.25rem;
--text-heading-md: 1.125rem;
--text-body-lg: 1.125rem;
--text-body: 1rem;
--text-body-sm: 0.875rem;
--text-caption: 0.75rem;
```

**Spacing tokens (§5):** `--space-1` through `--space-32`, mapping 4px grid.

**Motion tokens (§11):**

```css
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
```

**Focus-visible ring** updated from blue `#4A90D9` → gold `--color-gold-400`.

**Body background** changed from `--background: #ffffff` → `--color-canvas: #FAFAF7`.

**Dark mode block** removed entirely - deferred to Phase 2 per §3 note.

### 2b. Tailwind usage convention

All new code uses Tailwind's `theme()` references OR arbitrary values only for one-offs. Example:
- `bg-[--color-gold-500]` not `bg-[#D4A017]`
- Never raw hex in className strings

---

## 3. Files Touched - Complete List

In dependency order (each row must be complete before the next group starts):

### Group 1 - Token Foundation (must be first, unblocks everything)

| # | File | Change | Lines est. |
|---|---|---|---|
| 1 | `src/app/globals.css` | Full token block replacement - colours, type, spacing, motion, body font, focus ring | ~80 → ~140 |
| 2 | `src/app/layout.tsx` | Add Manrope import, apply both font variables to `<body>`, set `lang="en"` on html | 36 → ~48 |

**No code in Group 2+ can be written until Group 1 is committed and verified in browser.**

### Group 2 - Shared Components (block every public page)

| # | File | Change | Lines est. |
|---|---|---|---|
| 3 | `src/components/layout/site-header.tsx` | NEW - top nav per §7.1: sticky, Logo (text "EVENTLINQS"), Browse, For Organisers, Sign in, Get Started CTA | ~80 |
| 4 | `src/components/layout/site-footer.tsx` | NEW - dual-pattern footer per §6.8: mobile accordion + desktop 4-col dark grid | ~180 |
| 5 | `src/components/features/events/event-card.tsx` | NEW - full card component per §6.2: 4:3 desktop / 16:9 mobile, category pill overlay, heart save, price tag, social proof badge | ~120 |

**Note:** `site-header.tsx` and `site-footer.tsx` are new files. `event-card.tsx` extracts what is currently inlined in `events/page.tsx`.

### Group 3 - Page Rewrites

| # | File | Change | Lines est. |
|---|---|---|---|
| 6 | `src/app/page.tsx` | Full homepage per §7.1: Pattern A cinematic hero (Unsplash API, category Afrobeats), TRENDING NOW carousel section stub, CULTURE PICKS section stub, FOR ORGANISERS split section, social proof band stub, SiteHeader + SiteFooter | ~220 |
| 7 | `src/app/events/page.tsx` | Apply new tokens throughout, replace blue with gold, use EventCard component, update sidebar to collapsible group pattern per §6.4, update search input per §6.9 | ~320 → ~280 (refactoring to EventCard reduces lines) |

### Group 4 - Filter Sidebar Extraction

| # | File | Change | Lines est. |
|---|---|---|---|
| 8 | `src/components/features/events/filter-sidebar.tsx` | NEW - desktop-only collapsible sidebar per §6.4: WHEN (expanded), CATEGORY (top 5 + show more), PRICE (collapse), CULTURE/LANGUAGE (collapsed + top 6) | ~200 |
| 9 | `src/components/features/events/events-filter-strip.tsx` | UPDATE - add active filter count badge to trigger, sticky "Show X results" button at bottom of mobile drawer per §6.5 | +~30 lines |

### Group 5 - Token Audit Pass

| # | File | Change |
|---|---|---|
| 10 | `src/components/layout/bottom-nav.tsx` | Apply gold/ink tokens - currently uses Tailwind default blue |
| 11 | `src/components/inventory/social-proof-badge.tsx` | Update badge colours to use coral-500 (trending), gold-100/gold-600 (near-sold-out) |

---

## 4. Order of Operations

```
Step 1 ── globals.css token block replacement
           layout.tsx font + body update
           ↓
           VERIFY: run dev server, confirm canvas bg, gold focus ring,
           Manrope visible on any text element with font-display class

Step 2 ── site-header.tsx (new file)
           site-footer.tsx (new file)
           event-card.tsx (new file)
           ↓
           VERIFY: isolated Storybook-style check - add header to page.tsx
           temporarily, confirm sticky behaviour, gold CTA, focus ring

Step 3 ── page.tsx (homepage rewrite)
           ↓
           VERIFY: 5 viewports (375, 393, 414, 768, 1280)
           hero height, search bar sticky, font rendering

Step 4 ── filter-sidebar.tsx (new)
           events-filter-strip.tsx (update)
           events/page.tsx (update)
           ↓
           VERIFY: 5 viewports - sidebar visible on 1280 only,
           filter drawer on mobile, gold active states, CULTURE group present

Step 5 ── Token audit pass on bottom-nav + social-proof-badge
           ↓
           VERIFY: final 5-viewport full-page screenshots
```

**Atomic commits per step.** Never commit a step with broken TypeScript (run `tsc --noEmit` before each commit).

---

## 5. Self-Verification at 5 Viewports

After every Group 2+ step, verify visually at these exact widths in browser devtools (device pixel ratio 2.0):

| Viewport | Device ref | What to check |
|---|---|---|
| **375px** | iPhone SE / older Android | Hero fills screen, single card col, bottom nav visible, no horizontal scroll |
| **393px** | iPhone 15 Pro | Dynamic Island safe area, hero `520px` height, filter chip strip |
| **414px** | iPhone 14 Plus | Card image 16:9 edge-to-edge, price tag reads correctly |
| **768px** | iPad mini / tablet | Filter chip strip not sidebar, 2-col card grid, hero 560px+ |
| **1280px** | Desktop target | Sidebar visible (280px), 3-col card grid, Pattern A hero full bleed |

### Checklist per viewport

- [ ] No horizontal overflow (`document.body.scrollWidth === window.innerWidth`)
- [ ] `--canvas` (`#FAFAF7`) is page background - not pure white, not gray-50
- [ ] Gold `#D4A017` visible on CTAs - not blue, not electric blue
- [ ] Manrope rendering on H1/section titles (check computed font in inspector)
- [ ] Touch targets ≥ 44×44px (inspect any button)
- [ ] Focus ring is gold, not blue - Tab through page to verify
- [ ] Category pill absolute-positioned on card image (not below image)
- [ ] Heart icon present on card, bottom-right
- [ ] Price shows "From AUD $X" not bare number

---

## 6. Benchmarks vs TM and DICE

Each page deliverable is evaluated against these specific patterns before the session ends:

### Homepage

| Pattern | Ticketmaster does | DICE does | EventLinqs target |
|---|---|---|---|
| Hero | Full-bleed photo, left text, primary CTA | Bold display type, no photo (B&W) | Pattern A: full-bleed photo + left text + gold pill CTA |
| Above-fold section order | Hero → trending carousel | Hero → city-based events | Hero → search bar → TRENDING NOW → CULTURE PICKS |
| Section header | Eyebrow + title + "View all" | Bold uppercase only | Eyebrow + gold bar (32×2px) + title + "View all >" |
| Footer mobile | 5+ accordions, cluttered | 3 accordions, minimal | 3 accordions + social icons, <600px total height |

**Pass criteria:** Side-by-side screenshot at 375px and 1280px - EventLinqs hero should look as premium as TM and as confident as DICE, with more cultural warmth than either.

### Events listing

| Pattern | Ticketmaster | DICE | EventLinqs target |
|---|---|---|---|
| Card image | 4:3 landscape, large | Square 1:1 | 4:3 desktop, 16:9 mobile edge-to-edge |
| Filter sidebar | Long list, all expanded, overwhelming | Not present on web (app only) | Collapsible groups, top 5 visible, show more |
| Cultural filter | None | None | CULTURE/LANGUAGE group - our moat |
| Card price | Prominent, bold | No price until tap | "From AUD $XX", Manrope 700 |

**Pass criteria:** The filter sidebar at 1280px must not look like a wall of checkboxes. The CULTURE/LANGUAGE group must be present and visually distinct.

---

## 7. Rollback Plan

### What can go wrong

| Risk | Likelihood | Recovery |
|---|---|---|
| Manrope fails to load (Google Fonts blocked) | Low | Font stack falls back to `system-ui` - layout is preserved, no crash |
| CSS token syntax error crashes Tailwind build | Medium | `globals.css` is a single file - `git checkout HEAD -- src/app/globals.css` restores in 5 seconds |
| Homepage rewrite breaks auth flow | Low | Homepage has no auth logic - only Link elements. Auth routes untouched |
| `events/page.tsx` rewrite breaks search/filter | Medium | All filter logic is server-side in query builder - keep identical query logic, only change JSX/styles |
| EventCard component has type mismatch | Low | TypeScript strict mode will catch at `tsc --noEmit` before commit |

### Git strategy

- Each Step (1-5) is a separate commit
- If Step 3 (homepage) is broken, `git revert` restores the placeholder without touching token work from Steps 1-2
- If entire session needs rollback: `git revert HEAD~N --no-edit` for N commits
- No squashing during session - preserve atomic history for surgical rollback

### Pre-session snapshot

Before writing any code, run:
```bash
git stash  # if any WIP exists
git log --oneline -5  # confirm clean HEAD
```

Current clean HEAD is `dd9a062` (design system doc commit). All session code starts from this SHA.

---

## 8. Out of Scope for Session 2

These items are **explicitly not in scope** - do not build them:

- Unsplash API integration (homepage hero uses a static placeholder image or gradient for now - API wired in Session 3)
- TRENDING NOW carousel data (real data wired in Session 3 - Session 2 renders the layout with static/empty state)
- CULTURE PICKS sub-tabs with live data (layout only)
- Event detail page (`/events/[slug]`) redesign - Session 3
- Checkout redesign - Session 3+
- Organiser dashboard redesign - Session 5+
- PostHog analytics instrumentation - Session 4
- Dark mode - Phase 2
- iOS/Android app badges in footer - post-app-launch

---

## 9. Session 2 Token Budget (Approximate)

| Task | Est. tokens |
|---|---|
| globals.css rewrite | ~1,500 |
| layout.tsx update | ~800 |
| site-header.tsx (new) | ~2,000 |
| site-footer.tsx (new) | ~3,500 |
| event-card.tsx (new) | ~2,500 |
| page.tsx (homepage full rewrite) | ~5,000 |
| events/page.tsx (token + component refactor) | ~4,000 |
| filter-sidebar.tsx (new) | ~4,000 |
| events-filter-strip.tsx (update) | ~1,000 |
| bottom-nav + social-proof-badge audit | ~1,000 |
| **Total estimate** | **~25,300** |

Well within a single session. No need to split.

---

## 10. Definition of Done

Session 2 is complete when:

1. `tsc --noEmit` passes with zero errors
2. `globals.css` uses v2.0 tokens exclusively - no `#4A90D9` or `#1A1A2E` raw hex remaining in any modified file
3. Manrope confirmed rendering in browser inspector on H1 and at least one section title
4. Homepage `/` passes 5-viewport checklist (§5)
5. Events listing `/events` passes 5-viewport checklist (§5)
6. CULTURE/LANGUAGE filter group visible and collapsible at 1280px
7. Event cards show category pill on image overlay, heart icon, "From AUD $X" price
8. Focus ring is gold (`--color-gold-400`) on Tab through homepage - not blue
9. No horizontal scroll at 375px on either page
10. All commits have `tsc --noEmit` clean - no WIP commits

---

*Plan locked: 13 April 2026. Start coding when Lawal approves.*
