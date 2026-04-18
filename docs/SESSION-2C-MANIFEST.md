# SESSION 2C — M4.5 FINISHING LINE
## Diagnostic Report + Three-Stream Scope Manifest (FINAL)

**Project:** EventLinqs
**Executor:** Claude Code (Opus 4.7, xhigh effort) across 3 parallel terminal tabs
**Repo:** github.com/eventlinqs/eventlinqs-app
**Branch:** main (review locally before push, no auto-commits)
**Standard:** Silicon Valley + 2026 web design playbook. Benchmark and beat: Ticketmaster, DICE FM, Resident Advisor, Eventbrite, Airbnb. After this session ships, M4.5 is closed and we move to Module 5.

---

## EXECUTION MODEL

Three parallel CC tabs, no file collisions. Open three PowerShell tabs, each running CC in `C:\Users\61416\OneDrive\Desktop\EventLinqs\eventlinqs-app`. Paste the matching stream prompt into each. Run simultaneously.

- **Stream A — Visceral Public Site (bento grid + smart media + micro-animations)**
- **Stream B — Seat Selector + Checkout Visual Lift**
- **Stream C — Bug Fixes + Logo Rollout + M3 Verification**

Expected runtime: 90-120 minutes per tab. Stream A is the biggest because it's the visceral experience layer.

---

# PART 1 — DIAGNOSTIC REPORT

(Same as previous draft. All findings still apply. Summarised:)

1.1 Homepage hero is a placeholder ("TRENDING NOW stub", picsum images)
1.2 Event cards are uniform-grid only (no bento, no editorial hierarchy)
1.3 Event detail page needs full audit and lift
1.4 Seat selector uses blue brand colour, not gold
1.5 Seat selector has known twitch on hover bottom rows
1.6 Seat selector legend shows "A A A" instead of section names
1.7 Sold-out event UX is bare
1.8 `/organisers/signup` is a placeholder waitlist (contradicts Decision A)
1.9 Dashboard event row drops into edit, skipping view
1.10 "Networking" hero category mismatches footer "Business & Summits"
1.11 Logo concept picked but not rolled out (Concept A, Option 2 spacing)
1.12 Image upload limit 5MB, JPG only — needs 10MB + WEBP
1.13 M3 polish items unverified after M4 refactors (cover image cropping, inline org creation, organisation nav discoverability)
1.14 189 instances of off-brand colours across codebase

---

# PART 2 — NORTH STAR (apply to every change)

1. Production-quality on every surface. No stubs, no "data wired later", no placeholder colours, no flat coloured rectangles.
2. Brand: gold (var(--color-gold-500)), ink-900 for primary text, Australian English, no em/en-dashes as punctuation, no exclamation marks.
3. EVENTLINQS wordmark = the new component, used everywhere.
4. Empty states: headline + sub-copy + CTA. Always.
5. Hover states with gold accent + lift + scale.
6. Mobile-first responsive at 375px, 768px, 1280px.
7. Accessibility: keyboard nav, ARIA labels, visible focus, WCAG AA contrast.
8. UTF-8 without BOM.
9. `npm run build` and `npm run lint` pass before marking complete.
10. **Visual benchmark:** DICE + Ticketmaster + Resident Advisor + Apple's marketing pages. If a senior designer wouldn't approve it, don't ship it.
11. **Motion is mandatory.** Static pages are dead. Every meaningful surface has at least one purposeful animation: hover transitions, Ken Burns zoom on hero imagery, scroll-triggered fades on section entry, micro-interactions on buttons.
12. **Smart media everywhere.** No event ever shows a generic image. Category-aware photography pulled from Pexels API, video where available, graceful fallbacks.

---

# PART 3 — STREAM A: VISCERAL PUBLIC SITE

**Tab 1.** This is the biggest and most important stream. It transforms the site from "linear and professional" to "magnetic, sticky, kinetic."

**Files:**
- `src/app/page.tsx` (homepage rebuild)
- `src/app/events/page.tsx` (events listing — featured + bento)
- `src/app/events/[slug]/page.tsx` (event detail full lift)
- `src/components/features/events/event-card.tsx` (existing — extend)
- `src/components/features/events/event-bento-tile.tsx` (NEW — universal bento tile)
- `src/components/features/events/featured-event-hero.tsx` (NEW — the big hero tile)
- `src/components/features/events/bento-grid.tsx` (NEW — grid wrapper with named layouts)
- `src/components/features/events/city-tile.tsx` (NEW — By City tiles)
- `src/components/features/events/free-weekend-tile.tsx` (NEW — replaces Gospel)
- `src/components/features/events/this-week-strip.tsx` (NEW — horizontal scroll strip)
- `src/components/ui/smart-media.tsx` (NEW — universal media component: still / Ken Burns / video / carousel)
- `src/components/ui/glass-card.tsx` (NEW — glassmorphism card primitive)
- `src/lib/images/category-photo.ts` (NEW — Pexels photo pipeline)
- `src/lib/images/category-video.ts` (NEW — Pexels video pipeline)
- `src/lib/images/event-media.ts` (NEW — orchestrator: organiser uploads vs Pexels fallback)
- Brand colour sweep across listed offenders

