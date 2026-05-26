# Payment Audit - 26 May 2026

Scope: the five findings the founder + project manager flagged as launch-critical from the Phase 6 payment audit that lived in a partner-session chat context and was never committed to the repo. This document is the persistent record of those five findings: each one verified against the current code on `origin/main` at `e3b092f`, with file:line evidence, the status as of today, and the remediation owed for anything still open.

Author: live verification by the docs/audit-payment-2026-05-26 session, working from the artefacts already in the repo (`docs/TRIAD-REFACTOR-DESIGN.md`, the FIX-ACL commit `62690cf`, and the live route handlers and CI workflows).

## Summary

Four of the five named critical findings are closed on `main` today. The fifth is structurally in place but not yet enforced. Three smaller surfaces flagged by the P4-3 / P4-7 / P4-9 audit-compliance copy review are still open and are listed under "Open punch list" below.

| Finding | P-code(s) | Status | Where it lives |
|---|---|---|---|
| Silent paid-no-ticket | P2-1, P2-2, P2-6, P2-7 | CLOSED on main | `src/app/api/webhooks/stripe/route.ts` |
| Sentry capture in payment catch paths | P3-1 | CLOSED on main | `src/app/api/webhooks/stripe/route.ts`, `src/lib/payments/*` |
| Refunded ticket scannable | P3-5 | CLOSED on main | `src/app/t/[code]/page.tsx` |
| Auto-refund / tax-invoice / transfer copy (ACL) | P4-3, P4-7, P4-9 | PARTIAL: help-content fix in PR #46 (open); three surfaces still open | `src/lib/help-content.ts`, `src/app/legal/refunds/page.tsx`, `src/components/features/checkout/CheckoutTrustSignals.tsx`, `docs/EventLinqs_Scope_v5.md` |
| CI test gate | P5-2, P5-5 | PARTIAL: workflows exist; branch protection enforcement pending | `.github/workflows/*.yml`, `docs/development/pr-process.md` |

## Finding 1 - Silent paid-no-ticket (P2-1, P2-2, P2-6, P2-7)

**Original defect chain.** Captured in `docs/TRIAD-REFACTOR-DESIGN.md` section 1: the webhook marked the payment row `completed` before calling `confirm_order`, then on a `confirm_order` failure logged the error and returned 200. End state was a paid Stripe charge with no ticket row, no ledger entry, no confirmation email, and no Stripe retry because the 200 told Stripe the event was handled. A manual replay short-circuited at the `payment.status === 'completed'` guard, so the order could never be confirmed by replay either.

**Current code.** `src/app/api/webhooks/stripe/route.ts` lines 52 to 110 implement the triad refactor:

- Line 56 to 57 comment block states the contract: "confirm_order is the authoritative gate (P2-7); the payment row is marked completed only after it succeeds (P2-1); a failure is no longer swallowed behind a 200 (P2-2)".
- Line 81: `claimWebhookEvent` performs the event-level dedupe (P2-6). Duplicate deliveries return early with `{ received: true, duplicate: true }` at line 84.
- Line 89: `handlePaymentSucceeded` runs inside a `try`; an exception calls `markWebhookEventFailed` (line 93), captures to Sentry with full context (lines 94 to 101), and returns 500 at line 108 so Stripe retries on its backoff schedule.

**Inside `handlePaymentSucceeded`:**

- Lines 232 to 240: a missing `payments` row throws `WebhookProcessingError`, mapping to 500 and a Stripe retry, rather than returning early on a 200.
- Lines 252 to 262: `confirm_order` runs FIRST. The function is SECURITY DEFINER with `SELECT ... FOR UPDATE` row-locking the order (verified in `supabase/migrations/20260101000001_baseline_schema.sql`), idempotent (early returns TRUE when already confirmed), and issues tickets inside the same UPDATE via the `AFTER UPDATE` trigger from `20260517000001_ticketing_system_v1.sql`. On error, the payment row stays in its current state and the webhook returns 500.
- Lines 268 to 282: only after `confirm_order` succeeds does `transition_payment_status` mark the payment row complete. The `payment.status !== 'completed'` guard at line 268 lets a replayed delivery still run `confirm_order` and repair a legacy order that the old code left unconfirmed.

**Residual.** The squad-member payment branch (lines 64 to 78) keeps best-effort behaviour for this draft and returns 200 even on handler error. This is documented as a known follow-up in `docs/TRIAD-REFACTOR-DESIGN.md` section 4.4: squad payments are idempotent on natural keys, and event-level dedupe extension to that path is a tracked follow-up, not a launch blocker. It is called out here so the next session does not rediscover it.

**Status.** CLOSED on main for the primary (non-squad) money path. Squad path follow-up tracked in TRIAD-REFACTOR-DESIGN.md section 4.4.

## Finding 2 - No Sentry capture in payment catch paths (P3-1)

**Original defect.** Webhook and refund failures wrote only to `console.error`. With no Sentry capture and Vercel log retention measured in days, a production payment failure was invisible to oncall until a buyer complained.

