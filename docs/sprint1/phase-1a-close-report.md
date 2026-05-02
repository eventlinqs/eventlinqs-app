# Sprint 1 Phase 1A - Close Report

**Date:** 2026-04-26
**Owner:** Lawal
**Branch:** `feat/sprint1-hollywood-foundation` (7 commits ahead of `main`)
**Status:** ✅ Production verified on Sydney. Branch ready to merge.

---

## Executive summary

Hollywood Foundation Sprint 1 Phase 1A is complete. Production is now serving from the Sydney Supabase project (`gndnldyfudbytbboxesk`) instead of Mumbai (`cqwdlimwlnyaaowwcyzp`). Cultural breadth seed (12 organisations across 5 diaspora categories, ~24-30 events) is rendering on `www.eventlinqs.com` and `eventlinqs.com.au`. Lighthouse baseline captured for Sprint 2 speed-optimization comparison.

---

## Production Sydney verification

**Active deployment:** `dpl_EwHUhyyDfa2unMHfzaVj2dkik9jg`
**Vercel region:** `syd1` (Sydney compute, matches Sydney Supabase project)

### Bundle inspection (both domains)

| Domain | Deployment | Supabase URL in JS chunk | Status |
|---|---|---|---|
| `www.eventlinqs.com` | `dpl_EwHUhyyDfa2unMHfzaVj2dkik9jg` | `https://gndnldyfudbytbboxesk.supabase.co` | ✅ Sydney |
| `eventlinqs.com.au` | `dpl_EwHUhyyDfa2unMHfzaVj2dkik9jg` | `https://gndnldyfudbytbboxesk.supabase.co` | ✅ Sydney |

Probed via Playwright with `?cb=<timestamp>` cache-busters and `Cache-Control: no-store`. `x-vercel-cache: MISS` confirms fresh server responses, not browser/CDN cache. Cultural breadth seed visible: 49 event-link nodes on the homepage, hero strapline "Made for the diaspora - Afrobeats, Gospel, Amapiano, Owambe, Comedy", "27 events live now • 4 cities • This week" counter.

Screenshots:
- `docs/sprint1/screenshots/post-redeploy-www-homepage.png` (full page, www domain)
- `docs/sprint1/screenshots/post-redeploy-comau-homepage.png` (viewport, .com.au domain)
- `docs/sprint1/screenshots/blocker-mumbai-still-serving-login.png` (pre-redeploy evidence - kept for audit trail)

### Env-var swap notes for the audit trail

The first redeploy attempt did not promote a new build to Production; bundle still showed Mumbai URL. Root cause was env-var scope: NEXT_PUBLIC_* vars need to be saved against **Production + Preview + Development**. Once corrected and a no-cache redeploy was triggered, the new deployment baked in Sydney values correctly. Capturing this here so the next time we swap a backend region the runbook reflects the gotcha.

---

## Lighthouse baseline (post-Sydney migration)

**Auditor:** Lighthouse 13.1.0, mobile form factor (Moto G Power 2022 emulation), simulated Slow 4G.
**Target:** `https://www.eventlinqs.com/`
**Captured:** 2026-04-26T03:00:57Z
**Files:** `docs/sprint1/lighthouse-post-sydney.html` (full report, 724 KB) + `lighthouse-post-sydney.json` (raw 674 KB).

### Scores

| Category | Score | Status |
|---|---|---|
| **Performance** | 74 | 🟡 Sprint 2 target - ship to ≥90 |
| **Accessibility** | 100 | ✅ |
| **Best Practices** | 100 | ✅ |
| **SEO** | 100 | ✅ |

### Core Web Vitals (Lab)

| Metric | Value | Threshold (Good) | Status |
|---|---|---|---|
| **LCP** (Largest Contentful Paint) | 3.7 s | ≤ 2.5 s | 🟡 Sprint 2 priority |
| **TTFB** (Time to First Byte) | 50 ms | ≤ 800 ms | ✅ Excellent (Sydney compute proximity) |
| **TBT** (Total Blocking Time) | 350 ms | ≤ 200 ms | 🟡 Sprint 2 priority |
| **CLS** (Cumulative Layout Shift) | 0 | ≤ 0.1 | ✅ Perfect |
| **FCP** (First Contentful Paint) | 2.2 s | ≤ 1.8 s | 🟡 Close to threshold |
| **Speed Index** | 5.9 s | ≤ 3.4 s | 🟡 Sprint 2 priority |
| **INP** (Interaction to Next Paint) | n/a | ≤ 200 ms | Field-data only - capture from PostHog/RUM in Sprint 2 |

### What this baseline tells us

