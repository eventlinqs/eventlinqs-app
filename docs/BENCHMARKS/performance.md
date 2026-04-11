# Benchmark: Performance

## Overview

Performance is a conversion driver, not a nice-to-have. A 1-second delay in page load reduces conversion by 7% (Akamai). On mobile in low-bandwidth markets (Africa, Southeast Asia — EventLinqs primary expansion markets), performance is the difference between a purchase and a bounce. This document defines Core Web Vitals targets, image optimization patterns, and performance patterns used by best-in-class ticketing platforms.

---

## Core Web Vitals Targets (2026 Standards)

| Metric | Good | Needs Improvement | Poor | EventLinqs Target |
|--------|------|------------------|------|-------------------|
| LCP (Largest Contentful Paint) | < 2.5s | 2.5s–4.0s | > 4.0s | **< 2.0s** |
| INP (Interaction to Next Paint) | < 200ms | 200ms–500ms | > 500ms | **< 150ms** |
| CLS (Cumulative Layout Shift) | < 0.1 | 0.1–0.25 | > 0.25 | **< 0.05** |
| FCP (First Contentful Paint) | < 1.8s | 1.8s–3.0s | > 3.0s | **< 1.2s** |
| TTFB (Time to First Byte) | < 800ms | 800ms–1800ms | > 1800ms | **< 300ms** |

**Why stricter than Google's "Good" threshold:**
- EventLinqs targets emerging markets with slower connections
- Faster checkout = higher conversion = more revenue per visitor
- Being faster than Ticketmaster and Eventbrite is a competitive advantage

---

## LCP Optimization

LCP is measured as the time from navigation start to when the largest visible element (typically the hero image or headline) is fully rendered.

### Image Optimization (most impactful)

**Use Next.js `<Image>` component always:**
```jsx
<Image
  src={event.coverImageUrl}
  alt={event.name}
  width={1200}
  height={675}
  priority={true}           // LCP image: preload immediately
  loading="eager"           // LCP image: don't lazy load
  quality={85}              // WebP quality setting
  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 1200px"
  placeholder="blur"        // Show blurred placeholder while loading
  blurDataURL={event.blurHash} // Low-quality blur hash (server-generated)
/>
```

For below-fold images:
```jsx
<Image
  loading="lazy"    // Don't load until near viewport
  priority={false}  // Not preloaded
  ...
/>
```

**Image format priority:**
1. AVIF — best compression (30% smaller than WebP), supported in Chrome 85+, Safari 16+
2. WebP — fallback, supported in all modern browsers
3. JPEG/PNG — final fallback for very old browsers

**Blur hash generation:**
- Server-side: generate a blur hash string from the uploaded image using `blurhash` npm package
- Store blur hash in database alongside image URL
- Pass as `blurDataURL` to `<Image>` — shown instantly while real image loads, no layout shift

### Preload Critical Resources

```html
<!-- In Next.js, add to <head> via next/head or metadata API -->
<link rel="preload" href="/fonts/inter-variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
<link rel="preconnect" href="https://[supabase-project].supabase.co" />
<link rel="preconnect" href="https://[upstash-redis-domain].upstash.io" />
```

### Reduce LCP Element Size

- Hero image: maximum 1200px wide, compressed to WebP quality 80–85
- Do not use uncompressed PNGs as hero images
- Consider: serve 800px wide version for mobile (via `sizes` attribute)

---

## INP Optimization

INP (Interaction to Next Paint) measures the worst interaction delay during the entire page session. It replaced FID in 2024.

**Primary culprits for high INP:**

### Long JavaScript Tasks

Any JS task > 50ms can delay interaction response. Break up long tasks:
```js
// Bad: synchronous loop that blocks for 200ms
for (let i = 0; i < 100000; i++) { processItem(i) }

// Good: use setTimeout(0) / scheduler.postTask to yield to browser
async function processItems(items) {
  for (const item of items) {
    await scheduler.yield() // yield between iterations
    processItem(item)
  }
}
```

### Avoid Unnecessary Client-Side Work

- Use React Server Components for all non-interactive content
- Move data fetching to server (no client-side fetch waterfalls)
- Use `Suspense` boundaries so one slow component doesn't block the whole page

### Event Handler Optimization

- Debounce search inputs: 300ms debounce on search query
- Throttle scroll handlers: `requestAnimationFrame` throttle
- Seat map interactions: use `pointer` events instead of `touch` + `mouse` separate handlers

---

## CLS Optimization

CLS (Cumulative Layout Shift) measures visual instability — elements that move after initial render.

**Most common CLS causes and fixes:**

### Images without dimensions
```jsx
// Bad: browser doesn't know image height before it loads → layout shift
<img src={url} alt="..." />

// Good: reserve space with explicit dimensions or aspect ratio
<div className="aspect-video w-full">
  <Image fill alt="..." />
</div>
// OR
<Image width={800} height={450} alt="..." /> // explicit dimensions
```

