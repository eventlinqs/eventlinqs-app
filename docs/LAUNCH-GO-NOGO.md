# EventLinqs Launch GO / NO-GO (nationwide)

One reconciled, evidence-backed launch checklist. Every launch-necessary item has
a status, an owner, and proof where claimed DONE. Nothing is marked DONE without
evidence. Items only the founder can verify (third-party dashboards, credential
rotation) are FOUNDER-MANUAL, never DONE.

- Date: 2026-06-19 (pass 2 - execution + multi-branch reconciliation)
- Primary branch: `feat/home-rebuild`, tip `d095d4f`
- Warmed preview audited:
  `https://eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app`
  (public, HTTP 200, real app served - title "EventLinqs", not an auth wall)
- Sources reconciled: (1) founder pre-launch hardening checklist; (2)
  `docs/benchmark/system-pass/LAUNCH-DEFECT-REGISTER.md`; (3) CLAUDE.md + memory;
  (4) the in-flight fix branches, verified by `git show` this pass.
- Re-run procedure: `docs/playbooks/LAUNCH-AUDIT-PLAYBOOK.md`.
- Status vocabulary: DONE (proof attached) / OPEN (named owner) / FOUNDER-MANUAL
  (only the founder can close it).
- CRITICAL CONTEXT: this is a MULTI-BRANCH effort. The launch fixes are NOT all on
  one branch; each lives on a dedicated branch (verified below). GO requires those
  branches to land on the launch line, not just to exist. Do not duplicate a fix
  across branches (it creates merge conflicts) - this pass reverted such overlaps.

## Fix status by branch (verified 2026-06-19 pass 2 via `git show`)

