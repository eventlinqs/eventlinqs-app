# Dead-End Imagery - Fix + Affordance Audit

Emergency mission. Branch `feat/home-rebuild`. NO merge to main.
Preview: https://eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app

> **Founder-ruling items (none blocking):** the organiser community tile SET was
> recomposed to the locked Scenes V2 taxonomy (COMMUNITIES family First Nations
> first + high-volume SOUNDS + Comedy), not over-weighted to one cluster. Some
> tiles render the branded placeholder on the preview (no PEXELS_API_KEY there);
> on production they resolve real photos. Both are working links - never broken,
> never dead-end.

---

## 1. Organisers strip - dead-end FIXED (shipped first)

The "Open to every community" strip was static imagery in a `<ul>` grid with NO
links - tapping a tile did nothing (founder hit this live on mobile). Rebuilt as
`OrganiserCommunityStrip` (`src/components/features/organisers/community-strip.tsx`):

- **Every tile is a real `<a href>`** into an existing scene/culture/category
  page (verified resolving 200), with a label and a one-line description.
- **Recomposed set** (First Nations first, per law), reading "every community,
  every organiser" - not over-weighted:
  - Communities: First Nations -> /culture/aboriginal-torres-strait-islander;
    African, Caribbean, Latin American, Filipino -> /culture/[slug]; South Asian,
    East & SE Asian, Pasifika & Maori, Mediterranean -> resolving /events?q= ;
    Pride, Faith & worship -> /events?q= .
  - Sounds: Electronic & dance, Country, Indie & rock -> /events?q= .
  - Category: Comedy -> /events?category=comedy.
- Imagery via the culture/category photo pipeline with a branded fallback baked
  into EventCardMedia (never a broken image); separated-card design system, hover
  illumination, whole-tile touch target (>= 44px).
- Commit `7367023`. Verified on the deployed preview (captures below).

## 2. New law - interactive affordance (commit `f337bdf`)

Encoded in CLAUDE.md (Law 5 extended) and the page-build skill, same commit:
any image tile/card/grid-or-rail item that presents as tappable MUST be a working
link. "No dead links" now explicitly includes "no dead-end tiles". Decorative
imagery is allowed ONLY as full-bleed backgrounds or inline editorial photos,
never as tiles in grids/rails.

## 3. Automated check - affordance scan (commit `f337bdf`)

`scripts/affordance-scan.mjs` (Playwright): on every public page it finds
tile/card-shaped `<img>` (80-560px) inside a GRID or RAIL (computed grid / flex+
overflow-x / role=list|group) and FAILS if the image has no ancestor `<a href>`
or button. Excludes full-bleed backgrounds (>560px / absolute) and inline
editorial photos (not in a grid/rail). Runs beside the link-integrity crawler.
Soundness check: on /organisers it sees 9 card images in grids/rails, all 9
clickable (the rest render branded-placeholder divs inside working links).

## 4. Platform-wide sweep - result per page

Affordance scan across all 16 public pages on the deployed preview:

| Page | Status | Dead-end tiles |
|---|---|---|
| home | OK | 0 |
| organisers | OK | 0 |
| pricing | OK | 0 |
| about | OK | 0 |
| events-browse | OK | 0 |
| event-detail | OK | 0 |
| city | OK | 0 |
| suburb | OK | 0 |
| culture | OK | 0 |
| cultures-hub | OK | 0 |
| category | OK | 0 |
| culture-city (intersection) | OK | 0 |
| help | OK | 0 |
| press | OK | 0 |
| careers | OK | 0 |
| legal-terms | OK | 0 |

**TOTAL dead-end tiles platform-wide: 0.** The organisers strip was the only
dead-end; the founder's suspicion that it existed elsewhere did not hold - proven
by the scan, not asserted.

## 5. Proof (deployed preview)

- **Affordance scan:** 0 dead-end tiles across 16 pages (incl. all new tiles).
- **Link integrity:** 0 dead / 292 internal links (incl. every new tile link).
- **axe:** 0 violations on home and organisers, desktop + mobile
  (`affordance/axe.json`). (The community-moat audit separately holds axe 0 on
  the hub + 3 intersections.)
- **Gates:** tsc clean, eslint clean (0 errors), vitest 329/329, build clean.
- **Before/after captures** (`affordance/`, gitignored PNGs): organisers strip at
  390 (founder's mobile view) and 1440 - the tiles are now linked cards with
  labels + descriptions, First Nations first. Before: a static `<ul>` of images
  in `<div>`s with no links (dead-end on tap).

## Commits (feat/home-rebuild, NO merge)
- `7367023` fix(organisers): real-link tiles (dead-end fix)
- `f337bdf` feat(law): interactive-affordance law + affordance scan