**Current code.**

- `src/app/api/webhooks/stripe/route.ts`: `captureException` is wired at every `catch` and every hard-error branch in the money path. Verified call sites: line 47 (signature verification), 69 (squad handler), 94 (main money-path handler), 202 (non-money dispatch catch), 304 (Connect ledger throw), 363 (seat-sold update error), 411 (order-items load error for cache refresh), 446 (confirmation email throw), 482 (Plausible setup throw).
- `src/lib/observability/sentry.ts`: stable `captureException(error, context?)` API with PII scrub applied at the boundary, per `docs/TRIAD-REFACTOR-DESIGN.md` section 3.
- Sentry SDK installation closed by PR #41 (merged 24 May), real runtime initialisation closed by PR #45 (merged 25 May). The `captureException` calls are now backed by real event ingestion in Vercel production, not a no-op shim.

**Status.** CLOSED on main.

## Finding 3 - Refunded ticket scannable (P3-5)

**Original defect.** A ticket whose status had moved to `refunded` or `void` after a Stripe refund still rendered a scannable QR on the bearer page. A buyer who had been refunded could still present a working QR at the gate.

**Current code.** `src/app/t/[code]/page.tsx`:

- Line 89: `const isVoided = ticket.status === 'void' || ticket.status === 'refunded'`.
- Lines 110 to 120: when `isVoided`, the page renders an unambiguous red "Refunded - This ticket has been refunded and is not valid for entry" panel in place of the QR.
- Lines 121 to 134: the QR is rendered only in the non-voided branch. The `dangerouslySetInnerHTML` SVG injection is gated by the same `isVoided` guard.
- Code comment at lines 111 to 112 cites "Step 6: a refunded/void ticket must never present a scannable QR" - matching commit `22b1c61 feat(ticketing): Step 6 - refund voids tickets, bearer view hides QR`.

The `/api/tickets/[code]/qr` PNG endpoint (`src/app/api/tickets/[code]/qr/route.ts`) returns the QR PNG to anyone with a valid `(code, secret)` pair regardless of status. That is the email-time QR for the confirmation email. The relevant audit question is whether a refunded ticket is presentable as a credential at the gate. The bearer page is the credential surface, and it now refuses to present the QR for refunded tickets. The PNG endpoint not gating on status is acceptable as long as the gate-side check is the bearer page (which a phone shows from the email link); a stricter version would also gate the PNG endpoint and 404 on void/refunded. Captured here as a future hardening item.

**Status.** CLOSED on main for the primary credential surface (bearer page). PNG endpoint hardening tracked as a future item.

## Finding 4 - Auto-refund / tax invoice / ticket transfer ACL (P4-3, P4-7, P4-9)

**Original defect.** Three Audit Compliance List (ACL) exposures in user-facing copy implied platform-side guarantees EventLinqs does not currently honour:

- **P4-3 auto-refund on cancellation.** Help-centre FAQ and the dedicated cancellation Q&A both said "we are committed to processing these refunds promptly", implying the platform auto-processes refunds. The actual model is organiser-controlled.
- **P4-7 tax invoice.** Buyer FAQ "Can I get a receipt for my ticket purchase?" started with "Yes" and described the confirmation email as a receipt, implying tax-effective documentation.
- **P4-9 ticket transfer.** Buyer FAQ "Can I transfer my ticket to someone else?" said "not available at this time", which reads as a near-term roadmap commitment that has not actually been scoped.

**Current state.**

PR #46 (`fix-acl/help-content-copy`, commit `62690cf`, OPEN as of 26 May) closes the help-content surface for all three findings. Verified replacements per the commit message:

- P4-3: cancellation sub-clause changed to "If an event is cancelled by the organiser, refunds are processed at the organiser's discretion in line with their refund policy stated at point of purchase." Organiser FAQ trailing line changed to "If you cancel an event, ticket holders are entitled to a refund in line with that policy, and you remain responsible for processing those refunds."
- P4-7: buyer FAQ first line changed to "A receipt is issued at point of purchase. For tax invoicing requirements, contact the event organiser."
- P4-9: buyer FAQ changed to "Ticket transfer between buyers is not currently supported. Contact the event organiser directly for any ticket changes."

**Surfaces still open.** The FIX-ACL commit explicitly listed three surfaces it did not touch. Verified open as of `e3b092f` on `origin/main`:

1. **`src/app/legal/refunds/page.tsx` lines 13 and 43-67**: section literally titled "When EventLinqs Guarantees a Refund" (heading + table-of-contents anchor) and three bullets stating "EventLinqs will always process a full refund" for cancellations, reschedules, and material changes. This is the same P4-3 ACL exposure on the **legal source-of-truth surface**, which is the higher-risk surface a buyer would point to in a dispute. **OPEN.**

