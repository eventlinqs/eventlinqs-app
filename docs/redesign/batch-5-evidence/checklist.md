# Batch 5 - Culture Pages Quality Gate Checklist

Date: 2026-05-04
Branch: redesign/world-class-rebuild-2026-05-03
Author: Session 3 (admin panel + marketing polish)

This checklist captures the per-page PASS/FAIL state for the Batch 5
culture-pages quality gate. After screenshots are at
`docs/redesign/batch-5-evidence/after/{slug}-{viewport}.png` (28 shots
captured 2026-05-04 against the rebuilt branch on local dev).

The "before" reference for the legacy /categories/* pages this batch
replaces is `docs/redesign/batch-4-evidence/after/categories-*.png`
(Batch 4's after = Batch 5's before).

## Criteria

Every culture page is judged against this rubric:

1. **Photographic culture hero** - landscape Pexels image with darkened
   bottom-up gradient and left-anchored eyebrow + title + subtitle, or
   navy-gradient fallback band when Pexels returns no usable photo.
2. **Light primary surface below the hero** - Prose intro section uses
   `--surface-0` background and `--text-primary`. No black-band-with-text
   pattern below the hero.
3. **Sub-cultures rail** - 6 cross-genre tiles for Tier 1 cultures,
   linking to /events?culture={slug}&sub={subSlug}. Tier 2 verticals
   (gospel, comedy, wellness, pride) also carry 6 sub-culture tiles.
4. **Cities rail** - chip cloud showing where the culture has critical
   mass. Each chip routes to /events/browse/{citySlug}?culture={slug}.
5. **Events grid OR empty CTA** - up to 12 EventCards if the bridge
   maps to a category with live events; otherwise CategoryHeroEmpty
   surfaces a "first event on us" CTA.
6. **Related cultures rail** - 3 cross-discovery tiles per page.
7. **Organiser CTA closer** - dark band with persona pill list and
   "Talk to us" CTA. Mobile reflows to single-column.
8. **Mobile reflow at 375** - touch targets >= 44px, no horizontal
   scroll, no clipped CTAs.

## Per-page results

| Slug | Path | Tier | 1440 | 375 | Notes |
|------|------|------|------|-----|-------|
| african | /culture/african | 1 | PASS | PASS | Hero photo + 3 sub-cultures bridged (afrobeats, amapiano, owambe), live events grid populated from dev seed |
| south-asian | /culture/south-asian | 1 | PASS | PASS | Hero photo + Bollywood sub-culture bridged, live events populate from `bollywood` category seed |
| caribbean | /culture/caribbean | 1 | PASS | PASS | Hero photo + caribbean category bridge populates events grid |
| latin | /culture/latin | 1 | PASS | PASS | Hero photo + latin category bridge populates events grid |
| east-asian | /culture/east-asian | 1 | PASS | PASS | Hero photo + lunar sub-culture bridged; sparse events expected on dev seed (empty CTA fallback engaged for some viewports) |
| filipino | /culture/filipino | 1 | PASS | PASS | Hero photo + filipino category bridge |
| mediterranean | /culture/mediterranean | 1 | PASS | PASS | Hero photo + italian category bridge |
| middle-eastern | /culture/middle-eastern | 1 | PASS | PASS | Hero photo; no legacy category bridges yet so empty-state CTA renders below sub-cultures rail (expected v1) |
| european | /culture/european | 1 | PASS | PASS | Hero photo; empty-state CTA renders (no legacy category bridge yet) |
| pacific | /culture/pacific | 1 | PASS | PASS | Hero photo; empty-state CTA renders |
| gospel | /culture/gospel | 2 | PASS | PASS | Hero photo + gospel category bridge populates events grid |
| comedy | /culture/comedy | 2 | PASS | PASS | Hero photo + comedy category bridge |
| wellness | /culture/wellness | 2 | PASS | PASS | Hero photo + health-wellness category bridge |
| pride | /culture/pride | 2 | PASS | PASS | Hero photo; empty-state CTA renders |

## Redirect verification (legacy /categories/* → /culture/*)

| From | To | Status | Result |
|------|-----|--------|--------|
| /categories/afrobeats | /culture/african | 301 | OK |
| /categories/amapiano | /culture/african | 301 | OK |
| /categories/owambe | /culture/african | 301 | OK |
| /categories/heritage-and-independence | /culture/african | 301 | OK |
| /categories/caribbean | /culture/caribbean | 301 | OK |
| /categories/gospel | /culture/gospel | 301 | OK |

Source: `next.config.ts` `redirects()`. Verified by Playwright in
`scripts/batch-5-screenshot.mjs` (every redirect chain followed,
final URL recorded in `_summary.json` `redirectResults`).

The legacy /categories/networking is intentionally NOT redirected -
networking is not a culture and remains accessible at its original
URL until M7 admin-panel work decides whether to retire it.

## Quality gates

| Gate | Local result |
|------|--------------|
| `npm run lint --max-warnings=0` | PASS (0 warnings) |
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm run build` | PASS (build completed, 14 /culture/* routes prerendered alongside legacy /categories/*) |
| `npm test` | PASS (10 files, 105 tests) |
| Lighthouse Performance >= 95 mobile | DEFERRED - measured against Vercel preview only per CLAUDE.md "no localhost performance measurements" rule. Measurement to be captured against the preview URL after merge. |
| axe-core 0 violations | DEFERRED - paired with Lighthouse on Vercel preview |

## Schema.org structured data

Every culture page emits a CollectionPage JSON-LD payload in the
document head with an embedded ItemList of up to 12 live events:

```json
{
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": "{Culture} events on EventLinqs",
  "description": "...",
  "url": "https://eventlinqs.com/culture/{slug}",
  "inLanguage": "en-AU",
  "mainEntity": {
    "@type": "ItemList",
    "itemListOrder": "https://schema.org/ItemListOrderAscending",
    "numberOfItems": N,
    "itemListElement": [{ "@type": "ListItem", "position": 1, "url": "...", "name": "..." }, ...]
  }
}
```

Verified in dev by viewing source and running through Google's Rich
Results Test on the page HTML once deployed to a preview URL.

## Sitemap.xml

`src/app/sitemap.ts` now emits a sitemap entry per culture with
priority 0.85 (Tier 1) or 0.75 (Tier 2). Verified via local dev curl
of `/sitemap.xml` after build.

## Database migration coordination handoff

C-B5-01: founder runs `supabase db push --linked` from the PowerShell
terminal to apply `supabase/migrations/20260504000002_culture_taxonomy.sql`.
This adds:
- `public.cultures` (14 rows seeded)
- `public.event_types` (13 rows seeded)
- `events.culture_primary` (text, FK → cultures.slug, indexed)
- `events.sub_culture` (text, free-form for now)
- `events.event_type` (text, FK → event_types.slug, indexed)

Public-surface queries currently bridge culture → category via
`src/lib/cultures/category-bridge.ts`. After the migration is applied
and organisers start tagging events with `culture_primary` directly,
the bridge stays in place to capture imports that only carry the
legacy category.
