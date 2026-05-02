# M6 Phase 3-H: Stripe Live Mode Preparation Checklist

**Branch:** `feat/m6-phase3-destination-charges`
**Authored:** 2026-05-02
**Status:** preparation only. Live mode is NOT activated by Phase 3. Activation is founder-gated and ships when launch readiness lands (post-Phase 6, ahead of nationwide go-live in May to mid-June 2026).

**Audience:** Lawal Adams (sole founder, sole authorised live-mode actor). No automated agent or session may flip the live key without explicit founder approval recorded against this checklist.

---

## 0. Why this is its own document

Live mode for a Connect platform is irreversible in operationally meaningful ways: every connected account onboarded through the live OAuth path becomes a Stripe customer relationship, every charge becomes a real ATO/HMRC/IRS record, every webhook misroute creates a real refund-or-reconcile fire. The cost of accidental partial activation is measured in days of cleanup and in trust loss with the organisers who happened to be the test subjects.

Phase 3 ships the *code* that makes live mode safe to flip. Activation itself happens in a single dedicated session with the founder present.

---

## 1. Pre-activation gates (all must be green)

### 1.1 Phase gates (preceding work must be closed)

- [ ] M6 Phase 1 closed (Connect schema, RLS, account row contract) — done 2026-04-28
- [ ] M6 Phase 2 closed (onboarding, OAuth callback, account.updated webhook, charges_enabled / payouts_enabled gating) — done 2026-05-01
- [ ] M6 Phase 3 closed (this phase: destination charges, ledger writes, refund core)
- [ ] M6 Phase 4 closed (payouts dashboard, reserve release scheduler)
- [ ] M6 Phase 5 closed (refund UI, four-source allocator, dispute handling)
- [ ] M6 Phase 6 closed (organiser financial controls, payout method UI, statement download)

Live mode cannot be activated with any of Phases 4-6 outstanding. Reason: refund and payout flows must work end-to-end on real money, not mocks. A live destination charge with no refund UI is an open liability the day a buyer asks for their money back.

### 1.2 Hardening gates (Session 2 must have shipped)

- [ ] Upstash Sydney region active (low-latency rate limiting on the AU buyer path)
- [ ] Sentry error reporting wired into all `src/app/api/webhooks/stripe/**` handlers
- [ ] Idempotency layer verified under concurrent-request load test (k6/Artillery, Session 2 scope)
- [ ] Database backups verified restorable (Supabase PITR confirmed in staging restore drill)
- [ ] `src/types/database.ts` regenerated against the live-equivalent schema, no drift

### 1.3 Admin gates (Session 3 must have shipped)

- [ ] Admin refund tool functional (Session 3 / M7) — required so support can reverse a bad live charge without engineer intervention
- [ ] Admin organiser-suspension tool functional — required so a compromised connected account can be cut off without code deploy
- [ ] Admin financial dashboard shows per-organisation balance and payout state — required for incident triage

---

## 2. Stripe Dashboard prerequisites (live account)

Performed in the Stripe Dashboard under the live account, not test. Each item is a manual founder action.

### 2.1 Platform account configuration

- [ ] Live platform account exists and is fully verified (business verification, bank account, ATO/ABN matched)
- [ ] Statement descriptor configured: `EVENTLINQS` (full) and `ELINQS` (shortened)
- [ ] Connect platform profile published (logo, display name, support email, support URL)
- [ ] Branding assets uploaded (logo, icon, primary colour `#1A1A2E`, accent `#4A90D9`)
- [ ] Connect onboarding type confirmed as Express (matches Phase 2 implementation)
- [ ] Application fee configuration enabled on Connect (allows `application_fee_amount` on PaymentIntents)
- [ ] Currency and country eligibility verified for AU, GB, US, IE, plus EU member states currently in v1 launch geography
- [ ] Live-mode TOS for connected accounts published and current

### 2.2 Webhook endpoints

- [ ] Live webhook endpoint registered at `https://eventlinqs.com/api/webhooks/stripe` (Connect events) AND `https://eventlinqs.com/api/webhooks/stripe/account` (account events) — confirm exact paths against the route files at activation time
- [ ] All 14 Phase 2 events subscribed on the live endpoint:
  - **Payment (5):** `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.succeeded`, `charge.refunded`
  - **Connect (9):** `account.updated`, `account.application.deauthorized`, `account.external_account.created`, `account.external_account.updated`, `payout.created`, `payout.paid`, `payout.failed`, `transfer.created`, `transfer.failed`
- [ ] Live webhook secret captured and stored in Vercel env as `STRIPE_WEBHOOK_SECRET` (production scope only)
- [ ] Webhook signing version confirmed (current Stripe API version `2026-03-25.dahlia`)
- [ ] Test webhook delivery from Stripe Dashboard returns 200 and is visible in Sentry/logs

