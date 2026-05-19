# Autonomous Batch Summary - Triad Refactor (draft)

Branch: `autonomous/triad-refactor-draft` (based on `feat/ticketing-v1-steps-5-6`, HEAD `08a3688`).
Run mode: unsupervised autonomous batch, Tab C.
Constraints honoured: no `git push`, no `supabase db push`, no merge. One
commit, prefixed `[AUTONOMOUS-BATCH]`. SUMMARY.md written. Stopped after commit.

Gates at commit time:
- `npx tsc --noEmit`: clean (exit 0).
- `npm run lint`: 0 errors (2 pre-existing warnings in
  `scripts/batch-11-screenshots.mjs`, unrelated, untouched).
- `npm test`: 127 passed (117 prior + 10 new). 0 failures.

This is an initial draft and architectural foundation. Full production
hardening will require iteration on return; the items in "Still needs
iteration" are explicit, not silent deferrals, and require project-manager
sign-off per CLAUDE.md "Definition of Done".

---

## 1. What was implemented

### Design

- `docs/TRIAD-REFACTOR-DESIGN.md` - full design: current defect chain, new
  confirm_order-first flow, POST result contract, Sentry wiring policy,
  dedupe table + claim-first lifecycle, composite idempotency key, cancel
  idempotency, the "wrapper is confirm_order itself" decision, refund
  void retry-safety classification, test plan, and explicit follow-ups.

### Code (closes / advances P2-1, P2-2, P2-6, P2-7, P2-8, P2-9, P3-1, P3-5)

- **`src/app/api/webhooks/stripe/route.ts`** (the core refactor):
  - `payment_intent.succeeded` (non-squad) now runs **confirm_order FIRST**
    as the authoritative gate. The payment row is transitioned to
    `completed` **only after** confirm_order succeeds (P2-1, P2-7).
  - The old completed-guard short-circuit
    (`if (!payment || payment.status === 'completed') return`) is removed:
    a missing payment row throws retryable, and an already-completed
    payment still runs the gate so legacy stuck orders self-repair on
    replay (P2-1).
  - confirm_order / transition / missing-payment failures throw
    `WebhookProcessingError`; POST returns **HTTP 500** so Stripe retries
    the idempotent handler instead of the failure being swallowed behind a
    200 (P2-2).
  - Event-level dedupe wraps the money path via claim-first
    `claimWebhookEvent` / `markWebhookEventProcessed` /
    `markWebhookEventFailed`. A replayed already-processed event is a true
    200 no-op (P2-6).
  - `captureException` added to every catch / hard-error branch in the
    money path: signature failure, top-level dispatch, confirm_order,
    transition, connect-ledger, seats-sold, cache-items, confirmation
    email, plausible, charge.refunded void, and all four squad branches
    (P3-1).
  - `charge.refunded` ticket-void: deliberately NOT made POST-retryable
    (the refund already settled); the idempotent `.not('status','in',...)`
    filter is documented as the retry-safety guarantee and a void failure
    is now captured for operator re-drive (P3-5).
- **`src/lib/payments/webhook-events.ts`** (new): `WebhookProcessingError`
  + claim-first dedupe helpers. Fails open if the dedupe table is
  unreachable (a dedupe outage must not drop a real confirmation).
- **`src/lib/payments/idempotency.ts`** (new):
  `buildPaymentIntentIdempotencyKey({ orderId, amountCents, attempt })`
  -> `pi:<order>:<amount>:a<attempt>` (P2-8).
- **`src/app/actions/checkout.ts`**: both the standard flow and the seat
  flow now use the composite key helper instead of a bare `order_id`, so
  the two flows cannot drift (P2-8).
- **`src/lib/payments/stripe-adapter.ts`**: `cancelPaymentIntent` now
  passes `idempotencyKey: cancel:<intent>` so a retried cancel is a safe
  no-op instead of an error (P2-9).
- **`src/lib/payments/refund.ts`**: the Stripe `refunds.create` call is
  wrapped to `captureException` (order/intent/amount/initiator context)
  then rethrow - caller behaviour unchanged, Sentry now sees it (P3-1).
- **`src/lib/payments/connect-ledger.ts`**: `captureException` added to the
  three hard-abort branches (order not found, org not found,
  order_confirmed credit insert failed). Soft skips stay `console.warn`
  by design (P3-1).

