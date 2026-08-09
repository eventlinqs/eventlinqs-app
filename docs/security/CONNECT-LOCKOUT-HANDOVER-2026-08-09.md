# Handover: the connected-account lockout

Branch `fix/security-hardening`. Last updated 2026-08-09, second session.
Commits: `a787a26` (keystone), then the payouts control, multi-organisation fix and
cron in the commit that follows this document.

**Read the two findings first. They are the reason the rest exists.**

---

## FINDING 1: payout_status was a one-way door

`src/lib/stripe/connect-handlers.ts` handles `account.updated` and wrote six
columns. **It never wrote `payout_status`.** The deauthorize handler in
`src/app/api/webhooks/stripe/route.ts` DID write it, setting `'restricted'`.

So anything could restrict an organisation and **no Stripe event could ever release
it**. Every organiser who was ever restricted would have stayed restricted forever,
and only SQL against production could free them. `checkPublishGate` read
`payout_status === 'restricted'` and refused with "Resolve the Stripe issue" while
Stripe reported the account fully enabled, capabilities `transfers=active` and
`card_payments=active`, zero errors, zero `past_due`, bank account attached.

A third writer had the same omission: `src/app/api/stripe/connect/return/route.ts`
wrote five columns on return from onboarding and also omitted `payout_status`, plus
`stripe_account_country` and `payout_destination`. Three writers, three definitions
of "what Stripe says", one of them a one-way door.

## FINDING 2: the platform was broken for anyone with two businesses

`resolveOrganiserScope()` did:

```ts
.eq('owner_id', user.id).maybeSingle()
if (error) return { ok: false, status: 404, reason: 'no_organisation' }
```

`maybeSingle()` does not return the first row when several match. From the
postgrest-js implementation itself
(`node_modules/@supabase/postgrest-js/dist/index.mjs`):

```js
if (isMaybeSingle && Array.isArray(data)) if (data.length > 1) {
  error = { code: "PGRST116",
    details: `Results contain ${data.length} rows, ...requires 1 row`,
    message: "JSON object requested, multiple (or no) rows returned" }
  data = null; status = 406
}
```

So a user with two or more organisations got `PGRST116`, fell into `if (error)`, and
was told they had **no organisation**. One `owner_id` on production holds **sixteen**.
Every payouts surface (summary, history, refunds, Stripe dashboard link) and the
payouts page itself returned "no organisation" to the person who owns all sixteen.

That is the founder's explicit product requirement failing at the second business.

---

## DONE and verified

| Item | State | Where |
|---|---|---|
| 1. Divergence fixed at root | **DONE** | `connect-handlers.ts` writes `payout_status`; deauthorize and the onboarding return both call the single owner |
| 2. Reconcile: publish gate | **DONE** | `publish-gate.ts` reconciles before refusing |
| 2. Reconcile: payouts control | **DONE** | `RefreshStripeStatus` + `payouts/actions.ts` |
| 2. Reconcile: onboarding return | **DONE** | `connect/return/route.ts` now calls the reconciler |
| 2. Reconcile: schedule | **DONE (code)** | `api/cron/connect-reconcile/route.ts`. **Not registered in `vercel.json`** |
| 3. Atomic disconnect + migration | **DONE** | `DISCONNECTED_STATE`, `disconnectConnectedAccount`, migration `20260809000001` |
| 4. Multi-organisation | **PARTLY** | resolver fixed, 4 routes pass `?org=`, switcher built. See below |
| 5. Refusal message | **DONE** | `describeOutstanding()` from Stripe's own payload |
| 6. Divergence guard | **NOT STARTED** | |

### Verification actually run

```
tsc --noEmit    exit 0
eslint          0 errors, 45 warnings (under the 48 baseline)
vitest          1534 passed, 138 files
guards          all 14 PASS
```

Invoked from `node_modules/` directly. **Never trust `npx tsc` in this repo**: with
`node_modules` absent it printed "This is not the tsc command you are looking for"
while a piped exit code read as success. That is the third instrument lie found in
this project, so never trust a piped exit code here.

### Payment path

Money modules in the diff: **0**. The reconciler writes only the seven derived
Stripe-state columns and never touches an amount, `orders`, `payments`, `payouts`,
`pricing_rules` or `organiser_balance_ledger`.

---

## YOUR COMMANDS

### 1. The migration