### 2.3 API keys

- [ ] Live secret key generated and stored in Vercel env as `STRIPE_SECRET_KEY` (production scope only)
- [ ] Live publishable key stored in Vercel env as `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (production scope only)
- [ ] Test keys remain in preview and development scopes; never overlapping
- [ ] Restricted key strategy reviewed: all server-side Stripe calls use the unrestricted secret key inside Fluid Compute functions; no client-side Stripe calls beyond Stripe.js (publishable key only)

---

## 3. Codebase prerequisites

### 3.1 Environment variables (verified set on Vercel production)

- [ ] `STRIPE_SECRET_KEY` (sk_live_*)
- [ ] `STRIPE_WEBHOOK_SECRET` (whsec_* from live endpoint)
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (pk_live_*)
- [ ] `STRIPE_CONNECT_CLIENT_ID` (ca_* from live Connect settings)
- [ ] `NEXT_PUBLIC_APP_URL=https://eventlinqs.com` (production scope)
- [ ] All Supabase env vars confirmed pointed at production project (`gndnldyfudbytbboxesk`)
- [ ] No `STRIPE_TEST_MODE` flag, no environment-conditional Stripe key loading: live keys for production, test keys for preview, period

### 3.2 Pre-cutover code review

- [ ] Search the codebase for hardcoded `acct_test_`, `pi_test_`, `ch_test_`, `re_test_`, `cs_test_` literals. Confirm all are inside `tests/**` only.
- [ ] Confirm `src/lib/payments/refund.ts:__setStripeClientForTests` is only referenced from `tests/**`
- [ ] Confirm `src/lib/stripe/connect.ts` constant `STRIPE_API_VERSION` matches `src/lib/payments/stripe-adapter.ts` literal (`2026-03-25.dahlia`). Drift here is silent and dangerous.
- [ ] Confirm no debug `console.log` of any field starting with `pi_`, `ch_`, `acct_`, `cus_`, `pm_`, `re_`, `seti_`, or any field containing `secret` or `client_secret`
- [ ] Confirm `idempotency_key` is set on every gateway call: search for `gateway.createPaymentIntent` and `stripe.refunds.create` and verify each has a non-empty key
- [ ] Confirm webhook handler returns 200 quickly and writes to ledger off the critical path or wraps DB errors as non-fatal so retries are bounded

### 3.3 Schema state

- [ ] Run `supabase db push --linked --dry-run` against production. Confirm zero pending migrations.
- [ ] Confirm `organisations.stripe_account_id`, `organisations.stripe_charges_enabled`, `organisations.payout_status`, `organisations.payout_tier`, `organisations.stripe_account_country` columns exist in production (Phase 1 migration applied)
- [ ] Confirm `organiser_balance_ledger`, `payout_holds`, `connect_event_log` tables exist in production
- [ ] Confirm RLS policies on `organiser_balance_ledger` (organiser can SELECT own rows; admin client can INSERT) — query `pg_policies` from PowerShell
- [ ] Confirm `pricing_rules` rows for live currencies (AUD, GBP, USD, EUR) are present and current

---

## 4. Smoke-test plan (live mode, dry-run before opening to organisers)

The plan: open a single founder-controlled connected account in live mode, run one $1 destination charge against a real card, confirm the full data path, then refund.

### 4.1 Set up the canary connected account

- [ ] Create a test organiser account in production using the founder's own email
- [ ] Walk through live Connect onboarding for that organiser (real KYC, real bank account, real verification)
- [ ] Confirm `organisations.stripe_charges_enabled` flips to `true` after `account.updated` arrives
- [ ] Confirm row appears in `connect_event_log` with the correct event id and payload hash

### 4.2 Live destination charge ($1 minimum)

