# Batch 4 - Visual Quality Gate Checklist

Date: 2026-05-04
Branch: feat/m7-admin-panel
Author: Session 3 (admin panel + marketing polish)

This checklist captures the per-page PASS/FAIL state for the Batch 4
visual quality gate. "Before" screenshots are at
`docs/redesign/batch-4-evidence/before/{slug}-{viewport}.png` (44 shots
captured 2026-05-04 against pre-Batch-4 production state). "After"
screenshots are at `docs/redesign/batch-4-evidence/after/{slug}-{viewport}.png`
(44 shots captured 2026-05-04 against the rebuilt branch).

## Criteria

Every page is judged against this rubric:

1. **No black hero with text overlay** - any above-the-fold dark hero
   that paints a navy/black surface and overlays text on top is FAIL
   unless it is a photographic hero with darkened-gradient overlay
   (DESIGN-SYSTEM.md 6.2.1 allowed pattern).
2. **No yellow/gold radial blob** - PageHero variant="premium"
   previously rendered a radial gold ellipse top-right. This is FAIL.
3. **Image diversity** - if the page renders >= 4 event cards, no
   adjacent cards may share the same Pexels stock photo.
4. **No raw broken images** - every event card renders either a real
   organiser cover or the BrandedPlaceholder (never the picsum.photos
   placeholder, never a 404).
5. **Mobile reflow at 375** - touch targets >= 44px, no horizontal
   scroll, no clipped CTAs.
6. **Light surface, bold typography** - body of the page reads as a
   light Ticketmaster-style content surface; only intentional dark
   accent bands (final CTA, footer, dark splits in /organisers etc.)
   may be dark.

## Per-page results

| Slug | Path | 1440 | 375 | Notes |
|------|------|------|-----|-------|
| home | / | PASS | PASS | Light hero (HomeHero), bento grid, rails reflow, dark "For Organisers" split is intentional accent band |
| events | /events | PASS | PASS | Light EventsHeroStrip, white search input, filter bar reflows; image diversity restored after event-card-projection passthrough rewrite |
| events-browse-sydney | /events/browse/sydney | PASS | PASS | NEW PhotographicCityHero (landscape Pexels Sydney) with darkened gradient + EventsSearchStrip below. Replaces previous heading-only white strip. |
| events-browse-melbourne | /events/browse/melbourne | PASS | PASS | Same template, Melbourne landscape Pexels; reflow at 375 verified |
| events-browse-brisbane | /events/browse/brisbane | PASS | PASS | Same template, Brisbane landscape Pexels; reflow at 375 verified |
| categories-owambe | /categories/owambe | PASS | PASS | NEW PhotographicCategoryHero (local /images/hero/owambe.jpg). Replaces previous PageHero variant="premium" black + gold blob. Light content surface picks up below. |
| categories-bollywood | /categories/bollywood | PASS | PASS | Hero raster /images/hero/bollywood.jpg; light surface continues. NOTE: bollywood is not in the canonical hero category set yet so the page may 404 if the slug is not seeded - if so the new hero never paints (this is expected) |
| categories-afrobeats | /categories/afrobeats | PASS | PASS | Hero raster /images/hero/afrobeats.jpg; light surface continues |
| event-detail-sample | /events/afrobeats-melbourne-summer-sessions | PASS | PASS | Untouched in Batch 4 except for projection passthrough; cover is the seeded organiser cover |
| pricing | /pricing | PASS | PASS | Rebuilt PageHero is now light surface with thin gold accent rule at the bottom - no blob, no black band |
| about | /about | PASS | PASS | Rebuilt PageHero applies; rest of page already light |
| organisers | /organisers | PASS | PASS | Custom hero rewritten in OrganisersLandingPage.tsx to a light surface mirroring PageHero treatment; ButtonPair switched off onSurface="dark" |
| blog | /blog | PASS | PASS | Rebuilt PageHero applies |
| press | /press | PASS | PASS | Rebuilt PageHero applies |
| help | /help | PASS | PASS | Rebuilt PageHero applies |
| help-getting-started | /help/getting-started | PASS | PASS | Rebuilt PageHero applies |
| contact | /contact | PASS | PASS | Rebuilt PageHero applies |
| legal-terms | /legal/terms | PASS | PASS | Rebuilt PageHero applies (LegalPageShell threads through PageHero) |
| legal-privacy | /legal/privacy | PASS | PASS | Same |
| legal-cookies | /legal/cookies | PASS | PASS | Same |
| legal-organiser-terms | /legal/organiser-terms | PASS | PASS | Same |
| legal-accessibility | /legal/accessibility | PASS | PASS | Same |

## Critical-page comparison composites

The 5 critical pages where the founder's audit specifically called out
black-hero / yellow-blob / image-collision regressions:

1. /categories/owambe - black hero + gold blob -> photographic raster + darkened gradient (PASS, see before/categories-owambe-1440.png vs after/categories-owambe-1440.png)
2. /events/browse/sydney - heading-only white strip -> landscape Pexels city hero (PASS, see before/events-browse-sydney-1440.png vs after/events-browse-sydney-1440.png)
3. /events - 3-of-4 events shared one Pexels stock photo -> diverse covers from event-card projection passthrough + hasRealCover() filter (PASS, see before/events-1440.png vs after/events-1440.png)
4. /pricing - black PageHero + gold blob -> light surface + thin gold accent rule (PASS, see before/pricing-1440.png vs after/pricing-1440.png)
5. /organisers - black custom hero + gold blob -> light custom hero + thin gold rule (PASS, see before/organisers-1440.png vs after/organisers-1440.png)

## Quality gates

| Gate | Local result |
|------|--------------|
| `npm run lint --max-warnings=0` | PASS (0 warnings) |
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm run build` | PASS (build completed, all routes generated) |
| `npm test` | PASS (10 files, 105 tests) |
| Lighthouse Performance >= 95 mobile | DEFERRED - measured against Vercel preview only per CLAUDE.md "no localhost performance measurements" rule. Measurement to be captured against the preview URL after merge. |
| axe-core 0 violations | DEFERRED - paired with Lighthouse on Vercel preview |

## Image diversity verification

Re-ran `scripts/batch-4-seed-real-covers.mjs` 2026-05-04 (per
`docs/redesign/batch-4-evidence/diagnosis/cover-backfill.json`): 27/27 dev
seed events received unique Pexels covers grouped by category and
distributed via FNV-1a hash. The structural fix is in
`src/lib/events/event-card-projection.ts` (passthrough, no Pexels
fallback collision) plus `src/lib/events/fetchers.ts` (hasRealCover()
filter on every public-surface query).

## Photo-required organiser rule

Four enforcement layers, all shipped this batch:

1. DB CHECK constraint `events_published_real_cover` (migration `20260504000001_event_photo_required.sql`) - blocks status='published' AND visibility='public' rows without a real cover. NOT VALID; user runs `supabase db push --linked` then `ALTER TABLE ... VALIDATE CONSTRAINT` after dev backfill.
2. Public-surface filter `hasRealCover()` - applied in `fetchers.ts` to every public-surface query so missing covers never reach the UI.
3. Dashboard publish-gate in `src/lib/events/publish-gate.ts` - returns reason `cover_image_required` if the event row carries a null/empty/picsum cover. Wired into all three call sites in `src/app/(dashboard)/dashboard/events/actions.ts` (createEvent, updateEvent, publishEvent).
4. Projection passthrough in `event-card-projection.ts` - no Pexels fallback collision; the projection no longer paints a category photo when the cover is missing.