**This stream is the "make it visceral" stream. Bento grid layout + smart media (photo/video/carousel) + micro-animations + glassmorphism + live data signals.**

---

## A.0 SMART MEDIA PIPELINE — THE FOUNDATION

Every visual upgrade depends on this. Build first. Everything else consumes it.

### A.0.1 Pexels API setup

Lawal needs a free Pexels API key. Free tier: 200 requests/hour, 20,000/month. More than enough for SSG/ISR.

Stream A produces a checklist: `docs/PEXELS-API-SETUP.md` with 3 steps:
1. Visit pexels.com/api → create free account
2. Copy API key
3. Add to `.env.local` and Vercel: `PEXELS_API_KEY=xxx`

If env var missing, all functions fall back to local placeholder images (Stream A creates `/public/images/event-fallback-hero.jpg` and `/public/images/event-fallback-thumb.jpg` — solid ink-900 colour with EVENTLINQS gold dot watermark, generated as SVG).

### A.0.2 New file: `src/lib/images/category-photo.ts`

```ts
import { unstable_cache } from 'next/cache'

const PEXELS_API_KEY = process.env.PEXELS_API_KEY
const PEXELS_API = 'https://api.pexels.com/v1'

const CATEGORY_QUERIES: Record<string, string> = {
  'afrobeats': 'afrobeats concert party crowd lights',
  'amapiano': 'south africa club dance party night',
  'gospel': 'gospel choir worship singing',
  'owambe': 'nigerian wedding celebration colourful party',
  'caribbean': 'caribbean carnival dance party tropical',
  'heritage-and-independence': 'african culture festival flag celebration',
  'networking': 'business conference networking professional event',
  'music': 'concert crowd stage lights performance',
  'sports': 'stadium crowd sports event excited fans',
  'arts-culture': 'art exhibition gallery culture event',
  'food-drink': 'food festival outdoor restaurant tasting',
  'business-networking': 'business conference networking suits handshake',
  'comedy': 'stand up comedy stage spotlight microphone',
  'family': 'family festival outdoor children fun',
  'fashion': 'fashion runway show models stylish',
  'film': 'cinema movie premiere red carpet',
  'health-wellness': 'yoga wellness meditation outdoor calm',
  'religion': 'church congregation worship community',
  'community': 'community gathering people diverse celebration',
  'charity': 'charity fundraiser people helping volunteers',
  'education': 'lecture seminar audience learning',
  'festival': 'music festival outdoor crowd lights stage',
  'nightlife': 'nightclub party dj dance lights',
  'technology': 'tech conference startup speakers innovation',
  'other': 'event celebration crowd people gathering',
}

export interface PexelsPhoto {
  src: string
  thumb: string
  alt: string
  photographer: string
}

const FALLBACK: PexelsPhoto = {
  src: '/images/event-fallback-hero.jpg',
  thumb: '/images/event-fallback-thumb.jpg',
  alt: 'EventLinqs',
  photographer: 'EventLinqs',
}

async function fetchPexelsRaw(query: string): Promise<PexelsPhoto> {
  if (!PEXELS_API_KEY) return FALLBACK

  try {
    const res = await fetch(
      `${PEXELS_API}/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape`,
      {
        headers: { Authorization: PEXELS_API_KEY },
        next: { revalidate: 60 * 60 * 24 * 7 },
      }
    )
    if (!res.ok) return FALLBACK
    const data = await res.json()
    if (!data.photos?.length) return FALLBACK

    const hash = simpleHash(query)
    const photo = data.photos[hash % data.photos.length]

    return {
      src: photo.src.large,
      thumb: photo.src.medium,
      alt: photo.alt || query,
      photographer: photo.photographer,
    }
  } catch {
    return FALLBACK
  }
}

const fetchPexels = unstable_cache(
  fetchPexelsRaw,
  ['pexels-category-photo'],
  { revalidate: 60 * 60 * 24 * 7, tags: ['pexels'] }
)

function simpleHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export async function getCategoryPhoto(categorySlug: string | null | undefined): Promise<PexelsPhoto> {
  const slug = (categorySlug || 'other').toLowerCase()
  const query = CATEGORY_QUERIES[slug] ?? CATEGORY_QUERIES.other
  return await fetchPexels(query)
}
```

### A.0.3 New file: `src/lib/images/category-video.ts`

Pexels also has a video API. Same pattern but returns video URLs.

