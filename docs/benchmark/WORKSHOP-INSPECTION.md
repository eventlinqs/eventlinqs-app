# Workshop inspection: independent pre-test-drive verdict

Role: independent Chief Inspector (QA + design director). I did not build this
platform. Mandate: adversarial honesty. Verify every claim in
`docs/benchmark/system-pass/REPORT.md` independently; trust nothing untested.

- Inspection date: 2026-06-07
- Design target: feat/home-rebuild preview (full 55-event density)
  `https://eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app`
  (serving branch tip `4e759a0`, confirmed local == origin == deployed)
- Engine target: production `https://www.eventlinqs.com`
- Read-only on production: no events, reservations, or orders were created.
- Branch: `chore/workshop-inspection` (report only; no app code changed).
- Evidence harnesses (gitignored, under `design-captures/audit/`):
  `workshop-statuscrawl.mjs`, `workshop-deepaudit.mjs`, `workshop-manifest.json`,
  reusing the existing `lh.mjs` (Lighthouse) and `capture.mjs` (Playwright).
  Raw JSON: `crawl-prod.json`, `crawl-preview.json`, `deepaudit-preview.json`.

---

## ONE-LINE FOUNDER VERDICT

**NOT READY for the owner's test drive as currently deployed.** The design-target
preview is a Potemkin facade: the homepage shows 55 polished event cards and
**every single one returns a 404 on click**, while suburb and culture-city pages
return HTTP 500. The thing the founder would do first - click an event - is
broken on the exact surface he is told to drive. The merged production engine is
materially healthier (events resolve, headers present, ~all routes 200), but the
"Lighthouse 95+" law is not actually enforced or met. Between here and yes:
(1) make the preview's homepage cards resolve to real detail pages, (2) fix the
preview 500s on suburb/culture-city, (3) reconcile the perf law with reality.
Full routing + severities below.

---

## HEADLINE: the builder's close-out is contradicted

`REPORT.md` close-out (2026-06-06) states: *"With those exact exceptions, the
system is at or above the bar on every surface. The independent inspector +
founder test drive can proceed."* It does not hold. The #9 re-audit benchmarked
event detail using a **real DB slug** (`africultures-festival-sydney-2027`, 200)
and never clicked a card on the full-density homepage it was certifying. Those
cards point at fixture slugs that do not exist in the database.

---

## DEFECTS (severity-ranked, routed)

### BLOCKER-1 - Every preview homepage event card 404s
- **Where:** preview `/` (all viewports) -> any `/events/cat-*` card.
- **Evidence:** 55 card hrefs scraped from the rendered homepage; all are
  `/events/cat-...`; every one returns HTTP 404 (warm, repeated). A real DB slug
  (`/events/africultures-festival-sydney-2027`) returns 200, proving the route
  works - the fixture cards specifically do not resolve.
- **Root cause (code-confirmed):** homepage density is served from the build-time
  fixture (`src/lib/events/home-queries.ts:85`, `HOMEPAGE_SEED_FIXTURE=1`,
  reading `src/lib/dev/home-seed-fixture.json` with invented `cat-*` slugs),
  while the detail route's existence guard
  (`src/app/events/[slug]/layout.tsx:30`) queries the **real `events` table** and
  calls `notFound()` for unknown slugs. Density and detail draw from two sources
  that do not agree, so every fixture card is a dead link.
- **Impact:** the single most damaging thing a test-driver hits, on the first
  click, on the surface designated for the drive. Equivalent in spirit to the
  flagship 500 the builder caught - except this one ships in the "ready" state.
- **Routed to:** feat/home-rebuild session (fixture/data design).
- **Fix direction:** the preview must seed the same events into the DB it queries
  (so detail pages exist), OR the detail guard/data path must read the same
  fixture the homepage uses when `HOMEPAGE_SEED_FIXTURE=1`. The two paths must
  share one source of truth. Re-verify by clicking, not by a hand-picked slug.

### BLOCKER-2 - Preview 500s on suburb and culture-city pages
- **Where:** preview `/city/[slug]/[suburb]` (e.g. `/city/sydney/cbd`) and
  `/culture/[culture]/[city]` (e.g. `/culture/african/sydney`) - HTTP 500, warm,
  reproducible. Production returns 200 for the same routes.