## 2. Test coverage added (+10 tests)

- `tests/unit/webhook-handlers/payment-intent-succeeded.test.ts` (4):
  1. happy path: confirm_order is called strictly before
     transition_payment_status; event marked processed; 200.
  2. confirm_order failure: HTTP 500; transition NOT called; event marked
     failed; captureException called.
  3. replay of an already-processed event_id: 200 `{duplicate:true}`;
     handler (gate) never runs.
  4. signature verification failure: 400; no dispatch; captured.
- `tests/unit/payments/payment-calculator.test.ts` (6): pins CURRENT
  rounding/composition behaviour - platform fee Math.round half-up,
  platform fixed-cents is per-ticket while processing fixed-cents is not,
  discount clamp + absorb hides fees, free-order short circuit (no
  pricing-rules read), tax half-up on discounted subtotal, explicit
  fee_pass_type override. These lock behaviour so the P2-4 fix in PR3 is a
  deliberate reviewed change and pre-PR3 drift fails loudly.

## 3. The webhook_dedupe migration draft - FOUNDER ACTION REQUIRED

`supabase/migrations/20260520000002_webhook_dedupe.sql` is **DRAFT ONLY and
NOT APPLIED**. It creates `public.processed_webhook_events`
(event_id PK, event_type, status check, attempts, last_error, timestamps,
status+created_at index, RLS on with no policy, service_role grants).

The runtime code (`webhook-events.ts`) **fails open** if the table does not
exist yet: `claimWebhookEvent` logs and returns `claimed`, so the webhook
still processes payments correctly using the per-resource idempotency that
already exists. Dedupe becomes active only once the founder applies the
migration via `supabase db push --linked` (then `npm run db:types`), per the
CLAUDE.md security rule. Do not apply via Dashboard or MCP.

Until the migration is applied, `src/types/database.ts` has no
`processed_webhook_events` type; the helper avoids typed table generics so
this does not break `tsc` (verified clean). Regenerate types after apply.

## 4. Still needs iteration (explicit, not silent deferrals)

- **P2-4 rounding correctness fix is PR3, not this PR.** The calculator
  tests here pin current behaviour only.
- Event-level dedupe currently wraps only the `payment_intent.succeeded`
  money path. Squad payments and Connect/payout/dispute branches keep
  existing best-effort + natural-key idempotency. Extending the wrapper is
  a mechanical follow-up (design section 4.4).
- Persisted per-payment `attempt` counter feeding the idempotency composite
  is not wired (the helper is attempt-aware, defaulting to 1). A real
  retry path needs the counter on the `payments` row.
- Confirmation-email send-once ledger: claim-first dedupe closes the
  common replay case; the narrow concurrent-first-delivery-plus-retry
  window for a duplicate email is not separately ledgered yet.
- A single combined `confirm_order_and_complete_payment(order_id,
  payment_id)` RPC was deliberately NOT introduced (would mean rewriting
  the audited money-path confirm_order body). Sequencing against the
  existing atomic gate is the lower-risk draft choice; a combined RPC is a
  future hardening item.
- `@sentry/nextjs` is not installed (SHARED `package.json` change requiring
  project-manager coordination). All `captureException` calls are no-ops
  via the existing stable shim until that lands; wiring them now is free
  and means every payment failure path is instrumented on the day Sentry
  is enabled.

## 5. Files touched

New: `docs/TRIAD-REFACTOR-DESIGN.md`, `src/lib/payments/idempotency.ts`,
`src/lib/payments/webhook-events.ts`,
`supabase/migrations/20260520000002_webhook_dedupe.sql`,
`tests/unit/webhook-handlers/payment-intent-succeeded.test.ts`,
`tests/unit/payments/payment-calculator.test.ts`, `SUMMARY.md`.

Modified: `src/app/api/webhooks/stripe/route.ts`,
`src/app/actions/checkout.ts`, `src/lib/payments/stripe-adapter.ts`,
`src/lib/payments/refund.ts`, `src/lib/payments/connect-ledger.ts`.

Note: `package.json` / `package-lock.json` / `src/types/database.ts` were
NOT modified - no SHARED-file coordination event was triggered by this batch.

---

# PR #26 unblock: migration recovery + merge with main (2026-05-20)