```ts
import { unstable_cache } from 'next/cache'

const PEXELS_API_KEY = process.env.PEXELS_API_KEY
const PEXELS_VIDEO_API = 'https://api.pexels.com/videos'

// Tuned video queries — different from photo because video search returns different results
const VIDEO_QUERIES: Record<string, string> = {
  'afrobeats': 'concert crowd dancing lights',
  'amapiano': 'club dancing party night',
  'gospel': 'choir singing worship',
  'comedy': 'comedy stage performance',
  'music': 'concert stage lights crowd',
  'festival': 'festival crowd outdoor music',
  'business-networking': 'business conference people talking',
  'food-drink': 'food market people eating',
  'sports': 'stadium fans cheering',
  'nightlife': 'nightclub dj party',
  'other': 'people celebrating event',
}

export interface PexelsVideo {
  src: string         // mp4 URL, ~720p
  poster: string      // thumbnail still
  duration: number
}

const FALLBACK_VIDEO: PexelsVideo | null = null

async function fetchVideoRaw(query: string): Promise<PexelsVideo | null> {
  if (!PEXELS_API_KEY) return FALLBACK_VIDEO

  try {
    const res = await fetch(
      `${PEXELS_VIDEO_API}/search?query=${encodeURIComponent(query)}&per_page=10&orientation=landscape`,
      {
        headers: { Authorization: PEXELS_API_KEY },
        next: { revalidate: 60 * 60 * 24 * 30 },  // 30 days for video
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!data.videos?.length) return null

    // Prefer videos 8-20 sec (loop-friendly), fall back to first
    const candidates = data.videos.filter((v: { duration: number }) => v.duration >= 8 && v.duration <= 20)
    const video = candidates[0] ?? data.videos[0]

    // Find ~720p mp4 file
    const file = video.video_files
      .filter((f: { file_type: string }) => f.file_type === 'video/mp4')
      .sort((a: { width: number }, b: { width: number }) => Math.abs(a.width - 1280) - Math.abs(b.width - 1280))[0]

    if (!file) return null

    return {
      src: file.link,
      poster: video.image,
      duration: video.duration,
    }
  } catch {
    return null
  }
}

const fetchVideo = unstable_cache(
  fetchVideoRaw,
  ['pexels-category-video'],
  { revalidate: 60 * 60 * 24 * 30, tags: ['pexels-video'] }
)

export async function getCategoryVideo(categorySlug: string | null | undefined): Promise<PexelsVideo | null> {
  const slug = (categorySlug || 'other').toLowerCase()
  const query = VIDEO_QUERIES[slug] ?? VIDEO_QUERIES.other
  return await fetchVideo(query)
}
```

### A.0.4 New file: `src/lib/images/event-media.ts` — the orchestrator

Decides what media to show for any given event based on what the organiser uploaded vs what Pexels can provide.

```ts
import { getCategoryPhoto, type PexelsPhoto } from './category-photo'
import { getCategoryVideo, type PexelsVideo } from './category-video'

export type EventMedia =
  | { kind: 'video'; src: string; poster: string; duration: number }
  | { kind: 'carousel'; images: string[]; alts: string[] }
  | { kind: 'still-kenburns'; src: string; alt: string }

export interface EventMediaInput {
  cover_image_url?: string | null
  thumbnail_url?: string | null
  gallery_urls?: string[] | null
  video_url?: string | null
  category?: { slug?: string | null } | null
}

export async function getEventMedia(event: EventMediaInput): Promise<EventMedia> {
  // Priority 1: organiser uploaded a video
  if (event.video_url) {
    return {
      kind: 'video',
      src: event.video_url,
      poster: event.cover_image_url ?? '/images/event-fallback-hero.jpg',
      duration: 0,
    }
  }

  // Priority 2: organiser uploaded multiple gallery images (3+) → carousel
  if (event.gallery_urls && event.gallery_urls.length >= 3) {
    return {
      kind: 'carousel',
      images: event.gallery_urls,
      alts: event.gallery_urls.map(() => 'Event imagery'),
    }
  }

  // Priority 3: organiser uploaded a single cover image → Ken Burns still
  if (event.cover_image_url) {
    return {
      kind: 'still-kenburns',
      src: event.cover_image_url,
      alt: 'Event cover',
    }
  }

  // Priority 4: no organiser media → category-aware fallback
  // For featured/hero context (high-stakes), prefer video
  // For card context (low-stakes), prefer photo
  // We default to photo here. Featured tile component decides if it wants video instead.
  const photo = await getCategoryPhoto(event.category?.slug)
  return {
    kind: 'still-kenburns',
    src: photo.src,
    alt: photo.alt,
  }
}

export async function getFeaturedEventMedia(event: EventMediaInput): Promise<EventMedia> {
  // Same as getEventMedia but for featured tile: try video first as fallback before photo
  if (event.video_url) {
    return {
      kind: 'video',
      src: event.video_url,
      poster: event.cover_image_url ?? '/images/event-fallback-hero.jpg',
      duration: 0,
    }
  }

  if (event.gallery_urls && event.gallery_urls.length >= 3) {
    return {
      kind: 'carousel',
      images: event.gallery_urls,
      alts: event.gallery_urls.map(() => 'Event imagery'),
    }
  }

  if (event.cover_image_url) {
    return {
      kind: 'still-kenburns',
      src: event.cover_image_url,
      alt: 'Event cover',
    }
  }

  // Featured tile fallback: try Pexels video first
  const video = await getCategoryVideo(event.category?.slug)
  if (video) {
    return {
      kind: 'video',
      src: video.src,
      poster: video.poster,
      duration: video.duration,
    }
  }

  // Final fallback: Pexels photo with Ken Burns
  const photo = await getCategoryPhoto(event.category?.slug)
  return {
    kind: 'still-kenburns',
    src: photo.src,
    alt: photo.alt,
  }
}
```