- **Evidence:** curl 500 x2 warm on preview; production `/culture/african/sydney`
  = 200. City pages render suburb tiles and culture pages render culture-city
  tiles that link into these routes, so the test-driver reaches them by clicking.
- **Impact:** server error pages mid-navigation on the design target.
- **Routed to:** feat/home-rebuild session (likely the same fixture/data
  divergence as BLOCKER-1, surfacing as an unhandled exception rather than 404).
- **Fix direction:** reproduce under `HOMEPAGE_SEED_FIXTURE=1` locally; the
  suburb/culture-city loaders throw when the fixture-vs-DB data shape diverges.

### MAJOR-1 - "Lighthouse 95+ on desktop AND mobile" is not enforced or met
- **Where:** `lighthouserc.json` (the gate) + measured medians on the preview.
- **Evidence (gate config):** the CI gate (a) runs against **`localhost:3000`**
  via `startServerCommand: npm run start` - the exact "single localhost run" the
  law forbids, not the preview/warmed-prod it requires; (b) floors performance at
  **0.80, not 0.95**; (c) **downgrades performance to warn (non-blocking) on `/`
  and all `/culture/*`** - the two hero surfaces are not gated on perf at all;
  (d) is **mobile-only** (no desktop formFactor anywhere); (e) leaves LCP, TBT,
  FCP, Speed-Index at **warn** (only CLS + category scores are error-level).
- **Evidence (my medians, warmed preview, mobile, median-of-3, el-audit=1):**
  home perf **0.91** (LCP 2034ms), `/events` **0.84** (LCP 3396ms), event detail
  **0.75** (LCP **4561ms, over the 4000 threshold**). a11y 1.0 and seo 1.0
  throughout. (best-practices reads 0.96 on the preview, attributable to the
  `vercel.live` toolbar's report-only CSP console entry - a preview-only
  injection, not an app defect; expect 1.0 on production.)
