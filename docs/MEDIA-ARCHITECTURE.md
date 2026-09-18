# Media Architecture - EventLinqs Platform Standard

**Status:** Authoritative. Every page, every component, every PR.
**Date:** 2026-04-26
**Owner:** Platform / Performance
**Enforced by:** ESLint rules (`eslint.config.mjs`) + Lighthouse CI gate (`lighthouserc.json`)

This document defines **how media works on EventLinqs**. The audit (`MEDIA-AUDIT.md`) shows what exists today; the inconsistencies list (`MEDIA-INCONSISTENCIES.md`) flags every deviation. This document is what we build to.

---

## 0. Why this exists

Phase 1B iter-0 produced `NO_LCP` on the homepage because the hero fallback rendered a `<video>` element with an SVG poster, and SVGs are not LCP-eligible per the W3C LargestContentfulPaint spec. The same fall-through exists on `/events`, `/events/[slug]`, `/events/[city]`, and any organiser dashboard with a missing avatar. **One inconsistency, six broken pages.**

This document centralises every media decision so the same fix works on every page, today and forever.

---

## 1. Principles (non-negotiable)

1. **Every above-fold visual region MUST have a raster LCP candidate.** No SVG-only heroes. No `branded-placeholder` as the sole hero element. No video with SVG poster on the LCP path.
2. **Every image MUST have explicit dimensions** - `width` + `height` props, or `fill` inside a sized parent. CLS budget is 0.
3. **Every image MUST declare format priority via `next.config.ts`** - AVIF first, WebP fallback, raster only.
4. **Every image MUST go through `<Image>` from `next/image`** unless it is a local SVG, in which case use the approved component for that role.
5. **Every above-fold image MUST have `priority` AND `fetchPriority="high"`** AND **MUST NOT** carry an opacity transition or active scale transform on the first paint.
6. **Every below-fold image MUST be lazy** with `loading="lazy"` and `decoding="async"`. No exceptions.
7. **Every video MUST have a raster poster** (AVIF/WebP/JPEG). Never SVG. Above-fold video must have a peer raster `<Image>` painted as the LCP layer with the video overlaid only after first commit.
8. **All media component code lives in `src/components/media/`.** Feature components consume that library only - they do not construct `<Image>` or `<video>` directly.

---

## 2. Component library - the only allowed surfaces

Located at `src/components/media/`. Each enforces a slice of this standard.

| Component | Use when | Auto-applied defaults |
|---|---|---|
| `<HeroMedia>` | Above-fold full-bleed hero on any route (`/`, `/events/[slug]`, future landing pages) | `priority`, `fetchPriority="high"`, raster only, no opacity transition on first paint, video overlay deferred to `requestIdleCallback` |
| `<EventCardMedia>` | Card / tile / bento / rail / list-row event imagery | lazy, sized via a prop variant that names ONE cell or ONE column ladder (`rail-event-card`, `grid-one-two-three`, `list-thumb`, ...), AVIF, blur placeholder |
| `<CityTileImage>` | City rail tiles, city landing page heroes, region selectors | dual-mode (local SVG → raw `<img unoptimized>`; remote raster → `<Image>`), with the `sizes` hint chosen by the caller's required `layout` prop |
| `<OrganiserAvatar>` | Every avatar - topbar, organiser cards, ticket holder badges, list rows | rounded-full, sized via `size` prop (`xs`, `sm`, `md`, `topbar`, `lg`), initials fallback, lazy unless `priority` |
| `<CategoryTileImage>` | Category landing tiles, category pickers, category browse cards | lazy, AVIF, alt text required, `sizes` chosen by the caller's required `layout` prop |

These are the **only** surfaces feature code is allowed to use for media. ESLint enforces.

---

## 3. Layout role → media role mapping

| UI role | Component | Variant | Priority? | Sizes |
|---|---|---|---|---|
| Homepage hero (above fold) | `<HeroMedia>` | `variant="full-bleed"` | yes | `(max-width: 768px) 100vw, 1920px` |
| Event detail hero | `<HeroMedia>` | `variant="full-bleed"` | yes | `(max-width: 768px) 100vw, 1920px` |
| Bento grid hero tile | `<EventCardMedia>` | `variant="bento-hero"` | optional `priority` | `(max-width: 1024px) 100vw, 720px` |
| Bento grid supporting tile | `<EventCardMedia>` | `variant="bento-supporting"` | no | `(max-width: 1024px) 50vw, 360px` |
| Event card grid | `<EventCardMedia>` | `variant="card"` | first row optional | `(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw` |
| Live vibe marquee | `<EventCardMedia>` | `variant="marquee"` | no | `280px` |
| This week strip row | `<EventCardMedia>` | `variant="rail"` | no | `(min-width: 1024px) 280px, 220px` |
| City rail tile | `<CityTileImage>` | (auto) | no | `(min-width: 640px) 280px, 220px` |
| Category tile | `<CategoryTileImage>` | (auto) | no | `(max-width: 768px) 50vw, 320px` |
| Dashboard topbar avatar | `<OrganiserAvatar>` | `size="topbar"` | yes (above fold on dashboard) | (fixed 32×32) |
| Organiser card avatar | `<OrganiserAvatar>` | `size="md"` | no | (fixed 48×48) |

