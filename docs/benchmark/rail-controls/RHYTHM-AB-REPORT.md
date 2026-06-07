# Rail Control System + Homepage Rhythm A/B/C - Report

Mission 3. Date: 2026-06-08 (overnight). NO MERGE anywhere. Branches pushed,
three Vercel previews live.

Role discipline held: every control decision is traced to captured competitor
evidence (`docs/benchmark/rail-controls/CATALOGUE.md`), not taste.

---

## Preview URLs (hand-back)

| Variant | What it is | URL |
|---|---|---|
| **A (control)** | feat/home-rebuild: NEW rail controls + ORIGINAL rhythm. The control for the rhythm comparison (control system held constant). | https://eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app |
| **B (role rhythm)** | test/home-rhythm-b: new controls + wider gaps + restrained role differentiation. | https://eventlinqs-app-git-test-home-rhythm-b-lawals-projects-c20c0be8.vercel.app |
| **C (editorial rhythm)** | test/home-rhythm-c: new controls + bigger gaps + ranked rail, square tiles, editorial row, per-rail devices. | https://eventlinqs-app-git-test-home-rhythm-c-lawals-projects-c20c0be8.vercel.app |

Why A carries the new controls: Part 1 (the control redesign) is a decided,
permanent platform law that "ships in both variants." The A/B/C test is about
RHYTHM only, so the control system is held constant across all three and only
the rhythm varies. A is the rhythm control.

---

## Part 1 - Rail Control System (the law, ships in A, B and C)

**Evidence** (`CATALOGUE.md`, live Playwright at 1440 / 1180 / 390): Airbnb (the
gold standard) and Ticketmaster both anchor paired circular prev/next buttons at
the TOP-RIGHT of each rail header; Airbnb #F2F2F2 / Humanitix #F9F9FA fills are
opaque; Airbnb's disabled-at-start state is opacity 0.5 + grey border; neither
shows any progress dot/bar; Ticketmaster runs 44px; mobile hides arrows (swipe).

**Built** (`src/components/ui/snap-rail.tsx`, `RailArrows`, single source):
- Solid opaque navy circular buttons, 44px (`h-11 w-11`), white chevron turning
  gold on hover; lift + shadow on hover, `active:scale-95` press.
- Header-anchored top-right = structurally stable: arrows live in normal flow,
  so they never float, jump, vanish on scroll, or shift on resize. Proven at
  1440 / 1180 / 980 (`variants/*/controls-*.png`).
- Muted disabled state at either end (read off Airbnb). Verified live: the "This
  week" rail shows a muted left arrow (at start) + solid navy right arrow.
- The travelling progress dot/bar is REMOVED and replaced with nothing - exactly
  what the gold standard does. Hook no longer tracks progress.
- Reachable on mobile (header-anchored, 44px) on top of native swipe - better
  than Airbnb/TM, evidence-consistent with Humanitix keeping hero arrows on
  mobile. Verified on the 390 captures.
- A rail that does not overflow shows no controls (no dead arrows).
- Desktop drag-to-scroll + keyboard glide + hero-LCP snap-on-engage + locked
  easing all preserved untouched.
- The lone DragRail rail (recommended, on /events + event detail) was migrated
  to SnapRailScroller so it shares the identical control; first-card LCP
  priority preserved.
- Law written into `CLAUDE.md` and the `page-build` skill in the Part 1 commit.

---

## Part 2 - Homepage rhythm (homepage only, hero untouched)

Founder verdict on Ticketmaster: rails too symmetrical, cards too close
side-to-side. Both variants open the side-to-side gap (vertical rhythm
unchanged) and differentiate rails by role. Cards are uniform WITHIN each rail.
No bento.

### Variant B - role rhythm (restrained)
- Gap +1/3 mobile, +1/2 desktop (`RHYTHM_GAP gap-4 sm:gap-[18px]`).
- This Week + Music + most category rails: current landscape scale.
- Trending now: the one larger feature-card row (uniform feature cards).
- Scenes: proper square tiles at a distinct smaller scale + a gold-tinted
  top-divider per-rail accent.
- City rail: distinct larger destination tiles (wider than event cards).

### Variant C - editorial rhythm (bolder, genuinely distinct)
- Gap pushed further: +2/3 mobile, +~133% desktop (`gap-5 sm:gap-7`).
- Trending now: ranked/numbered rail - large solid-navy editorial numerals
  beside square cards (numerals sit BESIDE the image, never on it). Verified:
  1 2 3 4 5 chart row.
- Compact square category tiles + even smaller square scene tiles.
- Editor's picks: wide editorial card row (uniform feature cards).
- One tasteful navy/gold solid graphic device per signature rail (`RailDevice`:
  rank / star / grid / wave glyphs) via a new optional SnapRail device slot.

---

## Proof (per variant, on the deployed previews)

| Check | A (base) | B | C |
|---|---|---|---|
| Build (Turbopack) | green | green | green |
| tsc / eslint | clean | clean | clean |
| vitest | 329/329 | 329/329 | 329/329 |
| Link integrity (deployed) | (base, 295 ok) | **0 dead / 295** | **0 dead / 295** |
| axe desktop + mobile (deployed) | (base) | **0 / 0** | **0 / 0** |
| New controls render + states | yes | verified | verified |
| Control resize stability 1440/1180/980 | n/a | verified | verified |
| Arrows reachable on mobile (390) | yes | verified | verified |

Capture paths (PNGs are local/gitignored per repo convention; downscaled views
under each `view/` dir):
- Competitor evidence: `docs/benchmark/rail-controls/*-{1440,1180,390}-*.png`
  + `rail-controls-measurements.json` + `CATALOGUE.md`.
- B: `docs/benchmark/rail-controls/variants/b/` (home-1440, home-390,
  home-1440-rails, controls-1440/1180/980, trending-feature, axe-*.json).
- C: `docs/benchmark/rail-controls/variants/c/` (home-1440, home-390,
  home-1440-rails, controls-1440/1180/980, trending-ranked, editorial-feature,
  axe-*.json).

### Lighthouse note (honest)
A fresh median-of-5 Lighthouse was NOT run. Reasons: (1) the changes are
layout-only (inter-card gap + per-rail card scale) with NO new above-fold
priority images - feature/ranked rail images are forced `priority=false` and the
hero LCP path is untouched, so LCP/CLS are neutral-to-positive; (2) the preview
Lighthouse gate is separately tracked as known-RED for documented unrelated
reasons (preview toolbar, Issue #42) on the base branch, so A/B/C share that same
baseline - the rhythm work does not regress it. Single-run Lighthouse is barred
by the constitution, so none is reported. This is the one item not freshly
measured; flag if a median-of-5 sweep on all three is wanted before the call.

### Density note
The deployed previews render live Supabase data (~23 events), not the local
gitignored full-density fixture (`HOMEPAGE_SEED_FIXTURE=1`, local-only). The
rhythm still reads clearly on the previews because every populated rail shows its
gap + role treatment (confirmed: ranked 1-5, feature rows, square scene/category
tiles, larger city tiles, devices). If you want full-density (55-card) captures
for the final call, say so and I will run them locally.

---

## Decision needed
Pick the rhythm: A (hold current), B (role rhythm), or C (editorial rhythm).
Nothing is merged. On your call I wire the chosen rhythm into feat/home-rebuild
and retire the other test branch.
