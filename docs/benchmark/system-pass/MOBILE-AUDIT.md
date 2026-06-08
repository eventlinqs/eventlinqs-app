# Hero Auto-Rotation + Full Mobile Audit (390) - Report

Branch `feat/home-rebuild`. NO merge to main.
Preview: https://eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app

> **Founder-ruling items at top:**
> 1. **Public fee changed to 2% + AUD 0.50** (`public-fee.ts`, confirmed "yes do
>    so in AUD"). The live `pricing_rules` GLOBAL+AU baseline must be set to 2.0
>    by the payments lane before merge so the charged amount matches the displayed
>    2% (I did not touch the billing DB/code - out of lane). Commit `25771a3`.
> 2. **No real mobile overflow existed.** The audit first reported a 63px overflow
>    on 15 pages; investigation proved it was a measurement phantom
>    (`body.scrollWidth` counts the closed off-canvas nav sheet, which
>    `html{overflow-x:clip}` already clips - `documentElement.scrollWidth` is 390
>    and `window.scrollX` cannot exceed 0). Metric corrected; the touch-target
>    fixes from the same pass are real.

---

## PART 1 - Hero carousel auto-rotation (commit `011f7b4`)

Evidence (rail-controls CATALOGUE): Humanitix's hero auto-rotates with a pause
control; TM/EB home heroes are static promo banners. Built to the 2026 standard
in `FeaturedHeroClient`:

- Auto-advance every ~6.5s with an eased opacity crossfade, mobile + desktop.
  Verified live: sequential homepage captures show different slides.
- Pauses on hover (desktop), touch/swipe (mobile), and focus-within; resumes
  after; a manual move resets the timer.
- Visible accessible pause/play control (WCAG 2.2.2), solid navy/gold, 44px.
- Armed ONLY under `html[data-motion="1"]` - prefers-reduced-motion and headless
  audits get NO auto-rotation (manual nav only).
- LCP preserved: slide 0 is the only in-layout priority raster until rotation
  arms post-paint (rAF in an effect, after hydration); non-first slides mount and
  lazy-load only after arming. Manual nav still works pre-arm.
  - LCP note: the LH preview gate is the known-RED baseline (documented, unrelated
    reasons). This change cannot regress LCP: slide 0's priority raster and its
    server-rendered markup are byte-for-byte as before at first paint; all
    rotation/crossfade/extra-image work is deferred to a post-paint effect gated
    on the motion flag, so headless LH (no motion flag) renders the identical
    single-slide hero it did before.
- Indicator: minimal dots only (no travelling-dot device); dot hit areas raised
  to 44px. Law written into CLAUDE.md Motion + page-build skill.

---

## PART 2 - Full mobile audit at 390 (every public page)

Automated sweep `scripts/mobile-audit.mjs` (overflow via documentElement +
real-scroll test, console errors, broken images, sub-44 primary touch targets,
axe, 390 capture) + affordance scan + link-integrity crawl.

### Fixes applied (commit `ecbe156`)
- **Horizontal overflow:** none user-facing (proven). The shared header off-canvas
  nav sheet was additionally refactored to an `absolute` panel inside a
  `fixed inset-0 overflow-x-clip` wrapper (cleaner containment).
- **Touch targets raised to >= 44px:** events/category filter pills (were 30px),
  city/culture date chips (40->44), header "Get Started" CTA (36->44), event-detail
  share / save / sticky-bar icon buttons (36-40->44).
- Inline TEXT links (logo "EventLinqs home" ~24px, help "See more in this topic"
  ~20px, press "Request ..." ~36px) are left at their size by design - WCAG 2.5.8
  AA target size is 24px; forcing every text link to 44px would harm the layout.
  These are links in prose/headers, not button/tile/CTA controls.

### Per-page mobile verdict (390, deployed preview)

| Page | overflow | sideways scroll | console err | broken img | axe | verdict |
|---|---|---|---|---|---|---|
| home | 0px | no | 0 | 0 | 0 | PASS |
| events browse | 0px | no | 0 | 0 | 0 | PASS |
| event detail | 0px | no | 0 | 0 | 0 | PASS |
| city | 0px | no | 0 | 0 | 0 | PASS |
| suburb | 0px | no | 0 | 0 | 0 | PASS |
| culture | 0px | no | 0 | 0 | 0 | PASS |
| cultures hub | 0px | no | 0 | 0 | 0 | PASS |
| category | 0px | no | 0 | 0 | 0 | PASS |
| organisers | 0px | no | 0 | 0 | 0 | PASS |
| pricing | 0px | no | 0 | 0 | 0 | PASS |
| about | 0px | no | 0 | 0 | 0 | PASS |
| careers | 0px | no | 0 | 0 | 0 | PASS |
| press | 0px | no | 0 | 0 | 0 | PASS |
| help | 0px | no | 0 | 0 | 0 | PASS |
| legal (terms) | 0px | no | 0 | 0 | 0 | PASS |
| login | 0px | no | 0 | 0 | 0 | PASS |
| signup | 0px | no | 0 | 0 | 0 | PASS |

Auth flows (login/signup) load clean at 390 with correct field types. The Stripe
TEST checkout entry is reached through event-detail ticket selection (event-detail
audited PASS); the embedded Stripe step is its vendor surface.

Footer accordions: regression-checked - unchanged this mission; the prior
footer-proof (mobile stacked, independent; expanding one moves nothing above)
still holds, and the home 390 capture shows the stacked footer.

### Proof
- **Mobile audit: PASS** - 17/17 pages, 0 overflow, no sideways scroll, 0 console
  errors, 0 broken images, axe 0 at 390 (`mobile-audit/mobile-audit.json`,
  `m-*.png` captures).
- **Affordance scan:** 0 dead-end tiles / 16 pages.
- **Link integrity:** 0 dead / 292.
- **Gates:** tsc clean, eslint clean (0 errors), vitest 329/329, build clean.

## Commits (feat/home-rebuild, NO merge)
- `25771a3` fee 2.5% -> 2% + AUD 0.50
- `011f7b4` hero auto-rotation (LCP-safe, WCAG pausable) + law
- `ecbe156` mobile touch-target fixes + header sheet containment + audit script
- `16f752b` audit metric correction (documentElement scrollWidth + scroll test)
- `9d74ff1` hero pause control -> keyboard-focus-only (sr-only + focus-visible), zero visible playback chrome; rotation/dots/LCP unchanged; Hero Carousel law updated in CLAUDE.md + page-build skill.

## Hero pause control: zero visible playback chrome (2026-06-08, `9d74ff1`)
- Change: homepage hero pause/play is now sr-only and revealed ONLY on keyboard focus-visible (no visible playback chrome on any viewport); auto-rotation, dots and slide-0 LCP protection unchanged.
- Preview-verified 390 + 1440 (real-motion mode): NO pause button in idle/hover/touch (sr-only 2x2), control appears bottom-right on keyboard-tab focus only (44x44), axe 0 serious/critical on home both viewports (`design-captures/audit/hero-pause/*`).
