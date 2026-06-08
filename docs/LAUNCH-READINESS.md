# EventLinqs Launch Readiness Ledger

Single pre-launch source of truth. Honest DONE vs OUTSTANDING, split into
**code-complete** (engineering can finish on the branch) and **founder actions**
(only Lawal can do: env vars, DB applies, pricing, demo data, photo day, staging,
live Stripe). Read this before claiming launch readiness; update it as items
close.

- Branch: `feat/home-rebuild` (NO MERGE without approval).
- Tip at last verification: `7b9f434`.
- Last full verification: 2026-06-08.
- Companion sources: `docs/benchmark/system-pass/REPORT.md` (surface-by-surface
  state), `CLAUDE.md` (the constitution + gate-coverage map), and
  `docs/LAUNCH-READINESS-AUDIT-2026-05-31.md` (the prior module-by-module
  read-only audit against `main` with live prod/db evidence, retained for the
  module-level detail and the money-path proof).

---

## 1. Reconciliation findings (consolidation pass, 2026-06-08)

Parallel-tab contradictions found and resolved to the founder's latest ruling.

| # | Contradiction | Resolution |
|---|---|---|
| 1 | **Hero scale: two-tier vs single standard.** Docs (`page-build` skill, `DESIGN-SYSTEM.md`, `REPORT.md`) still described `.hero-content` as a separate taller "content" tier; the founder ruled ONE platform scale (2026-06-07). | Code was already flattened to `.hero-marketing` (the `.hero-content` token is gone from `globals.css`). Purged the stale two-tier text from all three docs to match the single-standard ruling. |
| 2 | **Live hero regressions from the flatten.** `events/[slug]/loading.tsx` skeleton was still `55-70vh` (would jump into the now `.hero-marketing` hero); `PhotographicCityHero` (`/events/browse/[city]`) hardcoded `44vh`. | Both flattened to `.hero-marketing`. Zero-shift skeleton restored (Motion law). |
| 3 | **Gold eyebrow law vs white eyebrows.** Four content/discovery heroes (culture, category, city, city-browse) used `text-white/85` eyebrows against the gold homepage baseline; the law says "never a white eyebrow". | Brought all four to `text-[var(--brand-accent)]`, matching the homepage and event-detail baseline. |
| 4 | **Oversized hero display type.** `PhotographicCategoryHero` headline ran to `lg:text-6xl`; event-detail H1 clamp ran to `4rem` (~text-6xl). Law caps at the homepage scale (`lg:text-5xl`, never text-6xl). | Category headline capped to `text-3xl..lg:text-5xl`; event-detail H1 clamp capped to `3rem`. |
| 5 | **Hero pause control: visible vs keyboard-focus-only.** `MOBILE-AUDIT.md` still described a "visible accessible pause/play control", contradicting its own later entry and CLAUDE.md. | Updated to the keyboard-focus-only / zero-visible-playback-chrome ruling (`9d74ff1`, 2026-06-08). |
| 6 | **Platform fee: 2% vs 2.5% and what drives the display.** `public-fee.ts` header claimed the static 2% constant drives `/pricing` and the live DB MUST be set to 2.0 before merge; `ADMIN-HANDOVER.md` says `/pricing` reads the LIVE `pricing_rules` value so displayed == charged already holds at 2.5%. | Corrected `public-fee.ts` so the constant reads as a fallback, not the source. The fee NUMBER is a founder pricing decision (see Founder actions): single-source live read means displayed always equals charged; lowering to the 2% intent (2026-06-08) is one admin field, no migration. |

**Confirmed already consistent (no contradiction):** hover wash (navy-only,
brightens, shared `HoverWash`), footer (4-col desktop / 2x2 mobile stacked
independent accordions), rail control system (RailArrows, no progress dot) all
agree across CLAUDE.md, the skills, and the benchmark docs.

**Dead-code landmines (not live, flagged for cleanup, not removed this pass to
avoid scope creep):** the 90vh hero chain `featured-event-hero.tsx` ->
`hero-carousel-client.tsx` / `featured-hero-static-shell.tsx` (only a type is
imported from it; never rendered), `split-state-hero.tsx`, and `home-hero.tsx`
are unused. The live homepage hero is `FeaturedHero` -> `FeaturedHeroClient`
(lawful 42-48vh). `venue-profile-hero.tsx` (64vh, max 600px) and
`organiser-profile-hero.tsx` (40vh, max 420px) are profile-banner heroes not in
the founder's enumerated single-scale list; they currently differ from the token
and need a founder call on whether profile banners are in or out of the one-scale
law.

