# Social meta audit — code-side metadata across public routes

**Date:** 2026-04-28
**Scope:** flag-only audit. No fixes applied. Fixes deferred until social handles exist and the logo is delivered.
**Source files inspected:** `src/app/layout.tsx`, `src/app/icon.tsx`, `src/app/opengraph-image.tsx`, all `page.tsx` files exporting `metadata` or `generateMetadata`, `src/components/layout/site-footer.tsx`, `public/`.

---

## Summary

| Surface | Status | Severity if launched as-is |
|---|---|---|
| Root layout OG tags | Present (default fallback) | OK |
| Root layout Twitter Card | Present (default fallback, missing handle) | LOW |
| Per-page OG override on dynamic routes | Mixed | MEDIUM |
| Twitter Card override per page | Mostly missing | MEDIUM |
| Favicon set | Single dynamic 32×32 only | MEDIUM |
| Apple touch icon | Missing | MEDIUM |
| `manifest.json` (PWA) | Missing | HIGH (PWA spec mentions install on home screen) |
| Default OG image | Present (1200×630 dynamic) | OK |
| Footer social links | Hardcoded to dead handles | MEDIUM |

**Verdict:** the platform has decent baseline OG and a strong default OG image, but per-page Twitter Card overrides, the icon set, the PWA manifest, and the apple-touch-icon are gaps. The footer hardcodes `twitter.com/eventlinqs`, `instagram.com/eventlinqs`, `tiktok.com/@eventlinqs`. Until those handles are registered, those are dead links shipping in production.

---

## Findings by surface

### 1. Root layout metadata

**File:** `src/app/layout.tsx:23-45`

Present and correct:

- `metadataBase` set to `NEXT_PUBLIC_SITE_URL` (defaults to localhost). Production must have `NEXT_PUBLIC_SITE_URL=https://eventlinqs.com` set in Vercel.
- `title`, `description`, `alternates.canonical: '/'`, `robots.index: true`.
- `openGraph`: `type: 'website'`, `title`, `description`, `siteName: 'EventLinqs'`, `locale: 'en_AU'`. **No explicit `url` — falls back to `metadataBase`. OK.**
- `twitter`: `card: 'summary_large_image'`, `title`, `description`. **`twitter:site` and `twitter:creator` are missing.** Once `@eventlinqs` exists, add `site: '@eventlinqs'` (and creator if relevant).

**Flag:** add `twitter.site` once the X handle is registered.

**Flag:** confirm `NEXT_PUBLIC_SITE_URL` is set in Vercel Production env. If absent, OG image URLs will resolve to `http://localhost:3000/...` and break in production previews.

### 2. Default OG image

**File:** `src/app/opengraph-image.tsx`

Strong. 1200×630 PNG generated at build time via `ImageResponse`. Includes brand wordmark, tagline, navy + gold palette, "Where the culture gathers." copy, footer URL. Acts as universal fallback across all routes that don't define their own OG image.

**No issue.**

### 3. Favicon / icons

**File:** `src/app/icon.tsx` — single 32×32 dynamic icon ("E." in navy + gold).

**Missing:**

- 16×16 favicon (older browsers).
- 48×48 favicon (Windows tile).
- 192×192 (Android home screen).
- 512×512 (PWA install prompt).
- Apple touch icon (180×180 PNG at `/apple-icon.png` or via `app/apple-icon.tsx`).
- `favicon.ico` static fallback for ancient browsers.

**Flag MEDIUM:** at minimum add `apple-icon.tsx`, `icon.tsx` overrides at 192 and 512 sizes, and a static `favicon.ico` fallback. Best done from the canonical logo SVG once delivered.

### 4. PWA manifest

**Files:** none. No `src/app/manifest.ts`, no `public/manifest.json`, no `public/site.webmanifest`.