---

## 4. Format and quality policy

### 4.1 Formats

`next.config.ts` declares `formats: ['image/avif', 'image/webp']`. The Image Optimizer serves AVIF when the browser sends `Accept: image/avif`, falling back to WebP. **Origin upload format is irrelevant** - Supabase storage, Pexels, and any other source go through `/_next/image`.

Raster formats: AVIF preferred. WebP fallback. PNG/JPEG only as origin upload (transparent to component).

### 4.2 Quality tiers

Centralised in `src/components/media/quality.ts`:

```ts
export const MEDIA_QUALITY = {
  hero: 80,      // full-viewport hero - best perceived quality
  card: 75,      // standard card / bento tile
  rail: 70,      // small rail / marquee tile
  avatar: 75,    // avatars - sharpness matters at small sizes
} as const
```

Components import these constants. **Never** hardcode a `quality={N}` literal in feature code. The `next.config.ts` `qualities` array constrains the legal values to `[70, 75, 80]`.

### 4.3 Sizes hints

**The table lives in `src/components/media/sizes.ts` and is NOT copied here.**

It used to be copied here, and the copy went stale without anybody noticing:
this section still showed `fullBleed: '(max-width: 768px) 100vw, 1920px'` and
`rail: '(min-width: 1024px) 280px, 220px'` long after the code had moved to
75vw and to a 640px breakpoint. A second copy of a value is a second thing that
can be wrong, and prose cannot be run. Read the file.

**The rule the file holds, and the two gates that hold it.**

A `sizes` hint is a promise about layout that the markup makes to the browser
before any layout exists, and the browser believes it absolutely: it picks a
srcset candidate from the hint alone, at parse time. So a hint is written from
the LAYOUT, never from taste and never from a measurement taken at one viewport.

- A **rail cell** is a fixed pixel width that steps once at Tailwind's `sm`
  (640px). Its two numbers live in `src/lib/ui/rhythm.ts` beside the Tailwind
  class string that renders them, and its hint is derived from that pair.
- A **grid** is viewport-relative UNTIL the container stops growing. Every
  content column is capped at `max-w-7xl`, which is 1400px INCLUDING its 32px of
  large-screen padding, so 1336px of content. Above that a `vw` term keeps
  growing while the column does not, so every grid hint ends in a fixed pixel
  term. Grid hints are named for their COLUMN LADDER
  (`gridOneTwoThree`, `gridTwoThreeSix`), not for the page that first needed one,
  so the next page with that ladder reuses it.
- **A hint may be larger than its slot and never smaller.** Over-fetching costs
  bytes and is measured. Under-fetching costs sharpness, which the premium bar
  forbids, and it is invisible to every static check because the markup is
  perfectly well formed. The one deliberate exception is `fullBleed` on mobile,
  documented in the file and exempted BY NAME in the drive.

**The hint decides which candidate is CHOSEN. The width ladder decides how many
are OFFERED, and that is a document cost rather than an image one.**

`images.deviceSizes` and `images.imageSizes` in `next.config.ts` are emitted into
the `srcset` of every fixed-width image, so the two lists are a CLAIM about the
slots this platform renders and they are paid once per image, in the HTML. On the
homepage that is 1,404 candidate URLs across 124 images, 30.5% of a 1,039,112
byte document, and 83% of each URL is the percent-encoded storage src repeated
identically twelve times.

A hint expressed only in CSS pixels emits EVERY rung, because that is the branch
`getWidths` takes when it finds no `vw` term; a hint carrying one can never emit
a rung below `deviceSizes[0]` times the smallest ratio. Both facts come from
`node_modules/next/dist/shared/lib/get-img-props.js`, and together they make
"can anything select this rung" decidable from source.

The claim goes stale in silence, because the slots live in three other files. It
already had: the comment above those two lists named "16, 32, 192, 256, 288, 320
and 512" as the fixed sizes in use, and the `sizes` rework of 18 September 2026
moved the smallest slot to 24 CSS pixels without touching it.

