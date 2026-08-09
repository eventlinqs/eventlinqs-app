# Handover: the connected-account lockout

Branch `fix/security-hardening`. Written 2026-08-09 because the brief said to hand
over precisely rather than leave items half done.

**Items 1, 3 and 5 are complete and verified. Item 2 is one third built. Items 4
and 6 are not started.** Nothing below is half-written: every file that exists
compiles, is tested, and does what this document says.

---

## The root cause, proven by reading

`src/lib/stripe/connect-handlers.ts` handles `account.updated` and wrote six
columns:

```
stripe_charges_enabled, stripe_payouts_enabled, stripe_account_country,
stripe_capabilities, stripe_requirements, stripe_onboarding_complete
```

**It never wrote `payout_status`.** The deauthorize handler in
`src/app/api/webhooks/stripe/route.ts` DID write it, setting `'restricted'`.

So `payout_status` was a **one-way door**. Anything could restrict an
organisation; no incoming Stripe event could ever release it. `checkPublishGate`
read `payout_status === 'restricted'` and refused. That is the whole lockout, and
it explains why only an UPDATE against production cleared it.

The half-cleared row is a separate defect with the same origin: the deauthorize
handler owned its own inline column set, so there was no single definition of what
"disconnected" means.

**There is no application-level disconnect path.** Searched: the only disconnect is
the `account.application.deauthorized` webhook. The founder's half-cleared row
therefore came from outside the app (Stripe-side revocation, or direct SQL). The
fix is the same either way: one owner, plus a reconciler that repairs any partial
state it finds.

---

## What is DONE and verified

### Item 1: the divergence, fixed at its root

| Change | File |
|---|---|
| `account.updated` now writes `payout_status`, mirroring `payouts_enabled`, preserving an admin `on_hold` | `src/lib/stripe/connect-handlers.ts` |
| Deauthorize calls the single owner instead of its own inline column set | `src/app/api/webhooks/stripe/route.ts` |
| Webhooks are no longer the source of truth; the Stripe API is | `src/lib/stripe/reconcile-connect.ts` (new) |

### Item 3: atomic disconnect and the migration

`DISCONNECTED_STATE` in `reconcile-connect.ts` is the single definition of a
disconnected row, and `disconnectConnectedAccount()` writes all nine columns in one
UPDATE. A test asserts the object equals the full column set, so a half-cleared row
is unreachable through that function.

`supabase/migrations/20260809000001_payout_status_unset.sql` adds `'unset'`.

**Chosen a fourth value over nullable, and the reason is specific.** The platform
filters with `payout_status <> 'restricted'`, and `NULL <> 'restricted'` evaluates
to NULL rather than TRUE, so a nullable column would silently DROP disconnected
organisations out of result sets instead of including them. Forgetting an `IS NULL`
branch would be an invisible omission, which is the same shape of defect as the one
being fixed. A fourth value keeps NOT NULL and keeps every comparison two-valued.

**YOU RUN THIS:**

```powershell
supabase db push --linked
```

Success criteria are in the migration header, numbered 1 to 4, including the one
that matters: after applying, the founder's organisation must be releasable by
pressing Refresh Stripe status in the browser, with no SQL.

### Item 5: the refusal message