CLAUDE.md and platform philosophy mention "installable on any smartphone home screen" and African-market PWA support (Scope §3.7 / §3.16). Without a manifest, Add-to-Home-Screen on iOS / Android falls back to a generic shortcut without theme colour, splash, or short name.

**Flag HIGH:** ship a `src/app/manifest.ts` with `name`, `short_name`, `description`, `start_url`, `display: 'standalone'`, `background_color`, `theme_color: '#0A1628'` (ink-950), and at least 192 + 512 icons. PWA install will not work without this.

### 5. Per-page metadata coverage

Audited every public-facing route. **Status legend:**

- **`OG`** — page or layout sets `openGraph` block with title + description.
- **`OG-image`** — page sets `openGraph.images` (overrides default 1200×630 OG image).
- **`Twitter`** — page sets `twitter` block with card + title + description.
- **`canonical`** — page sets `alternates.canonical`.

| Route | OG | OG-image | Twitter | canonical | Notes |
|---|---|---|---|---|---|
| `/` (homepage) | inherits root | inherits root default | inherits root | yes | OK as inheritance, but lacks page-specific override |
| `/events` | inherits root | inherits root default | inherits root | yes | OK |
| `/events/browse/[city]` | yes (city-specific) | inherits root default | no (inherits root only) | yes | TWITTER missing override |
| `/events/[slug]` | yes (event-specific) | yes (event cover image) | no | yes | TWITTER missing override |
| `/categories/[slug]` | yes (category-specific) | inherits root default | no | no | CANONICAL missing, TWITTER missing override |
| `/about` | no override | inherits root default | inherits root | no | CANONICAL missing |
| `/help` | no override | inherits root default | inherits root | no | CANONICAL missing |
| `/help/[slug]` | unaudited (file present) | unaudited | unaudited | unaudited | needs spot-check |
| `/pricing` | no override | inherits root default | inherits root | no | CANONICAL missing |
| `/organisers` | no override | inherits root default | inherits root | yes | OK except TWITTER override |
| `/legal/privacy` | no override | inherits root default | inherits root | no | CANONICAL missing |
| `/legal/terms` | no override | inherits root default | inherits root | no | CANONICAL missing |
| `/legal/cookies` | unaudited | unaudited | unaudited | unaudited | needs spot-check |
| `/legal/organiser-terms` | unaudited | unaudited | unaudited | unaudited | needs spot-check |
| `/blog` | no override | inherits root default | inherits root | no | CANONICAL missing |
| `/careers` | no override | inherits root default | inherits root | no | CANONICAL missing |
| `/contact` | no override | inherits root default | inherits root | no | CANONICAL missing |
| `/login`, `/signup` | no override | inherits root default | inherits root | no | acceptable for auth pages but `robots: noindex` could be considered |
| `/forgot-password`, `/auth/reset-password` | no override | inherits root default | inherits root | no | should be `noindex` |
| `/queue/[slug]` | unaudited | unaudited | unaudited | unaudited | dynamic queue route, may want `noindex` |
| `/squad/[token]`, `/squad/[token]/pay/[member_id]` | unaudited | unaudited | unaudited | unaudited | private invitation pages, must be `noindex` + `nofollow` |
| `/orders/[id]/confirmation`, `/checkout/*` | unaudited | unaudited | unaudited | unaudited | private; must be `noindex` |
| `/dashboard/*` | layout-protected | inherits root | inherits root | no | private; must be `noindex` |
| `/admin/*` | layout-protected | inherits root | inherits root | no | private; must be `noindex` |

**Aggregate flags:**

1. **MEDIUM — Twitter Card overrides missing on every dynamic public route.** Without a per-page Twitter override the Twitter share preview falls back to the root `twitter.title = 'EventLinqs'` and the root description, even though the OG block has rich per-page content. Twitter often (not always) reads OG fields when twitter:* is missing, so the practical impact is mild, but explicit Twitter Card per page is cleaner.
2. **MEDIUM — `alternates.canonical` missing on `/about`, `/help`, `/pricing`, `/legal/*`, `/blog`, `/careers`, `/contact`, `/categories/[slug]`.** Canonical URLs should be set on every indexable route.
3. **MEDIUM — auth, dashboard, checkout, squad, queue, admin, and order routes need explicit `robots: { index: false, follow: false }` to avoid private URLs leaking into search.** Squad invitation tokens in particular are sensitive.