---

## 2. Gate battery (this pass, deployed preview `7b9f434`)

All run against the deployed Vercel preview, full fixture density where relevant.

| Gate | Result | Evidence |
|---|---|---|
| TypeScript (`tsc --noEmit`) | **PASS** 0 errors | local |
| ESLint | **PASS** 0 errors (36 pre-existing warnings, all in `scripts/`+`research/` capture files) | local |
| Vitest | **PASS** 329/329 | local |
| `next build` | **PASS** | local |
| Link-integrity crawler (Law 5) | **PASS** 292/292 internal links resolve 200, ZERO dead | `scripts/link-integrity-crawl.mjs` |
| Affordance scan (no dead-end tiles) | **PASS** 0 dead-end tiles across 16 pages | `scripts/affordance-scan.mjs` |
| Hero measurement (single scale) | **PASS** home, event-detail, city, suburb, culture, organisers all = 432px @1440 / 354px @390 (== homepage) | `scripts/measure-el-heroes.mjs` |
| Mobile overflow audit (390) | **PASS** 17 pages, 0 overflow, 0 scrollX, 0 console errors, 0 broken images, axe 0 | `scripts/mobile-audit.mjs` |
| axe-core (key pages, both viewports) | **PASS** 0 serious/critical across 19 pages x mobile+desktop (38 audits) | `scripts/axe-overnight.mjs` |
| CI: lint / typecheck / build / test | **GREEN** all jobs success | GitHub Actions `CI` |
| CI: types-drift guard (now blocking) | **GREEN** no real drift | GitHub Actions `CI` |
| Lighthouse CI | **KNOWN-RED baseline** (documented; see gate gap 1) | GitHub Actions `Lighthouse CI` |
| Post-deploy smoke | N/A on a PR branch (runs on `main` after deploy) | GitHub Actions |

Minor watch item: the mobile audit flags a small number of sub-44px elements per
page (`small=2-7`), non-hard-failing (likely inline prose links, not tap
targets). Worth a dedicated 44px touch-target pass before launch but not a
blocker.

---

## 3. Code-complete (DONE on the branch)

- **Buyer journey:** discovery (home, events, city, suburb, culture, category),
  event detail, checkout, order confirmation, tickets. Zero dead links, zero
  dead-end tiles, single hero scale, light-and-airy chrome, hover-wash motion,
  rail control system. Verified this pass.
- **Community moat:** Sounds/Communities split rails, real `/culture/[slug]`
  landings (First Nations first), Communities doorway, value band, intersection
  pages inheriting spine imagery with branded fallbacks, shared
  `CategoryHeroEmpty` zero-event state.
- **Marketing surfaces:** `/organisers`, `/pricing`, `/about`, `/careers`,
  `/press`, legal pages, image-rich to the competitor bar, axe-clean.
- **Pricing display:** single-source live fee (`getLivePublicFee`), displayed ==
  charged, reads live `pricing_rules` via the anon client (works on preview).
- **Admin:** secure panel (getUser + admin_users + 2FA + RBAC, negative-access
  proven), pricing editor with confirmation step. Founder is super_admin.
- **Organiser tooling:** reporting (attendee list/exports), ownership gate
  (`getOrganiserEvent`).
- **Refund path** (M6) and **payout app layer** (M6): app code shipped.
- **Check-in scanner:** door scanner, atomic admit-once.
- **Hero motion:** LCP-safe auto-rotation, WCAG-pausable (keyboard-focus-only
  control), motion-flag gated.

The money path has been proven end to end at least once in TEST mode (one
connected organiser, one issued ticket, one ledger credit, one payout hold) per
the 31 May audit. That is proof of wiring, not of robustness at scale.

---

## 4. Outstanding (code work, engineering can finish on the branch)

- **Dead-hero cleanup:** remove the unused 90vh hero chain, `split-state-hero`,
  `home-hero` (move the one shared type out of `featured-event-hero.tsx` first).
  Low risk, defer or do in a dedicated cleanup commit.
- **Profile-banner hero decision:** once the founder rules on whether
  `/venues/[handle]` and `/organisers/[handle]` banners are inside the one-scale
  law, flatten or formally exempt them.
- **44px touch-target pass:** resolve the `small=N` elements flagged by the
  mobile audit.
- **Lighthouse gate vs the law:** bring the gate up to the 95+ law or amend the
  law (gate gap 1 below) once the founder rules.