### Dynamically injected content above existing content
- Sticky headers that appear after scroll: pre-reserve the height
- Cookie banners: always place at bottom, not top
- Ad slots: pre-reserve dimensions even before ad loads

### Fonts causing layout shift
- Use `font-display: swap` in font-face declarations
- Preload critical fonts
- Use `size-adjust` or `ascent-override` to reduce font swap shift:
```css
@font-face {
  font-family: 'Inter';
  font-display: swap;
  src: url('/fonts/inter-variable.woff2') format('woff2');
}
```

### Skeleton loaders
- Skeleton placeholders MUST be the same size as the content they replace
- If event cards are 300px tall, skeletons must also be 300px tall
- This prevents shift when real content replaces skeleton

---

## Code Splitting

Next.js App Router does automatic route-based code splitting. Additional manual splitting:

### Dynamic imports for heavy components
```jsx
import dynamic from 'next/dynamic'

// Seat map: large SVG library, only needed on seat selection page
const SeatMap = dynamic(
  () => import('@/components/features/SeatMap'),
  {
    loading: () => <SeatMapSkeleton />,
    ssr: false  // seat map uses browser APIs
  }
)

// Rich text editor: large library, only needed on event creation
const RichTextEditor = dynamic(
  () => import('@/components/forms/RichTextEditor'),
  { loading: () => <div className="h-40 bg-gray-100 animate-pulse rounded" /> }
)
```

### Bundle size targets
- Main bundle: < 100KB gzipped
- Per-route chunks: < 50KB gzipped each
- Total JavaScript for homepage: < 200KB gzipped
- Seat map route: budget 300KB gzipped (SVG library is heavy)

Monitor with: `npm run build` → check output sizes, use `@next/bundle-analyzer`

---

## Server-Side Rendering vs Client Components

**Performance rule:** Default to Server Components. Every client component is JavaScript shipped to the browser.

| Component type | Use Server Component? | Reason |
|----------------|----------------------|--------|
| Event listing cards | Yes | Static data, no interactivity |
| Event hero section | Yes | Static, data from server |
| Ticket tier display | Yes | Data from server, no interactivity |
| Filter chips | No (Client) | User interaction required |
| Seat map | No (Client) | Complex browser interactions |
| Checkout form | No (Client) | Form state, payment elements |
| Date picker | No (Client) | Browser interaction |
| Order summary (read-only) | Yes | Display only |
| Countdown timer | No (Client) | Real-time updates |

---

## Caching Strategy

### Upstash Redis (event data)
- Cache event listing results: TTL 60 seconds (fast invalidation on ticket sale)
- Cache individual event data: TTL 5 minutes with invalidation on event update
- Cache ticket tier availability: TTL 30 seconds (stale is acceptable for "X remaining" display)
- Cache seat map SVG layout: TTL 24 hours (changes only when organiser edits the map)

### Next.js cache (`cache`, `revalidate`)
```jsx
// Event listing page: revalidate every 60 seconds
export const revalidate = 60

// Event detail page: on-demand revalidation on ticket purchase
export async function GET() {
  const data = await fetch(url, { next: { revalidate: 300 } })
}
```

### Edge caching (Vercel Edge Network)
- Static pages (homepage, events listing): cached at edge globally
- Event pages with dynamic data: ISR (Incremental Static Regeneration) with 60s TTL
- API routes: `Cache-Control: public, s-maxage=10, stale-while-revalidate=59` for non-personal data

---

## Performance Monitoring

### Tools

- **Vercel Analytics** — Core Web Vitals per page, by country, by device type. Free with Vercel Pro.
- **PostHog** — Custom performance events (checkout load time, seat map interaction time)
- **Sentry Performance** — Transaction tracing, slow query detection
- **Lighthouse CI** — Run in GitHub Actions on every PR, fail if score drops below threshold

### Lighthouse CI GitHub Action

```yaml
# .github/workflows/lighthouse.yml
- name: Run Lighthouse
  uses: treosh/lighthouse-ci-action@v10
  with:
    urls: |
      http://localhost:3000
      http://localhost:3000/events
    budgetPath: ./budget.json
    uploadArtifacts: true

# budget.json
[{
  "path": "/*",
  "resourceSizes": [{ "resourceType": "script", "budget": 200 }],
  "timings": [
    { "metric": "interactive", "budget": 3000 },
    { "metric": "first-contentful-paint", "budget": 1800 }
  ]
}]
```

### Performance Budgets

| Page | JS Budget (gzipped) | LCP Target | CLS Target |
|------|---------------------|-----------|-----------|
| Homepage | 150KB | 1.5s | 0.05 |
| Events listing | 120KB | 2.0s | 0.05 |
| Event detail | 130KB | 1.8s | 0.05 |
| Seat map | 300KB | 2.5s | 0.1 |
| Checkout | 180KB | 2.0s | 0.05 |
| Confirmation | 100KB | 1.5s | 0.02 |