- [ ] Create a $1 ticket on a private (unlisted) live event under the canary organiser
- [ ] Buy the ticket using a real personal card (founder's, not a test card)
- [ ] Confirm the PaymentIntent on Stripe Dashboard shows:
  - amount $1
  - `application_fee_amount` matches `platform_fee_cents + payment_processing_fee_cents` from the order row
  - `transfer_data.destination` matches the canary `acct_*`
  - `on_behalf_of` matches the canary `acct_*`
  - statement descriptor "EVENTLINQS"
- [ ] Confirm `payment_intent.succeeded` webhook delivered, 200 returned, `connect_event_log` row written
- [ ] Confirm `organiser_balance_ledger` rows:
  - one `order_confirmed` row with `delta_cents = total - app_fee`
  - one `reserve_hold` row with `delta_cents = -reserveCents` (Tier 1 = 20 percent of organiser share)
- [ ] Confirm `payout_holds` row written with `release_at = event_end + 3 business days` and `hold_type = 'reserve'`
- [ ] Confirm `organisations.hold_amount_cents`, `total_volume_cents`, `total_event_count` updated correctly

### 4.3 Live refund (full)

- [ ] Trigger a full refund via `refundOrder` (admin tool or temporary script, not a public surface)
- [ ] Confirm Stripe Dashboard shows refund with:
  - `reverse_transfer: true`
  - `refund_application_fee: true`
  - metadata `order_id`, `initiated_by`, `platform_reason` populated
  - idempotency key `refund:<order_id>:<amount>:<initiator>` visible in API logs
- [ ] Confirm the platform balance and the connected account balance both reflect the reversal correctly (both should net to zero on this transaction)
- [ ] Confirm `charge.refunded` webhook delivered and processed (Phase 4 ledger reversal will record the offsetting entries; Phase 3 only ships the Stripe-side refund call)

### 4.4 Live partial refund

- [ ] Buy a $2 ticket, refund $1 of it
- [ ] Confirm `application_fee` refund is proportional (50 percent of original app fee returned)
- [ ] Confirm `reverse_transfer` returns 50 percent of organiser share

### 4.5 Live failure modes

- [ ] Attempt a charge with a card that triggers `card_declined`. Confirm:
  - PaymentIntent ends in `requires_payment_method`
  - No ledger row written
  - No `payout_hold` row written
  - Buyer-facing error message is friendly, not a raw Stripe error string
- [ ] Disable the canary connected account's payouts in Stripe Dashboard (`payouts_enabled` → false). Attempt a new charge. Confirm `assertCanCreateDestinationCharge` rejects with `org_payouts_restricted` and the buyer sees a friendly "this organiser cannot accept payments right now" message, not a 500.

---

## 5. Cutover plan (the day live mode opens to organisers)

### 5.1 Sequencing (single founder-controlled session)

1. Confirm all Section 1 / 2 / 3 / 4 boxes are checked, with timestamps
2. Promote the live env vars on Vercel production (Section 3.1)
3. Trigger a Vercel production redeploy (env var changes require redeploy to take effect on Fluid Compute functions)
4. Confirm production build succeeds, all routes return 200
5. Run Section 4.2 ($1 charge) against the canary account on production
6. If Section 4.2 passes, mark live mode active; otherwise, immediately revert env vars to test keys and redeploy
7. Notify project manager (partner Claude) that live mode is active. Update `docs/MASTER-PLAN-V1.md` status.

### 5.2 Communications

- [ ] No public announcement until canary smoke test passes
- [ ] Existing test-mode connected accounts remain test-mode; their data is not migrated. Communicate to any test-mode organisers (likely none in v1) that they need to re-onboard for live mode.
- [ ] Update marketing /pricing page only after live mode is confirmed stable for 24 hours

### 5.3 Rollback plan

If anything in Section 5.1 step 5 fails, or if a Sentry alert fires within 1 hour of cutover:

1. Revert `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_CLIENT_ID`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` to the test-mode values previously stored
2. Trigger Vercel production redeploy
3. For any live charges that landed before rollback: each must be manually refunded from the Stripe Dashboard (live) and the `organiser_balance_ledger` rows reversed by an admin SQL session through the dashboard (do NOT use the read-only MCP)
4. Document the incident in `docs/m6/incidents/` with full timeline before resuming

Rollback is destructive in the sense that it strands any live charges that landed in the window. The cutover plan is built to keep that window minimal (single canary buy, single founder).

---

## 6. Open follow-ups (not blockers, but tracked)

- Phase 4 refund UI (organiser-initiated refunds with the four-source allocator). Until shipped, refunds are admin-only, performed via the function in `src/lib/payments/refund.ts` invoked from a temporary server action or the M7 admin tool.
- Phase 5 dispute handling (charge.dispute.created webhook → admin queue). Until shipped, disputes are watched manually in the Stripe Dashboard and resolved by founder action.
- Stronger refund idempotency (Phase 3 uses `refund:${orderId}:${amountCents}:${initiatedBy}`; Phase 4 should add a dedicated `refunds` row with a content-addressed key)
- Application-fee composition founder review (see `docs/m6/phase3/scope.md` §3.2). The current implementation uses `app_fee = platform_fee + processing_fee`, which deviates from a literal reading of impl plan §1.3. Confirm before live activation.

---

## 7. Sign-off

Live mode activation requires explicit founder confirmation against this checklist. The confirmation is recorded as:

```
[LIVE-ACTIVATION] <ISO-8601 timestamp> Lawal Adams confirms all Sections 1-5 boxes checked.
Canary smoke test passed at <timestamp>. Live mode opened to organisers.
```

posted to `docs/sessions/backend/progress.log`. No agent, no session, no automated job may post this entry. Founder only.