`describeOutstanding()` in `publish-gate.ts` builds the message from Stripe's own
payload. Where `requirements.errors[].reason` exists it is shown **verbatim**,
because Stripe documents it as "A plain language message that explains why the
error occurred and how to resolve it"
(https://docs.stripe.com/connect/handling-api-verification, fetched 2026-08-09).

Four cases are handled and tested: Stripe error reasons, bare requirement keys,
`pending_verification` and `under_review` (both say nothing is needed), and Stripe
reporting nothing outstanding at all. A test asserts the string
"resolve the Stripe issue" can no longer be produced.

### Item 2, one of four surfaces: reconcile before refusing

`checkPublishGate` no longer refuses on the stored columns. When those columns say
"cannot sell", it reconciles against Stripe first and decides on the fresh state, so
**a stale column cannot produce a false refusal**.

The Stripe call is on the refusal path only. An organisation that can already sell
is answered from the row with no network call, so the working path is not slowed.
Both behaviours are tested.

### Verification actually run

```
tsc --noEmit                 exit 0
eslint                       0 errors, 43 warnings (under the 48 baseline)
vitest                       1534 passed, 138 files
connect-reconcile.test.ts    20 passed
```

`tsc` and `vitest` were invoked from `node_modules/` directly, NOT via `npx`.
`node_modules` was missing at the start of this work and `npx tsc` printed "This is
not the tsc command you are looking for" while a piped exit code read as success.
That is the dangling-toolchain footgun in this repo: **do not trust `npx tsc` here.**

### Payment path, as required

3 source files changed. Money modules in the diff: **0**. Verified with:

```
git diff --name-only HEAD | grep -cE 'payment-calculator|application-fee|create-platform-charge|event-transfer|payout\.ts|fee-math|pricing-rules|connect-ledger|refund-service'
0
```

The reconciler writes only the seven derived Stripe-state columns. It never reads or
writes `orders`, `payments`, `payouts`, `pricing_rules` or `organiser_balance_ledger`,
and never touches an amount.

---

## What is NOT done

### Item 2, the other three surfaces

The reconciler is built and callable; these are wiring jobs.

1. **A control on the payouts page.** Add a server action calling
   `reconcileConnectedAccount(createAdminClient(), org.id)` and a button on
   `src/app/(dashboard)/dashboard/payouts/page.tsx`. Authorise with
   `resolveOrganiserScope()` from `src/lib/payouts/auth.ts`, which already returns
   the caller's owned organisation. Label it "Refresh Stripe status". Show
   `outstanding` beneath it when non-empty.
2. **On return from onboarding.** `src/app/api/stripe/connect/return/route.ts:86`
   already calls `retrieveAccount` and writes a partial set. Replace that block with
   a single `reconcileConnectedAccount` call so the return path and the reconciler
   cannot drift.
3. **On a schedule.** New `src/app/api/cron/connect-reconcile/route.ts`, guarded by
   `requireCronAuth` (`src/lib/cron/auth.ts`, already fail-closed). Iterate
   organisations where `stripe_account_id IS NOT NULL`, reconcile each, log the ones
   that changed. Register the path in `vercel.json` crons, which needs founder
   approval per the standing rule.

### Item 4: many businesses, many accounts, one person

Not started, and it is the largest remaining item. What is already known and does
not need re-investigating:

- The schema supports it: one `owner_id` holds 16 organisations on production.
- `resolveOrganiserScope()` (`src/lib/payouts/auth.ts`) uses
  `.eq('owner_id', user.id).maybeSingle()` — **`maybeSingle()` on a set of 16 rows.
  Start here.** This is the most likely place a second organisation breaks, and it
  is also the most likely place one organisation's payout state leaks onto another.
- `resolveSeatingOrganisation()` (`src/lib/organisations/access.ts`) has the same
  `.maybeSingle()` shape.
- Nothing found so far keys on the user's email, but that was not exhaustively
  swept, so treat it as unverified rather than clear.

Each of the six sub-proofs the brief lists needs a live TEST run.

### Item 6: the divergence guard

Not started. Shape: a cron route that reconciles read-only, comparing Stripe against
the row for every connected organisation and reporting mismatches without
correcting them, so a systemic divergence is visible. `outstandingFrom` and
`connectStateFrom` are pure and already exported for exactly this.

### The browser proof

Not done. The brief asks to reproduce the stranded state on TEST and prove recovery
at 390 and 1440 with screenshots. Reproduce by setting, on TEST only, an
organisation with a healthy connected account to
`payout_status='restricted', stripe_charges_enabled=false`, then attempting to
publish a paid event. With this work in place the gate should reconcile and allow
it. **Never on production.**

### Roast rounds

Not run. Two are required before this can be called finished.

---

## The one thing to check before anything else

**Are the live webhook endpoints actually subscribed to `account.updated`?** The
brief asked and I did not verify it, so treat it as unknown. It matters less than it
did, because the reconciler now recovers from a missed event, but a missing
subscription still means every organiser waits for a reconcile trigger instead of
updating immediately.

To check and fix, in the Stripe dashboard:

1. **Developers, then Webhooks**, and open each endpoint pointing at
   `www.eventlinqs.com.au/api/webhooks/stripe`.
2. Confirm the endpoint is a **Connect** endpoint. Connect events are only delivered
   to endpoints listening to connected accounts, and a platform-only endpoint will
   never receive `account.updated` regardless of what is selected.
3. In the event list confirm `account.updated` and
   `account.application.deauthorized` are both selected. If not, **Update details**,
   then **Select events**, search `account.updated`, tick it, and save.
4. Repeat for every endpoint: this repo's notes record the canonical endpoint being
   re-keyed more than once, so more than one may exist.

Stripe's own instruction is to "Establish a Connect webhook URL in your webhook
settings to watch for activity, especially `account.updated` events"
(https://docs.stripe.com/connect/handling-api-verification, fetched 2026-08-09).

---

## An observation worth a decision

An admin `payout_status = 'on_hold'` does **not** currently block publishing a paid
event: `checkPublishGate` only ever refused on `'restricted'`. That may be
deliberate, since a hold is about paying money out rather than taking it in. I did
not change it, because tightening it silently would regress a working surface. If a
hold should also block selling, that is a one-line change and your call.
