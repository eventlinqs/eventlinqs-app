# EventLinqs Module 4.5 — Visual Lift Manifest

> Authored: 2026-04-18 by Claude.
> Sister doc: `EVENTLINQS-DESIGN-SYSTEM-V3.md` — the visual contract this manifest implements.
> Repo: `github.com/eventlinqs/eventlinqs-app`, branch: `main`, working dir: `C:\Users\61416\OneDrive\Desktop\EventLinqs\eventlinqs-app`.
>
> **Mission: lift EventLinqs from current state to a level that beats DICE, Airbnb, and Ticketmaster combined.** No exceptions. No shortcuts. No "we'll fix it in M5".
>
> **Standards (all streams):**
> - Lint clean: `npm run lint` returns 0 errors
> - Build clean: `npm run build` succeeds
> - Dev clean: `npm run dev` starts without console errors
> - Type clean: `tsc --noEmit` returns 0 errors
> - Tokens only: any new colour, spacing, or typography MUST come from the locked tokens in `src/app/globals.css`. New tokens require a design system v3 update first.
> - Australian English: sentence case, no em/en-dashes as punctuation, no exclamation marks
> - Accessibility: WCAG 2.2 AA on every shipped component, focus rings present, 44px touch targets
> - No `localStorage` in artefacts; persistent state via Supabase or Redis only
> - Every commit message starts with `feat(m4.5):` or `fix(m4.5):` or `refactor(m4.5):` followed by a one-line summary

---

## How to use this manifest

1. **Read the sister design system doc first.** `EVENTLINQS-DESIGN-SYSTEM-V3.md` is the contract. This manifest is the build plan.
2. **Open three terminal tabs.** Each runs Claude Code in `C:\Users\61416\OneDrive\Desktop\EventLinqs\eventlinqs-app`.
3. **Assign one stream per tab.** Stream A, B, C. Each stream is sequential — finish one prompt before moving to the next within a stream.
4. **Streams run in parallel where dependencies allow.** Dependencies are noted at the top of each prompt with `DEPENDS ON:` — if it says "none", you can start immediately. If it depends on another stream's output, wait for that stream to commit and push.
5. **Every prompt has a TEST gate.** Do not move to the next prompt until the test passes. Paste the test command back to the user with the result.
6. **Commit after every prompt.** One prompt = one commit. Push to `main` after each.
7. **If any prompt fails 3 times, stop and report.** Do not invent. Do not skip. Stop and tell the user.

---

## Pre-flight checks (run once before all streams)

Open a fourth terminal in the repo root. Run:

```bash
git status
git pull origin main
npm install
npm run lint
npm run build
npx tsc --noEmit
```

All must succeed before any stream begins. If any fail, fix them first.

Then create a working branch:

```bash
git checkout -b m4.5/visual-lift
git push -u origin m4.5/visual-lift
```

All three streams commit and push to `m4.5/visual-lift`. Final merge to `main` after Stream C verification.

---

# STREAM A — Foundation: tokens, primitives, typography sweep

**Owner:** Tab 1
**Goal:** Establish the visual primitives every other stream depends on.
**Estimated commits:** 7
**Estimated time:** 4-6 hours

---

## Prompt A1 — Mojibake / unicode escape audit

**DEPENDS ON:** none. Start immediately.

```
You are working in the EventLinqs Next.js codebase. The repo has known mojibake bugs where unicode escape sequences like `\u2026`, `\u2014`, `\u2013` are being rendered as literal text instead of their character equivalents.

Task:
1. Search the entire `src/` directory for these patterns (case-sensitive):
   - `\u2026` — should be `…` (horizontal ellipsis)
   - `\u2014` — should be `—` (em-dash, but check context — we don't use em-dashes as punctuation per design system rule 19; replace with sentence rewrite, NOT a literal em-dash)
   - `\u2013` — should be `–` (en-dash, same rule — rewrite the sentence to avoid)
   - `\u2019` — should be `'` (right single quote / apostrophe)
   - `\u201C` — should be `"` (left double quote)
   - `\u201D` — should be `"` (right double quote)
   - `\u2192` — should be `→` (right arrow — keep as character)
   - `\u2190` — should be `←` (left arrow — keep as character)

2. For each match:
   - If it's an arrow (`→`, `←`) or ellipsis (`…`), replace the escape sequence with the character directly.
   - If it's a quote (`"`, `'`), replace with the character.
   - If it's an em-dash or en-dash, REWRITE the sentence to avoid the dash. Use a comma, full stop, or restructure. Per design system rule 19, em/en-dashes are not used as punctuation.

3. Special focus areas (search these first):
   - `src/components/layout/site-header.tsx` — search bar placeholder text
   - `src/app/page.tsx` — hero copy and section subheads
   - `src/components/features/events/event-card.tsx`
   - `src/components/layout/site-footer.tsx`
   - All files in `src/app/legal/`
   - All files in `src/lib/help-content.ts`

4. Run a final grep to confirm zero remaining matches:
   ```bash
   grep -rn '\\u20[12][0-9A-F]\b' src/ --include="*.tsx" --include="*.ts" --include="*.md"
   ```

TEST GATE:
- The grep above returns no results
- `npm run lint` passes
- `npm run dev` and visually verify the search bar placeholder reads "Search events, artists, venues" with a real ellipsis or no ellipsis
- Commit: `fix(m4.5): mojibake sweep, eliminate unicode escape sequences across src`
- Push.
```

---

## Prompt A2 — EventLinqsLogo primitive

**DEPENDS ON:** A1 complete and pushed.

```
The EVENTLINQS wordmark is currently inlined as raw JSX in `src/components/layout/site-header.tsx` and `src/components/layout/site-footer.tsx`. Per design system v3 §2, this must be a single component.

Task:
1. Create `src/components/ui/eventlinqs-logo.tsx`:

```tsx
type Props = {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'dark' | 'light'
  className?: string
}

const SIZES = {
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-2xl',
  xl: 'text-3xl',
}

export function EventLinqsLogo({ size = 'md', variant = 'dark', className = '' }: Props) {
  const colour = variant === 'dark' ? 'text-ink-900' : 'text-white'
  return (
    <span
      className={`font-display font-extrabold tracking-tight ${SIZES[size]} ${colour} ${className}`}
      aria-label="EventLinqs"
    >
      EVENTLINQS<span className="text-gold-500" aria-hidden="true">.</span>
    </span>
  )
}
```

2. Replace inline logo in `src/components/layout/site-header.tsx` (the `<Link href="/" className="font-display ...">EVENTLINQS</Link>` and the duplicate inside the mobile sheet) with `<EventLinqsLogo size="md" />`.

3. Replace inline logo in `src/components/layout/site-footer.tsx` with `<EventLinqsLogo size="lg" variant="light" />` (footer is on dark surface).

4. Verify the gold dot renders correctly in both light and dark variants by visiting `/` and scrolling to the footer.

TEST GATE:
- `npm run lint` passes
- `npm run build` passes
- Visual check: logo appears in nav (top-left, dark), in mobile sheet header (dark), in footer (light), all with the gold dot lockup
- Commit: `feat(m4.5): EventLinqsLogo primitive, single source of truth for wordmark`
- Push.
```

---

## Prompt A3 — Section header refinement

**DEPENDS ON:** A2 complete and pushed.

```
The `SectionHeader` function inside `src/app/page.tsx` is being repeated in concept across the homepage. Per design system v3 §4, extract it as a primitive and tighten the spec.

Task:
1. Create `src/components/ui/section-header.tsx`:

```tsx
import Link from 'next/link'

type Props = {
  eyebrow: string
  title: string
  href?: string
  linkLabel?: string
}

export function SectionHeader({ eyebrow, title, href, linkLabel = 'View all' }: Props) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="mt-1.5 h-9 w-0.5 shrink-0 bg-gold-500" aria-hidden="true" />
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">
            {eyebrow}
          </p>
          <h2 className="mt-1 font-display text-3xl font-bold leading-tight text-ink-900 sm:text-4xl">
            {title}
          </h2>
        </div>
      </div>
      {href && (
        <Link
          href={href}
          className="shrink-0 text-sm font-medium text-gold-600 hover:text-gold-700 transition-colors whitespace-nowrap"
        >
          {linkLabel} →
        </Link>
      )}
    </div>
  )
}
```

2. Remove the inline `SectionHeader` function from `src/app/page.tsx`. Import the new primitive from `@/components/ui/section-header`.

3. Verify all four section headers on the homepage (TRENDING NOW, CULTURE PICKS, By City, FOR EVENT ORGANISERS) use the new primitive. The FOR EVENT ORGANISERS section may use a slightly different layout — leave it alone for now; only convert the standard ones.

TEST GATE:
- `npm run lint` passes
- `npm run build` passes
- Visual: TRENDING NOW header shows gold left bar, "HOT RIGHT NOW" eyebrow in gold caps, "Trending Now" in display bold, "See all events →" right-aligned link
- Commit: `feat(m4.5): SectionHeader primitive extracted, design system v3 §4`
- Push.
```

---

## Prompt A4 — ImageCarousel primitive

**DEPENDS ON:** A3 complete and pushed.

```
Per design system v3 §6, build the ImageCarousel primitive used in three places: card image, event detail hero, "Fans also viewed" rail.

Task:
1. Create `src/components/ui/image-carousel.tsx`:

```tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'

type Props = {
  images: { url: string; alt: string }[]
  aspectRatio?: '4/3' | '16/9' | '4/5' | '1/1'
  showArrows?: boolean
  showCounter?: boolean
  showDots?: boolean
  rounded?: string
  priority?: boolean
}

