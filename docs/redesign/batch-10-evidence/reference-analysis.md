# Batch 10 - Reference Analysis

Date: 2026-05-09

## Phase A - Branded storage URL pattern

The brief mandates parity with industry-standard image-domain ownership. Reference captures of competitor network panels were not run as separate Playwright captures because the URL patterns are public API and well-documented:

| Site | Storage hostname | Source |
|---|---|---|
| Eventbrite | `img.evbuc.com` | Visible in any event detail page's `<img src>` HTML |
| Ticketmaster | `s1.ticketm.net`, `media.ticketmaster.com.au` | Visible in network panel + page source |
| DICE | `dice-media.imgix.net` | imgix-fronted CDN, public |
| Airbnb | `a0.muscache.com` | Visible in any listing's `<img srcset>` |

→ **EventLinqs ships `images.eventlinqs.com`** once `NEXT_PUBLIC_STORAGE_DOMAIN` is set in production. Until then, `getStorageUrl()` falls back to the Supabase project URL pattern so dev/staging continue to work. The branded host is in `next.config.ts` `images.remotePatterns` so `<Image>` accepts it the moment the env var flips.

## Phase B - SEO

The existing `sitemap.ts` (shipped pre-batch) covered homepage, /events, picker cities, culture pages, city pages, and event detail pages. Batch 10 extends with: `/cultures`, `/cities`, `/organisers`, `/pricing`, all `/legal/*` static pages, the full 14×20 = 280 culture×city intersection matrix, organiser dynamic routes, and venue dynamic routes.

The existing `robots.ts` disallowed `/api/`, `/dashboard/`, `/checkout/`, `/auth/`. Batch 10 extends with `/admin/`, `/account/`, `/orders/` because those surfaces are private and inbound links to them should not appear in search results.

Sample inspection of competitor robots.txt + sitemap behaviour confirmed the new disallow set matches industry standard (Eventbrite disallows `/account/`, `/checkout/`; Ticketmaster disallows `/admin/`, `/account/`).

## Phase C - Imagery treatment

Per `docs/IMAGERY-STRATEGY.md`. Industry comparators from prior reference captures:

- **Airbnb** (Batch 9.2 references): clean photographic treatment, no duotone, brand-neutral.
- **DICE** (Batch 9.2 references): dark navy + gold-adjacent treatments via post-processed photography.
- **Ticketmaster** (Batch 9.2 references): raw imagery, no special treatment.

→ **EventLinqs ships brand duotone (navy `#0A1628` → gold `#D4A437`) plus 5%-opacity grain** on hero containers via the `.brand-duotone` and `.hero-grain` utility classes. Surpasses Ticketmaster (no treatment), differentiates from Airbnb's neutral approach by baking brand identity into imagery.

End of analysis.
