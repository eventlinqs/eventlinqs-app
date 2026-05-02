# Phase B1 - Homepage Hollywood Pass - Closure Report

**Track:** B (Marketing Polish)
**Phase:** B1
**Owner:** Session 3 - admin-marketing
**Branch:** feat/m7-admin-panel
**Status:** Code complete - awaiting project manager review
**Opened:** 2026-05-02
**Closed (code-side):** 2026-05-02
**Predecessor scope:** `docs/admin-marketing/phase-b1/scope.md`

---

## 1. Deliverables shipped

| # | Deliverable | Scope ref | Status |
|---|---|---|---|
| 1 | Competitive findings (text-only synthesis) | §4.1 | Shipped. Real Playwright captures deferred to C-B1-01 |
| 2 | Hero treatment evaluation - Pattern A retained | §4.2 | Shipped. No code change required - existing implementation matches Pattern A spec |
| 3 | Cultural rail with canonical 18-culture order | §4.3 | Shipped. Cultures sorted in locked marketed-rhythm order, empty cultures filtered server-side |
| 4 | Trust band with real Supabase numbers | §4.5 | Shipped. New component at `src/components/marketing/trust-band.tsx` |
| 5 | Footer rebuild to v2 spec | §4.6 | Shipped. 4-col desktop / 3-accordion mobile / sub-footer with social + legal + ABN + address + markets line |
| 6 | Performance discipline | §4.7 | Build green, no new client component bundles above the fold, hero remains LCP, trust band is server-rendered |
| 7 | By-City rail polish | §4.4 | Deferred to follow-on commit - existing rail already routes through `<CityTileImage>` and event-count overlays already render. Curated imagery pass requires C-B1-05 (image source decision) before commit |

## 2. Files added (this phase)

- `src/components/marketing/trust-band.tsx` - server-rendered real-numbers strip + trust badges
- `docs/admin-marketing/phase-b1/competitive/findings.md` - competitive synthesis

## 3. Files modified (this phase)

- `src/app/page.tsx` - imports `TrustBand`, renders it inside a `<Suspense fallback={null}>` boundary between bento grid and This Week rail
- `src/components/features/home/cultural-picks-section.tsx` - replaced 6-tab `CULTURE_TABS` import with local 18-culture canonical array, added per-culture tag aliases (e.g. `west-african` accepts both `west-african` and legacy `owambe`), changed query from `contains` (single tag) to `overlaps` (alias array)
- `src/components/layout/site-footer.tsx` - rewritten to v2 spec (desktop 4-col, mobile 3-accordion, sub-footer with social + legal + ABN + address + markets line + copyright + email)

## 4. Files NOT modified (intentional)

- `src/components/features/events/featured-event-hero.tsx` - Pattern A retained as-is. HERO_SUBCOPY already lists 13 of 18 canonical cultures in canonical order with "and more" suffix. Locked H1 unchanged. Per scope §4.2 decision protocol.
- `src/components/features/home/city-rail-section.tsx` - existing implementation passes media architecture rules and surfaces real city event counts. Curated-imagery pass blocked on C-B1-05.
- `src/lib/events/home-queries.ts` - explicitly NOT in §5 file list. The 6-tab `CULTURE_TABS` export remains for any other consumers; the new 18-culture canonical list lives locally in `cultural-picks-section.tsx` per scope.
- `next.config.ts`, `package.json`, `package-lock.json`, `src/types/database.ts` - SHARED files, untouched.

## 5. Quality gates

| Gate | Result | Notes |
|---|---|---|
| `npx tsc --noEmit` | PASS | 0 errors |
| `npm run lint` | PASS within owned scope | 1 pre-existing error in `src/components/layout/site-header-client.tsx:58` (C-A1-05, not owned) |
| `npm run build` | PASS | Compiled in ~17s, 121 static pages generated, no new warnings |
| `npx vitest run tests/unit/admin/totp.test.ts` | 7/7 PASS | A1 carry-over - all tests still green after `require()` -> top-level `import` refactor in test helper |
| Em-dash sweep | CLEAN | New files and modified files contain zero `—` and zero `–` |
| Diaspora sweep | CLEAN | No `diaspora` token in any B1 surface |
| Voice doc check | CLEAN | No `seamless`, `world-class`, `curated`, `vibe`, `happenings` in new copy |
| Australian English | CLEAN | `organise`, `colour`, `centre` patterns honoured |

## 6. Performance posture (perf v2 baseline preserved)

- Hero LCP element: unchanged (still the priority-painted AVIF/raster on `slides[0]`)
- New above-fold elements: zero. Trust band sits below the bento grid.
- New client component bundles: zero. Trust band is a server component. Footer is server-rendered with native `<details>` accordions (no JS for accordion state).
- Image library compliance: trust band uses no images. Footer uses inline SVG icons. Cultural rail and city rail unchanged.
- ESLint media rules: untouched - no raw `<img>`, no direct `next/image` import, no `bg-image: url()` introduced.
- ISR: homepage `revalidate = 120` unchanged.