### 6. Footer social links

**File:** `src/components/layout/site-footer.tsx:92-100, 199-207`

Hardcoded:

- `https://twitter.com/eventlinqs`
- `https://instagram.com/eventlinqs`
- `https://tiktok.com/@eventlinqs`

**No links to:**

- Facebook page
- LinkedIn company page

**Flag MEDIUM:**

- Until Lawal registers `@eventlinqs` on each platform, these links are dead. Visitors who click them land on platform-default 404 / error pages.
- Facebook and LinkedIn icons are absent from the footer entirely. Add icons + links once the pages exist.
- Consider extracting handles into a single `SOCIAL_LINKS` constant in `src/lib/content/social.ts` so the footer, OG meta, structured data (LD+JSON), and any future "share" buttons all read from one source.

### 7. Public assets relevant to social presence

Inspected `public/`:

- `cities/`, `hero/`, `images/`, `logos/`, `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`.
- `next.svg` and `vercel.svg` are leftover Next.js scaffolding. Not linked from app code (verified by grep). Low-priority cleanup.
- `logos/` contains organiser logos used by the platform; not the EventLinqs brand mark.
- No `public/og/` for static OG images, no `public/icons/` for PWA, no `public/favicon.ico`.

**Flag LOW:** add a `public/brand/` directory with the canonical logo set once delivered. Add `public/og/default.png` as a static fallback if the dynamic OG generator ever fails.

### 8. Structured data (LD+JSON)

Not in this audit's primary scope but worth noting: there is **no LD+JSON `Event` structured data** on `/events/[slug]`. This costs us Google's rich-results carousel for events (a meaningful organic-traffic source for ticketing platforms). Out of scope to fix now; flagging as a discoverability gap.

---

## Recommended fix order (when fixes resume)

These are deferred per Lawal's instruction. Listed for sequencing once social handles exist and logo lands.

1. **Add `src/app/manifest.ts`** with brand colours, name, description, icons. (HIGH)
2. **Add `src/app/apple-icon.tsx`** at 180×180. (MEDIUM)
3. **Add 192 + 512 icon sizes** via additional `app/icon.tsx` size exports or static PNGs in `app/`. (MEDIUM)
4. **Add `public/favicon.ico`** static fallback. (LOW)
5. **Centralise social handles** in `src/lib/content/social.ts`; update footer + root metadata `twitter.site` + `openGraph.url`. (MEDIUM)
6. **Add `robots: { index: false, follow: false }`** on every private route (auth, dashboard, admin, checkout, orders, squad, queue). (MEDIUM)
7. **Add `alternates.canonical`** on every static public page that lacks one. (LOW-MEDIUM)
8. **Add per-page `twitter` block** on `/events/browse/[city]`, `/events/[slug]`, `/categories/[slug]`. (LOW)
9. **Spot-check unaudited pages** (`/help/[slug]`, `/legal/cookies`, `/legal/organiser-terms`, `/queue/[slug]`, squad routes, orders). (LOW)
10. **Add LD+JSON `Event` structured data** to `/events/[slug]` for Google rich results. (out of M6 scope, file as discovery improvement)

---

## References

- Root metadata: `src/app/layout.tsx:23-45`
- OG image generator: `src/app/opengraph-image.tsx`
- Favicon generator: `src/app/icon.tsx`
- Footer with social links: `src/components/layout/site-footer.tsx:92-100, 199-207`
- Launch blocker tracker: `docs/sprint1/launch-blocker-priorities.md` § "External presence and brand"