| Gate | What it proves |
|---|---|
| `scripts/guards/image-hints-match-the-cell.mjs` (registered, blocking) | every rail cell says its two numbers twice and both agree; every rail hint is derived from a cell; no cell width or raw `sizes` string is written anywhere else; no hint is dead and every variant is mapped |
| `scripts/guards/candidate-ladder-has-no-dead-rung.mjs` (registered, blocking) | every configured width is one some declared slot can select at 1x or 2x, or sits above the floor where a `vw` hint can still emit it; and no declared slot has outgrown the top of the ladder, which is an under-fetch no hint can fix |
| `scripts/verify/image-hint-fidelity-drive.mjs` | no image is fetched smaller than its slot, in a real browser, at nine viewports on four routes; and nothing is OFFERED that the configured ladder no longer carries, read from the served DOM rather than from the config |
| `scripts/perf/srcset-weight.mjs` | what the candidate lists cost in the document: bytes, candidates and share per route, with one candidate quoted verbatim and split into its parts |
| `scripts/perf/image-hint-fidelity.mjs` | the measurement the two above were written from: chosen candidate against rendered slot, per hint, per viewport |

Variants on each component pull their hint from the map. **Never** inline a
`sizes` string in feature code; the guard fails the build on one.

---

## 5. The LCP rule - above-fold media

### 5.1 What qualifies as LCP

Per W3C LCP spec, only these elements are LCP candidates:
- `<img>` (raster source)
- `<image>` element inside `<svg>` (raster href)
- `<video>` poster (raster poster only) **OR** the first frame of the video once decoded
- Block-level element with a `background-image` URL (raster only)
- Block-level text node above the threshold size

**SVGs (inline or as poster) are NOT LCP candidates.** This is the sole reason iter-0 produced NO_LCP.

### 5.2 `<HeroMedia>` contract

`<HeroMedia>` always renders **two layers**:

1. **LCP layer (always rendered, first paint):** `<Image priority fetchPriority="high" sizes={MEDIA_SIZES.fullBleed} />` with a raster `image` prop. No opacity transition. No transform. This is the LCP candidate.
   Since close-out C17 (7 September 2026) that `<Image>` is rendered by `<HeroRaster>` (`src/components/media/hero-raster.tsx`), the one client component in the hero: it renders the same server-rendered priority raster and owns the failure path a server component cannot, swapping in the branded navy and gold treatment (`BrandedPlaceholder` chromeless) when the raster errors after hydration or had already failed before React listened (a completed image with no natural width). A hero never shows the browser's broken-image glyph, a bare rectangle or a spinner. The homepage's no-event branch wears one of the curated rasters in `public/images/hero/` chosen by the UTC day (`src/lib/images/homepage-hero-curated.ts`, read from the attribution file beside the assets), and `scripts/guards/homepage-hero-never-empty.mjs` fails the build if that branch stops rendering `<HeroMedia>` or a curated slug loses its raster or its licence entry.
2. **Optional ambient layer (mounted via `useEffect` after first paint commits):** ken-burns scale animation, video overlay, carousel rotation. Mounts after `requestAnimationFrame(() => requestAnimationFrame(...))` to guarantee LCP has been observed.

The `image` prop is **required** and must point to a raster URL. If callers only have an SVG fallback available, they pass a fallback raster from the curated set in `public/images/hero/` (added in this phase).

### 5.3 Forbidden hero patterns

- ❌ `kind='branded-placeholder'` rendered above the fold without a raster peer image.
- ❌ `<video poster='/images/event-fallback-hero.svg'>` or any SVG poster.
- ❌ Carousel rotation that mounts the LCP image with `opacity: 0` initially.
- ❌ Server-mounted hero that defers image rendering to a `useEffect` (no SSR-painted `<img>`).
- ❌ Setting `priority` on more than one image per route.

---

## 6. Below-fold rules

- All `<EventCardMedia>`, `<CategoryTileImage>`, `<CityTileImage>`, `<OrganiserAvatar>` (non-priority) instances default to `loading="lazy"` and `decoding="async"`.
- `<Image>` `placeholder="blur"` is enabled when a `blurDataURL` is provided. Components emit a default blur using a hashed neutral colour from category context where available.
- No raw `<img>` for content. Local SVG via `<CityTileImage>` only (it knows when to switch to raw `<img unoptimized>`).

---

## 7. Video rules

- A `<video>` element above the fold must NEVER be the LCP candidate. The peer `<Image>` is.
- Posters are raster only. Period.
- `autoplay` is gated by `document.body.dataset.headless === '1'` (set during Lighthouse runs and Playwright audits) - autoplay is disabled in audit mode to stabilise Speed Index.
- All videos: `muted`, `playsInline`, `loop`, `preload="none"` unless explicitly auto-playing, in which case `preload="auto"`.

---

## 8. Avatars

