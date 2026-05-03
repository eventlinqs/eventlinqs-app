# M6.5 Phase 1B carry-over: mobile LCP diagnosis for / and /events

**Date:** 2026-05-02
**Branch:** feat/sprint1-phase1b-performance-and-visual
**Server:** local prod build (`rm -rf .next && npm run build && npm run start`) on http://localhost:3000
**Tooling:** scripts/brand-sweep-audit.mjs, devtools throttling fallback, raw Lighthouse JSON parse

## Baseline scores

| Route | Mobile Perf | LCP | FCP | TBT | CLS | SI | TTI |
|---|---|---|---|---|---|---|---|
| / | **0.74** | 2153ms | 2153ms | 755ms | 0.006 | 5671ms | 4469ms |
| /events | **0.86** | 4145ms (sim), 497ms (observed) | 1227ms | 62ms | 0.004 | 1227ms | 4956ms |

Gate is mobile Perf 0.95+. Both routes fail. Home is much further from the gate.

## LCP elements

### Home /
Selector: `div.absolute > div.absolute > div.absolute > img.object-cover`
DOM path: `MAIN > SECTION > DIV > DIV > DIV > DIV > IMG`
Image: hero carousel slide 1, `Caribbean Carnival Melbourne: Soca Saturday`
Source: Pexels remote via `/_next/image?url=...pexels.com/photos/13137874/...`
Attributes: `fetchpriority="high"` `loading="eager"` `decoding="async"` `sizes="(max-width: 768px) 100vw, 1920px"`
Bounding: 375 x 600 (full viewport width, hero block)

LCP breakdown:
- Time to first byte: 15.6 ms
- **Resource load delay: 634.6 ms** (gap between TTFB and image request start, dominated by render-blocking CSS download + parse)
- **Resource load duration: 1101.4 ms** (image download time; Next.js image optimizer cold-encoding Pexels remote)
- Element render delay: 401.5 ms

### Events /events
Selector: `li.w-64 > a.group > div.relative > img.object-cover`
DOM path: `MAIN > SECTION > DIV > UL > LI > A > DIV > IMG`
Image: first card in EventsRecommendedSection rail, `Caribbean Carnival Melbourne: Soca Saturday`
Source: Pexels remote via `/_next/image`
Attributes: `fetchpriority="high"` `loading="eager"` `decoding="async"` `sizes="(min-width: 640px) 288px, 256px"`
Bounding: 254 x 143 (rail card, below the page hero strip)

LCP breakdown:
- Time to first byte: 34.2 ms
- Resource load delay: 271.2 ms
- **Resource load duration: 12.0 ms** (real); 2648 ms (Lantern simulated)
- **Element render delay: 179.5 ms** (real); 1232 ms (Lantern simulated)

Crucial datapoint: the events LCP image is `requestDiscoverable: true` per Lighthouse, has `fetchpriority="high"` and `loading="eager"`, and observed real LCP is 497 ms. The 4145 ms LCP is a Lantern projection inflating both load duration and render delay by ~5x.

## Bottlenecks

### 1. Render-blocking CSS (both routes)
Two CSS files block first paint:
- `0f0w0tsp6khro.css` 18KB transferred / 100KB raw
- `0mvzmnw29zsqe.css` 1.5KB

Estimated savings:
- Home: **1037 ms** (worst CSS file alone)
- Events: 450 ms

Lighthouse score: 0 on `render-blocking-insight` for both routes.

### 2. JS bootup time (home only)
On home, `bootup-time: 2.5s` (score 0). Dominant chunk:
- `0.~2ky53fo~10.js`: 226KB raw, **1579ms scripting + 28ms parse on home**, 798ms scripting on events
  - Fingerprints: React runtime references (46), `@stripe Elements` (4), react-dom hydrate (4), lucide (1)
  - Chunk is in `rootMainFiles` so loads on every public page

Mainthread breakdown on home:
- Other: 4070 ms
- Script Evaluation: 2398 ms
- Style & Layout: 2044 ms
- Rendering: 1368 ms

Long tasks on home: 8 tasks, the longest are 361ms, 342ms, 253ms, 223ms — top three are HTML parse/exec on `/`, fourth is the heavy JS chunk.

### 3. Unused JS on /events
- `12537mhf-1c02.js`: 223KB raw, 58KB unused (100% unused per audit). 74 supabase fingerprints.
  - Loaded on /events shell despite no Supabase needed for the page itself
  - Likely loaded by Link prefetch on card hrefs to /events/[slug] (where supabase is used server-side, but client prefetch still hydrates the chunk)
- `0.~2ky53fo~10.js`: 27.5KB unused on events

### 4. Image optimizer cold encoding (home)
Home LCP image is a Pexels remote routed through `/_next/image`. First-request cold encoding takes 1101ms. This is the architectural bottleneck Phase 1B documented in `iter-14-pt5-image-preload/close-report.md` and Phase 1B explicitly recommended deferring.

## Why scores diverge

Lighthouse "simulate" throttling (Lantern) projects download time and CPU cost based on a network/CPU throttling model. For events, observed LCP is 497ms but Lantern projects 4145ms because:
- Image download `12ms observed -> 2648ms simulated` (5G to 4G + connection multiplexing model)
- Element render delay `179ms observed -> 1232ms simulated` (4x CPU slowdown)

We must satisfy Lantern's projection, not just real-device.

## Fix plan

Priority order, each iteration measured against the same Lighthouse harness:

1. **Self-host LCP imagery as local AVIF in `/public/hero/`**. Eliminates the 1101ms Next.js image-optimizer cold encoding on home LCP and the 2648ms Lantern projection on events. Static AVIF served from Vercel CDN bypasses the optimizer. Files needed: hero-1.avif (Caribbean Carnival), hero-2.avif (Latin Sabor), hero-3.avif (Afrobeats Melbourne), and the rail card top fold images.

2. **Reduce render-blocking CSS**. Audit the 100KB Tailwind output for content not used on public routes. Most likely savings: dashboard / organiser / admin classes leaking into the public CSS bundle. Goal: under 30KB raw on public routes.

3. **Code-split the 226KB main JS chunk on home**. Lazy-load `hero-carousel-client.tsx` (which depends on embla-carousel) since it's the lone heavy interactive component above the fold. Use `dynamic(() => import(...), { ssr: true, loading: skeleton })`. Below-fold client components (LiveVibeMarquee, CulturalPicksRail) are already in Suspense; verify they don't add to the initial JS bootup.

4. **Disable Link prefetch on event card hrefs on /events**. Stops eager loading of the 223KB supabase chunk on the listing shell. Prefetch on hover instead.

5. **Trim the LCP element's render delay on /events**. The first rail card image is the LCP. Either move the rail above the Suspense boundary OR adjust the recommended-section so it renders synchronously with the page shell. (Last-resort if 1-4 don't get to 95.)

## Iteration discipline

- After each iteration: rebuild, restart server, run `node scripts/brand-sweep-audit.mjs --only=home,events --viewport=mobile`, capture Perf score and key metrics.
- Append the result to `docs/perf/mobile-95-progress.log`.
- If a change does not improve the target metric, revert it.
- After both targets pass, run the full 13-route audit to confirm zero regression.
