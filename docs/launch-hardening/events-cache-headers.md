# /events cache headers (Facebook crawler overwhelm)

Runbook risk: a crawler burst (Facebook scraping Open Graph tags, or any bot)
hitting the discovery surfaces re-renders against the database on every request.

## Audit

| Route | Rendering | Anonymous? | Before: edge-cached? |
|---|---|---|---|
| `/events` | Dynamic - reads `searchParams`, so ISR does not apply despite `revalidate = 60` | yes (public anon client, no `cookies()`) | NO |
| `/events?category=...` etc | Dynamic | yes | NO |
| `/events/[slug]` | ISR (`revalidate = 300`) | yes | Vercel ISR yes; header was `no-store` locally |

Before, every route served:

```
Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
```

So `/events` (the dynamic listing Facebook crawls) was never edge-cached: each
crawler hit rendered fresh and queried the database. That is the overwhelm
vector.

## Fix

Added `CDN-Cache-Control` headers in `next.config.ts` `headers()` for the two
discovery routes. `CDN-Cache-Control` controls Vercel's edge cache only; it does
NOT change the browser `Cache-Control`, so it does not fight Next's per-page
`no-store` and there is no stale-personalisation risk (both routes are
anonymous anyway).

```
/events        CDN-Cache-Control: public, s-maxage=60,  stale-while-revalidate=300
/events/:slug  CDN-Cache-Control: public, s-maxage=300, stale-while-revalidate=86400
```

`s-maxage` matches each route's freshness (`/events` mirrors `revalidate = 60`;
event detail mirrors `revalidate = 300`). `stale-while-revalidate` lets the edge
serve a cached copy instantly while it refreshes in the background, so a crawler
burst is absorbed by the CDN.

## After (verified on a production build, `next start`)

```
/events:        CDN-Cache-Control: public, s-maxage=60, stale-while-revalidate=300
                Cache-Control:     private, no-cache, no-store, max-age=0, must-revalidate
/events/<slug>: CDN-Cache-Control: public, s-maxage=300, stale-while-revalidate=86400
                Cache-Control:     private, no-cache, no-store, max-age=0, must-revalidate
```

The browser still receives `no-store`; only Vercel's edge caches. On Vercel,
confirm the edge hit on the preview:

```
curl -sI 'https://<preview>/events' | grep -iE 'x-vercel-cache|cdn-cache-control'
# second request should report x-vercel-cache: HIT
```

## Note

This protects the canonical discovery URLs. A flood of unique query-string
combinations would still produce cache misses per novel URL; if that becomes a
problem, normalise/whitelist the `/events` query params or add a WAF rate limit.
That is out of scope here and not the Facebook-crawler vector (Facebook scrapes
canonical URLs).