const ASPECT_CLASSES: Record<string, string> = {
  '4/3': 'aspect-[4/3]',
  '16/9': 'aspect-video',
  '4/5': 'aspect-[4/5]',
  '1/1': 'aspect-square',
}

export function ImageCarousel({
  images,
  aspectRatio = '4/3',
  showArrows = false,
  showCounter = false,
  showDots = true,
  rounded = 'rounded-2xl',
  priority = false,
}: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return

    const handleScroll = () => {
      const scrollLeft = scroller.scrollLeft
      const width = scroller.clientWidth
      const index = Math.round(scrollLeft / width)
      setActiveIndex(index)
    }

    scroller.addEventListener('scroll', handleScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollTo = (index: number) => {
    const scroller = scrollerRef.current
    if (!scroller) return
    scroller.scrollTo({ left: index * scroller.clientWidth, behavior: 'smooth' })
  }

  if (images.length === 0) {
    return (
      <div className={`${ASPECT_CLASSES[aspectRatio]} ${rounded} bg-ink-100 flex items-center justify-center`}>
        <span className="text-ink-400 text-xs">No image</span>
      </div>
    )
  }

  if (images.length === 1) {
    return (
      <div className={`relative ${ASPECT_CLASSES[aspectRatio]} ${rounded} overflow-hidden bg-ink-100`}>
        <Image
          src={images[0].url}
          alt={images[0].alt}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover"
          priority={priority}
        />
      </div>
    )
  }

  return (
    <div
      className={`relative ${ASPECT_CLASSES[aspectRatio]} ${rounded} overflow-hidden bg-ink-100`}
      role="region"
      aria-roledescription="carousel"
      aria-label={`Image gallery, ${images.length} images`}
    >
      <div
        ref={scrollerRef}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto scrollbar-none"
        style={{ scrollbarWidth: 'none' }}
      >
        {images.map((img, idx) => (
          <div
            key={idx}
            className="relative h-full w-full shrink-0 snap-center"
            aria-roledescription="slide"
            aria-label={`${idx + 1} of ${images.length}`}
          >
            <Image
              src={img.url}
              alt={img.alt}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover"
              priority={priority && idx === 0}
            />
          </div>
        ))}
      </div>

      {showArrows && (
        <>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); scrollTo(Math.max(0, activeIndex - 1)) }}
            disabled={activeIndex === 0}
            className="absolute left-3 top-1/2 -translate-y-1/2 hidden md:flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-ink-900 shadow-sm hover:scale-110 transition-transform disabled:opacity-0 disabled:pointer-events-none"
            aria-label="Previous image"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); scrollTo(Math.min(images.length - 1, activeIndex + 1)) }}
            disabled={activeIndex === images.length - 1}
            className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-ink-900 shadow-sm hover:scale-110 transition-transform disabled:opacity-0 disabled:pointer-events-none"
            aria-label="Next image"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {showDots && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5" aria-hidden="true">
          {images.map((_, idx) => (
            <span
              key={idx}
              className={`h-1.5 w-1.5 rounded-full transition-all ${
                idx === activeIndex ? 'bg-white w-4' : 'bg-white/50'
              }`}
            />
          ))}
        </div>
      )}

      {showCounter && (
        <div className="absolute bottom-3 right-3 rounded-full bg-ink-900/70 backdrop-blur-sm px-2.5 py-1 text-xs font-semibold text-white">
          {activeIndex + 1} / {images.length}
        </div>
      )}
    </div>
  )
}
```

2. Add the `scrollbar-none` utility to `globals.css` (if not already present):
```css
@utility scrollbar-none {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
@utility scrollbar-none::-webkit-scrollbar {
  display: none;
}
```

TEST GATE:
- Create a temporary test page at `src/app/dev/carousel-test/page.tsx`:
```tsx
import { ImageCarousel } from '@/components/ui/image-carousel'

const TEST_IMAGES = [
  { url: 'https://picsum.photos/seed/1/800/600', alt: 'Test 1' },
  { url: 'https://picsum.photos/seed/2/800/600', alt: 'Test 2' },
  { url: 'https://picsum.photos/seed/3/800/600', alt: 'Test 3' },
]

export default function CarouselTest() {
  return (
    <div className="mx-auto max-w-2xl p-8 space-y-8">
      <h1>Card variant (dots only, no arrows)</h1>
      <ImageCarousel images={TEST_IMAGES} aspectRatio="4/3" />
      <h1>Detail variant (arrows + counter + dots)</h1>
      <ImageCarousel images={TEST_IMAGES} aspectRatio="16/9" showArrows showCounter />
    </div>
  )
}
```
- Visit `http://localhost:3000/dev/carousel-test`. Swipe on mobile or click arrows on desktop. Confirm dots track correctly.
- `npm run lint` passes, `npm run build` passes
- Commit: `feat(m4.5): ImageCarousel primitive with snap scroll, dots, arrows, counter`
- Push.
- DO NOT delete the test page yet — Stream B will use it for verification.
```

---

## Prompt A5 — SmartMedia component with Pexels fallback

**DEPENDS ON:** A4 complete and pushed.

```
Per design system v3 §14, build the SmartMedia component that handles the fallback hierarchy: provided URL → first gallery image → category-tuned Pexels → brand gradient.

Task:
1. Create `src/lib/images/pexels-queries.ts` with the category query map from design system v3 §14:

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

export function pickPexelsQuery(categorySlug: string | null | undefined): string {
  const key = (categorySlug ?? 'default').toLowerCase()
  const queries = CATEGORY_PEXELS_QUERIES[key] ?? CATEGORY_PEXELS_QUERIES.default
  // Deterministic pick based on date — rotates daily
  const dayIndex = Math.floor(Date.now() / (24 * 60 * 60 * 1000))
  return queries[dayIndex % queries.length]
}
```

2. Create `src/lib/images/pexels-client.ts` with a server-side Pexels fetcher with 24h cache:

```ts
import 'server-only'

const PEXELS_API_KEY = process.env.PEXELS_API_KEY
const CACHE = new Map<string, { url: string; expiresAt: number }>()
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24h

export async function fetchPexelsImage(query: string): Promise<string | null> {
  if (!PEXELS_API_KEY) {
    console.warn('[pexels] PEXELS_API_KEY not configured')
    return null
  }

  const cached = CACHE.get(query)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url
  }

  try {
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`,
      {
        headers: { Authorization: PEXELS_API_KEY },
        next: { revalidate: 86400 },
      }
    )
    if (!response.ok) {
      console.warn(`[pexels] fetch failed: ${response.status}`)
      return null
    }
    const data = await response.json()
    const url = data.photos?.[0]?.src?.large
    if (url) {
      CACHE.set(query, { url, expiresAt: Date.now() + CACHE_TTL })
      return url
    }
    return null
  } catch (error) {
    console.error('[pexels] fetch error:', error)
    return null
  }
}
```

3. Create `src/components/ui/smart-media.tsx`:

```tsx
import Image from 'next/image'
import { fetchPexelsImage } from '@/lib/images/pexels-client'
import { pickPexelsQuery } from '@/lib/images/pexels-queries'

type Props = {
  src: string | null | undefined
  galleryUrls?: string[] | null
  fallbackCategory?: string | null
  alt: string
  fill?: boolean
  width?: number
  height?: number
  sizes?: string
  className?: string
  priority?: boolean
}

export async function SmartMedia({
  src,
  galleryUrls,
  fallbackCategory,
  alt,
  fill = true,
  sizes,
  className,
  priority = false,
}: Props) {
  // Priority 1: provided src
  let resolvedSrc = src

  // Priority 2: first gallery image
  if (!resolvedSrc && galleryUrls && galleryUrls.length > 0) {
    resolvedSrc = galleryUrls[0]
  }

  // Priority 3: Pexels fallback by category
  if (!resolvedSrc && fallbackCategory) {
    const query = pickPexelsQuery(fallbackCategory)
    resolvedSrc = await fetchPexelsImage(query)
  }

  // Priority 4: brand gradient fallback
  if (!resolvedSrc) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-navy-950 via-ink-900 to-navy-950 ${className ?? ''}`}
        aria-label={alt}
      >
        <svg className="h-16 w-16 text-gold-500/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
        </svg>
      </div>
    )
  }

  return (
    <Image
      src={resolvedSrc}
      alt={alt}
      fill={fill}
      sizes={sizes}
      className={className}
      priority={priority}
    />
  )
}
```

4. Add Pexels image domain to `next.config.ts` if not already present:
```ts
images: {
  remotePatterns: [
    { protocol: 'https', hostname: 'images.pexels.com' },
    // ... existing patterns
  ],
}
```

TEST GATE:
- `npm run build` passes (server component, must compile)
- Add a temporary verification on `src/app/dev/carousel-test/page.tsx`:
```tsx
import { SmartMedia } from '@/components/ui/smart-media'

// Add to the existing test page:
<h1>SmartMedia — no src, falls back to Pexels for "afrobeats"</h1>
<div className="relative aspect-video w-full bg-ink-100 rounded-2xl overflow-hidden">
  <SmartMedia src={null} fallbackCategory="afrobeats" alt="Afrobeats fallback" />
</div>
```
- Visit `/dev/carousel-test` and verify a real Afrobeats-themed photo loads
- Commit: `feat(m4.5): SmartMedia component with Pexels category fallback and brand gradient last-resort`
- Push.
```

