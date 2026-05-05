# Batch 5.5 - Culture Pages Polish Closure Report

Date: 2026-05-05
Branch: `redesign/world-class-rebuild-2026-05-03`
Session: 3 (admin panel + marketing polish)
Author: Claude (Session 3 worktree)

## What was mandated

A 9-task polish pass on the Batch 5 culture pages plus two additions
that surfaced during the run:

1. T1 - Sub-cultures rail photographic rebuild
2. T2 - Cities rail photographic + intersection route /culture/[culture]/[city]
3. T3 - CTA panel refinement (30% shorter, photographic backdrop)
4. T4 - Editorial copy uplift across 14 cultures
5. T5 - Ticketmaster comparison composites
6. T6 - Lighthouse 95+ on production build
7. T7 - Image relevance audit
8. T8 - Seed events for Pride / European / Middle Eastern / Pacific
9. T9 - Footer rebuild (50% shorter, 4-col desktop, 2-col mobile)
10. T1-reconcile - Sub-culture slugs reconciled to founder-authoritative map
11. Africa-ready copy removal from public surfaces

Hard requirements: lint --max-warnings=0, tsc clean, build clean, 105+
tests, no em-dashes, no exclamation marks, Australian English, no
"diaspora" in public copy, founder-authoritative sub-culture slugs
with exact Pexels queries.

## What shipped

### Components

- `src/components/media/SubCultureTileImage.tsx` - new media component
  for sub-culture rail tiles with photographic Pexels imagery and a
  navy-gradient fallback when Pexels returns null.
- `src/components/features/culture/sub-cultures-rail.tsx` - rebuilt to
  consume `SubCultureTileImage` instead of a flat colour band.
- `src/components/features/culture/cities-rail.tsx` - photo tiles
  routing to `/culture/[culture]/[city]` intersection page.
- `src/components/features/culture/culture-organiser-cta.tsx` -
  30% shorter (py-10/12/16 vs py-16/20/24), photographic backdrop with
  0.86 dark overlay, single talk-to-us CTA. Uses HeroMedia `priority=false`
  for the backdrop layer per media-library contract.
- `src/components/templates/CultureLandingPage.tsx` - parallel-fetches
  sub-culture photos and the first-city hero photo, threads both into
  the rebuilt sections.
- `src/components/layout/site-footer.tsx` - rebuilt to v4 - 50% vertical
  reduction (pt-10/pb-6), 4-col desktop, 2-col mobile with accordion,
  brand strip with logo + tagline + social inline, compact sub-footer.

### Routes

- `src/app/culture/[culture]/page.tsx` - renamed from `/culture/[slug]`
  to make the segment self-describing under the new
  `/culture/[culture]/[city]` intersection route.
- `src/app/culture/[culture]/[city]/page.tsx` - new intersection route
  for "Afrobeats events in Sydney" style queries.

### Data + library

- `src/lib/cultures/data.ts` - full sub-culture slug rewrite to the
  founder-authoritative map (african pan-african → pan-african-gospel,
  south-asian garba → garba-raas, holi → holi-diwali, tamil → tamil-telugu,
  caribbean / latin / east-asian / pacific full rewrites, filipino
  truncated 6 → 4, mediterranean and middle-eastern truncated 6 → 5).
  Editorial story paragraphs uplifted across all 14 cultures. Australian
  English, no em-dashes, no exclamation marks, no "diaspora".
- `src/lib/cultures/category-bridge.ts` - bridge updated to mirror the
  reconciled sub-culture slugs.
- `src/lib/images/sub-culture-photo.ts` - Pexels-backed sub-culture
  photo helper, 81 founder-authoritative queries (56 Tier 1 + 25 Tier
  2), top-5 hash sample, v1 cache key, 7-day revalidate.

### Migrations

- `supabase/migrations/20260504000003_seed_pride_european_me_pacific_events.sql`
  - idempotent (on conflict do nothing) seed of launch-day events for
  the four cultures whose pages were rendering empty-state CTAs.

### Public copy

- `src/app/page.tsx` - "Africa-ready: mobile money, WhatsApp sharing"
  bullet replaced with "Mobile-first checkout: WhatsApp sharing built
  in". Removes Africa-specific positioning while preserving the
  WhatsApp-sharing feature claim.

## Evidence

- `docs/redesign/batch-5-evidence/after/culture-{slug}-{1440,375}.png`
  - 28 re-captured screenshots (14 cultures × 2 viewports).
- `docs/redesign/batch-5-evidence/footer-before-{1440,375}.png` and
  `docs/redesign/batch-5-evidence/footer-after-{1440,375}.png` - v3
  vs v4 footer comparison.
- `docs/redesign/batch-5-evidence/organisers-africa-ready-fix-375.png`
  - post-fix homepage For Organisers section showing the new bullet.
- `docs/redesign/batch-5-evidence/lighthouse/run{1,2,3}/` - 3-pass
  Lighthouse JSON + HTML reports for 6 culture routes.
- `docs/redesign/batch-5-evidence/lighthouse-scores.md` - median table
  + honest assessment of localhost cold-cache LCP artefact.
- `docs/redesign/batch-5-evidence/image-relevance.md` - 14 hero + 81
  sub-culture queries scored: 95 GOOD, 4 ACCEPTABLE, 1 POOR.
- `docs/redesign/references/ticketmaster/` and
  `docs/redesign/batch-5-evidence/comparisons/` - competitive pulls.
- `scripts/batch-5-5-screenshots.mjs`,
  `scripts/lh-batch-5-5-cultures.mjs`,
  `scripts/lh-batch-5-5-median.mjs` - reproducible capture pipeline.

## Quality gates (2026-05-05)

| Gate | Result |
|------|--------|
| `npm run lint --max-warnings=0` | PASS (0 warnings) |
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm run build` | PASS (all routes prerendered, /culture/[culture] + /culture/[culture]/[city] generated) |
| `npm test` | PASS (10 files, 105 tests) |
| Lighthouse Performance >= 95 mobile | DEFERRED - localhost cold-cache 0.82-0.89 documented as Pexels CDN artefact per CLAUDE.md "no localhost performance measurements" rule. Vercel preview run scheduled post-merge. |
| axe-core 0 violations | DEFERRED - paired with Lighthouse on Vercel preview. |

## Coordination handoffs (open)

- C-B5.5-01 - founder runs `supabase db push --linked` to apply
  `20260504000003_seed_pride_european_me_pacific_events.sql`. No
  schema change, only seed inserts; no `VALIDATE CONSTRAINT` step.
- C-B5.5-02 - PM runs Vercel preview Lighthouse median-of-5 mobile +
  axe-core 0 on /culture/{african, south-asian, caribbean, latin,
  gospel, comedy, pride}.
- C-B5.5-03 - PM runs visual regression at the 7 canonical viewports
  in BUILD-STANDARDS.md against the Vercel preview URL.

## What we are NOT going to do

- Strip the hero photograph to bump localhost LCP. The hero is the
  visual differentiation vs Ticketmaster.
- Switch to a self-hosted optimised raster pipeline now. M11 commissions
  cultural photographers and sets up a Cloudinary pipeline; that is the
  right place to fix LCP, not a localhost-only patch.
- Rename the `[culture]` segment again. The `[culture]/[city]`
  intersection works, the legacy `/categories/*` redirects still
  resolve via `next.config.ts`.

## [GATE]

Batch 5.5 code complete. Awaiting project manager review and
coordinated merge.
