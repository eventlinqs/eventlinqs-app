# SEO launch audit (2026-06-06)

Audited on a production build (`next start`) of the launch branch. Everything
below was checked against live server responses, not source reading.

## Results

| Surface | Status | Evidence |
|---|---|---|
| `robots.txt` | PASS | Allows `/`, disallows `/api`, `/dashboard`, `/checkout`, `/auth`, `/admin`, `/account`, `/orders`; points at `sitemap.xml`. |
| `sitemap.xml` | PASS | Valid XML, 572 URLs, per-URL `lastmod`/`changefreq`/`priority`; home 1.0, /events 0.9, cities 0.8, event detail 0.6 to 0.7. |
| Canonical tags | PASS | Present on every page type checked: `/`, `/events`, event detail, `/cultures`, `/cities`, `/city/[slug]`, `/culture/[slug]`, `/faith/[slug]`, `/pricing`, `/organisers`, `/organisers/[handle]`. |
| OG image | PASS | `/opengraph-image` returns HTTP 200 `image/png`. Event detail sets `og:image` from the event cover. |
| Twitter image | PASS | `/twitter-image` returns HTTP 200 `image/png`. |
| Structured data (event) | PASS | Event detail emits a full `Event` graph: `Event` (with subtype), `AggregateOffer` + offers, `Place` + `PostalAddress` + `GeoCoordinates`, `Organization`. |
| Structured data (home) | PASS | `WebSite` (with `SearchAction` sitelinks box) + `Organization`. |

No server-side SEO bug was found; nothing to fix in code.

## One consistency decision for the founder (not a code bug)

The web canonicals, sitemap, and robots resolve to the **apex** host
`https://eventlinqs.com` (the last-resort fallback in `src/lib/site-url.ts`),
while the Supabase Auth Site URL, the transactional emails, and the legal pages
use **`https://www.eventlinqs.com`**. Search engines should see one canonical
host.

Resolve it with config, not code, because the base URL already resolves from
`NEXT_PUBLIC_SITE_URL` first:

1. Decide the canonical host (apex or www).
2. Configure the Vercel domain so the other host 301s to it.
3. Set `NEXT_PUBLIC_SITE_URL` on the production deployment to that exact host.
   Then canonicals, sitemap, robots, and OG `metadataBase` all match it, and
   they agree with the Auth Site URL.

`src/lib/site-url.ts` resolution order (unchanged): `NEXT_PUBLIC_SITE_URL` ->
`VERCEL_PROJECT_PRODUCTION_URL` -> `VERCEL_URL` -> `https://eventlinqs.com`.

## Optional structured-data enhancements (non-blocking)

- `performer` on music events (artist/DJ), once the artist layer ships.
- `doorTime` / `duration` on the event `Event` schema.

These are additive; current event structured data is valid and rich without
them.
