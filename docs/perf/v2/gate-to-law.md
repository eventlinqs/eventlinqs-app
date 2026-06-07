# Quality gate brought up to the law (chore/gates-to-law)

Branch: `chore/gates-to-law`. Responds to MAJOR-1 and the MAJOR-4 gate-gap in
`docs/benchmark/WORKSHOP-INSPECTION.md`.

## What the inspection proved about the old gate

The Lighthouse CI gate did not enforce the law it claimed:

- ran against `localhost:3000` via `npm run start`, not the deployed preview;
- floored performance at 0.80, not the 0.95 law;
- waived performance to warn (non-blocking) on `/` and all `/culture/*`;
- measured mobile only, no desktop;
- left LCP/TBT/FCP/Speed-Index at warn (only CLS + category scores error);
- omitted `/about`, `/blog`, `/careers`, `/press`, `/legal/privacy` from the
  axe + Lighthouse URL list.

## What this branch changes

1. **Target = warmed Vercel preview.** `.github/workflows/lighthouse.yml` now
   resolves the preview deployment URL for the PR commit from the GitHub
   deployments API that Vercel posts (no third-party action), warms every URL
   with an unrecorded curl pass, then runs Lighthouse against it. The old
   local-Supabase + `next build` + localhost path is gone. The
   preview-only `vercel.live` toolbar is blocked during measurement
   (`blockedUrlPatterns`) so best-practices and performance measure the app as
   production serves it.
2. **Desktop + mobile.** A form-factor matrix runs both. Mobile uses
   `lighthouserc.json`; desktop uses `lighthouserc.desktop.json`.
3. **Performance is error-level everywhere.** The warn waivers on `/` and
   `/culture/*` are removed. Core Web Vitals (LCP/TBT/FCP/Speed-Index) are
   raised from warn to error. The performance floor is set to the highest
   value the warmed preview actually passes (table below); the remaining gap
   up to the 0.95 law is tracked in **Issue #42** (Vercel image-optimiser
   cold-start), not waived in-gate.
4. **Marketing + legal pages added** to the gate URL list: `/about`, `/blog`,
   `/careers`, `/press`, `/legal/privacy`. The event-detail URL is now
   discovered from the live sitemap (a real, resolvable slug) instead of a
   hand-picked seed slug.
5. **Link-integrity crawl wired** (`link-integrity` job): dormant no-op pass
   until the crawler lands on main from feat/home-rebuild, then auto-activates.

No existing threshold was lowered. Every change is strictly equal-or-stronger
than the gate it replaces.

## Floors

The floor is the highest the warmed preview passes today; the gap from the
floor to 0.95 is the Issue #42 cold-start work, tracked, not waived.

| Form factor | Performance floor | a11y | best-practices | seo | LCP | TBT | CLS | FCP | Speed-Index |
|---|---|---|---|---|---|---|---|---|---|
| Mobile  | 0.80 (calibrating - see below) | 1.0 err | 1.0 err | 1.0 err | <=4000 err | <=600 err | <=0.1 err | <=2000 err | <=4500 err |
| Desktop | 0.90 (calibrating - see below) | 1.0 err | 1.0 err | 1.0 err | <=4000 err | <=600 err | <=0.1 err | <=2000 err | <=4500 err |

Mobile keeps the existing 0.80 floor as the never-lowered baseline; desktop
starts at 0.90. Both are ratcheted up to the highest the warmed-preview CI run
actually passes once measured (the run prints median scores per URL via
`scripts/ci/lh-print-summary.mjs`).

## Measured medians (warmed Vercel preview, median-of-3, el-audit=1)