- **Backend latency is not the bottleneck.** TTFB 50ms is genuinely excellent; Sydney compute next to Sydney DB is delivering. Anyone who later argues for re-introducing Edge Functions or aggressive route caching has to beat 50ms TTFB without breaking RSC.
- **The 3.7 s LCP and 5.9 s Speed Index are mostly client-side cost.** Likely culprits to investigate in Sprint 2: hero image weight (the diaspora hero photo), font loading strategy, JS bundle main-thread work (350ms TBT corroborates), and whether the cultural-events strip below the fold is render-blocking.
- **Three perfect category scores** (a11y / BP / SEO) means we don't have to defensively maintain them in Sprint 2 - focus is uniformly on Performance.

These numbers are the **before** snapshot for Sprint 2 Phase 1 speed optimization. Re-run after each optimization PR and diff against this report.

---

## Commits delivered in Phase 1A (chronological)

| # | SHA | Type | Subject |
|---|---|---|---|
| 1 | `915ea52` | feat | homepage: add CityTile and ThisWeekStrip premium components |
| 2 | `270a825` | docs | research: competitive teardown of TM, DICE, Eventbrite across 5 surfaces |
| 3 | `62faa8c` | docs | sprint1: operator-led Sydney migration runbook |
| 4 | `dc73f06` | feat | sprint1: Sydney baseline schema, cultural breadth seed, RLS recursion fix |
| 5 | `8675a91` | feat | sprint1: Playwright screenshot automation script |
| 6 | `b8f31b2` | docs | sprint1: mumbai decommission scheduled for May 3 2026 |
| 7 | `e284716` | docs | sprint1: correct env state and flag missing Sydney service-role key |

All 7 commits are on `feat/sprint1-hollywood-foundation`, pushed to `origin`, and ready to merge.

---

## Verification matrix

| Check | Method | Result |
|---|---|---|
| Production points at Sydney URL | Playwright bundle scrape, both domains | ✅ Pass |
| Production deployment ID changed after redeploy | Pre/post `dpl_*` comparison | ✅ Pass (`dpl_7RKCQ1pf6XXp4yi1VyunnGzjiPJi` → `dpl_EwHUhyyDfa2unMHfzaVj2dkik9jg`) |
| Bundle does not contain Mumbai URL | grep `cqwdlimwlnyaaowwcyzp` in all script chunks | ✅ Pass |
| `eventlinqs.com.au` resolves to same deployment | Playwright nav + dpl ID comparison | ✅ Pass |
| Cultural breadth seed visible on homepage | DOM event-link count + diaspora hero copy | ✅ Pass (49 event links) |
| Vercel compute region | `x-vercel-id` header | ✅ `syd1` |
| Build / lint / typecheck (local, pre-merge) | `npm run build && npm run lint && npx tsc --noEmit` | ✅ All clean |
| Lighthouse baseline captured | Lighthouse 13.1.0, mobile, slow 4G | ✅ Pass - see scores above |

---

## Remaining items / handoffs

### Final action - one step (you)
Merge the Sprint 1 PR:

→ https://github.com/eventlinqs/eventlinqs-app/pull/new/feat/sprint1-hollywood-foundation

Once merged, Vercel auto-deploys `main`. The new deployment will not change runtime behaviour (env vars are already correct, migrations and seed are already applied to Sydney directly), but it brings the repo state into alignment with what's running in production.

### Mumbai decommission - scheduled
Project `cqwdlimwlnyaaowwcyzp` marked for deletion **2026-05-03** (7 days from Sydney go-live). See `docs/sprint1/sydney-migration-runbook.md` § "Decommission Mumbai" for the procedure.

### `.env.local` cleanup - optional
Mumbai entries are still present in `.env.local` (Sydney wins via dotenv last-write precedence). After Mumbai is deleted on May 3, remove the Mumbai lines.

---

## Sprint 1 Phase 1B - recommended start

With Phase 1A closed, Phase 1B can begin. Top candidates ordered by leverage:

1. **Performance optimization pass** (LCP 3.7s → < 2.5s, TBT 350ms → < 200ms). Lighthouse baseline above is the diff target. Start by profiling the hero image + bundle main-thread work - those two are most likely to move LCP and TBT respectively.
2. **PostHog INP capture wired up** so we get real-user (field) Web Vitals, not just lab. Lighthouse INP is unavailable in lab mode, and INP is the metric Google now ranks on.
3. **Search relevance** - Meilisearch index population from the cultural breadth seed, so `/search` returns results across the 5 diaspora categories.

Recommend starting Phase 1B with #1 since the baseline is fresh and Sprint 2 was already framed around speed optimization.
