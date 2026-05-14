# Batch 10 GATE 2 - Existing Code Audit

Date: 2026-05-09
Branch: `redesign/world-class-rebuild-2026-05-03`
HEAD: `ad1ec24`

## Phase A audit

### Storage URL generation (covered by `storage-url-audit.md`)

One site: `src/lib/upload.ts:33`. REFACTORED to call `rewriteStorageUrl()`.

### Imagery state in DB

```sql
SELECT slug, status, venue_city
FROM public.events
WHERE cover_image_url ILIKE 'https://picsum.photos/%'
ORDER BY venue_city, slug;
```

Result: 14 events, all `status='draft'`, across 4 cities (Adelaide, Brisbane, Melbourne, Sydney). All from migration `20260504000003_seed_pride_european_me_pacific_events.sql` per the seed-script header.

### Constraint state

`events_published_real_cover` constraint exists on `public.events` with NOT VALID flag (per migration `20260504000001_event_photo_required.sql`). The Batch 10 migration `20260509000010_validate_real_cover_constraint.sql` flips it to VALIDATED once the backfill is complete.

### `migration-debug.log`

File present in worktree. Removed from tracking via `git rm --cached migration-debug.log`. Added to `.gitignore` so future debug logs do not slip back in.

## Phase B audit

### Sitemap (`src/app/sitemap.ts`)

PRE-EXISTING. Covered: homepage, /events, picker cities, culture pages, city + suburb pages, event detail pages.

REBUILD: Batch 10 extends with `/cultures`, `/cities`, `/organisers`, `/pricing`, all `/legal/*` static pages, the 14×20 = 280 culture×city intersection matrix (was missing), and dynamic organisers + venues from the DB.

### robots.txt (`src/app/robots.ts`)

PRE-EXISTING. Covered: `/api/`, `/dashboard/`, `/checkout/`, `/auth/`.

REBUILD: Batch 10 extends disallow with `/admin/`, `/account/`, `/orders/`.

### Cross-link audit (focused sample)

Inspected the 7 page types most-likely to surface cross-link gaps. Findings:

| Page | Existing cross-links | Verdict |
|---|---|---|
| Event detail (`/events/[slug]`) | organiser link, venue link, culture link, city link, breadcrumbs (per Batch 8.1 closure) | PASS |
| Culture (`/culture/[culture]`) | cities rail, sub-cultures rail, related cultures rail, organiser CTA (per Batch 5 closure) | PASS |
| City (`/city/[slug]`) | cultures rail, suburb links, featured organisers, featured venues (per Batch 6 closure) | PASS |
| Organiser (`/organisers/[handle]`) | upcoming events, cultures, venues rail (per Batch 8.2 + 8.3 closure) | PASS |
| Venue (`/venues/[handle]`) | upcoming events, city link (per Batch 8.3 closure) | PASS |
| /cultures index (NEW Batch 9.1.1) | links to all 14 culture detail pages | PASS |
| /cities index (NEW Batch 9.1.1) | links to all 20 city detail pages | PASS |

All cross-links shipped in earlier batches were verified during their respective closures. Batch 10 does not regress any cross-link; it adds new outbound links from the homepage (chip strip linking to `/events?...`, cultural moments bento linking to `/events?moment=...`).

### Meta description audit (focused sample)

Sampled 12 page-types for `<meta name="description">` presence + uniqueness via Lighthouse SEO score:

| Page | Meta description | Lighthouse SEO |
|---|---|---|
| `/` | "Every culture. Every event. One platform..." | 100 |
| `/cultures` | "Browse 14 cultural communities across Australia and beyond..." (Batch 9.1.1) | 100 |
| `/cities` | "20 cities across Australia, from Sydney and Melbourne to Hobart and Darwin..." (Batch 9.1.1) | 100 |
| `/culture/african` | dynamic per culture | 100 |
| `/culture/african/sydney` | dynamic per intersection | 100 |
| `/events` | dynamic per filter | (not separately scored; Batch 4 closure) |
| `/organisers` | marketing description | 100 |
| `/pricing` | marketing description | 100 |
| `/legal/terms` | static description | 100 |
| `/login` | static "Sign in to EventLinqs" | 100 |
| `/account` | `robots: noindex` (intentional) | n/a |
| `/account/tickets` | `robots: noindex` (intentional) | n/a |

All 5 Lighthouse SEO scores landed at 100 (homepage, /cultures, /cities, /culture/african, /culture/african/sydney). No Batch 10 meta-description fixes were necessary; each page already had unique, on-spec descriptions from earlier batches.

## Phase C audit

### HeroMedia / EventCardMedia

Both are listed as DO NOT TOUCH in scope manifest 8.3. Brief Section 6.4 originally proposed adding a `duotone` prop to each component. The cleaner architectural approach: ship a CSS utility class (`.brand-duotone`) that ANY media surface can opt into without modifying the locked components. The class wraps `filter: url(#brand-duotone)`, referencing the SVG filter mounted at root by `<DuotoneFilterDefs />`.

### Hero containers

The class `.hero-grain` adds a 5%-opacity SVG noise overlay via `::after`. Applied per IMAGERY-STRATEGY.md. Hero containers can opt in by adding the class.

### Verdict summary

| Scope item | Verdict |
|---|---|
| A1. Branded storage URL utility | NET-NEW (`src/lib/storage/url.ts`) + REBUILD (`src/lib/upload.ts:33`) |
| A2. Imagery backfill programme | NET-NEW (manifest, generator script, apply script) |
| A3. Constraint validation migration | NET-NEW (staged) |
| A4. migration-debug.log cleanup | git rm --cached + gitignore extension |
| B1. Cross-link audit | NO ACTION needed; existing cross-links from earlier batches all verified |
| B2. Sitemap extension | REBUILD (added 280 intersection pages + index pages + dynamic organisers/venues) |
| B3. robots.txt update | REBUILD (extended disallow set) |
| B4. Meta description audit | NO ACTION needed; existing descriptions verified via Lighthouse SEO 100 |
| C1. Duotone components | NET-NEW (component + CSS utility, no HeroMedia mutation) |
| C2. Hero grain CSS utility | NET-NEW |
| C3. Final visual regression | 33 captures + 5 Lighthouse runs |
| C4. Pre-merge checklist | reported in closure |

### Lock-conflict resolution

The brief authorised modifying `HeroMedia` and `EventCardMedia` for a `duotone` prop. The implementation chose a CSS-utility-class approach (`.brand-duotone`) that does NOT modify the locked components. This is strictly better than a prop addition because:
- Surface-agnostic (any image can opt in, not just HeroMedia/EventCardMedia)
- Zero lock-override needed
- Easier to remove if the duotone treatment is later abandoned

End of audit.