2. **`src/components/features/checkout/CheckoutTrustSignals.tsx` line 38**: "Money-back guarantee per organiser refund policy" rendered on the checkout sidebar. Same P4-3 class, on the **checkout surface** (the purchase-decision moment, the audit's most weighted exposure). **OPEN.**

3. **`docs/EventLinqs_Scope_v5.md` line 925**: "every purchase generates a tax invoice with: platform name, ABN/VAT number/EIN, buyer details (if provided), event details, line items with tax breakdown, invoice number (sequential per region), and date." Internal scope doc; contradicts the corrected P4-7 help-centre copy. Not user-facing today but it is the document every session reads on start, so it will keep regenerating the original wrong claim downstream unless reconciled. **OPEN.**

**Status.** PARTIAL. PR #46 closes the help-content surface; the three surfaces above remain open.

## Finding 5 - CI test gate (P5-2, P5-5)

**Original defect.** The audit found there was no enforced pre-merge gate that would prevent a PR with failing tests or a failing performance gate from landing on main.

**Current state.**

CI workflows exist and pass on every PR:

- `.github/workflows/ci.yml` jobs: `verify` (lint + tsc + build) and `test` (vitest).
- `.github/workflows/lighthouse.yml` job: `lighthouse` (Lighthouse CI mobile gate, hard-fail per `lighthouserc.json` thresholds).
- `.github/workflows/post-deploy-smoke.yml`: post-deploy curl smoke against production with Resend email alert on failure. Triggered by `workflow_run` on CI completion on main.

Required-status-checks names are documented in `docs/development/pr-process.md` lines 30 to 33:

- `lint · typecheck · build` (from `CI / verify`)
- `test (vitest)` (from `CI / test`)
- `Lighthouse mobile gate` (from `Lighthouse CI / lighthouse`)

**What is missing.** Per the same doc, footer lines 83 to 85:

> Branch protection verified configured: pending.
> Verified rejection of `gh pr merge --admin` on a red PR: pending.

The gates exist in CI but are not enforced by branch protection. Any merge command that bypasses required checks (admin override, or absence of a configured rule) can still land a red PR. The first half of P5-2/P5-5 is closed (workflows exist, tests run); the enforcement half is the open piece.

**Status.** PARTIAL. Remediation is configuration-only (Repo Settings -> Branches -> Branch protection rules), documented step-by-step in `docs/development/pr-process.md` lines 19 to 46, followed by the verification protocol in lines 73 to 80 (open a deliberate red PR, confirm rejection of `gh pr merge --admin`, revert).

## Open punch list (what actually remains before launch)

1. **Merge PR #46** to close the help-content surfaces of P4-3, P4-7, P4-9. Branch: `fix-acl/help-content-copy`. Commit: `62690cf`.

2. **Apply audit-recommended copy to `src/app/legal/refunds/page.tsx`** (the legal source-of-truth surface). Replace the "When EventLinqs Guarantees a Refund" section with copy that puts responsibility on the organiser, mirroring the help-content fix. Highest-risk of the three remaining P4-3 surfaces because it is the document a buyer would cite in a refund dispute.

3. **Update `src/components/features/checkout/CheckoutTrustSignals.tsx:38`**. Replace "Money-back guarantee per organiser refund policy" with copy that does not promise a platform-side guarantee at the purchase-decision moment.

4. **Reconcile `docs/EventLinqs_Scope_v5.md:925`** with the corrected P4-7 copy. Either update the scope doc to reflect "a receipt is issued at point of purchase; tax invoicing handled by organiser", or scope an actual tax-invoice feature for v1 with the engineering, GST/VAT, ABN/EIN, and sequential-numbering requirements stated in that line.

5. **Configure GitHub branch protection on `main`** per `docs/development/pr-process.md` lines 19 to 46. Run the verification protocol (lines 73 to 80) and update the footer when complete. This closes the enforcement half of P5-2/P5-5.

6. **(Future hardening, not launch-blocking)** Gate `src/app/api/tickets/[code]/qr/route.ts` on ticket status so the PNG endpoint also refuses to render a QR for `void` or `refunded` tickets. Belt-and-braces with the bearer-page check at `src/app/t/[code]/page.tsx`.

7. **(Future hardening, not launch-blocking)** Extend webhook event-level dedupe to the squad-member payment path so squad webhooks also return 500-on-retryable-failure instead of best-effort 200. Tracked in `docs/TRIAD-REFACTOR-DESIGN.md` section 4.4.

## Verification method

Each finding above was verified by reading the named file at the named line range on `origin/main` at commit `e3b092f` from this branch on 26 May 2026. Where a fix is referenced as in-flight in another PR, the PR was confirmed open via `gh pr list` and the commit hash was inspected via `git show`. The TRIAD design doc was cross-referenced for P2-1/2/6/7 and P3-1 because the call sites carry P-code references that point back at it.

No code was changed by this audit. The doc itself is the only artefact, and it lives under `audit-v2/` to keep the persistent-audit content together with `AUDIT-COMPREHENSIVE-2026-05-24.md` (the live-execution audit) and `AUDIT-FUNCTIONALITY-2026-05-23.md` (the prior static audit).

— end of audit —