- Every avatar instance goes through `<OrganiserAvatar>`.
- Component renders one of:
  1. `<Image>` with explicit dimensions if `src` is a remote raster.
  2. Initials in a coloured circle if `src` is missing or fails to load (`onError` swap).
- Sizes from `MEDIA_SIZES.avatar*`.
- Above-fold dashboard topbar avatar passes `priority` (it's an LCP candidate on dashboard pages).

---

## 9. User uploads (organiser cover/gallery/video)

- Format: any → Supabase storage → served via `/_next/image` (re-encoded to AVIF/WebP by Next).
- Maximum dimension: 4000×4000 (server-side rejected if larger). Implemented in `src/lib/upload.ts`.
- Multiple sizes generated automatically by `next/image` from `deviceSizes` in `next.config.ts`.
- All uploads route through Supabase CDN (single `remotePatterns` entry). Public bucket only for cover/gallery; private bucket for ticket QR PDFs (out of scope here).

---

## 10. Decorative imagery

- Decorative gradients, vignettes, blurred backdrops are NOT content imagery.
- They live as inline `style={{ background: 'linear-gradient(...)' }}` or Tailwind utilities.
- They MAY use `style={{ backgroundImage: 'radial-gradient(...)' }}` because no URL is referenced.
- They MUST NOT use `background-image: url(...)` - that pattern is reserved for content imagery and is forbidden.

`<BrandedPlaceholder>` is decorative and stays in `src/components/ui/`. It can never be the sole element above the fold.

---

## 11. Forbidden patterns (mirror of MEDIA-INCONSISTENCIES.md §Forbidden)

1. ❌ `background-image: url(...)` for content imagery
2. ❌ Raw `<img>` for content imagery (`@next/next/no-img-element` - error, not warn)
3. ❌ Above-fold media without `priority` + `fetchPriority="high"`
4. ❌ `<Image>` without `width`+`height` and without `fill`
5. ❌ `<video>` with SVG poster on the LCP path
6. ❌ `kind='branded-placeholder'` as the sole hero element
7. ❌ Opacity transition or `transform: scale()` on the LCP image during first paint
8. ❌ Client-only `useEffect`-mounted `<Image>` for above-fold media
9. ❌ `loading="lazy"` combined with `priority`
10. ❌ Hardcoded `quality={N}` outside `MEDIA_QUALITY.*`
11. ❌ Hardcoded `sizes="..."` outside `MEDIA_SIZES.*` (blocking guard: `image-hints-match-the-cell`)
11b. ❌ A rail cell width (`w-[Npx] shrink-0 snap-start`) written anywhere but `src/lib/ui/rhythm.ts` (same guard)
12. ❌ `unoptimized={true}` on remote raster images
13. ❌ Constructing `<Image>` directly in feature code outside `src/components/media/`

---

## 12. Enforcement

### 12.1 ESLint (`eslint.config.mjs`)

- `@next/next/no-img-element` → **error** (was warn). Exceptions only via approved files in `src/components/media/`.
- `no-restricted-syntax` rules ban:
  - JSX `style` attribute containing `backgroundImage:` outside `src/components/media/decorative/` and `src/components/ui/branded-placeholder.tsx`.
  - JSX `<Image>` or `<img>` element nodes outside `src/components/media/**`.
- `no-restricted-imports` bans direct `import Image from 'next/image'` outside `src/components/media/**`.

### 12.2 Lighthouse CI gate (`lighthouserc.json` + `.github/workflows/lighthouse.yml`)

- Runs against built production output on every PR.
- URL set: `/`, `/events`, `/events/[city]` (sample: `/events/melbourne`), `/events/[slug]` (sample: real seeded event), `/organisers`.
- Thresholds:
  - Performance ≥ 95 → **error**
  - Accessibility = 100 → **error**
  - Best Practices = 100 → **error**
  - SEO = 100 → **error**
  - LCP < 2.5s → **error**
  - TBT < 300ms → **error**
  - CLS < 0.1 → **error**

### 12.3 PR review

- Any PR introducing a new media surface must reference this document in its description and explain which component is used and why.

---

## 13. How this gets to 100

iter-0: NO_LCP. iter-1 (post-refactor): the hero ships a raster AVIF as the LCP element, paints in <1.0s, and the ambient video/ken-burns layer mounts after commit. TBT drops because we stop loading the 1920px hero on every card.

The standard above is what guarantees iter-1 succeeds, and what guarantees `/events`, `/events/[slug]`, and every other page hits Performance 100 in Pre-Task 3.

---

## 14. Change control

Edits to this document require:
1. PR labelled `media-architecture`.
2. Lighthouse CI must still pass under the new rules.
3. `docs/MEDIA-AUDIT.md` re-run if any new media surface is introduced.