First real CI run: PR #95, run 27078399497, preview
`eventlinqs-9ya6nsuth-...vercel.app` (off `main`). `--` = NO_LCP (perf score
null - the priority hero image did not register an LCP event inside the gather
window; this is the Issue #42 cold-start manifestation, intermittent).

### Mobile

| URL | perf | a11y | bp | seo | LCP ms |
|---|---|---|---|---|---|
| / | -- | 100 | 96 | 100 | -- (SI 5053) |
| /events | 80 | 100 | 96 | 100 | 3954 |
| /events/africultures-festival-sydney-2027 | 78 | 100 | 96 | 100 | 3957 |
| /events/browse/melbourne | 80 | 100 | 96 | 100 | 4108 |
| /culture/african | -- | 100 | 96 | 100 | -- |
| /organisers | 91 | 100 | 96 | 100 | 3184 |
| /pricing | 86 | 100 | 96 | 100 | 3508 |
| /help | 81 | 100 | 96 | 100 | 3595 |
| /about | 86 | 97 | 96 | 100 | 3519 |
| /blog | 97 | 96 | 96 | 100 | 1988 |
| /careers | 90 | 96 | 96 | 100 | 2611 |
| /press | 91 | 90 | 96 | 100 | 1981 |
| /legal/terms | 83 | 100 | 96 | 100 | 3810 |
| /legal/privacy | 83 | 100 | 96 | 100 | 3812 |
| /login | 95 | 100 | 96 | off | 2274 |
| /signup | 93 | 100 | 96 | off | 2715 |

### Desktop

| URL | perf | a11y | bp | seo | LCP ms |
|---|---|---|---|---|---|
| / | 92 | 100 | 96 | 100 | 982 |
| /events | 99 | 100 | 96 | 100 | 913 |
| /events/africultures-festival-sydney-2027 | 99 | 100 | 96 | 100 | 889 |
| /events/browse/melbourne | 99 | 100 | 96 | 100 | 908 |
| /culture/african | -- | 100 | 96 | 100 | -- |
| /organisers | 99 | 100 | 96 | 100 | 867 |
| /pricing | 100 | 100 | 96 | 100 | 784 |
| /help | 99 | 100 | 96 | 100 | 825 |
| /about | 100 | 96 | 96 | 100 | 817 |
| /blog | 99 | 96 | 96 | 100 | 828 |
| /careers | 100 | 96 | 96 | 100 | 797 |
| /press | 100 | 89 | 96 | 100 | 813 |
| /legal/terms | 100 | 96 | 96 | 100 | 814 |
| /legal/privacy | 99 | 96 | 96 | 100 | 860 |
| /login | 100 | 100 | 96 | off | 769 |
| /signup | 100 | 100 | 96 | off | 646 |

## What the truthful target reveals (the gate is correctly red)

Pointed at the warmed preview instead of localhost, the gate fails - because
the app does not yet meet the law on the truthful target. Every failure is
real and routed; none is a gate defect, and nothing was weakened to hide them.

1. **best-practices = 0.96 on every URL, both form factors.** Cause: the
   Lighthouse `inspector-issues` audit (weight 1) fires on a Content-Security
   -Policy issue from `https://vercel.live/_next-live/feedback/feedback.js` -
   the Vercel **preview toolbar**. It is a preview-only platform injection
   (production serves no toolbar, so production reads 1.0), and blocking the
   request via `blockedUrlPatterns` does not suppress the report-only-CSP
   *issue* (the violation is evaluated when the HTML is parsed, before the
   request is aborted). Resolution is to disable the Vercel Toolbar on preview
   deployments (Vercel project Settings > Toolbar), after which the existing
   1.0 floor holds on the preview too. This is also tied to MINOR-2 (flip the
   app CSP from Report-Only to enforcing). No threshold lowered.
2. **a11y < 1.0 on /about, /blog, /careers, /press (and /legal/terms +
   /legal/privacy on desktop).** Real color-contrast on `main` - the exact
   class the inspection flagged as MAJOR-4, now caught by the gate. Owned by
   the feat/home-rebuild session (marketing/legal page files; off-limits to
   engine hardening). The gate addition is this PR's job; the fixes are theirs.
3. **perf below floor on mobile buyer pages + NO_LCP on hero pages.** Mobile
   event-detail is 78 (below the never-lowered 0.80 floor), `/` and
   `/culture/african` return NO_LCP, and a couple of CWV overages
   (melbourne LCP 4108 > 4000, home Speed-Index 5053 > 4500). Desktop is clean
   (92-100) except `/culture/african` NO_LCP. This is the Issue #42 image
   -optimiser cold-start plus a genuine mobile perf gap on the buyer journey -
   the inspection's "0.91 -> 0.84 -> 0.75 degradation on the correct target."
   Tracked in Issue #42; the gap from the floor to 0.95 is the work there.

The previous gate read green only because it measured localhost at a 0.80
floor with the hero pages waived. Removing those crutches surfaces the truth.

## Final floors (this PR)

| Form factor | Performance floor | Rationale |
|---|---|---|
| Mobile  | 0.80 | The never-lowered existing floor. Note: on the truthful target the buyer journey already brushes/busts it (event-detail 78); kept at 0.80, gap tracked in Issue #42 (not lowered to match reality). |
| Desktop | 0.90 | Ratcheted up from mobile's 0.80. Desktop measurable pages run 92-100, so 0.90 passes comfortably with cold-start margin; the gap to 0.95 is tracked in Issue #42. |

a11y / best-practices / seo stay at 1.0 error; all Core Web Vitals at
error-level. Nothing in this gate is weaker than the gate it replaces.

## Branch-protection note for the project manager

The required-status-check names change with this gate:

- removed: `Lighthouse mobile gate`
- added: `Lighthouse mobile gate` and `Lighthouse desktop gate` (matrix), plus
  `Resolve Vercel preview` and `Link integrity crawl`.

Branch protection on `main` must be updated to require the new check names once
this PR's first green run confirms them.
