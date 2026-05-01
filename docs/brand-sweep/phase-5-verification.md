# M6.5 Brand Sweep - Phase 5 Verification

**Date:** 2026-05-02
**Branch:** feat/sprint1-phase1b-performance-and-visual
**Scope:** Verification of public-surface culture-first sweep covering 9 commits (57116a8..cf5b2a8).

## 1. Diaspora text scan (public surfaces)

Command: `Grep diaspora src/ -i`

Result: **0 matches** in production source.

The 46 historical references that remain live in:
- `docs/` (architecture notes, prior strategy docs, performance reports)
- `scripts/` (seed scripts, hero raster fetcher)
- `supabase/migrations/` (one fixture event titled "Diaspora Business Summit 2026")

Migrations were intentionally not edited. Migrations applied to remote databases are immutable; renaming the seeded event title requires a new forward migration. Logged as Phase 6 follow-up.

## 2. Em-dash and en-dash scan (public surfaces)

Commands:
- `LC_ALL=C.UTF-8 grep -rnP '\x{2014}' src/app src/components`
- `LC_ALL=C.UTF-8 grep -rnP '\x{2013}' src/app src/components`

Result: **0 matches** for both U+2014 (em-dash) and U+2013 (en-dash).

## 3. Exclamation mark scan (user-facing copy)

Command: `LC_ALL=C.UTF-8 grep -rnE "[a-z][a-z]+!('|\"|<)" src/app src/components`

Result: **0 matches**. The only `!` characters in `src/app` and `src/components` are TypeScript negation and non-null operators in code paths.

## 4. Forbidden CTA verb scan

Command: `Grep '"Discover|\'Discover' src/`

Findings (all addressed):
- `src/lib/content/category-highlight-slides.ts:42` - "Discover events that cost nothing" -> "Find events that cost nothing"
- `src/components/features/events/free-weekend-tile.tsx:73` - same fallback subtitle reframed
- `src/components/features/events/free-weekend-tile.tsx:125` - button label "Discover" -> "Find free"
- `src/components/features/events/m5-events-hero-strip.tsx:31` - default heading "Discover events" -> "Find your next event"

Surviving `Discover` literal: footer column title (acceptable as a section label, not a CTA verb).

## 5. Typecheck

Command: `npx tsc --noEmit` after each batch.

Result: **0 errors** across all 9 commits.

## 6. Locked positioning audit

| Asset | Required string | Present? |
|---|---|---|
| Hero h1 | "Every culture. Every event. One platform." | hero-carousel-client.tsx |
| Sub-tagline | "The ticketing platform built for every culture." | featured-event-hero, footer (mobile + desktop), root meta, privacy/terms preamble, about, blog, help, organisers landing, email signoffs |
| Cultures list | Locked order with middle-dot separator | Surfaced verbatim in featured-event-hero subcopy, organiser landing paragraph, help "Who is EventLinqs for", root meta description |
| Mission | Stated culturally-specific welcome | OrganisersLandingPage paragraph |

## 7. Visual regression and competitive scoring

Deferred from this autonomous run:
- Playwright screenshot capture across 7 viewports
- tesseract.js OCR pass on captured screenshots to confirm rendered copy matches source
- Lighthouse and axe accessibility runs on each rewritten surface
- Side-by-side competitive scoring against Ticketmaster, DICE, Eventbrite, Humanitix, RA, Songkick

The copy-side verification above (greps, typecheck, locked-positioning audit) confirms the rewrite is complete and consistent across the 8 batches. The visual / scoring pass requires a running dev server, headless browser tooling, and Lighthouse CLI in a way that is best done in a dedicated session where each output can be reviewed before moving on. Documented as Phase 6 follow-up.

## 8. Commit log

```
cf5b2a8 feat(brand): replace Discover CTA with Find across event surfaces
cbd4fe5 feat(brand): culture-first root meta, footer, and seeded fallbacks
6f9c2ed feat(brand): culture-first email templates for confirmation and waitlist
faae60d feat(brand): culture-first auth subtitle and order confirmation
5b4bff6 feat(brand): culture-first preamble in privacy and terms
e8c1c0c feat(brand): culture-first help centre and FAQ articles
c401a27 feat(brand): culture-first organiser landing, about, and blog
feb2b9c feat(brand): culture-first browse, location picker, and city data
ca69fdb feat(brand): culture-first homepage hero and category copy
b54af4d docs(brand): public surface inventory
57116a8 docs(brand): phase 1 research and phase 2 voice
```

## 9. Summary

The copy sweep is complete. Every public-surface diaspora reference in production source is gone, replaced with culture-first language using the locked positioning. Voice rules (no em-dash, no en-dash, no exclamation marks, no Discover as primary CTA) are observed across all rewritten surfaces. Typecheck is clean. The remaining work is the visual / Lighthouse / competitive scoring pass and the seeded-event migration fix, both logged as Phase 6 follow-ups.