```powershell
supabase db push --linked
```

Success criteria are numbered 1 to 4 in
`supabase/migrations/20260809000001_payout_status_unset.sql`. Criterion 4 is the one
that matters: after applying, organisation `8baf2eaa-c592-41b7-a303-3df92b2eaa77`
must release itself by pressing **Refresh Stripe status** on `/dashboard/payouts`,
with no SQL.

`'unset'` was chosen over nullable because the platform filters
`payout_status <> 'restricted'`, and `NULL <> 'restricted'` evaluates to NULL rather
than TRUE, so a nullable column would silently DROP disconnected organisations from
result sets. A forgotten `IS NULL` is an invisible omission of the same shape as the
defect being fixed.

### 2. The webhook subscription, and the trap is worth more than the steps

I did not verify this, so treat it as unknown.

1. Stripe dashboard, **Developers**, then **Webhooks**. Open each endpoint pointing
   at `www.eventlinqs.com.au/api/webhooks/stripe`.
2. **Confirm it is a CONNECT endpoint.** This is the trap: Connect events are only
   delivered to endpoints listening to connected accounts. A platform-only endpoint
   **never receives `account.updated` no matter what events are ticked**, and the UI
   gives you no warning.
3. Confirm `account.updated` and `account.application.deauthorized` are both
   selected. If not: **Update details**, **Select events**, search `account.updated`,
   tick, save.
4. Repeat for every endpoint. This repo's notes record the canonical endpoint being
   re-keyed more than once, so more than one may exist.

Stripe's instruction is to "Establish a Connect webhook URL in your webhook settings
to watch for activity, especially `account.updated` events"
(https://docs.stripe.com/connect/handling-api-verification, fetched 2026-08-09).

### 3. Register the cron

`api/cron/connect-reconcile` needs a `vercel.json` crons entry. I did not touch
`vercel.json` because the brief forbids it without reporting. Suggested: hourly.

---

## WHAT REMAINS, precisely

### Item 4, the rest

Built: resolver returns a LIST plus the active organisation and verifies ownership
(403 for someone else's id); the 4 payouts routes accept `?org=<id>`; the payouts
page honours it; `OrganisationSwitcher` renders when there are 2 or more.

**Switching cannot leak state between organisations by construction**, because each
business is a distinct URL and every switch is a fresh server render scoped to one
verified organisation. There is no shared client state to leak.

Still to do:

1. **Sweep the other 28 `eq('owner_id', user.id)` call sites.** Grep found 29; only
   the payouts resolver is fixed. Any that end in `.maybeSingle()` or `.single()` are
   broken the same way for a multi-organisation owner. **This is the highest-value
   remaining task.** `resolveSeatingOrganisation()` in
   `src/lib/organisations/access.ts` has the identical shape and is confirmed
   unfixed. So does `requireActiveOrganisation()` in `src/app/actions/gigs.ts`.
2. **The dashboard beyond payouts** (events list, event creation) still assumes one
   organisation. A second organisation is currently reachable on the payouts surface
   only.
3. **The six browser proofs** in the brief. None run. Needs TEST, two Stripe test
   accounts, and captures at 390 and 1440.
4. **The email question.** Nothing found keying on the user's email, but this was not
   exhaustively swept. Unverified, not clear.

### Item 6, the divergence guard

Not started. Shape: a cron route that reconciles **read-only**, comparing Stripe
against the row for every connected organisation and reporting mismatches without
correcting them, so a systemic divergence stays visible instead of being papered
over. `outstandingFrom` and `connectStateFrom` are pure and exported for this.

### Not done

- The TEST browser proof with the stranded state reproduced deliberately, at 390 and
  1440.
- Both roast rounds. The roast must be hostile specifically about whether a **second**
  organisation can get stranded in a way the first cannot, which is now the live
  question given item 4 is only partly done.

---

## Founder-reviewed deferral: `on_hold`

An admin `payout_status = 'on_hold'` does **not** block publishing a paid event;
`checkPublishGate` only ever refused on `'restricted'`. Left as it is by founder
ruling. The reasoning: an admin hold is a deliberate act by EventLinqs and should be
a separate decision from a Stripe restriction, and silently tightening a working
surface is its own defect. The reconciler preserves an existing `'on_hold'` rather
than overwriting it with Stripe's opinion, so a deliberately withheld organisation is
never silently released.
