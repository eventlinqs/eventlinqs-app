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

2. **Lighthouse and axe runs.** Per-surface accessibility and performance audits on the rewritten pages. The earlier Phase 1B work has the harness in `docs/sprint1/phase-1b/`. Re-run on the brand-sweep branch and diff against the iter-14-pt5 baseline.

3. **Competitive re-scoring.** Side-by-side review of EventLinqs against Ticketmaster, DICE, Eventbrite, Humanitix, RA, and Songkick using the brand-expression scorecard from `docs/brand-sweep/research/findings.md`.

4. **Seeded fixture event title.** `supabase/migrations/20260414000001_seed_culturally_relevant_sample_events.sql` contains a fixture titled "Diaspora Business Summit 2026". Migrations applied to remote databases are immutable, so this needs a new forward migration that updates the event title and slug rather than an edit to the historical file. The same migration can also touch the seed image URL (`https://picsum.photos/seed/diaspora/...`) which surfaces in the seeded event card alt text.

5. **Internal docs sweep (optional).** 25+ internal `docs/` files still reference the prior diaspora-first framing. Not user-facing, but updating them keeps the historical record aligned with the new positioning. Lower priority than the four items above.

## Status

Phases 1 through 5 complete. Phase 4 delivered all 8 commit batches. Phase 5 verification passed every text-side check; visual / Lighthouse / scoring deferred as documented above.