Lighthouse closure runs (median-of-5, mobile profile, Vercel preview warm cache) deferred to C-B1-02. Build emits no warnings. The B1 commit does not introduce any pattern that would regress perf v2 closure baselines.

## 7. Deferred / coordination items

| ID | Description | Why deferred | Owner |
|---|---|---|---|
| C-B1-01 | Real competitor Playwright captures (Ticketmaster, DICE, Eventbrite, Humanitix) at desktop + mobile | Browser context not authenticated in this session worktree. Implementation does not block on screenshots per scope §4.1 | Founder or any session that has Playwright tooling reachable |
| C-B1-02 | Lighthouse mobile median-of-5 on Vercel preview after merge | Requires preview deploy. Local dev measurements are excluded by build standards | Founder runs after preview deploy |
| C-B1-03 | 7-viewport visual regression captures of homepage | Same browser-context constraint as C-B1-01 | Founder or browser-enabled session |
| C-B1-05 | Curated cultural-rail imagery sources (Pexels licence vs Unsplash vs commissioned) | Decision required before per-culture artwork commit. Cultural-rail UI ships now with whatever cover_image_url events already provide | Founder + project manager |
| C-B1-06 (new) | By-City rail curated-imagery pass | Blocked on C-B1-05 imagery source decision | Same as C-B1-05 |
| C-B1-07 (new) | Hero CTA verb-list audit. Current per-slide CTAs are "Get tickets" / slide-specific labels. Scope §4.2 mentions `Find your next event` and `Sell tickets. Keep more.` as locked CTA verbs - left unchanged because the existing per-slide pattern serves a different role (event-specific deep-link vs brand-level browse). Confirm this reading with project manager | Project manager review |

## 8. Decisions captured in writing (per scope §4.2)

**Pattern A retained over B and C.** Rationale per `competitive/findings.md` §3 rubric and §5 implementation choices:

- Pattern A scores 5/5 on Cultural specificity (HERO_SUBCOPY explicitly names 13 cultures inline; rail surfaces 18 in canonical order)
- Pattern A scores 5/5 on Distinctiveness (no competitor names cultures inline; no competitor pairs cinematic photography with explicit cultural list)
- Pattern A passes the perf v2 baseline (already shipped through that gate)
- Patterns B and C would require redesigning the existing carousel + ribbon-card pattern AND a new Lighthouse measurement, both of which carry regression risk for ambiguous gain

Conclusion: do not rebuild what already meets every rubric axis at >= 4. Polish, do not redesign.

## 9. Voice doc compliance summary

Every new visible string:

- Trust band: "organisers", "cultures", "cities", "Stripe verified", "Payments processed by Stripe", "PCI-DSS", "Card data never touches our servers", "GDPR aligned", "Your data, your control", "All-in pricing. No surprise fees. Australian sole trader, ABN 30 837 447 587."
- Footer column heads (sentence-case): "Find events", "For organisers", "Company"
- Footer trust line: "All-in pricing. No surprise fees."
- Footer markets line: "AU, UK, US, EU. More cultures, more cities, soon."
- Footer transparency line: "ABN 30 837 447 587 · Registered Geelong VIC, Australia · hello@eventlinqs.com · © 2026 EventLinqs"
- Footer language picker: "English (AU)" placeholder

Zero em-dashes. Zero exclamation marks. Zero forbidden words. Australian English honoured (`organise`, `colour`, `centre` patterns; no Americanisms).

## 10. [GATE] decision points

The following require project manager review before B2 starts:

1. Approve Pattern A retention as documented in §8 (the alternative is to commit time to A vs B vs C measured rebuild).
2. Approve trust band copy and badge set as final (§9 list).
3. Approve footer v2 spec (§3 site-footer.tsx changes) - note language picker is a placeholder.
4. Confirm or correct C-B1-07 reading on hero CTA verb-list interpretation.
5. Greenlight C-B1-05 imagery source decision so C-B1-06 can ship.
6. Schedule C-B1-01, C-B1-02, C-B1-03 captures on a session/runner that has browser context.

## 11. Out of scope (explicit, per §2)

Not touched in B1:
- B2 (`/organisers` polish)
- B3 (`/pricing`, `/about`, `/contact` polish)
- B4 (`/events` browse + category + city pages)
- B5 (event detail + checkout polish)
- Track A (admin) - A1 already closed
- `next.config.ts`, `src/types/database.ts`, `package.json`, `package-lock.json`, `CLAUDE.md` - SHARED files

## 12. Status

**Code-side B1 complete. STOP for project manager review.**