- **Impact:** every "Lighthouse on the Vercel preview (CI gate)" claim in
  REPORT.md is inaccurate - the gate is a localhost run at a lowered floor with
  the hero pages exempted. On the correct target the buyer journey degrades
  0.91 -> 0.84 -> 0.75; none meet the 95+ law and detail busts the LCP threshold.
  The variance (single runs swing 0.67-0.97) is the documented next/image
  optimiser cold-start (Issue #42), still unresolved.
- **Routed to:** engine hardening branch (gate config + perf), with founder
  ruling needed: the law says 95+ on preview/warmed-prod desktop AND mobile; the
  team has operated to 0.80/warn on localhost mobile per an internal perf doc.
  Either the law is amended with sign-off or the gate is brought up to it.

### MAJOR-2 - Long-tail culture-city pages time out under cold concurrency (prod)
- **Where:** production `/culture/*/[city]`, e.g. the entire `other-south-asian`
  family + `other-european/wollongong`.
- **Evidence:** in a 12-way concurrent crawl of the 572-URL sitemap, 10 of these
  returned network timeouts (45s) and another ~6 took 8-21s. Warm and sequential
  they return 200 in 1-2s. This is the Supabase pool-exhaustion class the build
  fix (985e46d) moved off the build and into on-demand ISR - a burst of cold
  requests to long-tail pages can still exceed the function timeout.
- **Impact:** invisible to a single human test-driver (sequential, mostly warm);
  real on launch day or under a crawler hitting many cold long-tail pages.
- **Routed to:** engine hardening branch (ISR warm strategy / query indexing /
  concurrency caps on the long-tail loaders).

### MAJOR-3 - Taxonomy drift: culture-first routes + stale CULTURE_TABS
- **Where:** the entire `/culture/<ethnicity>` URL namespace (sitemap: vietnamese,
  turkish, korean, greek, arab, african, indian, ... x24) and
  `src/lib/events/home-queries.ts:112` `CULTURE_TABS`.
- **Evidence:** `CULTURE_TABS` still ships the OLD taxonomy
  (afrobeats/amapiano/owambe/caribbean/heritage/networking) pointing at
  `/categories/*` hrefs, not the locked Scenes V2 set. The `/culture/<ethnicity>`
  namespace is culture-first - the exact framing the founder corrected to
  community-first (CLAUDE.md: banned culture-first language; Scenes V2 names are
  First Nations, South Asian, Asian, Pasifika & Maori, Mediterranean, Pride,
  Faith & Worship).
- **Impact:** the live URL taxonomy and the homepage culture rail contradict the
  locked scene taxonomy and the community-first law. Known Phase-2 work, but it is
  live and indexed (572-URL sitemap), so it ships in the test-drive build.
- **Routed to:** feat/home-rebuild session (the post-photos taxonomy mission the
  REPORT already flags), escalated here because it is user-facing and indexed.

### MAJOR-4 - Marketing + legal pages fail the axe-core 0-violations law
- **Where (preview, desktop AND mobile, axe-core serious/critical):**
  - `/blog`: color-contrast x8 **and a "Coming soon" placeholder** (a COMING SOON
    wasteland - Law 1 no-placeholders, Law 4 image-rich-marketing, and the
    mandate's explicit ban).
  - `/press`: color-contrast x5 **+ definition-list x1 + dlitem x18** (broken
    `<dl>` semantics - 18 `<dt>/<dd>` items not wrapped in a `<dl>`).
  - `/about`: color-contrast x4.  `/careers`: color-contrast x3.
  - `/legal/terms`: color-contrast x1.  `/legal/privacy`: color-contrast x1.
- **Why it slipped:** the Lighthouse/axe gate URL list (`lighthouserc.json`)
  covers `/`, `/events`, `/organisers`, `/pricing`, `/help`, `/legal/terms`,
  `/login`, `/signup` - it does **not** include `/about`, `/blog`, `/careers`,
  `/press`, or `/legal/privacy`, so they were never axe-gated. The recent
  marketing "dark-sweep to light" introduced/left low-contrast text (most likely
  a gold eyebrow or muted body colour on the new light surface) on exactly these
  ungated pages.
- **Impact:** breaches the "axe-core 0 violations" law on in-scope surfaces;
  `/blog` is a literal placeholder shipped in the "ready" build.
- **Routed to:** feat/home-rebuild (fix contrast tokens + `/press` `<dl>` markup +
  build a real `/blog` or remove it from nav/sitemap) AND engine hardening (add
  about/blog/careers/press/legal-privacy to the axe gate URL list so this can
  never silently regress again).

### Contrast vs the builder's report (both directions, for fairness)
- **Report OVERSTATES (homepage imagery):** REPORT.md grades homepage imagery
  SURPASS and dismisses the sameness as "a seed-data artifact, not a design
  defect." Independent capture at full density shows the homepage rendering as a
  near-uniform **wall of dark, dim concert/crowd photos** (including a dark hero)
  - monotonous and not "light and airy" (design law). The founder will see this.
  Graded **BELOW on imagery** below, root cause notwithstanding.
- **Report UNDERSELLS (organisers imagery):** REPORT.md close-out lists
  "Organisers imagery - BELOW (named exception), 0 body photos." That is now
  **stale** - `/organisers` was rebuilt (the `surface-6/rebuild-2026-06-07` work
  + new Law 4) and is image-rich (split hero, photo feature bands, a real-photo
  community grid, photo CTA). Graded **at bar** below. Credit where due.

---

## DESIGN VERDICTS (independent, fresh captures at 1440; mobile 390 where noted)

Captures (gitignored, `design-captures/audit/workshop/`): `ours-*`,
`eb-home-1440`, `tm-home-1440`. EB is the stronger competitor pattern (light,
curated, image-led); TM is ad/sponsor-driven and lower-craft. Motion is
DOM-evidenced (reveal/hero-enter/scroll-snap classes present; `data-motion` off
in headless so content is flash-free) - static frames cannot show animation.

### Homepage `/`
| Aspect | Verdict | Evidence |
|---|---|---|
| Layout / structure | SURPASS | Solid navy header + cinematic hero + a dozen+ consistent curated rails with CAPS headings + faint dividers. EB: one curated row + icon nav + a city grid. |
| Density | SURPASS | Many distinct rails of real breadth vs EB's single grid. |
| Hierarchy | SURPASS | Uniform card sizing, clean rail rhythm. |
| **Imagery** | **BELOW** | At full density the cards are a near-uniform wall of dark, low-light concert photos; reads murky, not "light and airy." EB is bright, varied, colourful. Card *structure* (image-alone, details below) is correct; the *palette/variety* fails the bar. |
| Typography | PARITY | Rail headings 24/22px, card titles 18px - matches both. |
| Motion | SURPASS (DOM) | hero-enter stagger, `.reveal` rails, eased glide, card hover - competitors near-static. |
| Loading | SURPASS | Designed brand-shimmer skeletons; competitors flash. |
| Mobile (390) | PARITY-minus | Clean stacked rails + peek + 44px targets, but the same dark-imagery monotony. |

### Event detail `/events/[slug]` (real slug)
| Aspect | Verdict | Evidence |
|---|---|---|
| Layout / imagery / hierarchy / typography | SURPASS | Cinematic hero, gold CTA + sticky ticket panel, About, venue, organiser card, WhatsApp share, varied related grid. Far above TM thumbnail-list / EB flyer. |
| Caveat | - | Reachable only via a real DB slug; from the preview homepage it 404s (BLOCKER-1). Venue map tile rendered grey in the static capture - verify interactively. |

### Organisers `/organisers`
| Aspect | Verdict | Evidence |
|---|---|---|
| Imagery / layout / density | SURPASS / PARITY | Image-rich split hero + photo feature bands + real-photo community grid + FAQ + photo CTA. The report's "imagery BELOW" exception is resolved. |

### Browse `/events`, Search `/events?q=`, City `/city/[slug]`, Culture `/culture/[slug]`
Render correctly, axe-clean, designed loading; structure/density/hierarchy
at/above the EB/TM bar (corroborates REPORT.md for these surfaces). They inherit
the same dark-imagery palette concern on their event cards but to a lesser visual
degree than the homepage (more mixed categories on browse; editorial heroes on
city/culture). Not separately graded BELOW; the homepage is the worst case.

---

## ENGINE PASS LEDGER (verified healthy)
| System | Result | Evidence |
|---|---|---|
| Production route health | PASS | 573/586 = 200; the 2 4xx are correct (`/search` has no route, fake slug); 1 redirect correct (`/tickets` -> login). No 5xx. |
| Hard 404s on fake slugs | PASS | `/events/zzz`, `/events/browse/zzz`, `/orders/<fake>/confirmation`, `/t/<fake>` all hard 404 (the prior soft-404 is fixed). |
| Security headers | PASS (1 caveat) | HSTS, X-Content-Type-Options nosniff, X-Frame-Options SAMEORIGIN, Referrer-Policy, Permissions-Policy on preview + prod. **Caveat: CSP is Report-Only (not enforced) - see MINOR-2.** |
| robots.txt / sitemap.xml | PASS | robots disallows api/dashboard/checkout/auth/admin/account/orders; sitemap 572 URLs, well-formed. |
| OG / Twitter cards | PASS (gaps) | Present on home/events/detail/organisers/pricing/legal/auth. **Missing og:image on city/culture/cultures/cities/about/blog/careers/press - MINOR-1.** |
| axe-core (buyer-critical path) | PASS | 0 serious/critical on home, /events, search, detail, city, culture, cultures, cities, organisers, pricing, login, signup (desktop + mobile). |
| Console errors (app) | PASS | Only the preview-only `vercel.live` toolbar report-only-CSP frame warning; no app console errors. |
| Banned content (em/en-dashes) | PASS | 0 across all 18 rendered surfaces. |
| User-facing "culture/cultural" copy | PASS | 0 visible "culture(al)" labels (copy is community-first even though the URL namespace is not - see MAJOR-3). |
| Broken images / off-brand inline hex | PASS | 0 broken images; 0 watchlist off-brand hex (#1A1A2E/#4A90D9/#10B981/#F0F6FF...) in rendered inline styles. |
| Auth pages render + baseline validation | PASS (partial) | /login + /signup 200, noindex; inputs are `required` + `type=email` + password min - native validation blocks empty/invalid. Server-side error-state test deferred (needs careful no-submit auth interaction). |

## MINOR findings
- **MINOR-1 - og:image missing** on `/city/*`, `/culture/*`, `/cultures`,
  `/cities`, `/about`, `/blog`, `/careers`, `/press`. Social shares of these
  render without a card image. Route: feat/home-rebuild (per-route OG image).
- **MINOR-2 - CSP is Report-Only**, not enforced, on preview AND production.
  `Content-Security-Policy-Report-Only` means violations are reported, not
  blocked - the policy provides no actual protection yet. Known "CSP prep"; flag
  to flip to enforcing `Content-Security-Policy` after report-tuning. Route:
  engine hardening.
- **MINOR-3 - event-detail venue map** tile rendered as a grey box in the static
  capture. Likely a slow Mapbox tile (not a flagged failed request); verify it
  paints interactively on the preview. Route: feat/home-rebuild (verify).

---

## SYSTEMS SUMMARY (PASS / DEFECT)
| Area | Status |
|---|---|
| Preview homepage -> event detail navigation | **DEFECT (BLOCKER-1)** |
| Preview suburb / culture-city pages | **DEFECT (BLOCKER-2)** |
| Lighthouse 95+ law (enforcement + actual) | **DEFECT (MAJOR-1)** |
| Long-tail ISR under cold concurrency (prod) | **DEFECT (MAJOR-2)** |
| Taxonomy: culture-first routes + stale CULTURE_TABS | **DEFECT (MAJOR-3)** |
| Marketing/legal axe + `/blog` placeholder | **DEFECT (MAJOR-4)** |
| Homepage imagery at density | **DEFECT (design BELOW)** |
| Production route health / 404 discipline | PASS |
| Security headers (CSP report-only caveat) | PASS |
| robots / sitemap | PASS |
| OG/Twitter (og:image gaps) | PASS w/ MINOR-1 |
| axe buyer-critical path | PASS |
| Banned content (dashes / culture labels / placeholders on buyer path) | PASS |
| Event detail / browse / city / culture / organisers design | PASS (SURPASS/PARITY) |

---

## ROUTED FIX LIST

### To the feat/home-rebuild session (design + data)
1. **BLOCKER-1** - make preview homepage fixture cards resolve: one source of
   truth for density and detail (seed the fixture events into the queried DB, or
   read the fixture in the detail data path under `HOMEPAGE_SEED_FIXTURE=1`).
   Re-verify by clicking cards, not a hand-picked slug.
2. **BLOCKER-2** - fix the preview 500 on `/city/[slug]/[suburb]` and
   `/culture/[culture]/[city]` (reproduce locally with the fixture flag set).
3. **MAJOR-3** - reconcile `CULTURE_TABS` (`home-queries.ts:112`) and the
   `/culture/<ethnicity>` namespace to Scenes V2 + community-first (the
   post-photos taxonomy mission).
4. **MAJOR-4 / design BELOW** - fix marketing+legal color-contrast, fix `/press`
   `<dl>` markup, replace the `/blog` "Coming soon" with a real surface or pull it
   from nav/sitemap; raise homepage imagery variety (lighter, mixed-category
   photography) so density does not read as a dark monotone.
5. **MINOR-1, MINOR-3** - per-route og:image; verify venue map paints.

### To a new engine hardening branch
1. **MAJOR-1** - bring the Lighthouse gate up to the law (run against the
   preview/warmed-prod not localhost; add desktop; raise perf floor toward 0.95
   or get an explicit founder amendment of the law) and resolve Issue #42
   (next/image optimiser cold-start) driving the LCP/perf variance.
2. **MAJOR-2** - protect long-tail `/culture/*/[city]` ISR from cold-concurrency
   pool exhaustion (warm strategy / query indexing / concurrency cap).
3. **MAJOR-4 (gate gap)** - add `/about`, `/blog`, `/careers`, `/press`,
   `/legal/privacy` to the axe + Lighthouse gate URL list.
4. **MINOR-2** - flip CSP from Report-Only to enforcing after report-tuning.

---

## SCOPE + LIMITS OF THIS INSPECTION (honest disclosure)
- Lighthouse run locally against the warmed preview (median-of-3, mobile,
  el-audit=1) on a slower-than-CI box; treat absolute perf scores as indicative,
  the gate-config findings as authoritative. Desktop Lighthouse not run (the gate
  defines no desktop run to mirror; flagged as MAJOR-1).
- Design verdicts focused on the worst-case (homepage) + the buyer-critical
  surfaces + the two surfaces the report disputes (organisers, detail). A
  surface-by-surface 1440/768/390 fresh-capture matrix for all ~20 surfaces was
  not exhaustively re-shot; the engine crawl + axe sweep covered every surface
  for health/a11y, and the homepage finding is the binding design issue.
- The paid-money path (live checkout form, Stripe round-trip, confirmation
  success, issued-ticket QR) is correctly staging-gated and was NOT exercised
  (read-only on production; no orders created) - it remains separately certified.
- Forms: structural validation verified; server-side auth error states deferred.