Follow-up autonomous batch to make PR #26 mergeable. Three steps, three
commits, no push / no db push / no merge (Lawal runs those manually).
Gates re-run green on the final merged tree: `npx tsc --noEmit` exit 0,
`npm run lint` 0 errors (same 2 pre-existing unrelated warnings),
`npm test` 127 passed.

## STEP 1 - recover missing migration files (commit `106374c`)

Two migrations were applied to the remote Sydney DB but the task reported
them as absent from this worktree. Findings on investigation, with two
corrections to the task's stated premise that LAWAL SHOULD NOTE:

1. **The prompt path was wrong.** The files do not live in
   `...\eventlinqs-app\supabase\migrations\` (that worktree has neither).
   They exist in the `eventlinqs-app-admin` and `eventlinqs-app-backend`
   sibling worktrees, and in git history on `origin/feat/m6-phase5-refunds-manager`.

2. **`20260502000002_pricing_rules_extension.sql` was NOT actually
   missing.** It was already tracked in this branch via ancestor commit
   `b477b70` (which is also an ancestor of `origin/main`, and the file is
   present in `origin/main`). The recovery write produced byte-identical
   content, so it correctly did not appear in the commit. Net effect: no
   change, file already present and canonical.

3. **`20260503000001_refunds_extension.sql` WAS genuinely missing** and is
   the only file added by commit `106374c`. It was recovered from the
   canonical committed blob `4c9e286` (commit "feat(refunds): add refunds
   schema with enums, RLS, and indexes" on `origin/feat/m6-phase5-refunds-manager`).

   DISCREPANCY TO RECONCILE: the `eventlinqs-app-admin` worktree copy of
   this file has DIVERGED from the canonical committed version (admin raw
   8673 bytes vs canonical 5761 bytes; the `eventlinqs-app-backend`
   worktree copy IS byte-identical to the canonical commit after newline
   normalisation). The prompt instructed recovery "from the admin
   worktree", but the admin copy is not what is committed/on the remote
   branch. I recovered the canonical committed version (== backend
   worktree) because that is the source of truth for what `supabase db
   push` would have applied. If the LARGER admin version is in fact what is
   live on the remote Sydney DB, that is a separate schema-drift problem
   Lawal must reconcile before applying anything - flagged here, not
   silently resolved.

## STEP 2 - merge `origin/main` (merge commit `18643bb`)

The anticipated `src/app/api/webhooks/stripe/route.ts` conflict DID NOT
occur. PR #25's Step 5 confirmation-email work landed in commit `08a3688`,
which is exactly the base this branch's triad refactor was built on, so
Step 5's `route.ts` changes were already present and already integrated by
the original triad refactor. `origin/main` since the merge-base only
changed `.github/workflows/ci.yml`, `src/lib/help-content.ts`, and
`SUMMARY.md`; the first two auto-merged cleanly.

The only real conflict was `SUMMARY.md` (add/add: PR #25's batch summary
vs this branch's triad summary). Resolved to this branch's version -
SUMMARY.md is a per-PR artifact, PR #25's summary is preserved in `main`'s
git history, and STEP 3 rewrites this file anyway.

Step 5 email integration into the triad structure was VERIFIED on the
merged tree (not just assumed). Confirmed ordering in `route.ts`:
`confirm_order` rpc (gate, first) -> throws `WebhookProcessingError` on
failure (HTTP 500, Stripe retries) -> payment transitioned to `completed`
only after the gate -> `sendConfirmationEmail` runs after both -> email
failure is caught, sent to `captureException`, non-fatal, webhook still
returns 200. This is exactly the required money-flow-governs / email-is-
non-critical structure; no code change was needed because the original
refactor already integrated Step 5 correctly.

## STEP 3 - this documentation (commit follows)

Both the migration recovery (with the two premise corrections and the
admin-worktree divergence flag) and the merge resolution are documented
above. Stopped after this commit. No push, no `supabase db push`, no
merge - Lawal runs those manually.

## Commit chain for PR #26 unblock

- `106374c` [AUTONOMOUS-BATCH] migrations: recover refunds and
  pricing_rules ext files applied remote but missing locally
- `18643bb` [AUTONOMOUS-BATCH] merge: resolve conflict with main
  (Step 5 email integration into triad structure)
- (this commit) [AUTONOMOUS-BATCH] docs: SUMMARY for migration recovery
  + merge resolution
