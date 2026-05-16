# Platform Fix v1 - Test, Triage, Fix Report

Run date: 2026-05-16
Branch base: main (branch-protected). All fixes shipped to feature branches + PRs; none merged to main without CI.
Production target tested: https://www.eventlinqs.com

---

## 1. What was tested

Phase 1 covered every user-facing surface reachable from the sitemap, nav, and homepage:

- **HTTP status sweep** of 38 critical routes (static pages, all `/legal/*`, auth, the one live event, culture/city landings, `/events/browse/*`, sitemap, robots, og-image). Result: all 200 except `/for-organisers` (404). No 500s. No `localhost` leaks (the prior OG localhost blocker, PR #9, confirmed resolved).
- **Deep content-render audit** (Firecrawl, desktop + mobile) of 15 high-traffic pages: homepage, /events, /pricing, /organisers, /cultures, /cities, /culture/african, /culture/gospel, /city/sydney, /city/geelong, the live event-detail page, /about, /contact, /help, /signup.
- **Database truth checks** (Supabase, read-only): 26 published upcoming events all carry non-empty `tags`; per-culture resolution under the new bridge; the live `pricing_rules` baseline.
- **Source review** of the funnel data layer, pricing surfaces, and routing.

Not executed this run (documented gap, see section 4): full interactive E2E of auth (real signup/verify/login/reset) and checkout (free + Stripe-test paid purchase). These require live account + test-card transactions on production; the structural defects that block "show friends today" were higher-leverage and were prioritised. The render/status/data layers of these flows were checked (forms present with fields + submit; `/signup` `/login` render correctly).

## 2. What was broken (severity-ranked)

| # | Severity | Defect | Surface |
|---|----------|--------|---------|
| 1 | CRITICAL | Entire culture funnel resolved to ZERO events. `/cultures` showed 14/14 "Coming soon"; every `/culture/*` landing was empty; `/events?culture=` returned nothing. Root cause: culture->event bridge keyed on legacy `event_categories` slugs that live events do not carry (they carry generic `music`/`nightlife`/...). The platform's central culture-first promise was non-functional. | /cultures, /culture/*, /events |
| 2 | CRITICAL | `/cities` showed ~17/20 "Coming soon" tiles (incl. 4 capitals + the Geelong HQ) while the subtext claimed "the platform launches with full event catalogues in each" - a direct copy/state contradiction. | /cities |
| 3 | HIGH | `/pricing` advertised "From 2.9% + AUD 0.59" + a "fees are indicative ... may vary by event type" hedge. Live `pricing_rules` charges **2.5% + AUD 0.50** with every row `event_type='ALL'` (no variation). The most scrutinised page overstated the fee and hedged its strongest asset. | /pricing (+ metadata) |
| 4 | MEDIUM | Culture count inconsistent: homepage / `/cultures` / newsletter say "14 communities"; `/about` stat said "18". | /about |
| 5 | MEDIUM | `/for-organisers` returned a hard 404 (only `/organisers` existed). | /for-organisers |
| 6 | MEDIUM (deferred, see 4) | Same event shows `From $35` vs `AUD $35` vs `From AUD $35` across surfaces. Cosmetic-consistency, site-wide blast radius. | site-wide |
| 7 | LOW (noted, see 4) | One live event labelled "Free entry" while carrying a paid AUD 35 tier; venue static-map image not rendering. Likely seed-data + map-key, not core code. | event detail |
| - | STRATEGIC (escalated, see 4) | Live 14-grouping browse taxonomy vs CLAUDE.md 18-item rhythm list differ. Not unilaterally re-architected. | /cultures taxonomy |

## 3. What was fixed (shipped)

All three PRs pass the full local gate: `eslint` (0 errors), `tsc --noEmit`, `vitest` (117 passed), `next build`.

| PR | Branch | Fixes | Link |
|----|--------|-------|------|
| **#11** | `fix/culture-browse-funnel` | Defects 1 + 2. New `src/lib/cultures/tag-bridge.ts` matches events by `tags` jsonb containment; repointed `/events` fetchers, `/culture` + `/culture/[city]` landings, and `/cultures` index counts. Dead "Coming soon" replaced with honest "Be the first". `/cities` subheading corrected. **Validated on live data: 10/14 cultures now resolve to real events (african 9, caribbean 4, south-asian 4, comedy 3, east-asian 2, filipino 2, gospel 2, latin 1, middle-eastern 1, pacific 1); the 4 with no inventory show the honest state.** | https://github.com/eventlinqs/eventlinqs-app/pull/11 |
| **#12** | `fix/pricing-fee-consistency` | Defect 3. New `src/lib/pricing/public-fee.ts` canonical constant mirroring the `pricing_rules` AU/GLOBAL baseline; `/pricing` Paid tier + metadata now state the definite **2.5% + AUD 0.50**; removed "From" and the indicative/may-vary hedge; confident risk-reversal line instead. Charged rates unchanged. | https://github.com/eventlinqs/eventlinqs-app/pull/12 |
| **#13** | `fix/marketing-consistency-404` | Defects 4 + 5. `/about` culture stat 18 -> 14 (matches every other surface). New `/for-organisers` route permanent-redirects (308) to `/organisers`. | (opened this run - see PR list) |

## 4. Still open / deferred (with reason)

- **Defect 6 - price-format unification** (`From $35` / `AUD $35` / `From AUD $35`). Deferred deliberately: the formatting is spread across ~10 card/rail components, is cosmetic-consistency not breakage, and a site-wide formatter swap has a large blast radius unsuitable for an unattended same-day run. Recommended as the top next-session task: introduce one `formatTicketPrice()` helper and route every card/rail through it.
- **Defect 7 - event "Free entry" mislabel + broken venue map.** The event carries `is_free=true` yet has a paid AUD 35 tier; this is almost certainly seed-data, not a code bug, and a code "fix" could mask a data problem. The static-map blank is likely a Mapbox/static-image key or referrer restriction (infra/Session-2 territory per CLAUDE.md). Both need a data + infra owner, not a marketing-code change.
- **Culture taxonomy reconciliation** (live 14 groupings vs CLAUDE.md 18-item marketed rhythm list). This is a brand-positioning and URL/SEO-structural decision explicitly outside autonomous authority (escalation rule: brand positioning). Flagged for founder/PM. The functional fix (events actually appear) is shipped; only the naming/grouping strategy is held.
- **Interactive auth + checkout E2E** not executed (see section 1). The render/status/data layers were verified; a full transactional pass (real signup/verify/login/reset, free + Stripe-test paid checkout, confirmation email) is the recommended first task for the next focused run.

## 5. Production verification

Branch protection prevents merging to `main`, and production deploys from `main`, so the fixes are not yet live on www.eventlinqs.com - this is by design and per the run's safety constraints. Verification performed:

- **Local full gate** green on all three branches (tsc, eslint, vitest 117, `next build` - the same compile/type/render path Vercel runs).
- **Data-level proof for the headline fix (PR #11):** the tag-bridge OR-logic was executed against the **live production Supabase** dataset, returning 10/14 cultures with real event counts (vs 0/14 under the old bridge). This verifies the fix on real production data without needing the deploy.
- **Fee fix (PR #12):** the corrected figure (2.5% + AUD 0.50) was taken directly from a live `pricing_rules` query, so the displayed copy now provably matches the billing system.
- **PR CI / Vercel preview:** each PR triggers the repo's checks/preview build; merge to `main` is gated on those passing (CI must be green before any human merge - not bypassed here).

Recommended go-live verification once merged: re-run the Phase 1 status sweep + Firecrawl render check on production, confirming `/cultures` shows real counts, `/culture/african` and `/culture/gospel` list events, `/pricing` reads "2.5% + AUD 0.50", `/for-organisers` 308 -> `/organisers`, `/about` reads 14.

## 6. Next-session recommendations (priority order)

1. **Merge #11, #12, #13** after CI/preview green, then run the production re-verification above. #11 is the single biggest credibility unlock - prioritise it.
2. **Price-format unification** - one `formatTicketPrice()` helper, every card/rail through it (Defect 6).
3. **Auth + checkout E2E** - full transactional pass incl. Stripe test card, confirmation email (Supabase or test inbox).
4. **Event-data audit** - reconcile `is_free` vs paid tiers on seed events; fix the venue static-map key/referrer (infra).
5. **Founder/PM decision** - culture taxonomy: keep 14 browse groupings or move to the CLAUDE.md 18-item rhythm list (affects URLs/SEO).
6. **Make `/pricing` fully DB-driven** - wire `getPlatformFeePercentage`/`getPlatformFeeFixedCents` with `public-fee.ts` as the safe static fallback (seam already created in #12).
7. **Trust band** adjacent to price on /pricing, /organisers, homepage first-viewport (the analysis's single biggest competitive deficit).
