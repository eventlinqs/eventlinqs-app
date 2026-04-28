# Launch blocker priorities — post Pre-Task 5

**Date:** 2026-04-28 (updated post security rotation confirmation)
**Branch:** `feat/sprint1-phase1b-performance-and-visual`
**Status:** Pre-Task 5 closed; performance gate calibrated; Phase 1B complete; security cleanup **DONE** (Sydney DB password rotated, runbook sanitised, Google API key restrictions re-confirmed). This doc inventories the remaining launch blockers and proposes a sequence.

## Summary

**Recommended next task: M6 Stripe Connect.** Four code-work launch blockers remain.

| # | Blocker | Risk | Effort | Status | Sequence |
|---|---|---|---|---|---|
| 1 | M6 Stripe Connect | CRITICAL | 6–8 days | Stubbed | Rail A — **start next** |
| 2 | M7 Admin Panel (minimal) | CRITICAL | 4–5 days | Missing | Rail A — after M6 |
| 3 | Layout Polish (7-viewport sweep) | MEDIUM | 1.5–2 days | Not started | Rail B — parallel with M6 |
| 4 | Logo asset swap | LOW | 0.25 day | Awaiting asset | Rail B — anytime |

**Total remaining critical-path effort:** ≈10–13 working days.

### Done

- ~~Security cleanup (rotate creds)~~ — **DONE 2026-04-28.** Sydney DB password rotated via Supabase Dashboard, runbook redacted, Google API key restrictions re-confirmed. See `docs/sprint1/security-rotation-2026-04-28.md`.

## 1. M6 Stripe Connect — organiser onboarding and payouts

### Current state

Stubbed. Database has the columns, payment adapter handles attendee-side payment intents only, the organiser dashboard page is a placeholder.

| Layer | State | File |
|---|---|---|
| DB schema | Partial | `supabase/migrations/20260101000001_baseline_schema.sql:71-72` — `organisations.stripe_account_id` and `organisations.stripe_onboarding_complete` exist. No connected-account audit table, no payout/transfer table. |
| Payment adapter | Attendee-side only | `src/lib/payments/stripe-adapter.ts` — implements `createPaymentIntent`, `confirmPaymentIntent`, `cancelPaymentIntent`, webhook construction. Zero `accounts.create()`, `accountLink`, `accountSession`, or `transfer.create()` calls. |
| Organiser onboarding UI | Missing | No route exists for `/dashboard/organisation/payouts/onboard`. The "Connect payouts" step in `src/components/dashboard/get-started-checklist.tsx:35-40` links to `/dashboard/organisation` (no payout sub-page). |
| Payouts dashboard | Placeholder | `src/app/(dashboard)/dashboard/payouts/page.tsx` renders the static message "Stripe Connect is being wired for organiser payouts." |
| Spec coverage | Partial | `docs/EventLinqs_Scope_v5.md` defines daily/weekly settlement, multi-currency (AUD/USD/GBP/EUR/NGN/KES/ZAR/GHS), 7-day hold for unverified organisers, negative-balance chargeback handling, rolling-reserve rules. None of this is built. |

### Minimum-viable launch scope

Anything that lets a real organiser onboard, sell tickets, and receive a payout. Defer multi-currency complexity, rolling reserves, and chargeback dashboards.

1. **Stripe Connect Express onboarding** (1.5 days)
   - Create connected account on organisation creation or first event publish.
   - Generate `accountLink` for hosted onboarding redirect.
   - Webhook handler for `account.updated` to update `stripe_onboarding_complete` + `charges_enabled` + `payouts_enabled` flags.
   - Minimum schema additions: extend `organisations` with `stripe_charges_enabled`, `stripe_payouts_enabled`, `stripe_details_submitted` booleans.