### A.0.5 New file: `src/components/ui/smart-media.tsx`

Universal media renderer. Takes an `EventMedia` object, renders the right thing.

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import type { EventMedia } from '@/lib/images/event-media'

interface Props {
  media: EventMedia
  className?: string
  /** When true, video autoplays. When false, plays on hover. */
  autoplay?: boolean
  /** Carousel rotation interval in ms (default 4000) */
  carouselInterval?: number
}

export function SmartMedia({ media, className = '', autoplay = false, carouselInterval = 4000 }: Props) {
  const [carouselIndex, setCarouselIndex] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hovered, setHovered] = useState(false)

  // Carousel rotation
  useEffect(() => {
    if (media.kind !== 'carousel') return
    const id = setInterval(() => {
      setCarouselIndex(i => (i + 1) % media.images.length)
    }, carouselInterval)
    return () => clearInterval(id)
  }, [media, carouselInterval])

  // Hover-to-play for video when autoplay=false
  useEffect(() => {
    if (media.kind !== 'video' || autoplay) return
    const v = videoRef.current
    if (!v) return
    if (hovered) {
      v.play().catch(() => {})
    } else {
      v.pause()
      v.currentTime = 0
    }
  }, [hovered, media, autoplay])

  if (media.kind === 'video') {
    return (
      <div
        className={`smart-media smart-media-video ${className}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <video
          ref={videoRef}
          src={media.src}
          poster={media.poster}
          muted
          playsInline
          loop
          autoPlay={autoplay}
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>
    )
  }

  if (media.kind === 'carousel') {
    return (
      <div className={`smart-media smart-media-carousel relative ${className}`}>
        {media.images.map((src, i) => (
          <img
            key={src}
            src={src}
            alt={media.alts[i] ?? ''}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
              i === carouselIndex ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              transform: i === carouselIndex ? 'scale(1.05)' : 'scale(1)',
              transition: 'opacity 1s ease, transform 4s ease',
            }}
          />
        ))}
      </div>
    )
  }

  // still-kenburns
  return (
    <div className={`smart-media smart-media-still relative overflow-hidden ${className}`}>
      <img
        src={media.src}
        alt={media.alt}
        className="absolute inset-0 w-full h-full object-cover smart-media-kenburns"
      />
    </div>
  )
}
```

In `globals.css`, add the Ken Burns animation:
```css
@keyframes kenburns {
  0% { transform: scale(1) translate(0, 0); }
  100% { transform: scale(1.08) translate(-1%, -1%); }
}
.smart-media-kenburns {
  animation: kenburns 12s ease-in-out infinite alternate;
}
```

### A.0.6 New file: `src/components/ui/glass-card.tsx`

Glassmorphism primitive used for badges, info chips overlaid on hero imagery, etc.

```tsx
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  className?: string
  variant?: 'light' | 'dark'
}

export function GlassCard({ children, className = '', variant = 'dark' }: Props) {
  const base = variant === 'dark'
    ? 'bg-black/30 backdrop-blur-md border border-white/10'
    : 'bg-white/40 backdrop-blur-md border border-white/30'
  return <div className={`${base} ${className}`}>{children}</div>
}
```

---

## A.1 BENTO GRID HOMEPAGE

### A.1.1 Layout architecture

Replace the entire homepage section structure (currently: linear stack of Hero + TRENDING NOW stub + CULTURE PICKS stub + FOR ORGANISERS) with:

1. SiteHeader (existing, stays)
2. **Cinematic Hero** (full viewport, video/carousel background, glassmorphism overlay)
3. **Bento Grid Row 1** (Featured event 7×4 + 3 supporting tiles)
4. **This Week strip** (horizontal scroll, 8-12 events)
5. **Cultural Picks** (refactored, tabbed but with bento layout per tab)
6. **By City bento** (4-6 cities, image backgrounds)
7. **Live Vibe section** (NEW — scrolling text marquee of live signals: "DJ Spinall just sold 5 tickets in Sydney · Naija Night gala 80% sold · Comedy showcase 6 days to go")
8. **For Organisers** (existing dark split, keep, polish only)
9. SiteFooter (existing)

### A.1.2 Cinematic Hero

Full viewport height (min-height: 90vh on desktop, 70vh mobile).

**Background layer:**
- If a `featured` event exists with video → autoplay loop full-bleed
- Else if a featured event has gallery → carousel
- Else → Pexels video for category 'other' or 'festival' as default
- Always: dark gradient overlay (`linear-gradient(180deg, rgba(10,22,40,0.4) 0%, rgba(10,22,40,0.8) 70%, rgba(10,22,40,1) 100%)`) so foreground text is legible

**Foreground content (left-aligned, max-width 600px, padding from left):**
- Tiny gold eyebrow: "FEATURED · Sat 26 Apr · Melbourne"
- Massive display headline (text-6xl on desktop, font-display, font-extrabold, white): the event title
- Sub-copy in white/80 (max 2 lines)
- Two CTAs side by side:
  - Primary: "Get tickets" (gold filled, white text, hover: scale 1.03 + subtle gold glow)
  - Secondary: "Browse all events" (ghost glassmorphism button — uses GlassCard variant='dark' wrapper)

**Right side — glassmorphism event quick info card:**
- Floating card on the right of hero (hidden mobile, visible from md breakpoint)
- Uses `<GlassCard variant="dark">` with padding
- Inside: small thumbnail of event, event title (smaller), date/venue, ticket price range
- Live signal at bottom: "🔴 47 tickets sold today" (pulsing red dot, real-time data via Supabase)

**Below the hero, just before bento grid starts:**
- Thin strip with city marquee: "Trusted by organisers in Melbourne · Sydney · London · Toronto · Lagos · Accra ·" — slow horizontal marquee animation (CSS only)

### A.1.3 Bento Grid Row 1 — the main attraction

**12-column CSS Grid.** 90px row height. 12px gap. Tiles span various grid cells.

**Layout (desktop):**
- Tile 1 (Featured event): `grid-column: span 7; grid-row: span 4` — the giant tile
- Tile 2 (Comedy or 2nd-priority event): `grid-column: span 5; grid-row: span 2` — wide horizontal
- Tile 3 (3rd event, e.g. Amapiano): `grid-column: span 3; grid-row: span 2`
- Tile 4 (Free Weekend tile, replaces Gospel): `grid-column: span 2; grid-row: span 2`

**Mobile:** stack vertically, all tiles full-width, featured stays largest.

**EVERY TILE renders via `<EventBentoTile>` which uses `<SmartMedia>` for the background.**

#### `<EventBentoTile>` spec

Props: `event`, `size` ('hero' | 'wide' | 'standard' | 'compact'), `useVideoFallback` (boolean — only true for hero).

Renders:
- Background: `<SmartMedia media={...}>` filling the tile, `position: absolute; inset: 0`
- Dark gradient overlay bottom-half for legibility (`linear-gradient(180deg, transparent 0%, transparent 50%, rgba(10,22,40,0.85) 100%)`)
- Top-left badge: category pill (glass-card variant='dark', uppercase, 10px, white text)
- Top-right (hero size only): "FEATURED" gold ribbon
- Bottom content stack:
  - Date (small, gold)
  - Title (size scales with tile: hero=24px, wide=18px, standard=14px, compact=12px — all bold, white)
  - Sub-detail line: venue, city, lineup snippet
  - Bottom row: price + "Get tickets →" CTA on hero/wide, just price chip on smaller
- **Hover state:** image zooms 105% over 600ms, gold border appears (2px), subtle glow shadow, content slides up 4px, "→" arrow on CTA slides right 4px
- **Live signal pill (small)** in top-right of hero/wide tiles when applicable: "🔴 47 sold today" / "🔥 80% sold" / "⏰ 3 days left" — pulsing dot, glass-card

**Special rule for hero (7×4) tile:**
- If event has video → autoplay (autoplay=true on SmartMedia)
- If event has gallery 3+ → carousel autoplay 4s rotation
- If event has single image → Ken Burns zoom
- If event has nothing → category video from Pexels (autoplay)

**For wide/standard/compact tiles:**
- Static image with Ken Burns OR carousel (slower, 6s rotation) if gallery
- Video plays on hover only (autoplay=false)
- This avoids battery drain and bandwidth issues with 4+ autoplaying videos on screen

### A.1.4 Free Weekend tile (replaces Gospel)

`<FreeWeekendTile>` — 2×2 in the bento grid.

Server-side query: get the highest-capacity free event in the user's detected city happening this weekend.

If found: render the tile with that event's media + "FREE" pill + event details.
If not found: pivot to "Trending now" — show the event with most tickets sold in the last 24h.
If neither: show a generic "Discover free events" CTA tile with a happy lifestyle photo (Pexels query: "people enjoying outdoor festival sunset").

### A.1.5 This Week strip

Horizontal scroll with CSS scroll-snap. 280px wide cards, 16:9 aspect ratio, 16px gap.

Server-renders 8-12 events with start_date in the next 7 days, ordered by start_date ASC.

Each card:
- 280px × 158px image area at top (smart media — Ken Burns if static, carousel if gallery)
- Below image: small gold date badge, event title (16px bold), venue + city (12px), price (14px gold)
- On hover: image zooms 1.03, card lifts 4px with subtle shadow

Right-edge gradient fade hints at more content. Custom scroll arrows on desktop (left/right circle buttons that scroll one card width).

Section header with gold eyebrow "THIS WEEK" + h2 "What's happening near you" + "View all →" link to /events.

### A.1.6 Cultural Picks — bento per tab

Keep tab system (Afrobeats, Amapiano, Owambe, Caribbean, Heritage, Networking — drop Gospel for now per Lawal's call, or keep but don't feature on homepage).

**Each tab content area is now a bento sub-grid (not a flat row of cards):**
- Tile 1 (lead event of that genre): 8×3 — large editorial tile with smart media background
- Tile 2 (2nd event): 4×3 — medium tile
- Tile 3 (3rd event): 4×3 — medium tile
- Tile 4 (4th event): 4×3 — medium tile
- Below: "View all [Genre] events →" gold CTA

If a tab has fewer than 4 events: gracefully fill with "Be the first to host an [Genre] event" organiser CTA tile (gold ghost, magnetic hover).

Tab headers: subtle gold underline animation on hover, solid 2px gold underline when active. Smooth transition between tabs (200ms fade).

### A.1.7 By City bento

Section header: gold eyebrow "BY CITY" + h2 "Wherever you are, the culture follows".

4 city tiles in a 4-column grid (2×2 each in our 12-col reference, so each spans 3 cols):
- Melbourne, Sydney, London, Lagos (start with these 4 — others can be added when expanding)

Each city tile:
- Background: city-specific image. Stream A creates `/public/cities/melbourne.svg`, `sydney.svg`, `london.svg`, `lagos.svg` as SVG placeholders FOR NOW (solid coloured panels with city silhouette + name in big white type — see A.1.7.1 below). Easily swappable for real photography in M5.
- Dark gradient bottom 50%
- Bottom overlay: city name (24px bold white) + small line "[N] events" (12px, white/70)
- Hover: image scales 1.05, gradient lightens, "→" arrow fades in bottom-right
- Click → `/events?city=Melbourne` (filter applied)

#### A.1.7.1 City SVG placeholders

Create 4 SVG files per city. Each one is a 1200×900 SVG with:
- Background: solid colour from a curated palette (Melbourne = teal-800, Sydney = blue-800, London = purple-800, Lagos = coral-800)
- Bottom-right: city name in MASSIVE white font (200px+, font-extrabold, slightly transparent so it feels embedded)
- Optional: subtle abstract skyline silhouette using SVG path (not photoreal — geometric shapes)

These look intentional and editorial, not amateur. The point is they read as a CHOICE, not a placeholder. Real photography swaps in seamlessly later.

### A.1.8 Live Vibe marquee (NEW SECTION)

Below By City. Single-row horizontal marquee strip on dark background, full bleed.

Content: scrolling text of real-time platform activity:
- "🔴 DJ Spinall just sold 5 tickets in Sydney"
- "🔥 Afrobeats Melbourne 80% sold"
- "🎤 New: Comedy showcase added — 200 seats"
- "⏰ Owambe Gathering: 3 days to go"

Server-side: query last 10 platform events (sales, new listings, milestones), format as marquee strings. Cache 60 seconds. Animate horizontally infinite loop with CSS keyframe (`@keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`).

Background: ink-900. Text: white with gold accents on emoji/numbers. Subtle gold underline on hover (each item is a link to the relevant event).

Pure CSS animation. No JS library. Pause on hover.

### A.1.9 For Organisers section — keep

Already a dark split. Verify CTAs route to /organisers and /pricing. Polish any rogue colours.

---

## A.2 EVENTS LISTING PAGE (`/events`)

### A.2.1 Featured event hero (no filters active)

When user lands on `/events` with no filters, show a featured event hero at the top of the results column:
- Full-width within the results column (so 8 of 12 cols of the page given filter sidebar takes 4)
- Aspect ratio 21:9 (cinematic)
- SmartMedia background, dark gradient overlay
- Foreground: FEATURED ribbon, event title (32px), date + venue, "Get tickets" CTA
- Below this: existing 3-column grid of remaining events

When ANY filter is active: skip the featured hero, go straight to grid (user has intent, don't waste their time).

### A.2.2 Event card grid — bento variation

Instead of uniform 3-column grid, use a "lazy bento" pattern:
- Every 7 events, one tile spans 2 cols × 2 rows (a "feature" event in the grid)
- Other 6 are standard 1×1
- Achieved with CSS Grid `grid-auto-flow: dense` and `:nth-child(7n+1) { grid-column: span 2; grid-row: span 2; }`

This breaks monotony without requiring per-tile decisions. Looks editorial.

---

## A.3 EVENT DETAIL PAGE (`/events/[slug]`)

### A.3.1 Audit current state

Stream A first reads the existing `/events/[slug]/page.tsx` and reports its current structure. Then upgrades per below.

### A.3.2 Hero section

- Full-bleed top: SmartMedia (uses `getFeaturedEventMedia` so video preferred)
- Parallax: image/video scrolls slower than foreground (use CSS `transform: translateZ(0)` + scroll listener for subtle effect)
- Dark gradient bottom 60% overlay
- Foreground content (centered or left-aligned, max-width 800px, padded from bottom):
  - Category pill (gold)
  - Event title (40px+, font-display, white, bold)
  - Date · Venue · City line
  - Lineup snippet if available
- Min-height 70vh on desktop, 50vh mobile

### A.3.3 Sticky action bar

Sticky to top after scrolling past the hero. Contains:
- Event title (compact, scrolls in)
- Date + venue (smaller)
- Right side: ticket price range, "Get Tickets" gold button (jumps to ticket selector), share button, save heart icon
- Glassmorphism background (variant='light', opaque enough to be readable)

### A.3.4 Below action bar — content sections

- **About** — proper typography, font-serif option for editorial feel, expand/collapse if 500+ chars
- **Lineup / Agenda** — if data available, show as cards: artist name, set time, image
- **Venue** — name, address, embedded static map (Mapbox static API or Google Maps static — Stream A uses Google Maps Static API with a lightweight free tier; Lawal adds GOOGLE_MAPS_API_KEY env var)
- **Organiser** — small card: org logo, name, "View all events by [Org] →" link
- **Related events** — 4-card grid: events from same category OR same organiser OR same city, ordered by upcoming

### A.3.5 Sold-out integration

Stream B is building `<EventSoldOut>` component. Stream A's event detail page imports it and conditionally renders in place of ticket selector when no inventory:
```tsx
{soldOut ? <EventSoldOut event={event} relatedEvents={related} /> : <TicketSelector ... />}
```

---

## A.4 BRAND COLOUR SWEEP

Run:
```
grep -rln "bg-blue-600\|hover:bg-blue-700\|text-blue-600\|bg-blue-500" src/components src/app
```

For each match in **public-facing files only** (not dashboard, not checkout, not auth):
- `bg-blue-600` → `bg-gold-500`
- `hover:bg-blue-700` → `hover:bg-gold-600`
- `text-blue-600` → `text-gold-600`

DO NOT touch:
- `src/components/checkout/*` (Stream B)
- `src/components/dashboard/*` (already correct after 2b)
- `src/components/auth/*` (Stream B/C as applicable)
- `src/components/layout/*` (Stream C is rolling out logo)

When in doubt: leave it.

---

## A.5 STREAM A VERIFICATION

```
npm run build && npm run lint && npm run dev
```

Manual tests:
- Homepage hero plays video/carousel/Ken Burns based on featured event's media
- Bento grid renders with featured tile dominating
- Hover any tile → smooth zoom + gold border + content lift
- This Week strip scrolls with snap, looks alive
- Cultural Picks tabs each show bento sub-layout, not flat row
- By City tiles render with SVG placeholders, hover lights up
- Live Vibe marquee scrolls smoothly, pauses on hover
- /events listing: featured hero when no filters, lazy bento grid when scrolling
- /events/[slug]: full hero with video/Ken Burns, sticky action bar, all sections render

---

# PART 4 — STREAM B: SEAT SELECTOR + CHECKOUT

(Same as previous draft. Summarised:)

**Tab 2.** Files: `src/components/checkout/seat-selector.tsx`, `src/components/checkout/ticket-selector.tsx`, `src/components/checkout/checkout-summary.tsx`, `src/components/features/events/event-sold-out.tsx` (NEW).

**Scope:**
- Seat selector full rebuild: gold colours throughout (currently blue), fix bottom-row hover twitch, fix broken legend ("A A A" → readable section names), add STAGE label, row labels, mobile pinch-zoom
- Sold-out event UX: full event details preserved, big SOLD OUT gold badge, waitlist email + CTA, "Or browse similar events" with 3 related cards
- Ticket selector polish: gold accent on increment/decrement, sold-out tier disabled state with badge, max-per-order shown
- Checkout summary polish: brand colours, fee breakdown clear, cart timer with gold accent (no red panic), "Secure checkout" trust signal
- DO NOT touch event detail page (Stream A coordinates by importing <EventSoldOut>)

**Verification:** seat selector hover bottom rows = no flicker. Reserve button = gold. Legend = readable. Sold-out page = full content + waitlist.

---

# PART 5 — STREAM C: BUG FIXES + LOGO + M3 VERIFICATION

(Same as previous draft. Summarised:)

**Tab 3.** Files: `src/app/organisers/signup/page.tsx`, `src/app/(auth)/signup/page.tsx`, `src/app/(dashboard)/dashboard/events/[id]/page.tsx` (NEW), `src/lib/hero-categories.ts`, `src/components/ui/eventlinqs-logo.tsx` (NEW), `src/components/layout/site-header.tsx` (logo only), `src/components/layout/site-footer.tsx` (logo + business naming), `src/components/dashboard/dashboard-topbar.tsx` (logo only), `src/app/icon.tsx` (NEW), `src/app/opengraph-image.tsx` (NEW), `src/app/twitter-image.tsx` (NEW), `src/lib/upload.ts` (size limit), `src/components/features/events/event-form.tsx` (cover crop), `src/app/(dashboard)/dashboard/events/create/page.tsx` (inline org), `src/components/dashboard/dashboard-sidebar.tsx` (verify Organisation link), `src/components/dashboard/upcoming-events-panel.tsx` (row click target).

**Scope:**
- Replace /organisers/signup placeholder → redirect to /auth/signup?role=organiser
- /auth/signup reads role param → adjusts hero copy, sets profile.role on creation
- Build /dashboard/events/[id] view page with hero strip, KPI row, tabs section
- Update dashboard event row clicks: /dashboard/events/[id] not /edit
- Rename Networking hero category → Business & Networking everywhere (slug stays networking)
- EventlinqsLogo component: Concept A with Option 2 spacing (0.05em margin-left on the gold dot)
- Roll out logo across site-header, site-footer, dashboard-topbar
- Build app/icon.tsx (favicon), opengraph-image.tsx, twitter-image.tsx — all "E." gold-on-navy
- Image upload: 5MB → 10MB, add WEBP support
- Cover image cropping: object-cover → object-contain with proper aspect container
- Inline org creation on event create page (not separate redirect)
- Verify Organisation link visible in dashboard sidebar for organiser role
- Final link audit: every footer/nav/homepage link resolves

**Verification:** Get Started → /auth/signup not waitlist. Dashboard event click → view page first. Footer Business & Networking → Business & Networking page. Logo present everywhere with 1px gold dot gap. Favicon = "E." gold-on-navy. WhatsApp/Twitter share preview = new opengraph image. Upload 8MB WEBP succeeds. Create event without org → inline form. All links work.

---

# PART 6 — INTEGRATION CHECKLIST

After all 3 streams complete, Lawal:

1. `git status` in each tab — non-overlapping changed files
2. `npm run build` — passes
3. `npm run lint` — passes
4. `npm run dev` — clean startup
5. `.env.local` has `PEXELS_API_KEY` — if not, fallback images render
6. Smoke test full punch list:
   - Homepage cinematic hero plays media
   - Bento grid renders with featured tile dominating, all tiles have category-aware imagery
   - Hover any tile → motion (zoom + border + lift)
   - This Week strip scrolls with snap
   - Cultural Picks bento per tab works
   - By City SVG placeholders render
   - Live Vibe marquee scrolls
   - /events featured hero present (when no filters)
   - /events/[slug] cinematic, sticky action bar works
   - Seat selector gold + no flicker + readable legend
   - Sold-out event page keeps content + waitlist
   - Logo visible everywhere with 1px gold dot
   - All links resolve
7. Three commits, push, watch Vercel deploy
8. Add `PEXELS_API_KEY` and `GOOGLE_MAPS_API_KEY` (optional) to Vercel environment variables
9. **M4.5 closed.** Move to Module 5.

---

# PART 7 — DELIBERATELY OUT OF SCOPE

Deferred to M5:
- Real city photography for By City (placeholder SVGs ship now, real images later)
- Mapbox interactive venue maps (static map images ship now)
- Real analytics for KPI cards on event view page (placeholders where data isn't wired)
- Stripe Connect organiser onboarding UI (M5)
- Upstash Redis Sydney migration (M5 or ops task)
- Per-event opengraph images (generic platform OG ships now)
- Notifications system (bell icon is visual-only for now)

---

# PART 8 — FINAL WORD

After this session lands, EventLinqs holds up to a side-by-side comparison with DICE FM, Resident Advisor, and Ticketmaster on the public-facing surfaces. The dashboard already holds up to Stripe. Auth holds up to Notion. Brand consistency throughout.

The visceral "wow" — the magnetic, sticky, kinetic feeling — comes from:
- Bento layouts breaking the linear monotony
- Smart category-aware media on every event tile (Pexels API)
- Video on the featured hero (autoplay) and on hover for smaller tiles
- Ken Burns zoom on still images so nothing is truly static
- Glassmorphism on overlay UI elements
- Live data signals creating FOMO
- Micro-animations on every hover
- Marquee for live platform activity

Real organiser content + real event photography in M5 polish makes this even stronger, but the foundation built in 2c is the foundation that the platform launches on.

When this lands cleanly on Vercel, M4.5 is closed.

End of manifest.