| Item | Owning branch | State on that branch | Proof (verified this pass) |
|---|---|---|---|
| RES-01/02 (qty cap) | `feat/home-rebuild` | DONE (commit `6d69761`) | `src/lib/reservations/validation.ts` + test 6/6 |
| FUN-01/03 (display==charge) | `feat/home-rebuild` | DONE (commit `1196b5d`) | `src/lib/checkout/pricing.ts`, page reuses `getDynamicPriceMap`; test 12/12 |
| FUN-04 (fail-closed on items insert) | `feat/home-rebuild` | DONE (commit `d70887e`) | `checkout.ts` deletes order + returns error before charge |
| PAY-01 (payout schedule) | `feat/home-rebuild` | DONE interim (commit `8d8c2aa`) | explicit connected-account schedule set; founder to confirm the model |
| MOB-01 (hero scale) | `feat/home-rebuild` | DONE (commit `d095d4f`, this pass) | CategoryHeroEmpty -> `.hero-marketing` + text-5xl cap; build green |
| MOB-02 (next/image in feature code) | `feat/home-rebuild` | DONE (commit `d095d4f`, this pass) | squad/queue/sold-out/CategoryHeroEmpty -> media components; tsc/eslint/vitest 374/build green |
| HARD-01 (apex->www canonical) | `fix/hardening-security` (PR #98) | DONE | `src/proxy.ts` apex->www 308; `getSiteUrl`/`getAppUrl` default www |
| HARD-07 (no localhost redirect) | `fix/hardening-security` (PR #98) | DONE | 3 Stripe Connect routes use `getAppUrl()` |
| AUTH-02 (2FA proof gate) | `fix/hardening-security` (PR #98) | DONE | `getAdminSession` requires `hasValidTwoFactorProof`; buyer `/login` session rejected from `/admin` |
| PAY-02 (revenue nets refunds) | `fix/hardening-security` (PR #98) | DONE | orders/admin GMV via `aggregateGmv` net of completed refunds |
| HARD-03 (Mapbox restriction) | `fix/hardening-security` (PR #98) | RUNBOOK shipped | `scripts/verify-mapbox-restriction.mjs` (founder still restricts in console) |
| INFRA-01 (Upstash Sydney) | `fix/hardening-security` (PR #98) | RUNBOOK shipped | `scripts/verify-upstash-sydney.mjs` (founder still provisions) |
| HARD-06 / MIG-01 (migration push) | `fix/hardening-security` (PR #98) | SQL + verify shipped | `verify-mig-20260608000004.sql` (founder runs `db push`) |
| AUTH-01 (SSR middleware) | n/a | FALSE PREMISE - already wired | `src/proxy.ts` imports + calls `updateSession` with a matcher (Next 16 renamed middleware.ts -> proxy.ts). Do NOT add `src/middleware.ts` (build error). Register entry retired. |
| AUTH-03 (admin inactivity timeout) | `feat/auth-defects-fix` (suspected) | UNVERIFIED | confirm on that branch; otherwise OPEN |
| INFRA-02 (Vercel `syd1` pin) | infra/`feat/launch-hardening-nationwide` | OPEN | not yet confirmed on any branch; must land where vercel.json is owned (reverted from this branch to avoid a config conflict) |

## VERDICT: NO-GO (closing fast - most code fixes are DONE, spread across branches)

The code-level defects are largely fixed and verified; the remaining gate is
INTEGRATION (land the branches on the launch line) plus the founder-only items.
Blocking set:

- INTEGRATION: merge/reconcile `fix/hardening-security` (PR #98), `feat/home-rebuild`
  (PR #81), and `feat/auth-defects-fix` onto the launch line with no regressions.
  Until they converge, no single deployable branch carries all fixes. Owner: Founder.
- PERF-01 - mobile Lighthouse performance 57 (median) vs the 95+ law. OPEN. Not
  addressed by MOB-02 (the homepage hero is untouched by that change). Owner: perf
  lane / Issue #42, or a founder waiver of the 95+ law per the documented gate gap.
- PAY-01 - interim payout schedule is committed; FOUNDER must confirm the model
  (the value chosen and whether the M7 disbursement trigger is wired). Owner: Founder.
- HARD-06 / MIG-01 - migration `20260608000004` still unapplied on remote (confirmed
  live again this pass). Owner: Founder (`db push`).
- FOUNDER-MANUAL dashboards/secrets: Supabase Site URL set to the www host (code now
  defaults www via PR #98, but the dashboard value must be set); Resend domain DNS;
  Mapbox token restriction; Upstash Sydney provision on the paid plan; rotate the
  Sydney DB password + Google Maps key + PSI key; Stripe live-mode round-trip.
- INFRA-02 - Vercel `syd1` region pin must land on the infra branch.
- AUTH-03 - confirm the admin inactivity timeout is wired (or wire it).

GO is reachable once the branches converge and the founder-only items close;
nothing here is architectural. The buyer money-path core is sound (atomic holds,
webhook-driven issuance, fee single-source, webhook idempotency - register
"What PASSED").

## What this pass (pass 2) actually changed

- Committed MOB-01 + MOB-02 on `feat/home-rebuild` (`d095d4f`): the only worklist
  items in this branch's lane that were unclaimed by another branch. Gate battery
  green (tsc 0, eslint 0, vitest 374/374, production build green).
- Verified (did NOT duplicate) that HARD-01/HARD-07/AUTH-02/PAY-02 are DONE on
  `fix/hardening-security` (PR #98), and that FUN-01/03/04, RES-01/02, PAY-01-interim
  are DONE on `feat/home-rebuild`. Reverted my own overlapping edits to HARD-07,
  PAY-02, and INFRA-02 to avoid creating conflicting duplicate implementations.
- Retired AUTH-01 as a false premise (proxy.ts is the Next 16 middleware entry and
  already wires `updateSession`).
- Re-confirmed live: migration `20260608000004` still unapplied; Redis still
  non-Sydney (health endpoint 201 ms).
- Could NOT close (no access, by design): all FOUNDER-MANUAL dashboard/secret items
  and the branch integration. These are not defaultable safely by me.

---

## PERF-01 - Lighthouse, run this pass (warmed preview, not localhost)

Lighthouse 13.1.0, Chrome stable, against the warmed branch-alias preview.
Three runs per form factor, median reported. Homepage `/` (the hero LCP-risk
page). Screenshots are the Lighthouse final-screenshot of the median run, proving
the real app was audited.

| Form factor | Performance (median) | Accessibility | Best practices | SEO | LCP | TBT | CLS | Verdict vs 95+ |
|---|---|---|---|---|---|---|---|---|
| Desktop | 96 (90 / 97 / 96) | 100 | 100 | 100 | ~1.0 s | ~90 ms | 0 | PASS |
| Mobile | 57 (50 / 60 / 57) | 100 | 100 | 100 | ~4.7 s | ~1,130 ms | 0 | FAIL |

- Desktop PASSES the 95+ law (perf median 96; a11y / BP / SEO all 100).
- Mobile FAILS on performance only (median 57). Root cause is LCP ~4.7 s and TBT
  ~1.1 s on the hero page, consistent with Issue #42 (next/image optimiser
  cold-start) and the next/image feature-code bypasses (register MOB-02).
  Accessibility, best-practices, and SEO are 100 on mobile too.
- Evidence (committed): `lighthouse-2026-06-19/desktop-median-perf96.jpg`,
  `lighthouse-2026-06-19/mobile-median-perf57.jpg`. Raw reports
  (`home-{desktop,mobile}-{1,2,3}.report.{html,json}`) are on disk in the same
  folder, gitignored as heavy + regenerable.
- Note (founder ruling routed in CLAUDE.md gate gap 1): the live Lighthouse CI
  floors perf at 0.80 and runs the hero pages at warn-level, so the 95+ law is not
  currently gate-enforced. Either the 95+ law is met on mobile (Tab B / Issue #42)
  or the law is amended to the operating reality with founder sign-off. Until one
  happens, mobile perf is a NO-GO line item.
- Owner: Tab B (mobile LCP / Issue #42) + Founder (law-vs-reality ruling).

---

## Source 1 - Founder pre-launch hardening checklist

NOTE: for CURRENT status use the "Fix status by branch (pass 2)" matrix above -
it is authoritative. The table below is the pass-1 detail (evidence + owner
action) and still holds for the FOUNDER-MANUAL items; rows fixed in pass 2
(H1/HARD-01, H8/PAY-02, plus the runbooks for H3/H5/H9) are reflected in the matrix.

| # | Item | Status | Evidence / Owner action | Blocks launch |
|---|---|---|---|---|
| H1 | Supabase Auth Site URL = `https://www.eventlinqs.com` | FOUNDER-MANUAL | Code redirect logic is clean (built from `window.location.origin`: `src/components/auth/signup-form.tsx:35-37`, `login-form.tsx:68`), but `getSiteUrl()` defaults to the apex `https://eventlinqs.com` (`src/lib/site-url.ts:34-46`) and Vercel serves BOTH apex and www. Founder: set Supabase -> Auth -> URL Configuration Site URL to the chosen canonical host, add `/auth/callback` + `/auth/reset-password` to the redirect allowlist, and set `NEXT_PUBLIC_SITE_URL` in Vercel Prod to match. Proof = a screenshot of the URL Configuration page. | YES |
| H2 | Resend SMTP for `noreply@eventlinqs.com` | DONE (code) + FOUNDER-MANUAL (DNS) | Code DONE with proof: FROM is `EventLinqs <noreply@eventlinqs.com>` everywhere (`src/lib/payouts/email.ts:28`, `src/app/api/webhooks/stripe/route.ts:1118,1319`); no `onboarding@resend.dev` anywhere. Founder: confirm `eventlinqs.com` is Verified in Resend (SPF/DKIM/DMARC green); if Supabase Auth emails route via Resend SMTP, set that in Supabase -> Auth -> SMTP. Proof = Resend Domains screenshot. | YES (until DNS verified) |
| H3 | Mapbox token restricted to `eventlinqs.com` | FOUNDER-MANUAL | Token is public and ships in the client bundle (`NEXT_PUBLIC_MAPBOX_TOKEN`, used in `src/components/features/city/city-map.tsx:92`). Founder: add a URL restriction (`eventlinqs.com`, `www.eventlinqs.com`, preview host) on the `pk.*` token in Mapbox. Proof = token-settings screenshot. | No (security / cost risk; do before launch) |
| H4 | Vercel `/events` cache headers | DONE | Proof: `src/app/events/page.tsx:34` `export const revalidate = 60`; edge `CDN-Cache-Control: public, s-maxage=60, stale-while-revalidate=300` at `next.config.ts:106-114`. Not force-dynamic, not over-cached. Owner: verified (reconciliation lead). | No |
| H5 | Upstash Redis in Sydney on the paid plan | OPEN (confirmed NOT Sydney) + FOUNDER-MANUAL | LIVE PROOF this pass: `GET /api/health/redis` x3 returned `region:"unknown"`, `latencyMs: 201-202` (trans-Pacific RTT; a Sydney instance reads <20 ms). The live URL `prepared-stork-113798.upstash.io` has no region prefix. Founder: provision an `ap-southeast-2` Upstash DB on the paid plan, cut `UPSTASH_REDIS_REST_URL`/`TOKEN` over in Vercel, decommission the old one (`docs/hardening/phase1/upstash-sydney-setup.md`). Tab D: pin Vercel functions to `syd1` (`vercel.json` has no `regions` key today - INFRA-02) or Sydney Redis still loses. Proof = health endpoint median <20 ms. | No (perf degradation; Postgres stays authoritative) - but a founder-required hardening item |
| H6 | `getSession` replaced by `getUser` server-side | DONE | Proof: grep this pass - the only `getSession` call sites are client-side UI gates (`src/components/auth/reset-password-form.tsx:20`, `src/components/features/events/save-event-button.tsx:39`); the third hit is a comment in `src/lib/payouts/auth.ts:23`. Every server-side trust decision uses `getUser()` with null handled. Owner: verified. CAVEAT: AUTH-01 (the SSR middleware is never wired) is a separate auth gap - see P1 set. | No (clean) |
| H7 | Missing `/public/cities/*.svg` assets | DONE | Proof: only `melbourne.svg`, `sydney.svg`, `_fallback.svg` exist and ALL references are guarded by the `LOCAL_CITY_SVG` allowlist (`src/lib/events/home-queries.ts:145`) with a regression test (`tests/unit/media/city-svg-exists.test.ts`). No broken city-svg references. Owner: verified. | No |
| H8 | Stripe revenue card rounding bug | OPEN | Reconciliation: the rounding ARITHMETIC is correct (single `/100` + `toFixed(2)` / integer-cents). The real defect (register PAY-02) is inclusion-scope: revenue/net cards still sum fully-refunded orders at full original `total_cents`. Confirmed STILL OPEN this pass: `src/app/(dashboard)/dashboard/events/[id]/orders/page.tsx:75-81` filters in `'partially_refunded','refunded'` then sums `total_cents`. Owner: Tab B. | No (display-only, no mis-charge) - fix before launch |
| H9 | Migration drift reconciled | OPEN | Confirmed live this pass via `supabase migration list --linked`: `20260608000004_admin_user_capability_overrides` is Local-only (empty Remote); the other 39 match. The admin capability feature errors against prod until applied. Founder: `supabase db push --linked` from a tree on this branch, then verify via `supabase_migrations.schema_migrations`. Proof = migration-list with a populated Remote for `20260608000004`. | YES |
| H10 | Rotate Sydney DB password | FOUNDER-MANUAL | Not verifiable or doable from the repo (secret). Founder: rotate in Supabase -> Settings -> Database, update `DATABASE_URL` / pooler strings in Vercel envs, redeploy. Proof = rotation timestamp + a green post-deploy smoke. | YES (if the old password was ever exposed) |
| H11 | Rotate Google Maps API key + PSI key | FOUNDER-MANUAL | Not verifiable from the repo. Founder: regenerate the Google Maps key (and apply HTTP-referrer + API restrictions) and the PageSpeed Insights key in Google Cloud Console, update the Vercel envs, redeploy. Proof = new key ids + restriction screenshot. | YES (if exposed) |

---

## Source 2 - Register defect roll-up (current status this pass)

NOTE: superseded for CURRENT status by the pass-2 branch matrix above. Pass-2
reality: PAY-01 DONE-interim, FUN-01/03/04 DONE, RES-01/02 DONE, MOB-01/02 DONE
(all on `feat/home-rebuild`); AUTH-02, HARD-01, HARD-03, HARD-07, PAY-02 DONE on
`fix/hardening-security` (PR #98); AUTH-01 retired (false premise). Still OPEN:
PERF-01 (mobile), AUTH-03, INFRA-02, plus the FOUNDER-MANUAL set and branch
integration. The table below is retained as the pass-1 detail record.

Full detail in `docs/benchmark/system-pass/LAUNCH-DEFECT-REGISTER.md`.

### P0
| ID | Item | Status | Owner | Blocks |
|---|---|---|---|---|
| PAY-01 | Connected accounts have no payout schedule (Stripe default daily) | OPEN | Founder (decide model) + Tab B (apply in `createExpressAccount` + backfill `accounts.update`) | YES |

### P1 (must fix before launch)
| ID | Item | Status | Owner | Blocks |
|---|---|---|---|---|
| AUTH-01 | SSR middleware never wired (no token refresh / central protection) | OPEN | Tab B | YES |
| AUTH-02 | Admin gate does not assert 2FA/AAL on the live session | OPEN | Tab B | YES |
| AUTH-03 | Admin inactivity timeout is dead code | OPEN | Tab B | YES |
| INFRA-01 | Upstash not in Sydney (live 201 ms) | OPEN | Founder + Tab D | No (perf) - see H5 |
| PAY-02 | Revenue/net cards count refunded orders at full value | OPEN | Tab B | No (display) - see H8 |
| FUN-01 | Checkout display total != charged (dynamic pricing) | OPEN | Tab B | YES (P0 if a launch event uses dynamic pricing) |
| FUN-03 | Seat-mode display total != charged | OPEN | Tab B | YES (seated launch events) |
| FUN-04 | `order_items` insert failure swallowed -> paid order, no tickets | OPEN | Tab B | YES |
| HARD-01 | Supabase Site URL / canonical host | FOUNDER-MANUAL | Founder | YES - see H1 |
| HARD-03 | Mapbox token unrestricted | FOUNDER-MANUAL | Founder | No - see H3 |
| HARD-06 | Migration drift (`20260608000004`) | OPEN | Founder | YES - see H9 |
| HARD-07 | Stripe Connect routes fall back to localhost if `NEXT_PUBLIC_APP_URL` unset | OPEN (code) + FOUNDER-MANUAL (env) | Tab D (harden fallback) + Founder (confirm Vercel env) | YES (organiser onboarding breaks if unset) |
| MOB-01 | CategoryHeroEmpty live hero exceeds 480px cap + text-6xl | OPEN | Tab B | No (visual law) - fix before launch |
| MOB-02 | `next/image` in feature code on public surfaces | OPEN | Tab B | No (governance) - also feeds PERF-01 |
| PERF-01 | Mobile Lighthouse perf 57 < 95 | OPEN | Tab B + Founder (law ruling) | YES - see PERF-01 section |

### Already fixed this session (proof in the register)
| ID | Item | Status | Proof |
|---|---|---|---|
| RES-01/02 (quantity-cap) | Reservation quantity capped at 20 < tier `max_per_order` -> "Invalid reservation data" | DONE | `src/lib/reservations/validation.ts` + `tests/unit/reservations/validation.test.ts` 6/6 (register "Fixes applied") |

### P2 / P3
Not launch-blocking. Tracked in the register (INFRA-02, RES-01/02 expiry+cache,
PAY-03/04/05, FUN-02/05/06, AUTH-04/05, SEO-01..10, DATA-01, MOB-03..06, HARD-02,
MOB-07). AUTH-04 (squad pay page null-guard) should be read-and-cleared before
launch as a precaution (raise to P1 if a render path is ungated).

---

## Source 3 - CLAUDE.md + memory cross-checks

- Fee single-source (CLAUDE.md Fee system law): HELD. Displayed == charged through
  the one `getPricingRule` resolver (register "What PASSED"). The 2% vs 2.5%
  question is a single `/admin/pricing` field the founder sets live; no code
  blocker. Confirm the live AU/GLOBAL `pricing_rules` value before launch.
- Hero scale law (one `.hero-marketing`): held on the live homepage; MOB-01 is the
  one live violation (CategoryHeroEmpty), MOB-03/04 are dead-code/landmines.
- Stripe live mode (memory `project_refund_verification_checklist`,
  `project_payout_disbursement`): the live-key round-trip (purchase + refund) and
  the connected-account schedule (PAY-01) are launch-verification items the founder
  runs in live mode. Not closeable from the repo.
- Constitution gate gaps (CLAUDE.md): axe + link-crawler are not yet CI jobs;
  Lighthouse gate is below the 95+ law. These are routed to engine-hardening and
  do not individually block launch, but PERF-01 surfaces the Lighthouse gap as a
  real mobile-perf miss.

---

## Owner worklist (close these, then re-run this file)

### Founder (manual - dashboards / secrets / decisions)
1. PAY-01: decide payout-schedule model (interim `daily` + `delay_days`, or
   `manual` only once the M7 disbursement trigger is wired), then have Tab B apply
   it. NO-GO until decided.
2. H9 / HARD-06: `supabase db push --linked` to apply `20260608000004`.
3. H1 / HARD-01: set Supabase Site URL + redirect allowlist + `NEXT_PUBLIC_SITE_URL`
   to one canonical host (decide apex vs www).
4. H2: verify the Resend `eventlinqs.com` domain (SPF/DKIM/DMARC).
5. H3 / HARD-03: restrict the Mapbox token to `eventlinqs.com`.
6. H5: provision Upstash Sydney (`ap-southeast-2`) on the paid plan, cut over,
   decommission the old DB.
7. H10 / H11: rotate the Sydney DB password, the Google Maps key (+ restrictions),
   and the PSI key; update Vercel envs; redeploy.
8. HARD-07: confirm `NEXT_PUBLIC_APP_URL` is set in Vercel Production + Preview.
9. Stripe live-mode purchase+refund round-trip; confirm the live `pricing_rules`
   fee value.

### Tab B (in-repo code)
1. PERF-01: bring mobile LCP/TBT to the 95+ line (Issue #42 next/image optimiser;
   MOB-02 next/image bypasses). Re-run Lighthouse per the playbook.
2. AUTH-01 (wire `src/middleware.ts`), AUTH-02 (assert AAL2 in `getAdminSession`),
   AUTH-03 (enforce the inactivity timeout).
3. FUN-01 / FUN-03 (reconcile checkout display total with the charged total),
   FUN-04 (abort on `order_items` insert failure, do not charge).
4. PAY-01 apply (after the founder decision); PAY-02 (source revenue from the
   ledger, not full `total_cents`).
5. MOB-01 (CategoryHeroEmpty to `.hero-marketing` scale), MOB-02 (route
   `next/image` through the media components).

### Tab D (infra / env / hardening)
1. INFRA-02: pin Vercel functions to `syd1` (`vercel.json` `regions`).
2. HARD-07 code: change the three Stripe Connect route localhost fallbacks to the
   prod default.
3. Support H5 cut-over (env swap + verify health endpoint <20 ms).

---

## Maintenance protocol (keep this file current)

This is the single GO/NO-GO source. As Tab B and Tab D land fixes and the founder
closes manual items:

1. Flip the item's status to DONE only with attached proof (file:line + passing
   test, a command output, or a dashboard screenshot path). Never DONE on a claim.
2. Update the VERDICT block: remove the item from the blocking set when its proof
   lands.
3. Re-run PERF-01 (the playbook Lighthouse command) after any LCP/perf change and
   replace the medians table + screenshots.
4. Re-run `supabase migration list --linked` and `GET /api/health/redis` to refresh
   H9 and H5 live evidence.
5. Launch flips to GO only when the blocking set is empty and every row above is
   DONE or an explicitly founder-accepted waiver.