---

## Prompt A6 — Sticky bottom action bar primitive

**DEPENDS ON:** A5 complete and pushed.

```
Per design system v3 §12 and decision 10 of the top 10, build the StickyActionBar primitive used on event detail mobile.

Task:
1. Create `src/components/ui/sticky-action-bar.tsx`:

```tsx
type Props = {
  priceLabel: string
  currency: string
  availabilityStatus: 'good' | 'low' | 'critical' | 'sold_out'
  availabilityLabel: string
  ctaLabel: string
  ctaHref: string
}

const STATUS_COLOURS: Record<Props['availabilityStatus'], string> = {
  good: 'bg-success',
  low: 'bg-warning',
  critical: 'bg-error',
  sold_out: 'bg-ink-400',
}

export function StickyActionBar({
  priceLabel,
  currency,
  availabilityStatus,
  availabilityLabel,
  ctaLabel,
  ctaHref,
}: Props) {
  const isSoldOut = availabilityStatus === 'sold_out'

  return (
    <div
      role="region"
      aria-label="Ticket actions"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-ink-100 shadow-[0_-4px_20px_rgba(10,22,40,0.08)] pb-[max(0.75rem,env(safe-area-inset-bottom))] px-4 pt-3"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-[11px] uppercase tracking-widest text-ink-500 font-semibold">From</span>
          <span className="font-display text-base font-bold text-ink-900">
            {currency} {priceLabel}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${STATUS_COLOURS[availabilityStatus]}`} aria-hidden="true" />
          <span className="text-xs font-medium text-ink-600">{availabilityLabel}</span>
        </div>
        {isSoldOut ? (
          <button
            type="button"
            disabled
            className="rounded-lg bg-ink-200 px-6 py-3 text-sm font-bold text-ink-500 cursor-not-allowed"
          >
            Sold out
          </button>
        ) : (
          <a
            href={ctaHref}
            className="rounded-lg bg-gold-500 px-6 py-3 text-sm font-bold text-ink-900 hover:bg-gold-400 transition-colors"
          >
            {ctaLabel}
          </a>
        )}
      </div>
    </div>
  )
}
```

TEST GATE:
- `npm run build` passes
- Add to `/dev/carousel-test` for visual:
```tsx
import { StickyActionBar } from '@/components/ui/sticky-action-bar'

// Bottom of test page (note this only renders on mobile widths):
<StickyActionBar
  priceLabel="$44"
  currency="AUD"
  availabilityStatus="good"
  availabilityLabel="Tickets available"
  ctaLabel="Get tickets"
  ctaHref="#tickets"
/>
```
- Resize browser to < 1024px width and verify bar appears bottom, gold CTA, green dot
- Commit: `feat(m4.5): StickyActionBar primitive for mobile event detail`
- Push.
```

---

## Prompt A7 — Empty state primitives

**DEPENDS ON:** A6 complete and pushed.

```
Per design system v3 §15 and decision 3, replace dashed-border empty states with proper Discovery / Category / Hide patterns.

Task:
1. Create `src/components/ui/empty-state.tsx`:

```tsx
import Link from 'next/link'

type Variant = 'discovery' | 'category'

type Props = {
  variant: Variant
  illustration?: 'map' | 'stage' | 'crowd' | 'calendar'
  title: string
  description: string
  primaryCta?: { label: string; href: string }
  secondaryCta?: { label: string; href: string }
}

const ILLUSTRATIONS: Record<NonNullable<Props['illustration']>, React.ReactNode> = {
  map: (
    <svg viewBox="0 0 200 200" className="h-32 w-32 text-ink-300" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M40 60 L80 50 L120 70 L160 55 L160 150 L120 165 L80 145 L40 160 Z" strokeLinejoin="round" />
      <line x1="80" y1="50" x2="80" y2="145" />
      <line x1="120" y1="70" x2="120" y2="165" />
      <circle cx="100" cy="100" r="6" fill="currentColor" />
      <path d="M100 90 C95 85, 95 80, 100 80 C105 80, 105 85, 100 90 Z" fill="currentColor" />
    </svg>
  ),
  stage: (
    <svg viewBox="0 0 200 200" className="h-32 w-32 text-ink-300" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="40" y="120" width="120" height="40" rx="2" />
      <line x1="60" y1="40" x2="60" y2="120" />
      <line x1="140" y1="40" x2="140" y2="120" />
      <circle cx="60" cy="40" r="8" fill="currentColor" />
      <circle cx="140" cy="40" r="8" fill="currentColor" />
      <path d="M60 48 L100 100 L140 48" />
      <rect x="95" y="100" width="10" height="20" />
      <ellipse cx="100" cy="125" rx="12" ry="3" />
    </svg>
  ),
  crowd: (
    <svg viewBox="0 0 200 200" className="h-32 w-32 text-ink-300" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="60" cy="80" r="15" />
      <circle cx="100" cy="70" r="18" />
      <circle cx="140" cy="80" r="15" />
      <path d="M40 160 Q40 110 60 110 L80 110 Q80 130 80 160" />
      <path d="M75 160 Q75 100 100 100 L125 100 Q125 130 125 160" />
      <path d="M120 160 Q120 110 140 110 L160 110 Q160 130 160 160" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 200 200" className="h-32 w-32 text-ink-300" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="40" y="50" width="120" height="120" rx="4" />
      <line x1="40" y1="80" x2="160" y2="80" />
      <line x1="70" y1="40" x2="70" y2="60" />
      <line x1="130" y1="40" x2="130" y2="60" />
      <circle cx="100" cy="120" r="20" />
      <line x1="100" y1="105" x2="100" y2="120" />
      <line x1="100" y1="120" x2="115" y2="125" />
    </svg>
  ),
}

export function EmptyState({
  variant,
  illustration = 'crowd',
  title,
  description,
  primaryCta,
  secondaryCta,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="mb-6">{ILLUSTRATIONS[illustration]}</div>
      <h3 className="font-display text-xl font-bold text-ink-900 max-w-md">
        {title}
      </h3>
      <p className="mt-3 text-sm text-ink-600 max-w-md">
        {description}
      </p>
      {(primaryCta || secondaryCta) && (
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {primaryCta && (
            <Link
              href={primaryCta.href}
              className="inline-flex items-center rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-semibold text-ink-900 hover:bg-gold-400 transition-colors"
            >
              {primaryCta.label}
            </Link>
          )}
          {secondaryCta && (
            <Link
              href={secondaryCta.href}
              className="inline-flex items-center rounded-lg border border-ink-200 px-5 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-100 transition-colors"
            >
              {secondaryCta.label}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
```

2. Audit `src/app/page.tsx` and any category landing pages for dashed-border empty states. Replace each with `<EmptyState>`.

3. Check `src/components/ui/EmptyState.tsx` (capital E) — if it exists and is the older version, deprecate it (add `@deprecated` jsdoc) and route all imports to the new lowercase version. Note: do not delete the old file in this prompt — Stream B may depend on it.

TEST GATE:
- Add to `/dev/carousel-test`:
```tsx
import { EmptyState } from '@/components/ui/empty-state'

<EmptyState
  variant="discovery"
  illustration="map"
  title="No events match your filters"
  description="Try widening your date range or removing a category."
  primaryCta={{ label: 'Reset filters', href: '/events' }}
  secondaryCta={{ label: 'Browse all events', href: '/events' }}
/>
<EmptyState
  variant="category"
  illustration="stage"
  title="Be the first to host an Afrobeats event in Melbourne"
  description="Zero platform fees on your first event. Get listed in five minutes."
  primaryCta={{ label: 'Start hosting', href: '/organisers/signup' }}
/>
```
- Visit and verify the SVG illustrations render correctly, no dashed borders
- Commit: `feat(m4.5): EmptyState primitive with discovery and category variants, SVG illustrations`
- Push.

End of Stream A foundation. Notify the user that Stream A is complete and Stream B / C can now consume these primitives.
```

---

# STREAM B — Components: cards, hero, sections, navigation

**Owner:** Tab 2
**Goal:** Apply the primitives from Stream A to the visible surfaces of the platform.
**Estimated commits:** 9
**Estimated time:** 6-8 hours

---

## Prompt B1 — SiteHeader rebuild with pill search bar

**DEPENDS ON:** A2 (EventLinqsLogo) complete and pushed.

```
Per design system v3 §3 and decision 1 of the top 10, rebuild the SiteHeader to use the Airbnb-pattern pill search bar. Kill the Melbourne pin pill if present anywhere.

Task:
1. Open `src/components/layout/site-header.tsx`. Replace the entire desktop nav structure with:

```tsx
// Inside the header, replace the existing structure:

<header className="sticky top-0 z-50 w-full border-b border-ink-100 bg-canvas/95 backdrop-blur-sm">
  <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
    {/* Logo */}
    <Link href="/" aria-label="EventLinqs home" className="shrink-0">
      <EventLinqsLogo size="md" />
    </Link>

    {/* Desktop pill search bar — centred */}
    <Link
      href="/events?focus=search"
      className="hidden md:flex flex-1 max-w-md items-center gap-3 rounded-full border border-ink-200 bg-white px-5 py-2.5 hover:shadow-md transition-shadow"
      aria-label="Search events"
    >
      <svg className="h-4 w-4 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
      </svg>
      <span className="text-sm text-ink-500 truncate">Search events, artists, venues</span>
    </Link>

    {/* Right side */}
    <div className="flex items-center gap-3">
      {/* Desktop CTAs */}
      <Link
        href="/login"
        className="hidden md:inline-flex text-sm font-medium text-ink-700 hover:text-ink-900 transition-colors"
      >
        Sign in
      </Link>
      <Link
        href="/login?tab=signup"
        className="hidden md:inline-flex items-center rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-gold-400 transition-colors"
      >
        Get started
      </Link>

      {/* Mobile hamburger — keep existing */}
      {/* ... existing hamburger button ... */}
    </div>
  </div>

  {/* Mobile pill search — second row, hidden on md+ */}
  <div className="md:hidden border-t border-ink-100 bg-canvas px-4 py-3">
    <Link
      href="/events?focus=search"
      className="flex items-center gap-3 rounded-full border border-ink-200 bg-white px-5 py-3 hover:shadow-sm transition-shadow"
      aria-label="Search events"
    >
      <svg className="h-4 w-4 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
      </svg>
      <span className="text-sm text-ink-500">Search events, artists, venues</span>
    </Link>
  </div>
</header>
```

2. **Critical: search the entire codebase for any "Melbourne" pin pill, location pill, or location dropdown in headers.** Use:
```bash
grep -rn "MapPin\|map-pin\|location-pill\|MelbournePill" src/components/layout/ src/app/page.tsx
```
Remove any found. If `Melbourne` appears anywhere as a hardcoded location pill in nav, remove it. The location of the user lives inside the search modal (M5) and inside the user's profile, never in the nav.

3. Update `Get Started` to `Get started` (sentence case per Australian English rule).

TEST GATE:
- `npm run lint` passes, `npm run build` passes
- Visual: visit `/`, confirm pill search bar centred on desktop, second-row pill on mobile, NO Melbourne pin pill anywhere
- Visual: hover the pill, shadow appears
- Click the pill, navigates to `/events?focus=search`
- Commit: `feat(m4.5): SiteHeader rebuild — pill search bar, kill Melbourne pin pill, Airbnb pattern`
- Push.
```

---

## Prompt B2 — EventCard upgrade to design system v3

**DEPENDS ON:** A4 (ImageCarousel), A5 (SmartMedia) complete and pushed.

```
Per design system v3 §5, upgrade EventCard to use ImageCarousel for galleries, SmartMedia for fallback, and the locked typography spec.

Task:
1. Open `src/components/features/events/event-card.tsx`.

2. Update the type to accept `gallery_urls`:

```ts
export type EventCardData = {
  id: string
  slug: string
  title: string
  cover_image_url: string | null
  thumbnail_url: string | null
  gallery_urls: string[] | null  // NEW
  start_date: string
  venue_name: string | null
  venue_city: string | null
  venue_country: string | null
  created_at: string
  category: { name: string; slug: string } | null
  ticket_tiers: EventCardTier[]
}
```

3. Replace the image area with ImageCarousel + SmartMedia. The image area structure becomes:

```tsx
{/* Image area — carousel if gallery, single SmartMedia if not */}
<div className="relative">
  {(() => {
    const allImages = [
      ...(cover_image_url ? [{ url: cover_image_url, alt: title }] : []),
      ...((gallery_urls ?? []).map(url => ({ url, alt: title }))),
    ].slice(0, 5) // cap at 5 images per card

    if (allImages.length > 1) {
      return (
        <ImageCarousel
          images={allImages}
          aspectRatio="4/3"
          showDots
          rounded="rounded-t-2xl"
        />
      )
    }

    return (
      <div className="relative aspect-[4/3] overflow-hidden rounded-t-2xl bg-ink-100">
        <SmartMedia
          src={cover_image_url}
          fallbackCategory={category?.slug}
          alt={title}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>
    )
  })()}

  {/* Category pill — top-left */}
  {category && (
    <span className="absolute left-3 top-3 z-10 rounded-full bg-ink-900/80 backdrop-blur-sm px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
      {category.name}
    </span>
  )}

  {/* Heart — bottom-right */}
  <button
    type="button"
    aria-label={`Save ${title}`}
    onClick={(e) => { e.preventDefault() }}
    className="absolute bottom-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-ink-900 shadow-sm hover:scale-110 transition-transform"
  >
    <Heart className="h-4 w-4" strokeWidth={2} />
  </button>
</div>
```

4. Update the body typography to design system v3 §5 spec:

```tsx
<div className="flex flex-1 flex-col p-4 md:p-5">
  {/* Date — gold caps, tracking-widest */}
  <p className="font-display text-[11px] font-semibold uppercase tracking-[0.15em] text-gold-600">
    {formatDate(start_date)}
  </p>

  {/* Title — bumped to 18px mobile / 20px desktop */}
  <h3 className="mt-1.5 font-display text-lg md:text-xl font-bold leading-tight text-ink-900 line-clamp-2 group-hover:text-gold-700 transition-colors">
    {title}
  </h3>

  {/* Location */}
  {location && (
    <p className="mt-2 flex items-center gap-1 text-sm text-ink-500">
      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {location}
    </p>
  )}

  {/* Price + social proof */}
  <div className="mt-auto flex items-end justify-between gap-2 pt-4">
    <p className="font-display text-base font-bold text-ink-900">
      {priceLabel}
    </p>
    {inventory && (
      <SocialProofBadge inventory={inventory} createdAt={created_at} compact />
    )}
  </div>
</div>
```

5. Update the wrapping `<Link>` to add the lift hover:

```tsx
<Link
  href={`/events/${slug}`}
  className="group flex flex-col rounded-2xl overflow-hidden bg-white border border-ink-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200 ease-out"
>
```

6. Update all queries in `src/app/page.tsx` and `src/app/events/page.tsx` that select event card data to include `gallery_urls`:

```ts
.select('id, slug, title, cover_image_url, thumbnail_url, gallery_urls, start_date, venue_name, venue_city, venue_country, created_at, category:event_categories(name, slug), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)')
```

TEST GATE:
- `npm run lint` passes, `npm run build` passes
- Visual: visit `/`, confirm cards show 4:3 image, gold caps date, larger 18-20px titles, lift on hover
- If any seeded event has multiple gallery_urls, confirm carousel dots appear
- Commit: `feat(m4.5): EventCard v3 — carousel support, SmartMedia fallback, typography spec, hover lift`
- Push.
```

---

## Prompt B3 — Hero solid card replacing glass

**DEPENDS ON:** A2 (EventLinqsLogo) — for any logo refs in hero.

```
Per design system v3 §7 and decision 7, replace the glassmorphism Happening Soon card on the homepage hero with a solid `bg-ink-900` ribbon card.

Task:
1. Open `src/app/page.tsx`. Find the featured event card block (currently inside the hero section, the IIFE that renders `featuredEvent`).

2. Replace the entire featured card markup with:

```tsx
<div className="rounded-2xl border border-gold-500/30 bg-ink-900 p-6 shadow-2xl backdrop-blur-md lg:max-w-sm">
  <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-gold-400">
    Happening soon
  </p>
  <h3 className="mt-3 font-display text-2xl font-bold leading-tight text-white">
    {featuredEvent.title}
  </h3>
  <div className="mt-3 space-y-1 text-sm text-white/80">
    <p>{new Date(featuredEvent.start_date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
    {featuredEvent.venue_city && <p>{featuredEvent.venue_city}</p>}
    {featuredEvent.organisation && <p className="text-white/60">by {featuredEvent.organisation.name}</p>}
  </div>
  {featuredEvent.ticket_tiers.length > 0 && (
    <p className="mt-4 font-display text-base font-bold text-gold-400">
      From {featuredEvent.ticket_tiers[0].currency} ${(Math.min(...featuredEvent.ticket_tiers.map(t => t.price)) / 100).toFixed(0)}
    </p>
  )}
  <p className="mt-3 flex items-center gap-1.5 text-xs text-white/50">
    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-400" aria-hidden="true" />
    Live now on EventLinqs
  </p>
  <Link
    href={`/events/${featuredEvent.slug}`}
    className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-gold-500 px-4 py-3 text-sm font-bold text-ink-900 hover:bg-gold-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900"
  >
    View event →
  </Link>
</div>
```

The key change: `bg-ink-900` (solid near-black) instead of any glass/translucent surface. Border `border-gold-500/30` to give it the featured ribbon feel. CTA is `bg-gold-500` filled (gold solid) with `text-ink-900` (dark text on gold) — flips the visual weight versus the previous outlined gold.

3. Verify the hero H1 and copy still reads:
- Eyebrow: "Made for the diaspora" (sentence case)
- H1: "Where the **culture** gathers." with gold-400 on "culture"
- Subhead: existing copy
- CTAs: "Get tickets" (gold solid) and "Browse all events" (white outline)

If "Get Tickets" appears with a capital T, change to "Get tickets". Australian English sentence case rule.

TEST GATE:
- `npm run lint` passes, `npm run build` passes
- Visual: visit `/`, confirm featured card is solid dark navy with gold border, gold pulse dot, gold filled "View event →" CTA — no longer fades into the video
- Commit: `feat(m4.5): hero featured card — solid ink-900 ribbon replacing glassmorphism, decision 7`
- Push.
```

---

## Prompt B4 — Cultural Picks tab hiding logic

**DEPENDS ON:** B3.

```
Per design system v3 §8 and decision 3, Cultural Picks tabs that have zero events must hide entirely. The section header itself should hide if no tabs have content.

Task:
1. Open `src/app/page.tsx`. Find the CULTURE PICKS section.

2. Replace the hardcoded sub-tab strip with a database-driven version. Add a new query above the JSX:

```ts
// Fetch counts of upcoming published events per culture category
const { data: cultureCountsRaw } = await supabase
  .from('events')
  .select('category:event_categories(slug, name)', { count: 'exact', head: false })
  .eq('status', 'published')
  .eq('visibility', 'public')
  .gte('start_date', new Date().toISOString())

// Build a count map keyed by category slug
const cultureCounts = new Map<string, number>()
;(cultureCountsRaw ?? []).forEach((row: any) => {
  const slug = row.category?.slug
  if (slug) cultureCounts.set(slug, (cultureCounts.get(slug) ?? 0) + 1)
})

// Filter the tabs to only those with events
const ALL_CULTURE_TABS = [
  { label: 'Afrobeats',  href: '/categories/afrobeats',  slug: 'afrobeats' },
  { label: 'Amapiano',   href: '/categories/amapiano',   slug: 'amapiano' },
  { label: 'Gospel',     href: '/categories/gospel',     slug: 'gospel' },
  { label: 'Comedy',     href: '/events?category=comedy', slug: 'comedy' },
  { label: 'Owambe',     href: '/categories/owambe',     slug: 'owambe' },
  { label: 'Business',   href: '/categories/networking', slug: 'networking' },
] as const

const visibleCultureTabs = ALL_CULTURE_TABS.filter(t => (cultureCounts.get(t.slug) ?? 0) > 0)
```

3. Wrap the entire CULTURE PICKS section in a conditional. If `visibleCultureTabs.length === 0` AND `culturePicks.length === 0`, do not render the section at all.

```tsx
{(visibleCultureTabs.length > 0 || culturePicks.length > 0) && (
  <section aria-labelledby="culture-heading" className="bg-ink-100 py-14 sm:py-16">
    {/* ... existing content ... */}
  </section>
)}
```

4. Replace the tab strip with the dynamic version:

```tsx
<div className="mt-6 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
  <span className="shrink-0 rounded-full px-4 py-1.5 text-sm font-medium bg-gold-500 text-ink-900">
    All
  </span>
  {visibleCultureTabs.map(({ label, href }) => (
    <Link
      key={label}
      href={href}
      className="shrink-0 rounded-full px-4 py-1.5 text-sm font-medium bg-white text-ink-700 hover:bg-gold-100 hover:text-gold-700 border border-ink-200 transition-colors"
    >
      {label}
    </Link>
  ))}
</div>
```

5. The fallback rendering when `culturePicks.length === 0 && trending.length > 0` is acceptable — keep that. The change is: if BOTH are empty AND no tabs have events, hide everything.

6. Replace the existing dashed-border fallback with EmptyState (use the primitive from A7):

```tsx
import { EmptyState } from '@/components/ui/empty-state'

// Inside the "no events at all" branch:
<EmptyState
  variant="category"
  illustration="stage"
  title="The first cultural events are coming soon"
  description="Be the organiser who launches culture in your city."
  primaryCta={{ label: 'Start hosting', href: '/organisers/signup' }}
/>
```

TEST GATE:
- `npm run lint` passes, `npm run build` passes
- Visual: visit `/`. If your seed data has events in multiple categories, confirm only those categories appear as tabs. If you have only one category with events, only that one tab shows
- Visual: no dashed grey boxes anywhere in Cultural Picks
- Commit: `feat(m4.5): Cultural Picks — hide empty tabs, EmptyState for total empty, decision 3`
- Push.
```

---

## Prompt B5 — By City rail with editorial photography

**DEPENDS ON:** A5 (SmartMedia) complete.

```
Per design system v3 §9 and decision 9, build the By City rail with real editorial photography (Pexels-fed) replacing coloured-panel placeholders.

Task:
1. Create `src/components/features/cities/city-tile.tsx`:

```tsx
import Link from 'next/link'
import { SmartMedia } from '@/components/ui/smart-media'

type Props = {
  city: string
  citySlug: string
  eventCount: number
  pexelsQuery: string
}

export async function CityTile({ city, citySlug, eventCount, pexelsQuery }: Props) {
  const countLabel = eventCount === 0
    ? 'Coming soon'
    : eventCount === 1
    ? '1 event'
    : `${eventCount} events`

  return (
    <Link
      href={`/events?city=${citySlug}`}
      className="group relative aspect-[4/5] overflow-hidden rounded-2xl bg-ink-900 shadow-sm hover:shadow-md transition-all"
    >
      <SmartMedia
        src={null}
        fallbackCategory={pexelsQuery}
        alt={`${city} skyline`}
        fill
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
        className="object-cover transition-transform duration-500 group-hover:scale-110"
      />
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(to top, rgba(10,14,26,0.85) 0%, rgba(10,14,26,0.3) 50%, transparent 100%)' }}
        aria-hidden="true"
      />
      <div className="absolute inset-x-0 bottom-0 p-5">
        <h3 className="font-display text-2xl md:text-3xl font-extrabold text-white tracking-tight">
          {city}
        </h3>
        <p className="mt-1 text-sm text-white/80">{countLabel}</p>
      </div>
    </Link>
  )
}
```

2. Add city queries to `src/lib/images/pexels-queries.ts`:

```ts
export const CITY_PEXELS_QUERIES: Record<string, string> = {
  melbourne: 'Melbourne skyline night',
  sydney: 'Sydney harbour evening',
  brisbane: 'Brisbane city skyline',
  perth: 'Perth Australia city',
  london: 'London skyline night',
  toronto: 'Toronto skyline evening',
  houston: 'Houston Texas skyline',
  atlanta: 'Atlanta city night',
  lagos: 'Lagos Nigeria Victoria Island',
  birmingham: 'Birmingham UK city',
}
```

Update `pickPexelsQuery` to also accept city slugs (extend the function or add a `pickCityPexelsQuery`).

3. Add a By City section to `src/app/page.tsx` between Cultural Picks and For Organisers. Pull live event counts per city from the events table:

```tsx
// Add to the data fetching section above the return:
const { data: cityCountsRaw } = await supabase
  .from('events')
  .select('venue_city')
  .eq('status', 'published')
  .eq('visibility', 'public')
  .gte('start_date', new Date().toISOString())

const cityCounts = new Map<string, number>()
;(cityCountsRaw ?? []).forEach((row: any) => {
  const city = row.venue_city?.toLowerCase()
  if (city) cityCounts.set(city, (cityCounts.get(city) ?? 0) + 1)
})

const FEATURED_CITIES = [
  { name: 'Melbourne', slug: 'melbourne', query: 'Melbourne skyline night' },
  { name: 'Sydney',    slug: 'sydney',    query: 'Sydney harbour evening' },
  { name: 'London',    slug: 'london',    query: 'London skyline night' },
  { name: 'Lagos',     slug: 'lagos',     query: 'Lagos Nigeria Victoria Island' },
  { name: 'Toronto',   slug: 'toronto',   query: 'Toronto skyline evening' },
  { name: 'Houston',   slug: 'houston',   query: 'Houston Texas skyline' },
]
```

4. Render the section:

```tsx
<section aria-labelledby="cities-heading" className="bg-canvas py-14 sm:py-16">
  <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
    <SectionHeader
      eyebrow="By city"
      title="Wherever you are, the culture follows"
      href="/events"
      linkLabel="View all cities"
    />
    <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-6">
      {FEATURED_CITIES.map(c => (
        <CityTile
          key={c.slug}
          city={c.name}
          citySlug={c.slug}
          eventCount={cityCounts.get(c.name.toLowerCase()) ?? 0}
          pexelsQuery={c.query}
        />
      ))}
    </div>
  </div>
</section>
```

5. **Important:** SmartMedia is async (server component). Make sure the page is async (it already is) and the section renders inside the server component flow.

TEST GATE:
- `npm run lint` passes, `npm run build` passes
- Visual: visit `/`. Confirm 4 city tiles (2-up mobile, 4-up desktop) with REAL city photographs, dark gradient bottom, white city name, count below
- No coloured-panel placeholders anywhere
- Commit: `feat(m4.5): By City rail with Pexels editorial photography, decision 9`
- Push.
```

---

## Prompt B6 — Live Vibe marquee

**DEPENDS ON:** B5.

```
Per design system v3 §11, add the Live Vibe marquee strip between Cultural Picks and By City. Confident, slow scroll, gold eyebrow, hover-pause, reduced-motion respected.

Task:
1. Add the marquee animation to `src/app/globals.css`:

```css
@keyframes marquee {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}

.animate-marquee {
  animation: marquee 60s linear infinite;
}

.animate-marquee:hover {
  animation-play-state: paused;
}

@media (prefers-reduced-motion: reduce) {
  .animate-marquee {
    animation: none;
  }
}
```

2. Create `src/components/features/marquee/live-vibe-marquee.tsx`:

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export async function LiveVibeMarquee() {
  const supabase = await createClient()
  const { data: events } = await supabase
    .from('events')
    .select('slug, title, venue_city')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gte('start_date', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(12)

  if (!events || events.length === 0) return null

  // Duplicate the list so the marquee can loop seamlessly
  const items = [...events, ...events]

  return (
    <section aria-label="Live on EventLinqs" className="bg-ink-900 py-6 overflow-hidden border-y border-ink-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-3">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-gold-500">
          Live on EventLinqs
        </p>
      </div>
      <div className="relative w-full overflow-hidden">
        <div className="flex gap-12 animate-marquee whitespace-nowrap">
          {items.map((event, idx) => (
            <Link
              key={`${event.slug}-${idx}`}
              href={`/events/${event.slug}`}
              className="inline-flex items-center gap-2 text-sm text-white/90 hover:text-gold-400 transition-colors"
            >
              <span className="text-coral-500" aria-hidden="true">📍</span>
              <span className="font-medium">{event.title}</span>
              {event.venue_city && (
                <span className="text-white/50"> — {event.venue_city}</span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
```

3. Insert `<LiveVibeMarquee />` into `src/app/page.tsx` between Cultural Picks and By City.

TEST GATE:
- `npm run lint` passes, `npm run build` passes
- Visual: visit `/`. Marquee scrolls slowly across the dark band. Hover pauses. Test reduced-motion in browser dev tools to confirm animation stops
- Commit: `feat(m4.5): LiveVibeMarquee with hover pause and reduced-motion respect, design system §11`
- Push.

NOTE: The em-dash in `event.title} — {event.venue_city}` violates rule 19 (no em-dash as punctuation). Replace with `·` (middle dot) or `,`. Update to `<span className="text-white/50"> · {event.venue_city}</span>`.
```

---

## Prompt B7 — Featured grid layout (1 large + 2 small)

**DEPENDS ON:** B2 (EventCard upgrade) complete.

```
Per design system v3 §5 (featured card) and decision 5, the homepage Trending Now grid should lead with one large featured card and stack two smaller cards beside it on desktop, falling back to a uniform grid on mobile.

Task:
1. In `src/app/page.tsx`, replace the existing TRENDING NOW grid:

```tsx
{trending.length > 0 ? (
  <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
    {trending.map(event => (
      <EventCard key={event.id} event={event} dynamicPrices={trendingPrices} />
    ))}
  </div>
) : ( ... )}
```

With a featured-first layout:

```tsx
{trending.length > 0 ? (
  <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3 lg:auto-rows-[1fr]">
    {/* Featured (first) — spans 2 columns and 2 rows on lg+ */}
    {trending[0] && (
      <div className="lg:col-span-2 lg:row-span-2">
        <EventCard event={trending[0]} dynamicPrices={trendingPrices} />
      </div>
    )}
    {/* Remaining 4 — fit into the remaining 1 column on lg+, 2-up on sm */}
    {trending.slice(1, 5).map(event => (
      <EventCard key={event.id} event={event} dynamicPrices={trendingPrices} />
    ))}
  </div>
) : ( ... )}
```

2. The first card in the grid is now visually larger (spans 2x2 on desktop). Confirm the EventCard is flexible enough — it should already adapt because the card uses `aspect-[4/3]` on its image and flex column layout. The card title at 18-20px will read fine even when the card is larger.

3. Optionally, add a `featured` prop to EventCard that bumps the title to 24px when true. For M4.5, the default sizing is acceptable.

TEST GATE:
- `npm run lint` passes, `npm run build` passes
- Visual: desktop view of `/`, confirm first event card is roughly 2x the area of the others
- Mobile view, confirm cards stack 1-up, no horizontal overflow
- Commit: `feat(m4.5): Trending Now grid with featured card spanning 2x2 on lg+, decision 5`
- Push.
```

---

## Prompt B8 — Trusted by organisers / social proof section

**DEPENDS ON:** B7.

```
Per design system v3 §10 and decision 8, add a social proof section to the homepage showing organiser logos (only if 6+ are available).

Task:
1. Decide based on what you have. Run a query to count active organisations:

```bash
# Manual check first — if you have fewer than 6 active organisations with logos, SKIP this prompt and document why.
```

If you have 6+ active organisations with `logo_url`, build the section. Otherwise, place a placeholder stub and TODO note.

2. Create `src/components/features/social-proof/organiser-logos.tsx`:

```tsx
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'

export async function OrganiserLogosSection() {
  const supabase = await createClient()
  const { data: organisations } = await supabase
    .from('organisations')
    .select('id, name, logo_url')
    .eq('status', 'active')
    .not('logo_url', 'is', null)
    .limit(12)

  if (!organisations || organisations.length < 6) {
    // Hide the section if fewer than 6 logos available — empty social proof is worse than none
    return null
  }

  return (
    <section aria-labelledby="trust-heading" className="bg-canvas py-14 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">
            Trusted by organisers
          </p>
          <h2 id="trust-heading" className="mt-2 font-display text-2xl sm:text-3xl font-bold text-ink-900">
            Building culture across the diaspora
          </h2>
        </div>
        <div className="mt-10 rounded-2xl bg-ink-900 p-8 sm:p-12">
          <div className="grid grid-cols-3 gap-x-8 gap-y-10 sm:grid-cols-4 lg:grid-cols-6 items-center">
            {organisations.map(org => (
              <div key={org.id} className="flex items-center justify-center">
                {org.logo_url ? (
                  <Image
                    src={org.logo_url}
                    alt={org.name}
                    width={120}
                    height={48}
                    className="max-h-12 w-auto object-contain opacity-80 hover:opacity-100 transition-opacity invert brightness-0"
                  />
                ) : (
                  <span className="font-display text-sm font-bold text-white/80 text-center">
                    {org.name.toUpperCase()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
```

3. Insert into `src/app/page.tsx` between By City and For Organisers:

```tsx
<OrganiserLogosSection />
```

4. The `invert brightness-0` filter forces logos to monochrome white on the dark surface. If a logo is already white, it'll stay correct. If it's coloured, it becomes white silhouette. This is the DICE pattern.

TEST GATE:
- `npm run lint` passes, `npm run build` passes
- Visual: if 6+ organisations exist, section renders. If not, section is null and doesn't appear (this is correct behaviour)
- Commit: `feat(m4.5): organiser logos social proof section, hides when <6 logos available, decision 8`
- Push.
```

---

## Prompt B9 — Stream B verification pass

**DEPENDS ON:** B1 through B8 complete.

```
Verify the homepage end-to-end against the design system spec.

Task:
1. Pull latest:
```bash
git pull origin m4.5/visual-lift
```

2. Run all checks:
```bash
npm run lint
npm run build
npx tsc --noEmit
```

3. Start dev server:
```bash
npm run dev
```

4. Visit `http://localhost:3000` and verify each item below. Tick each one as confirmed:

- [ ] No Melbourne pin pill in nav (mobile or desktop)
- [ ] Pill search bar present, centred on desktop, second-row on mobile
- [ ] EVENTLINQS• logo with gold dot in nav
- [ ] Hero H1 "Where the culture gathers" with gold "culture" word
- [ ] Hero featured card is solid `bg-ink-900` (NOT translucent), gold border, gold filled CTA
- [ ] Hero pulse dot in gold
- [ ] TRENDING NOW: gold left bar, gold caps eyebrow, large display title, "See all events →" link
- [ ] First trending card spans 2x2 on desktop, larger than others
- [ ] All event cards have rounded-2xl corners, hover lifts -1, image scales 105% on hover
- [ ] Card titles at 18-20px in display bold
- [ ] Date in gold caps tracking-widest
- [ ] CULTURE PICKS shows only tabs with events (no dashed empty boxes)
- [ ] LIVE ON EVENTLINQS marquee scrolls slowly, hover pauses
- [ ] BY CITY tiles show real photographs (not coloured panels)
- [ ] City names in white extrabold over dark gradient
- [ ] TRUSTED BY ORGANISERS section appears IF 6+ orgs with logos exist (and is hidden otherwise)
- [ ] FOR ORGANISERS section unchanged (preserve existing dark split)
- [ ] No `\u2026` or other unicode escapes rendered as literal text anywhere

5. Resize browser to mobile (375px wide) and verify:
- [ ] Search pill drops to second row
- [ ] Cards stack 1-up
- [ ] City tiles 2-up
- [ ] Marquee still scrolls
- [ ] Featured card appears above subhead on hero (vertical stack, not side-by-side)

6. If any check fails, file the issue and fix in a follow-up commit. Notify the user once all checks pass.

Commit: `chore(m4.5): Stream B verification pass — all homepage decisions verified`
Push.
```

---

# STREAM C — Event detail full rebuild + multi-image upload

**Owner:** Tab 3
**Goal:** Lift the event detail page from text-dump to Ticketmaster-grade. Wire multi-image upload.
**Estimated commits:** 6
**Estimated time:** 6-8 hours

---

## Prompt C1 — Multi-image upload (organiser side)

**DEPENDS ON:** none. Start immediately (parallel to Stream A).

```
The events table already has a `gallery_urls: string[]` column. The event creation/edit form needs to accept multiple images (up to 10) and store them.

Task:
1. Open `src/components/features/events/event-form.tsx`. Find the existing image upload field (currently single image to `cover_image_url`).

2. Add a new field below the cover image upload for additional gallery images:

```tsx
{/* Gallery uploader — up to 9 additional images, total 10 with cover */}
<div className="space-y-2">
  <label className="block text-sm font-semibold text-ink-900">
    Additional images
  </label>
  <p className="text-xs text-ink-500">
    Up to 9 more images. The cover image (above) is the first one fans see.
    Additional images appear in a swipeable carousel.
  </p>

  <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
    {galleryUrls.map((url, idx) => (
      <div key={url} className="relative aspect-square rounded-lg overflow-hidden border border-ink-200 group">
        <Image src={url} alt={`Gallery image ${idx + 1}`} fill className="object-cover" sizes="120px" />
        <button
          type="button"
          onClick={() => removeGalleryImage(idx)}
          className="absolute top-1 right-1 h-6 w-6 rounded-full bg-ink-900/80 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          aria-label={`Remove image ${idx + 1}`}
        >
          ✕
        </button>
      </div>
    ))}

    {galleryUrls.length < 9 && (
      <label className="aspect-square rounded-lg border-2 border-dashed border-ink-200 hover:border-gold-500 cursor-pointer flex flex-col items-center justify-center gap-1 transition-colors">
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={handleGalleryUpload}
          disabled={uploadingGallery}
        />
        <svg className="h-6 w-6 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        <span className="text-xs text-ink-500">Add</span>
      </label>
    )}
  </div>
</div>
```

3. Add state and handlers:

```tsx
const [galleryUrls, setGalleryUrls] = useState<string[]>(event?.gallery_urls ?? [])
const [uploadingGallery, setUploadingGallery] = useState(false)

const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = Array.from(e.target.files ?? [])
  if (files.length === 0) return

  const remainingSlots = 9 - galleryUrls.length
  const filesToUpload = files.slice(0, remainingSlots)

  setUploadingGallery(true)
  try {
    const newUrls: string[] = []
    for (const file of filesToUpload) {
      // Reuse existing upload helper from src/lib/upload.ts
      const url = await uploadEventImage(file)
      if (url) newUrls.push(url)
    }
    setGalleryUrls(prev => [...prev, ...newUrls])
  } catch (err) {
    console.error('[gallery upload] error:', err)
  } finally {
    setUploadingGallery(false)
    e.target.value = '' // reset so same file can be picked again
  }
}

const removeGalleryImage = (index: number) => {
  setGalleryUrls(prev => prev.filter((_, i) => i !== index))
}
```

4. Include `galleryUrls` in the form submission payload — wherever the form posts to `createEvent` or `updateEvent`, add `gallery_urls: galleryUrls`.

5. Update the corresponding server action in `src/app/actions/events.ts` (or equivalent) to persist `gallery_urls` to the events table.

6. Verify image upload limit. The brief says 10MB per image. Check `src/lib/upload.ts` for the size validation. If it caps at less, raise to 10MB. Confirm WEBP is in the accepted MIME types.

TEST GATE:
- `npm run lint` passes, `npm run build` passes
- Manual test: log in as an organiser, edit an event, upload 3 additional images. Save. Reload the form. Confirm all 3 still show.
- Database check (Supabase dashboard): query `select id, title, gallery_urls from events where slug = 'your-test-event'` — confirm array of 3 URLs
- Commit: `feat(m4.5): multi-image gallery upload up to 10 images, organiser event form`
- Push.
```

---

## Prompt C2 — Event detail page hero rebuild

**DEPENDS ON:** A4 (ImageCarousel), A5 (SmartMedia), C1 (gallery_urls in DB).

```
Open `src/app/events/[slug]/page.tsx`. The current page uses stale Tailwind tokens (`bg-gray-50`, `bg-blue-100`), object-contain hero, no SiteHeader/SiteFooter. Full rebuild required.

Task:
1. **Wrap with SiteHeader and SiteFooter.** Remove the ad-hoc nav at line 282-289 and use the proper components.

2. **Replace the hero.** Replace the current `event.cover_image_url` block (lines 292-303) with the carousel:

```tsx
import { ImageCarousel } from '@/components/ui/image-carousel'
import { SmartMedia } from '@/components/ui/smart-media'

// In the page body:
<section aria-label="Event images" className="bg-canvas">
  <div className="mx-auto max-w-7xl px-0 sm:px-6 lg:px-8 lg:pt-6">
    {(() => {
      const allImages = [
        ...(event.cover_image_url ? [{ url: event.cover_image_url, alt: event.title }] : []),
        ...((event.gallery_urls ?? []).map(url => ({ url, alt: event.title }))),
      ]

      if (allImages.length === 0) {
        return (
          <div className="aspect-[4/5] sm:aspect-video lg:rounded-2xl overflow-hidden">
            <SmartMedia
              src={null}
              fallbackCategory={event.category?.slug}
              alt={event.title}
              fill
              sizes="(max-width: 1024px) 100vw, 1280px"
              className="object-cover"
              priority
            />
          </div>
        )
      }

      return (
        <ImageCarousel
          images={allImages}
          aspectRatio="4/5"
          showArrows={allImages.length > 1}
          showCounter={allImages.length > 1}
          showDots={allImages.length > 1}
          rounded="lg:rounded-2xl"
          priority
        />
      )
    })()}
  </div>
</section>
```

For desktop, the carousel is contained max-w-7xl with rounded-2xl. For mobile, it's full-bleed (px-0). Aspect ratio 4:5 reads more poster-like.

3. **Replace stale Tailwind classes.** Search the file for `bg-gray-50`, `bg-blue-100`, `text-blue-600`, `border-gray-200`, `bg-white` (where it should be `bg-canvas`) — replace with design system tokens:
- `bg-gray-50` → `bg-canvas`
- `bg-blue-100` → `bg-gold-100`
- `text-blue-600` → `text-gold-600`
- `border-gray-200` → `border-ink-200`
- Date/location icon backgrounds: `bg-blue-100` → `bg-gold-100`, `text-blue-600` → `text-gold-600`

4. **Update the H1 and category eyebrow.** Replace:
```tsx
{event.category && (
  <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-0.5 text-xs font-medium text-blue-700">
    {event.category.name}
  </span>
)}
<h1 className="mt-3 text-3xl font-bold text-gray-900">{event.title}</h1>
```

With:
```tsx
{event.category && (
  <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">
    {event.category.name}
  </p>
)}
<h1 className="mt-2 font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight text-ink-900">
  {event.title}
</h1>
```

TEST GATE:
- `npm run lint` passes, `npm run build` passes
- Visual: visit any event detail page. Confirm SiteHeader at top (with pill search). Carousel hero with dots, counter, arrows. Bold display H1. Gold eyebrow. No grey/blue Tailwind defaults
- If event has 1 image only: shows single image, no dots/arrows
- If event has 0 images: shows SmartMedia Pexels fallback
- Commit: `feat(m4.5): event detail hero rebuild — carousel, design system tokens, SiteHeader/Footer wrap`
- Push.
```

---

## Prompt C3 — Event detail sticky bottom action bar

**DEPENDS ON:** A6 (StickyActionBar), C2.

```
Wire the StickyActionBar into the event detail page mobile view.

Task:
1. In `src/app/events/[slug]/page.tsx`, calculate availability status from inventory:

```tsx
function getAvailabilityStatus(inventory: { percent_sold: number; available: number }): {
  status: 'good' | 'low' | 'critical' | 'sold_out'
  label: string
} {
  if (inventory.available === 0) return { status: 'sold_out', label: 'Sold out' }
  if (inventory.percent_sold >= 90) return { status: 'critical', label: 'Almost gone' }
  if (inventory.percent_sold >= 50) return { status: 'low', label: 'Selling fast' }
  return { status: 'good', label: 'Tickets available' }
}

// After eventInventory is built:
const availability = eventInventory ? getAvailabilityStatus(eventInventory) : null
const cheapestTier = event.ticket_tiers.length > 0
  ? event.ticket_tiers.reduce((min, t) => t.price < min.price ? t : min, event.ticket_tiers[0])
  : null
```

2. Add the sticky bar at the end of the page (just before the SiteFooter):

```tsx
import { StickyActionBar } from '@/components/ui/sticky-action-bar'

// Before SiteFooter:
{cheapestTier && availability && (
  <StickyActionBar
    priceLabel={`$${(cheapestTier.price / 100).toFixed(0)}`}
    currency={cheapestTier.currency ?? 'AUD'}
    availabilityStatus={availability.status}
    availabilityLabel={availability.label}
    ctaLabel={availability.status === 'sold_out' ? 'Sold out' : 'Get tickets'}
    ctaHref="#tickets"
  />
)}
```

3. Add `pb-24 lg:pb-0` to the main content wrapper to ensure the sticky bar doesn't cover the last content on mobile.

4. Add an `id="tickets"` to the ticket selector section so the CTA scrolls to it.

TEST GATE:
- `npm run lint` passes, `npm run build` passes
- Mobile: visit any event detail page at < 1024px viewport. Confirm sticky bar at bottom with: From AUD $X | green/amber/red dot + label | gold "Get tickets" CTA
- Tap "Get tickets" — page scrolls to ticket selector
- Desktop: sticky bar does NOT appear (lg:hidden working)
- Commit: `feat(m4.5): event detail sticky bottom action bar with availability status, decision 10`
- Push.
```

---

## Prompt C4 — Event detail body sections (When & Where, Organiser, Share)

**DEPENDS ON:** C3.

```
Per design system v3 §12, restructure the event detail body to include proper When & Where (with venue map), Organiser section, and Share section.

Task:
1. After the H1/eyebrow block, add an About section if `event.description` exists:

```tsx
{event.description && (
  <section className="mt-10">
    <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">
      About
    </p>
    <div
      className="mt-3 prose prose-ink max-w-none text-base leading-relaxed text-ink-700"
      dangerouslySetInnerHTML={{ __html: event.description }}
    />
  </section>
)}
```

(If `event.description` is markdown not HTML, render appropriately. The current schema may use markdown.)

2. When & Where section with Google Maps Static API embed:

```tsx
<section className="mt-10">
  <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">
    When & where
  </p>
  <div className="mt-4 rounded-2xl border border-ink-100 bg-white p-6">
    <div className="flex items-start gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold-100 text-gold-600">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
      <div>
        <p className="font-display text-base font-bold text-ink-900">
          {formatDateTime(event.start_date, event.timezone)}
        </p>
        {event.end_date && (
          <p className="text-sm text-ink-600 mt-1">
            Ends {formatDateTime(event.end_date, event.timezone)}
          </p>
        )}
      </div>
    </div>

    {(event.venue_name || event.venue_address) && (
      <div className="mt-6 flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold-100 text-gold-600">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <div className="flex-1">
          {event.venue_name && (
            <p className="font-display text-base font-bold text-ink-900">{event.venue_name}</p>
          )}
          {event.venue_address && (
            <p className="text-sm text-ink-600 mt-1">
              {event.venue_address}
              {event.venue_city && `, ${event.venue_city}`}
              {event.venue_state && `, ${event.venue_state}`}
            </p>
          )}

          {event.venue_latitude && event.venue_longitude && process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && (
            <div className="mt-4 aspect-video rounded-lg overflow-hidden border border-ink-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://maps.googleapis.com/maps/api/staticmap?center=${event.venue_latitude},${event.venue_longitude}&zoom=15&size=600x300&scale=2&markers=color:0xD4A017%7C${event.venue_latitude},${event.venue_longitude}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`}
                alt={`Map showing ${event.venue_name ?? 'venue location'}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          )}

          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${event.venue_name ?? ''} ${event.venue_address ?? ''}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-gold-600 hover:text-gold-700"
          >
            Open in Google Maps →
          </a>
        </div>
      </div>
    )}
  </div>
</section>
```

Note: The Google Maps API key needs to be exposed as `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` for client-side usage of the static map URL. If it's currently server-only (`GOOGLE_MAPS_API_KEY`), add the public version.

3. Organiser section:

```tsx
{event.organisation && (
  <section className="mt-10">
    <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">
      Organiser
    </p>
    <div className="mt-4 rounded-2xl border border-ink-100 bg-white p-6 flex items-center gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink-900 text-white font-display font-bold">
        {event.organisation.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1">
        <p className="font-display text-base font-bold text-ink-900">{event.organisation.name}</p>
        {event.organisation.description && (
          <p className="text-sm text-ink-600 mt-1 line-clamp-2">{event.organisation.description}</p>
        )}
      </div>
      <Link
        href={`/organisers/${event.organisation.slug}`}
        className="shrink-0 text-sm font-medium text-gold-600 hover:text-gold-700"
      >
        View →
      </Link>
    </div>
  </section>
)}
```

4. Share section using the existing CopyLinkButton plus WhatsApp:

```tsx
<section className="mt-10">
  <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">
    Share this event
  </p>
  <div className="mt-4 flex flex-wrap gap-3">
    <CopyLinkButton url={`https://eventlinqs.com/events/${event.slug}`} />
    <a
      href={`https://wa.me/?text=${encodeURIComponent(`Check out ${event.title} on EventLinqs: https://eventlinqs.com/events/${event.slug}`)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-100 transition-colors"
    >
      <svg className="h-4 w-4 text-success" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
      WhatsApp
    </a>
  </div>
</section>
```

TEST GATE:
- `npm run lint` passes, `npm run build` passes
- Visual: visit event detail with venue lat/long. Confirm Google Maps static image renders with gold pin
- "Open in Google Maps →" opens new tab to maps
- WhatsApp button opens wa.me share intent
- All sections use design system tokens, no grey/blue defaults
- Commit: `feat(m4.5): event detail body sections — When & Where with map, Organiser, Share`
- Push.
```

---

## Prompt C5 — Fans also viewed rail

**DEPENDS ON:** B2 (EventCard upgrade), C4.

```
Add a "Fans also viewed" rail at the bottom of the event detail page (Ticketmaster pattern, image 17).

Task:
1. Add a query in the page that fetches up to 6 other published events in the same category, excluding the current event:

```tsx
const { data: relatedRaw } = await supabase
  .from('events')
  .select('id, slug, title, cover_image_url, thumbnail_url, gallery_urls, start_date, venue_name, venue_city, venue_country, created_at, category:event_categories(name, slug), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)')
  .eq('status', 'published')
  .eq('visibility', 'public')
  .gte('start_date', new Date().toISOString())
  .neq('id', event.id)
  .eq('category_id', event.category_id ?? '')
  .order('start_date', { ascending: true })
  .limit(6)

const related = (relatedRaw ?? []) as unknown as EventCardData[]
const relatedPrices = await getDynamicPriceMap(cheapestTierIds(related))
```

2. Render after the Share section:

```tsx
{related.length > 0 && (
  <section className="mt-14">
    <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">
      Fans also viewed
    </p>
    <h2 className="mt-2 font-display text-2xl font-bold text-ink-900">
      More you might like
    </h2>
    <div className="mt-6 flex gap-4 overflow-x-auto pb-4 scrollbar-none snap-x snap-mandatory">
      {related.map(rel => (
        <div key={rel.id} className="shrink-0 w-72 snap-start">
          <EventCard event={rel} dynamicPrices={relatedPrices} />
        </div>
      ))}
    </div>
  </section>
)}
```

The horizontal scroll with snap behaviour mirrors Airbnb's "Popular homes in Sydney" rail and Ticketmaster's "Fans also viewed".

TEST GATE:
- `npm run lint` passes, `npm run build` passes
- Visual: visit event detail. Scroll to bottom. Confirm horizontal rail with snap-scroll, 6 related cards if available
- Section hides when no related events exist
- Commit: `feat(m4.5): event detail "Fans also viewed" horizontal snap rail, Ticketmaster pattern`
- Push.
```

---

## Prompt C6 — Stream C verification + final M4.5 sign-off

**DEPENDS ON:** C5 + A7 + B9 all complete.

```
Final verification of Module 4.5 visual lift.

Task:
1. Pull latest, run all checks:
```bash
git pull origin m4.5/visual-lift
npm install
npm run lint
npm run build
npx tsc --noEmit
```

2. Test as a fan (logged out):
- Visit `/`. Verify Stream B's homepage checklist (B9).
- Click into any event. Verify Stream C's detail page checklist below.

Event detail checklist:
- [ ] SiteHeader at top with pill search bar
- [ ] Carousel hero (if multiple images) or single SmartMedia hero
- [ ] Eyebrow "CATEGORY" in gold caps
- [ ] H1 in display extrabold
- [ ] About section with event description
- [ ] When & Where with date, venue, Google Maps static image with gold pin
- [ ] "Open in Google Maps →" link works
- [ ] Organiser section with avatar, name, View link
- [ ] Share section with Copy link + WhatsApp button
- [ ] Fans also viewed rail (horizontal snap scroll) if related events exist
- [ ] SiteFooter at bottom
- [ ] Mobile: sticky bottom action bar — From price | availability dot | gold "Get tickets" CTA
- [ ] Desktop: ticket selector visible in right column, sticky on scroll

3. Test as an organiser:
- Log in. Navigate to event edit form
- Confirm cover image + gallery upload (up to 9 additional)
- Upload 3 images. Save. Reload. All images persisted
- View the event as a fan — confirm carousel shows on detail and card

4. Run full lint and build one more time:
```bash
npm run lint
npm run build
```

5. If all pass, merge to main:
```bash
git checkout main
git pull origin main
git merge m4.5/visual-lift --no-ff -m "feat(m4.5): visual lift — Ticketmaster-grade design system applied"
git push origin main
```

6. Tag the release:
```bash
git tag -a m4.5-visual-lift -m "Module 4.5 — visual lift complete, design system v3 applied"
git push origin m4.5-visual-lift
```

7. Verify Vercel auto-deploys from main. Visit eventlinqs.com on a real mobile device. Confirm everything that worked in dev still works in prod.

8. Report back to user with:
- Total commit count
- Total time elapsed
- Any items that were deferred to M5 with reason

Commit: `chore(m4.5): final verification, all decisions verified, merging to main`
```

---

# Cross-stream coordination notes

- **Streams A, B, C can run in parallel** as long as B and C wait for A's primitives where noted.
- A1 has no dependencies — start immediately in Tab 1.
- C1 has no dependencies — start immediately in Tab 3.
- B1 waits only on A2 (logo) — start as soon as A2 is pushed.
- Suggested kickoff sequence:
  - Tab 1 (Stream A): start A1 immediately
  - Tab 3 (Stream C): start C1 immediately (parallel to A1)
  - Tab 2 (Stream B): wait until A2 is pushed (~30 min), then start B1
- The verification prompts (A7 ends Stream A, B9 ends Stream B, C6 ends Stream C and merges) are sequential blockers.
- If any stream hits an unforeseen issue, it must NOT modify another stream's files. Coordinate via the user.

---

# Definition of done for M4.5

Module 4.5 is "done" when:

1. Every checklist item in B9 and C6 verifies green
2. `npm run lint`, `npm run build`, `npx tsc --noEmit` all pass on main
3. Production deploy at eventlinqs.com renders the new homepage and event detail correctly on a real iPhone and a real Android phone
4. The "Apple test" passes on the homepage and event detail page (design system v3 §18)
5. No `\u2026`, `\u2013`, `\u2014`, or other unicode escapes render as literal text anywhere
6. No Melbourne pin pill exists in any nav state
7. No dashed-grey-border empty state exists anywhere
8. Every event card supports up to 5 images via carousel
9. Event detail page has sticky bottom CTA on mobile
10. The deployed site is meaningfully better than DICE, Airbnb, and Ticketmaster combined for the diaspora ticketing use case

When all 10 are true, EventLinqs is ready for the M5 push.

---

End of Module 4.5 manifest.
