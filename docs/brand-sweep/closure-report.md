# M6.5 Brand Sweep - Closure Report

**Date:** 2026-05-02
**Branch:** feat/sprint1-phase1b-performance-and-visual
**Mandate:** Replace "diaspora-first" positioning with "culture-first" across every public surface, in a quality bar that surpasses Ticketmaster, DICE, Eventbrite, Humanitix on brand expression.

## What shipped

11 commits on the working branch, in mandate order:

| # | SHA | Phase | Subject |
|---|---|---|---|
| 1 | 57116a8 | 1+2 | docs(brand): phase 1 research and phase 2 voice |
| 2 | b54af4d | 3 | docs(brand): public surface inventory |
| 3 | ca69fdb | 4.1 | feat(brand): culture-first homepage hero and category copy |
| 4 | feb2b9c | 4.2 | feat(brand): culture-first browse, location picker, and city data |
| 5 | c401a27 | 4.3 | feat(brand): culture-first organiser landing, about, and blog |
| 6 | e8c1c0c | 4.4 | feat(brand): culture-first help centre and FAQ articles |
| 7 | 5b4bff6 | 4.5 | feat(brand): culture-first preamble in privacy and terms |
| 8 | faae60d | 4.6 | feat(brand): culture-first auth subtitle and order confirmation |
| 9 | 6f9c2ed | 4.7 | feat(brand): culture-first email templates for confirmation and waitlist |
| 10 | cbd4fe5 | 4.8 | feat(brand): culture-first root meta, footer, and seeded fallbacks |
| 11 | cf5b2a8 | 5 | feat(brand): replace Discover CTA with Find across event surfaces |

All 11 commits are pushed.

## Locked positioning, where it now lives

- **Hero h1** "Every culture. Every event. One platform." -> `src/components/features/events/hero-carousel-client.tsx`
- **Sub-tagline** "The ticketing platform built for every culture." -> root meta, footer (mobile + desktop bottom-bar), privacy intro, terms agreement, about page, blog page, organiser landing, help/FAQ articles, email signoffs (confirmation + waitlist), featured-event hero subcopy
- **Cultures list** (Afrobeats, Caribbean, Bollywood, Latin, Italian, Filipino, Lunar, Gospel, Amapiano, Comedy, Spanish, K-Pop, Reggae) -> featured-event-hero subcopy, organiser landing paragraph, help "Who is EventLinqs for", root meta description, blog meta description
- **Mission** -> OrganisersLandingPage "Open to every community" section

## Voice rules, verified

| Rule | Verification | Result |
|---|---|---|
| Zero "diaspora" in public source | `Grep diaspora src/` | 0 matches |
| Zero em-dashes (U+2014) | `grep -P '\x{2014}'` | 0 matches |
| Zero en-dashes (U+2013) | `grep -P '\x{2013}'` | 0 matches |
| Zero exclamation marks in user copy | regex on JSX text | 0 matches |
| No "Discover" as primary CTA | manual cleanup | 4 instances replaced with "Find" / "Find free" |
| Australian English | review of new copy | confirmed (organisers, programme, summarising, etc) |
| Typecheck clean | `npx tsc --noEmit` after each batch | passing |

## What surfaces changed

Approximately 30 public files updated (homepage hero, featured event hero, category data, location picker, picker cities, launch cities, events page meta, organisers landing, about, blog, help-content, privacy preamble, terms preamble, signup page subtitle, order confirmation page, stripe webhook confirmation email, waitlist promotion email, root layout meta, site footer, home-queries fallback seeds, events hero strip, free-weekend tile, category-highlight-slides). Full file list per batch is in `docs/brand-sweep/surface-inventory.md`.

## Phase 6 follow-ups

These items remain. They were scoped out of this autonomous run because each requires a separate, focused session.

1. **Visual regression pass.** Playwright screenshots at 7 viewports (320, 375, 414, 768, 1024, 1280, 1920) for every rewritten surface. tesseract.js OCR on each capture to confirm rendered text matches source. Recommend a dedicated visual-QA session with the dev server running.

2. **Lighthouse and axe runs. DONE 2026-05-02.** New harness `scripts/brand-sweep-audit.mjs` runs Lighthouse + axe-core across 13 routes × 2 viewports = 26 cells. After fixing one root cause (missing `alternates.canonical` on 7 public routes), every public cell hits A11y 100, BP 100, SEO 100, axe 0. Performance hits 95-100 on 11 of 13 mobile cells and 98-100 on every desktop cell. Two documented caveats: (a) login/signup SEO 58 due to `(auth)` layout `robots: { index: false, follow: false }` (intentional, same caveat structure as M6 Phase 2 dashboard noindex); (b) home/events mobile perf 81/79, which is the Phase 1B image-LCP carry-over documented in `docs/sprint1/phase-1b/iter-14-pt5-image-preload/close-report.md` as architectural and outside brand-sweep scope (text-only changes cannot affect LCP). Full results doc at `docs/brand-sweep/verification/results.md`, per-cell JSON under `docs/brand-sweep/verification/{lighthouse,axe}/`, summary at `docs/brand-sweep/verification/summary.json`.

3. **Competitive re-scoring.** Side-by-side review of EventLinqs against Ticketmaster, DICE, Eventbrite, Humanitix, RA, and Songkick using the brand-expression scorecard from `docs/brand-sweep/research/findings.md`.

4. **Seeded fixture event title. DONE 2026-05-02.** Production audit (Sydney project `gndnldyfudbytbboxesk`) found that the "Diaspora Business Summit 2026" fixture from `20260414000001_seed_culturally_relevant_sample_events.sql` was never inserted into the events table - the legacy seed id `11111111-1111-4111-8111-111111111107` returned zero rows. The only diaspora-bearing row in production was `events.description` for slug `brisbane-gospel-choir-showcase` ("Six gospel choirs from Brisbane's diaspora communities..."). Forward migration `20260502000001_brand_sweep_event_copy.sql` rewrote that description, plus defensive UPDATEs across `title`, `summary`, and the `tags` JSONB array. Pushed to Sydney via `npx supabase db push --linked --yes`. Post-push verification confirmed zero diaspora hits across `events`, `organisations`, `ticket_tiers`. Both historical seed files were also edited so any future fresh-seed scenario starts clean.

5. **Internal docs sweep (optional).** 25+ internal `docs/` files still reference the prior diaspora-first framing. Not user-facing, but updating them keeps the historical record aligned with the new positioning. Lower priority than the four items above.

## Status

Phases 1 through 5 complete. Phase 4 delivered all 8 commit batches. Phase 5 text-side verification passed every check. Phase 5 follow-ups: A (seed-event scrub) and B (Lighthouse + axe) DONE 2026-05-02. Items 1, 3, 5 remain deferred as documented.