- **Wire axe + link crawler as blocking CI jobs** (gate gap 2): both pass when
  run by hand; making them CI makes the laws unskippable.
- **Add marketing/legal pages to the Lighthouse + axe URL set** (gate gap 3).
- **Copy-law grep CI gate** (gate gap 4): no em/en-dashes, no exclamation marks,
  no banned words, no placeholder strings.
- **Deferred data-gap features:** organiser follow feed + event FAQ data
  (PARITY-minus on event-detail and organiser surfaces, a data gap not a craft
  gap).

---

## 5. Outstanding (FOUNDER ACTIONS, only Lawal can do)

Ordered roughly by launch-blocking weight.

1. **Platform fee decision + live value (commercial).** The 2026-06-08 founder
   intent is **2% + AUD 0.50**; the live `pricing_rules` AU/AUD baseline is still
   **2.5% + AUD 0.50**. Display and charge both follow the one DB source, so
   displayed == charged at whatever the live value is. To realise 2%, set AU
   `platform_fee_percentage` to `2` in `/admin/pricing` (single field, no
   migration, no deploy). Decide and set, or confirm 2.5% stays.
2. **Stripe live (commercial, launch-blocking).** Switch live keys; set connected
   accounts to the intended payout schedule (memory flags the default daily-vs-
   manual question); run the live purchase + refund round-trip end to end. The
   refund-verification checklist (authed admin Lighthouse/Playwright/axe in
   staging + live Stripe round-trip) is deferred to this pass, not dropped.
3. **Apply pending migrations** with `supabase db push --linked` in PowerShell
   (never the Dashboard SQL editor, never the MCP). Verify by direct DB query, not
   the cached client. Pending in `supabase/migrations/` include the refund
   reconcile (`20260531000001/2`), payout disbursement (`20260531000003`), and
   the founder super-admin grant (`20260608000001`). Confirm each is applied.
4. **Environment variables on Vercel (preview + production):**
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (the interactive venue/city map needs it;
     `REPORT.md` flags it).
   - Stripe live secret + publishable + webhook signing secrets.
   - Confirm `SUPABASE_ACCESS_TOKEN` repo secret stays set (keeps the types-drift
     guard blocking and green).
5. **Demo-data decision (production DB).** Production holds a small seeded
   catalogue (~23 to 47 events across recent snapshots). Decide whether it stays
   as launch-day catalogue or gets purged. Never seed the live Sydney DB to fluff
   discovery; the full-density benchmark is a gitignored local fixture only.
6. **Photo day (brand).** The image spine is live with branded fallbacks; the
   ingest pipeline (`scripts/ingest-imagery.mjs`) is ready (drop
   `role__key__city__descriptor.jpg` into `design-assets/incoming/`, one command).
   Real licensed photography is a one-line swap per slot, never a template change.
   Hand-crafted editorial imagery for top intersections is post-launch.
7. **Staging certification.** No staging rig is provisioned (no local DB/Docker).
   Stand up staging for the authed-admin Lighthouse/axe pass, check-in scanner
   e2e + concurrency, and the live Stripe round-trip before launch.
8. **Approve the merge.** CI is the merge authority; no `--admin`, no lowering a
   threshold. Approve `feat/home-rebuild` -> `main` only when this ledger is clear.

---

## 6. Known gate gaps (from CLAUDE.md, routed to engine hardening)

1. **Lighthouse vs the law.** The gate floors perf below the 95+ law and the URL
   set / viewport coverage is below the law. Founder ruling needed: amend the law
   to the operating reality or bring the gate up. Tied to Issue #42 (next/image
   optimiser cold-start) driving LCP/perf variance.
2. **axe + link crawler are not CI jobs.** Both pass by hand (this pass); wire as
   blocking CI to make the accessibility + zero-dead-links laws unskippable.
3. **Marketing/legal pages outside the gate URL list.** Add `/about`, `/blog`,
   `/careers`, `/press`, `/legal/privacy` to Lighthouse + axe.
4. **Copy laws are grep-checkable.** A CI grep gate would make the no-dash,
   no-exclamation, no-banned-word, no-placeholder laws unskippable.

Laws that stay human/benchmark-enforced: Law 1 (no generic), Law 2 (evidence
Phase A/B), Law 3 (Australia-smart taxonomy), Law 4 (image-richness), the
light-and-airy palette, and the SURPASS/PARITY/BELOW benchmark verdicts.
