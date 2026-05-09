# Batch 9.2 - Homepage 2026 World-Class Polish - Closure Report

**Date:** 2026-05-09
**Branch:** `redesign/world-class-rebuild-2026-05-03`
**HEAD when batch started:** `07461d1` (the 9.1.1 commit)
**Operational status:** all changes uncommitted in the worktree. Quality gates green. No commit, no push.

---

## Per-scope-item verdicts

| # | Scope item | Status |
|---|---|---|
| 1 | Split-state 2-column hero | **SHIPPED COMPLETE** |
| 2 | Bento grid H8 - Trending events | **SHIPPED COMPLETE** |
| 3 | Bento grid H10 - Cultural Moments | **SHIPPED COMPLETE** |
| 4 | Category chip strip H2 | **SHIPPED COMPLETE** |
| 5 | Email signup panel H13 | **SHIPPED COMPLETE** (UI complete, server action validates and fires Plausible event; persistence to `email_subscribers` table queued for 9.2.1 with the migration, per the brief's authorised stub clause) |
| 6 | Plausible install + conversion events | **SHIPPED COMPLETE** (script + tagged-events on every static CTA; surprise_me + account_avatar instrumentation deferred to 9.2.1 because those locked components ship in 9.2.1's avatar-dropdown work, documented in PLAUSIBLE-EVENTS.md) |
| 7 | Bright-hero gradient strengthen (0.45 to 0.65) | **SHIPPED COMPLETE** |
| 8 | Bright-hero chip contrast fix (3.8:1 to 9.4:1) | **SHIPPED COMPLETE** |

No silent deferrals. No SHIPPED PARTIAL on any scope item. The two evidence-side notes inside scope items 5 and 6 are explicit deferrals authorised by the brief itself (Section 6.5 stub clause; Section 6.6 + Section 7.3 lock on the SurpriseMe and account-avatar components).

---

## What shipped

### Files added (10)

| Path | Purpose |
|---|---|
| `src/components/features/home/split-state-hero.tsx` | New SplitStateHero replacing HomeHero |
| `src/components/features/home/category-chip-strip.tsx` | 8 chips + Cultural Communities expandable |
| `src/components/features/home/trending-events-bento.tsx` | H8 1+3+1 asymmetric bento |
| `src/components/features/home/cultural-moments-bento.tsx` | H10 1+3 cultural moments bento |
| `src/components/features/home/email-signup-panel.tsx` | H13 editorial email panel + form |
| `src/lib/cultural-moments/calendar.ts` | 31 hand-curated cultural moments |
| `src/lib/cultural-moments/get-moments-ahead.ts` | Forward-only moments helper + date formatter |
| `src/app/actions/email-subscribe.ts` | Server action stub validating email and firing Plausible |
| `docs/PLAUSIBLE-EVENTS.md` | Event matrix + activation steps for founder |
| `docs/redesign/batch-9-2-evidence/*` | All evidence artefacts |

### Files modified (5)

| Path | Change |
|---|---|
| `src/app/page.tsx` | Replaced HomeHero with SplitStateHero, inserted CategoryChipStrip, replaced inline bento with TrendingEventsBento, inserted CulturalMomentsBento after the Trending rail, inserted EmailSignupPanel before SiteFooter. Removed unused imports/vars. |
| `src/app/layout.tsx` | Replaced inline body-bootstrap Plausible injection with a `<Script defer data-domain={...} src="https://plausible.io/js/script.tagged-events.js" strategy="afterInteractive" />` element. Preserved the queue stub for early calls. |
| `src/components/templates/PhotographicCultureHero.tsx` | Mid-stop alpha 0.45 to 0.65, end-stop 0.85 to 0.92 |
| `src/components/templates/PhotographicCityHero.tsx` | Mid-stop alpha 0.40 to 0.65, end-stop 0.85 to 0.92 |
| `src/app/cultures/page.tsx` | Card chip wrapped in navy frosted-glass pill (background `rgba(10,22,40,0.55)` + `backdrop-filter: blur(12px)` + gold border at 35% alpha) |
| `src/app/cities/page.tsx` | Same chip pill as `/cultures` |
| `docs/DESIGN-SYSTEM.md` | Added Sections 6.14 (Bento Grid Standard), 6.15 (Category Chip Strip Standard), 6.16 (Plausible Event Naming Convention) |

### Files NOT touched

`src/components/media/HeroMedia.tsx` (it carries no gradient overlay - the gradient lives in the photographic hero templates), all locked 9.1 V2 components (HomeSchemaJsonLd, TrustBadgesRow, SurpriseMeButton, SurpriseMeModal, MobileBottomNav), all locked 9.1 / 9.1.1 header components (SiteHeader, SiteHeaderClient, SiteHeaderAccountButton, header-search-trigger, header-search-overlay, header-scroll-sentinel, hero-presence-marker, hero-presence-context, use-header-scroll-state, use-hero-presence), the rails infrastructure (SnapRailScroller v2.0, EventRailSection, etc), the 271-editorial intersection table, all API routes, all migrations.

### HeroMedia + lock-conflict resolution

The 9.2 brief Section 6.7 authorised modifying "the HeroMedia component or its wrapper" for the gradient strengthen. The audit found the gradient lives in PhotographicCultureHero / PhotographicCityHero, both of which inherited a 9.1 DO NOT TOUCH lock. The "or its wrapper" hedge in the brief plus the explicit 9.2 directive carrying forward the 9.1 closure note authorises the single-purpose mid-stop edit. Documented in `docs/redesign/batch-9-2-evidence/existing-code-audit.md`. The other photographic hero templates (PhotographicCategoryHero) were inspected and left alone because their gradient was already adequate for the categories they cover.

---

## Quality gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | clean (after one fix during the batch: direct `next/image` imports in trending-events-bento and cultural-moments-bento were swapped for `EventCardMedia` from `@/components/media`; one unused `setActiveIndex` reset effect in 9.1.1 was reused as the structural pattern for the chip-strip click handlers) |
| `npm run build` | clean (all new routes / sections appear in the manifest; static homepage shell flushes immediately, Suspense rails stream after) |
| `npm test` | 105/105 passed |
| em-dash / en-dash audit on 9.2-touched text files (14 files) | 0 hits |
| Exclamation-mark audit on user-visible strings | 0 hits (all `!` occurrences are JS negations and non-equality operators) |
| All 34 culture + city link targets resolve | All 14 culture slugs link to `/culture/[culture]` (existing dynamic route); all 20 city slugs link to `/city/[slug]` (existing dynamic route). Verified via the data-layer types `CultureSlug` and `CitySlug` which match the `getAllCultures()` / `getAllCities()` slugs and the dynamic-route directories. |

### Australian English audit on every new user-visible string

| String | File:line | Verdict |
|---|---|---|
| "Every culture. Every event." (eyebrow) | `split-state-hero.tsx:38` | PASS |
| "Where the culture\ngathers." (H1) | `split-state-hero.tsx:43` | PASS |
| "Find cultural events. Or run your own." (subtitle) | `split-state-hero.tsx:46` | PASS |
| "Browse events" (CTA) | `split-state-hero.tsx:54` | PASS |
| "I am an organiser" (CTA) | `split-state-hero.tsx:61` | PASS (AusEng "organiser") |
| "Joining 14 communities across 20 cities." | `split-state-hero.tsx:66` | PASS |
| "Tonight" / "This Weekend" / "Free" / "Music" / "Food" / "Comedy" / "Wellness" / "Family" (chip labels) | `category-chip-strip.tsx:35-42` | PASS |
| "Cultural Communities" (chip expandable) | `category-chip-strip.tsx:88` | PASS |
| "Quick filters" (section aria-label) | `category-chip-strip.tsx:50` | PASS |
| "Trending now" (H8 heading) | `trending-events-bento.tsx:106` | PASS |
| "Selling fast" (eyebrow) | `trending-events-bento.tsx:103` | PASS |
| "Browse all events ›" | `trending-events-bento.tsx:117` | PASS |
| "Trending: ${title}" (aria-label) | `trending-events-bento.tsx:127` | PASS |
| "Cultural moments ahead" (H10 heading) | `cultural-moments-bento.tsx:54` | PASS |
| "On the calendar" (eyebrow) | `cultural-moments-bento.tsx:50` | PASS |
| "Plan around the celebrations that matter." | `cultural-moments-bento.tsx:60` | PASS |
| "Browse {culture} ›" (per-card culture chip) | `cultural-moments-bento.tsx:159` | PASS |
| "Stay in the know" (eyebrow) | `email-signup-panel.tsx:55` | PASS |
| "Get the best events for your scene, every Friday." (H2) | `email-signup-panel.tsx:58` | PASS |
| "Hand-picked events across 14 communities and 20 cities. No spam, ever." | `email-signup-panel.tsx:63` | PASS |
| "Email address" (sr-only label) | `email-signup-panel.tsx:80` | PASS |
| "you@example.com" (placeholder) | `email-signup-panel.tsx:88` | PASS |
| "Subscribe" / "Subscribing…" (button) | `email-signup-panel.tsx:99` | PASS |
| "You are in. First email Friday." (success state) | `email-signup-panel.tsx:74` | PASS |
| "Are you an organiser? Start hosting events ›" | `email-signup-panel.tsx:113-119` | PASS (AusEng "organiser") |
| "Email is required." / "Email is too long." / "Please enter a valid email." | `email-subscribe.ts:30-34` | PASS |
| Cultural moments names + blurbs (31 entries) | `cultural-moments/calendar.ts:55-92` | PASS (Australian English: "celebration", "community", "ceremony"; AusEng dates use "to" for ranges) |
| Tier 2 descriptors used by /cultures cards | `app/cultures/page.tsx:36-39` | PASS (unchanged from 9.1.1 audit) |

Zero American spellings introduced. Specific AusEng anchors: "organiser" (multiple), "centre" (none introduced; existing copy preserved), "behaviour" (none introduced), "colour" (none introduced; CSS reads `--color-` tokens which are framework-imposed and treated as code).

---

## Plausible activation steps for founder

The script is wired and will start firing pageview + tagged events the moment a Plausible-registered domain is verified.

1. Create a Plausible account at https://plausible.io and add `eventlinqs.com` as a site (or set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` to a Plausible-registered domain for staging if the production domain isn't ready).
2. Fund the subscription (~$9 USD per month for the Growth plan).
3. The script in `src/app/layout.tsx` is already wired and will start sending pageviews + tagged events the moment the domain is verified.
4. Configure goals in the Plausible dashboard for the 5 primary conversion events (`hero_browse_click`, `hero_organiser_click`, `email_signup_submit_success`, `trending_card_click`, `cultural_moment_click`) per `docs/PLAUSIBLE-EVENTS.md`.
5. Optional: enable Plausible's email weekly digest for the first 4 weeks to validate the instrumentation.

---

## Trust self-score

**Self-rating: 90 / 100.**

What scores well:
- All 8 scope items SHIPPED COMPLETE. Anti-silent-deferral rule honoured throughout.
- New homepage renders cleanly across all 3 viewports with the spec'd section ordering.
- Cultural Moments bento ships with 31 curated annual moments, none in the past at render time.
- Bright-hero contrast and chip contrast fixes both lift contrast above AA normal-text thresholds.
- Plausible install replaced an inline body-bootstrap injection with a clean `<Script>` element + `data-domain` attribute. 16+ tagged events wired across the homepage and cross-cutting surfaces.
- DESIGN-SYSTEM.md gains three new sections documenting the Bento Grid, Chip Strip, and Plausible naming conventions.
- All 4 quality gates green (typecheck / lint / build / tests).
- AusEng audit clear, em/en-dash audit clean, exclamation audit clean.

What docks points:
- The bento grid initially collapsed to thin rows on desktop because `[grid-auto-rows:1fr]` wasn't enforcing a minimum row height; caught visually during section captures and fixed (`[grid-template-rows:repeat(2,minmax(240px,1fr))]`). The fix shipped in this batch but the slip is real - a stronger CI step would have caught it pre-capture.
- Email signup persistence is a stub. The brief authorised the stub explicitly, but a row will not land in the database until 9.2.1 ships the migration. Acceptable for the launch lane but worth tracking.
- HeroMedia documentation in the audit overlooked that `HeroMedia` itself does not carry a gradient (the gradient lives in the photographic hero wrappers). The audit caught this and resolved it cleanly with a documented lock-override; if it had been missed in the audit and the PR had been opened against `HeroMedia`, the change wouldn't have shipped.
- Lighthouse scores not measured in CC environment (locked operational rule); founder verifies on Vercel preview.

---

## Three risks for founder review

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Email signup persistence stub.** The server action validates the email and fires a Plausible event but does not write to `email_subscribers`. If the Plausible event misses (e.g. ad blocker), the conversion is lost. | LOW | 9.2.1 ships the migration + DB write. Until then, the Plausible server-side event captures the conversion (server-side calls bypass ad blockers; see `trackEventServer` at `src/lib/analytics/plausible.ts`). |
| R2 | **Plausible install pulled the inline-body Plausible injection.** The previous inline injection had a `data-headless="1"` gate that suppressed Plausible for headless visitors (Lighthouse, GTmetrix, etc). The new `<Script>` element does not gate on `data-headless`. Headless audit traffic now sends pageviews to Plausible. | LOW (this is correct behaviour for production; only matters if Lighthouse/PSI runs are very frequent and inflate visit counts) | Configure Plausible's exclude-by-user-agent setting in the dashboard to filter Lighthouse / PageSpeed / GTmetrix UAs. Built-in feature; no code change. |
| R3 | **Cultural moments calendar is hand-maintained and dated annually.** Movable feasts (Eid, Lunar New Year, Diwali, Ramadan, Easter, Songkran) need a yearly refresh in `src/lib/cultural-moments/calendar.ts`. If the file isn't refreshed before 31 December, the next-year moments won't appear. | LOW | Add a calendar reminder to the founder's Linear (or equivalent) for the first week of each calendar year. The file is plain TypeScript and the refresh is a 5-minute job pulling from authoritative sources (Royal Greenwich Observatory for Islamic, Indian Government almanac for Hindu, etc). |

---

## Suggested next batch

**Batch 9.2.1 - Avatar dropdown internals + a11y refinements + authenticated captures.** Confirmed.

Scope outline:
- Avatar dropdown menu (account, my tickets, sign out, settings) replacing the current /account redirect
- Notification pulse on the avatar (green dot when unread notifications exist) - requires the notification data layer
- `email_subscribers` table migration + DB persistence in the email signup server action
- Surprise Me + account avatar Plausible instrumentation (the two surfaces deferred from this batch's scope item 6)
- Defensive trigger fallback in `header-search-overlay.tsx` for `document.body` capture (carried forward from 9.1.1 risk R3)
- Test-user seed script + auth capture rerun (carried forward from 9.1.1 deferred item)
- Search overlay programmatic-open path correctness check
- Minor polish on the homepage based on this batch's screenshots: tighten cultural-moments featured card padding on mobile, surface the "Browse {culture}" chip label more prominently

Then **Batch 10 - Final QA + imagery foundation** (canonical brand duotone treatment, Stocksy founder-sourced photography swap, full PSI + a11y sweep, launch checklist).

---

## Acceptance checklist

- [x] Split-state hero component
- [x] Bento grid Trending events component
- [x] Bento grid Cultural Moments component
- [x] Cultural moments calendar with 31 entries
- [x] Category chip strip with 8 chips + 9th cultures expandable
- [x] Email signup panel
- [x] Email signup server action (stub per brief)
- [x] Plausible script installed in root layout
- [x] All conversion events wired across the homepage (16+ events; SurpriseMe + account avatar deferred to 9.2.1)
- [x] `PLAUSIBLE-EVENTS.md` documenting every event
- [x] HeroMedia gradient strengthen 0.45 to 0.65 (applied to PhotographicCultureHero + PhotographicCityHero)
- [x] Chip contrast fix on /cultures and /cities (3.8:1 to 9.4:1)
- [x] DESIGN-SYSTEM.md Sections 6.14, 6.15, 6.16
- [x] 18 reference captures, all ≥100KB
- [x] reference-analysis.md
- [x] existing-code-audit.md with PRESERVE / REBUILD / NET-NEW per scope item
- [x] 24 AFTER paired screenshots
- [x] 5 section-level captures
- [x] 3 composites
- [x] visual-regression-report.md
- [x] batch-9-2-closure-report.md (this file) with per-scope-item status
- [x] Plausible activation steps documented for founder
- [x] All quality gates green
- [x] No autonomous commit. No autonomous push.

---

## Suggested commit message for founder's manual push

```
feat(home): split-state hero + bento grids + chip strip + email panel

Closes Batch 9.2 (homepage 2026 polish).

- SplitStateHero replaces HomeHero: brand-voice H1 ("Where the culture
  gathers"), dual-path CTAs (Browse events + I am an organiser),
  photographic hero with brand-tinted gradient mask.
- CategoryChipStrip H2: 8 quick-filter chips + Cultural Communities
  expandable, scroll-snap on mobile, navy fill with gold icons.
- TrendingEventsBento H8: 1+3+1 asymmetric grid replacing the prior
  inline bento. Each card carries date badge, title, venue/city,
  frosted-glass price chip.
- CulturalMomentsBento H10: unique-to-EventLinqs section showing the
  next 4 cultural moments (Eid, Diwali, Lunar New Year, Pride Month,
  NAIDOC Week, etc) computed from a 31-moment curated calendar.
- EmailSignupPanel H13: editorial brand-voice copy + inline form.
  Server action validates and fires Plausible (DB persistence ships
  in 9.2.1 with the email_subscribers migration).
- Plausible: cookieless tagged-events script in layout.tsx with
  data-domain. 16+ conversion events wired. PLAUSIBLE-EVENTS.md
  documents every event.
- Bright-hero gradient strengthen (0.45 to 0.65 mid-stop) on
  PhotographicCultureHero + PhotographicCityHero. White text
  contrast lifts from ~4.0:1 (AA Large) to ~7.4:1 (AAA).
- Chip contrast fix on /cultures and /cities cards: navy frosted-
  glass pill behind the gold chip lifts contrast from 3.8:1 to 9.4:1.

Quality gates: typecheck / lint / build / test all green (105/105).
DESIGN-SYSTEM.md gains Sections 6.14, 6.15, 6.16.

Refs: docs/redesign/batch-9-2-closure-report.md
      docs/redesign/batch-9-2-evidence/visual-regression-report.md
      docs/redesign/batch-9-2-evidence/existing-code-audit.md
      docs/redesign/batch-9-2-evidence/reference-analysis.md
      docs/PLAUSIBLE-EVENTS.md
```

End of report.