2. **Destination charges with application fees** (1 day)
   - Update `stripe-adapter.ts:createPaymentIntent` to accept `transfer_data.destination` (the organisation's connected account) and `application_fee_amount` (computed by `Pricing Service`).
   - Update checkout server action at `src/app/actions/checkout.ts` to pass these values.

3. **Payouts dashboard** (2 days)
   - Replace placeholder at `src/app/(dashboard)/dashboard/payouts/page.tsx` with: balance summary (available + pending), recent payouts list, recent transactions list, "Open Stripe Express dashboard" button (uses `accounts.createLoginLink`).
   - Server-side data fetched via the connected-account-scoped Stripe client.

4. **Get-started checklist wiring** (0.25 day)
   - `src/components/dashboard/get-started-checklist.tsx`: derive `connectPayouts` from `stripe_charges_enabled && stripe_payouts_enabled`. Update CTA to deep-link `/dashboard/organisation/payouts/onboard`.

5. **Webhook handler hardening** (1 day)
   - Verify `account.updated`, `payout.created`, `payout.paid`, `payout.failed` handlers are idempotent.
   - Persist webhook events to a dedicated audit table for reconciliation.

6. **Tests** (1 day)
   - Stripe Connect test-mode end-to-end: create org → onboard → publish event → buy ticket → see transaction in payouts dashboard.

7. **Operational setup** (0.25 day)
   - Add Stripe Connect webhook endpoint to Stripe dashboard pointing at `/api/webhooks/stripe`.
   - Confirm `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are in Vercel prod env.

**Estimated effort:** 6–8 days for one engineer.

**Deferred to post-launch:** Multi-currency handling beyond AUD, rolling reserves, chargeback dashboard, daily reconciliation cron, instant payouts.

## 2. M7 Admin Panel — minimum viable

### Current state

**Missing entirely.** No `src/app/(admin)/` or `src/app/admin/` route group. No admin auth gate. Service-role client (`src/lib/supabase/admin.ts`) is in use only for organiser dashboard reads.

The full scope at `docs/EventLinqs_Scope_v5.md` §3.18 covers platform metrics, user management, event moderation, financial oversight, promotion management, support tools, daily reconciliation, **and the non-negotiable pricing rules editor**. Attempting all of that pre-launch is a multi-week effort.

### Minimum-viable launch scope

Anything that lets the platform owner approve organisers and adjust fees in production without a code deploy. Everything else can be deferred.

1. **Admin auth gate** (0.5 day)
   - Route group at `src/app/(admin)/admin/` protected by middleware that checks `users.role === 'admin'`.
   - 403 redirect for non-admins.

2. **Organiser approval queue** (1 day)
   - Page at `/admin/organisations` listing organisations with `status = 'pending'`.
   - Approve / suspend actions that flip `organisations.status`.
   - Email notification to organiser on approval (Resend template).

3. **Pricing rules editor** (2 days) **[NON-NEGOTIABLE per scope §3.18]**
   - Page at `/admin/pricing-rules`.
   - List + create + version pricing rules (`platform_fee`, `fixed_fee`, `featured_listing`, etc.) per scope §3.18.1.
   - All changes append a new versioned row; no in-place edits.
   - Audit log: `admin_id`, `rule_id`, `old_value`, `new_value`, `created_at`.

4. **Basic platform metrics** (1 day)
   - Page at `/admin` with: total organisations, active events, total revenue (last 30 days), pending approvals count.
   - Read-only; no charts; just numbers.

5. **Tests** (0.5 day)
   - Auth-gated routes 403 for non-admins. Pricing rule version increments. Approval flips org status.

**Estimated effort:** 4–5 days for one engineer.

**Deferred to post-launch:** Event moderation queue, content review, promotion management, support tools, chargeback dashboard, daily reconciliation, BigQuery export.

## 3. Layout Polish — 7-viewport sweep

### Current state

Spacing tooling and constants are in place and applied correctly:

- `src/lib/ui/spacing.ts:23-29` defines `SECTION_DEFAULT = 'py-16 sm:py-24'`, `SECTION_TIGHT = 'py-12 sm:py-16'`, `HEADER_TO_CONTENT = 'mt-8'`.
- Homepage section components use them: `ThisWeekSection` at `:18`, `CulturalPicksSection` at `:63`, `ForOrganisers` split at `src/app/page.tsx:299`.

### Known issues

1. **Homepage second-row spacing** flagged by Lawal (referenced in this report) but no specific selector or screenshot. Needs visual review.
2. No TODO comments mentioning layout/spacing/polish anywhere in `src/app` or `src/components`. The flag is purely visual, not coded.

### Recommended approach

1. **Run a 7-viewport visual sweep** (0.5 day)
   - Viewports: 360 (Pixel 5 / Galaxy S20), 390 (iPhone 13/14), 414 (iPhone Pro Max), 768 (iPad portrait), 1024 (iPad landscape), 1280 (laptop), 1920 (desktop).
   - Capture homepage, `/events`, `/events/browse/melbourne`, `/event-detail/[slug]`, `/organisers`, `/pricing` at each viewport.
   - Flag any inconsistent vertical rhythm, awkward gutters, broken card grid wraps.

2. **Triage the second-row spacing flag** (0.25 day)
   - Lawal walks through the homepage at three viewports and points at the specific row.
   - Produce a single PR with the targeted fix.

3. **Address remaining flagged issues** (1 day)
   - Apply per-issue fixes using `SECTION_TIGHT` / `SECTION_DEFAULT` rather than ad-hoc `py-*` values.

**Estimated effort:** 1.5–2 days for engineer + Lawal review pairing.

## 4. Logo asset swap

### Current state

Per `CLAUDE.md`: "The logo does not exist yet. Use text 'EVENTLINQS' as a placeholder in navigation and branding components."

### Action

1. Receive logo asset from Lawal in PNG (light + dark variants) and SVG.
2. Add to `public/brand/logo-light.svg`, `public/brand/logo-dark.svg`, `public/brand/wordmark.svg`.
3. Replace the text placeholder in: `SiteHeader` brand link, `BottomNav` (if present), email templates, OG image generator, favicon.
4. Visual regression check.

**Estimated effort:** 0.25 day once asset is delivered.

## 5. Security cleanup — rotate three exposed credentials

### Current state — **DONE 2026-04-28**

Full record at `docs/sprint1/security-rotation-2026-04-28.md`. Summary:

- Sydney DB password rotated via Supabase Dashboard (operator-confirmed in chat).
- Runbook sanitised; old leaked credential no longer authenticates against the Sydney project.
- Google Maps + PSI API key restrictions re-confirmed in Cloud Console.
- Service-role key never exposed (was a placeholder in the runbook).
- Anon key rotation deferred as optional post-launch hygiene (low-severity by design — `NEXT_PUBLIC_*` ships in client bundles regardless).
- Git history retains the rotated value but it no longer authenticates. Full git-history scrub deferred unless the repo is ever made public.

Commits: `4f61813` (runbook redaction) → `8f39285` (handoff doc) → `f9a5d21` (launch-blockers update) → this commit (rotation confirmation).

## Recommended sequence

```
Week 1 (mostly parallel):
  Day 0   Operator: ~5 min Supabase Dashboard rotation + Cloud Console
          re-confirm (closes security cleanup completely).
  Day 1   Rail A: M6 Stripe Connect onboarding flow
          Rail B: Layout 7-viewport visual sweep capture
  Day 2   Rail A: M6 destination charges + checkout integration
          Rail B: Layout polish triage with Lawal
  Day 3   Rail A: M6 payouts dashboard
          Rail B: Layout polish fixes
  Day 4   Rail A: M6 payouts dashboard continued
          Rail B: Logo swap if asset delivered
  Day 5   Rail A: M6 webhook hardening + tests

Week 2:
  Day 6   Rail A: M6 polish + smoke test in Stripe test mode
  Day 7   Rail A: M7 admin auth gate + organiser approval queue
  Day 8   Rail A: M7 pricing rules editor (foundation)
  Day 9   Rail A: M7 pricing rules editor (versioning + audit log)
  Day 10  Rail A: M7 platform metrics + tests
  Day 11  Rail A: End-to-end smoke: real org onboards, publishes event, sells ticket, payout settles, admin sees it
```

**Critical-path total:** 10–13 working days. **Recommended next code-work task: M6 Stripe Connect.**

**Recommended sequencing rationale:**
- M6 must come before M7 because the pricing rules editor in M7 directly drives the application fees applied in M6's destination charges. Building M7 first and then retrofitting M6 risks two reworks of the fee plumbing.
- Security cleanup runs first because the exposed DB password is a standing risk; doing it now is cheap.
- Layout polish runs in parallel because it's pure frontend with no dependency on M6/M7 backend work.
- Logo swap is dependency-on-Lawal and lands when asset arrives.

## Out of scope for this launch

These are explicitly deferred to post-launch sprints, with reasoning:

- **Performance perf re-grind.** Documented at `docs/sprint1/pre-task-5-final-report.md`. Resume with RUM data, not simulator runs.
- **M6 multi-currency, rolling reserves, chargeback dashboard, daily reconciliation cron.** Required by scope but not first-organiser-revenue blockers.
- **M7 event moderation, support tools, BigQuery exports.** Required by scope but not platform-launch blockers.
- **Module M8+** (notifications, search advanced features, social, virtual queue advanced, etc.) — already partially built or queued for later sprints; not launch blockers.

## Evidence & references

- Pre-Task 5 final report: `docs/sprint1/pre-task-5-final-report.md`
- Calibrated Lighthouse gate: `lighthouserc.json` (commit `3277490`)
- Scope: `docs/EventLinqs_Scope_v5.md` §3.18 (Admin Panel), payments § (M6), §4.1 (Security)
- Module specs present: `docs/modules/M{1-4}*.md`. **M5/M6/M7 spec files do not yet exist** — recommend creating `docs/modules/M6-stripe-connect.md` and `docs/modules/M7-admin-minimal.md` once scoped, mirroring the M3/M4 structure.
- Get-started checklist: `src/components/dashboard/get-started-checklist.tsx`
- Payouts placeholder: `src/app/(dashboard)/dashboard/payouts/page.tsx`
- Stripe adapter: `src/lib/payments/stripe-adapter.ts`
- Spacing constants: `src/lib/ui/spacing.ts:23-29`
- Sydney runbook (credentials to rotate): `docs/sprint1/sydney-migration-runbook.md:70-73`
