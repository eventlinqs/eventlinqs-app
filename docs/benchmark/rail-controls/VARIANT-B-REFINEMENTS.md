# Variant B Wins + Four Refinements - Report

Date: 2026-06-08. Branch: `feat/home-rebuild`. **NO MERGE to main.**
Preview: https://eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app

Founder verdict: **Variant B (role rhythm) is the homepage rhythm**, on top of the
approved rail control system. B was landed and four refinements applied.

---

## 1. Land B + branch cleanup

- Variant B cherry-picked from `test/home-rhythm-b` into `feat/home-rebuild`
  (commit `2f8d27a`) - clean, conflict-free (shared base).
- Deployed `feat/home-rebuild` preview verified rendering the B rhythm (square
  scene tiles `w-[150px]`, feature Trending row, distinct city tiles, wider gaps).
- Branches `test/home-rhythm-b` and `test/home-rhythm-c` deleted, local + origin.
- Decision recorded at the top of `RHYTHM-AB-REPORT.md`.

## 2. Hover illumination v2 - brighten, never darken (commit f1bb943)

Founder escalation: the old navy wash dimmed photos; the law is now the opposite.

- The IMAGE brightens on hover: computed `filter: brightness(1.07) saturate(1.08)`
  riding the existing scale, via one shared `.card-media-img` class on the image
  in every media surface (EventCardMedia, CityTileImage, CategoryTileImage,
  SubCultureTileImage).
- The navy wash drops to a WHISPER at the base only (~12% at the bottom edge,
  fading to 0 by ~60% up) - brand identity + bottom-edge legibility kept, image no
  longer dimmed.
- One implementation; both effects gated under `html[data-motion="1"]` so
  reduced-motion + headless audit paths are unchanged. CLAUDE.md Motion law
  updated to "Hover illumination law v2" in the same commit.
- **Proof:** `refinements/hover-idle.png` vs `refinements/hover-active.png` - the
  hovered card reads clearly brighter (sky + crowd lift, title goes gold).
  Captured with a real UA so `data-motion=1` was live (confirmed in summary.json);
  the hovered `<img>` computed filter is `brightness(1.07) saturate(1.08)`.

## 3. Kill all edge fading + contained look (commit 29896ad)

- Removed the left/right gradient fade masks AND the negative-margin bleed from
  the rail scroll track (shared `snap-rail.tsx`), desktop and mobile. Rails now
  live fully inside the standard container and end cleanly with even margins both
  sides - the Ticketmaster/Eventbrite contained look. The next-card peek now comes
  from card pitch inside the container, never a fade.
- page-build skill law updated: "CONTAINED, no edge-fade masks".
- **Proof:** the `refinements/tworails-*` captures show clean, even, unfaded rail
  edges at 1440, 1280 and 390.

## 4. Vertical rhythm - two rails per screen (commit 29896ad)

- New `SECTION_RAIL` token (`py-6 sm:py-8`, down from `py-12 sm:py-16` /
  `py-16 sm:py-24`) applied to every stacked home rail section (This Week, Browse
  by Category, all event rails, Scenes, City, Featured Venues). Header-to-track
  gap `mt-5 -> mt-3` (scroller header `mb-5/6 -> mb-3/4`); rail bottom `pb-4 ->
  pb-3` in `snap-rail.tsx`.
- Variant B horizontal gaps untouched; hero untouched. Tighter, not cramped.
- **Proof:** at **1440x900**, two full rails are visible together past the hero
  (`tworails-1440x900.png`: Browse by Category + This Week, both headers + full
  card rows). At **1280x800** (`tworails-1280x800.png`): the full This Week rail
  plus the next rail (Music) header + card-tops and the category rail tails -
  clearly two-plus rails in view. Mobile 390 also shows two rails.

## 5. Lint hygiene (commit dd6a17a)

- Added the gitignored `.claude/worktrees/**` nested checkout to eslint
  `globalIgnores`. `npm run lint` is now honestly green locally (0 errors, was
  43,498 phantom problems from the nested second checkout), matching CI.

---

## Proof summary (deployed preview)

| Check | Result |
|---|---|
| Brighter hover (idle vs active) | PASS - hovered img filter brightness(1.07) saturate(1.08), visibly brighter; motion=1 |
| Contained, unfaded rail edges (1440/1280/390) | PASS - even margins both sides, no fade |
| Two rails in view (1440x900) | PASS - two full rails past the hero |
| Two rails in view (1280x800) | PASS - one full rail + next rail header/cards + prior tails |
| Link integrity (deployed) | PASS - 0 dead / 295 internal links |
| axe desktop + mobile (deployed) | PASS - 0 / 0 |
| tsc / eslint / vitest / build | PASS - 0 / 0 errors / 329-329 / clean |

Capture paths (PNGs local/gitignored per repo convention):
`docs/benchmark/rail-controls/refinements/` - `tworails-1440x900.png`,
`tworails-1280x800.png`, `tworails-390x844.png`, `hover-idle.png`,
`hover-active.png`, `summary.json`. Runner: `scripts/refinements-proof.mjs`.
The pre-refinement "before" state is preserved in `variants/b/` (the old B
preview captures: darkening wash, edge fades, looser spacing).

## Commits (per unit, feat/home-rebuild, NO merge)

- `2f8d27a` land Variant B (cherry-pick)
- `f1bb943` hover illumination v2 + Motion law
- `29896ad` contained edges (no fades) + two-rails-per-screen rhythm + laws
- `dd6a17a` lint hygiene (ignore nested worktree)
