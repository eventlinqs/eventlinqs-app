# The connected-account lockout: delivery

Branch `fix/security-hardening`, 2026-08-09, third session. Reads on top of
`CONNECT-LOCKOUT-HANDOVER-2026-08-09.md`, which holds the root-cause analysis.

Evidence for every claim below is in
`docs/security/evidence/connect-lockout-2026-08-09/`. Nothing here is asserted from
reading code where it could be run instead.

---

## YOUR THREE ACTIONS, in order. The first two are blocking.

### 1. Apply the migration. THE CODE ON THIS BRANCH IS BROKEN WITHOUT IT.

```powershell
supabase db push --linked
```

This is no longer only a widening for tidiness. Migration `20260809000001` adds
`'unset'` to the `payout_status` CHECK constraint, and the code on this branch
WRITES `'unset'` on every disconnect. Proven against TEST on 2026-08-09
(`scripts/verify/payout-status-domain.mjs`, output saved beside this file):

```
  'active'      accepted
  'on_hold'     accepted
  'restricted'  accepted
  'unset'       REJECTED  23514 new row for relation "organisations"
                          violates check constraint "organisations_payout_status_check"
```

So if the code deploys before the migration is applied, **every disconnect fails**.
The reconciler no longer lies about that (it used to report a clean `'unset'` whether
or not the write landed, which would have rebuilt your exact stranding out of an
optimistic return value), but a loud failure is still a failure.

**Deploy order: migration first, then the code.**

Success criteria are numbered 1 to 4 inside the migration file. Criterion 4 is the
one that matters and it is now independently reproduced: organisation
`8baf2eaa-c592-41b7-a303-3df92b2eaa77` must release itself by pressing **Refresh
Stripe status** on `/dashboard/payouts`, with no SQL. The same recovery is proven
end to end on TEST below.

### 2. Verify the Stripe webhook endpoint is a CONNECT endpoint

The trap is worth more than the steps, so it is first: **Connect events are only
delivered to endpoints that listen to connected accounts. A platform-only endpoint
never receives `account.updated` no matter which events are ticked, and the
dashboard gives you no warning.** Stripe's instruction is to "Establish a Connect
webhook URL in your webhook settings to watch for activity, especially
`account.updated` events"
(https://docs.stripe.com/connect/handling-api-verification, fetched 2026-08-09).

Dashboard steps:

1. Stripe dashboard, **Developers**, then **Webhooks**.
2. Open each endpoint whose URL is `www.eventlinqs.com.au/api/webhooks/stripe`.
3. Look at the top of the endpoint page for the words **Connected accounts** (or a
   "Listening to: connected accounts" line). If it says **Your account** instead,
   that endpoint is platform-only and will never deliver `account.updated`.
4. If none of your endpoints is a Connect endpoint, use **Add endpoint** and choose
   **Connected accounts** as the source. You cannot convert a platform endpoint into
   a Connect one after the fact.
5. On the Connect endpoint, confirm both `account.updated` and
   `account.application.deauthorized` are selected. If not: **Update details**,
   **Select events**, search `account.updated`, tick, save.
6. Repeat for every endpoint. This repo's notes record the canonical endpoint being
   re-keyed more than once, so expect more than one to exist.

**A faster check that does not depend on reading the UI correctly.** A Connect
endpoint carries a non-null `application` field; a platform endpoint's is null. Run
this against the live key and read the flag directly:

```powershell
node -e "const S=require('stripe')(process.env.STRIPE_SECRET_KEY); S.webhookEndpoints.list({limit:20}).then(r=>r.data.forEach(e=>console.log(e.status, e.application?'CONNECT':'platform-only', e.url, e.enabled_events.includes('account.updated')?'has account.updated':'MISSING account.updated')))"
```

Run on the TEST key on 2026-08-09 it printed, and this is what a correct one looks
like:

```
enabled  CONNECT        https://eventlinqs-staging.vercel.app/api/webhooks/stripe  has account.updated
enabled  platform-only  https://eventlinqs-staging.vercel.app/api/webhooks/stripe  MISSING account.updated
```

**Do this even though the reconciler no longer depends on it.** The four reconcile
triggers mean a missed webhook can no longer strand anybody, but a dead webhook
still means every organiser waits up to an hour, or a button press, for something
that should have been instant.

### 3. The two crons are registered and need nothing from you

Added to `vercel.json`:

| Path | Schedule | What it does |
|---|---|---|
| `/api/cron/connect-reconcile` | `17 * * * *` | repairs drift, hourly |
| `/api/cron/connect-divergence` | `47 */6 * * *` | REPORTS drift, four times a day, never writes |

Both are offset off the hour deliberately, so they never land on the same minute as
`payout-holds-release` and `event-disbursement`, which both run at `0 * * * *`.

---

## What was found that the previous handover did not record

### Two client-side leaks on the surface that had just been "fixed"

The payouts API routes learned `?org=<id>`, and the page passed it. Two CLIENTS did
not send it, so the server fell back to the caller's FIRST business:

- **`PayoutsHistoryTable`** refetches on every status filter and page click. Viewing
  business B and touching the filter replaced the table with business A's payout
  history, under business B's heading, with nothing on screen saying so.
- **`StripeDashboardButton`** posted with no organisation named. Pressing "Open
  Stripe Dashboard" while viewing business B minted a login link into business A's
  Stripe account. That is not a mis-render; it is an authenticated session into the
  wrong company's money.

Both are fixed and both are proven by watching the outgoing request, not by reading
the source (`connect-paths-proof.json`):

```
/api/payouts/list?org=12780d5e-...&status=paid&offset=0&limit=20
/api/payouts/stripe-dashboard-link?org=12780d5e-...
```

### The reconciler reported a state it had not written

On the no-account branch it returned `payoutStatus: 'unset'` unconditionally,
whether or not the repair write succeeded. Combined with the constraint above, that
means: payouts page says "no Stripe account is connected", publish gate keeps
refusing on the stale `'restricted'` underneath, and the organiser is stranded again
with a control that claims to have helped. It now reports the failure and names the
migration. Pinned by two tests in `connect-reconcile.test.ts`.

### A pre-existing build break, three commits before this work

`next build` could not complete on this branch:

```
./src/app/actions/squad-checkout.ts:35:17
Error: Server Actions must be async functions.
```

Every export of a `'use server'` module becomes a public HTTP endpoint, so the
directive permits async functions only, and `assertSquadAccess` is synchronous. It
arrived in `535b05f`, and **typecheck, eslint and the full test suite were all green
while the branch could not build.** The pure gate moved to `src/lib/squads/access.ts`
unchanged; both actions still call it; its 16 tests still pass. Without this the
branch could never have deployed.

### Live confirmation of the root cause, caught in the act

While building the TEST fixture, attaching an identity document to a connected
account fired a real `account.updated` at 03:29:08Z. The staging deployment, running
the OLD handler, updated the row at 03:29:09Z. `stripe_charges_enabled` and
`stripe_payouts_enabled` moved to true. **`payout_status` stayed `'restricted'`.**
The one-way door, on camera, with timestamps.

---

## The founder's six multi-business scenarios

Full output in `multi-org-scenarios.json`, `multi-org-money-proof.json`,
`connect-paths-proof.json`, `browser-proof.json`.

| # | Scenario | Verdict |
|---|---|---|
| 1 | second organisation, DIFFERENT Stripe account | **PROVEN.** Third business created through the browser form; pressing connect minted `acct_1U2O4o2cqKnoPbXl`, distinct from both existing accounts, stamped with its own `metadata.organisation_id`. Another owner's business is refused 403 |
| 2 | both sell independently, payouts to their own bank accounts | **PROVEN at the point the destination is chosen.** See below |
| 3 | switching never leaks state | **PROVEN.** URL, cookie, page content, and both client fetches |
| 4 | disconnect one, other untouched | **BLOCKED on the migration.** See below |
| 5 | reconnect to a different account keeps history | **PROVEN.** An event survived an account swap, attribution unchanged, other business unaffected |
| 6 | nothing keyed on the user's email | **PROVEN.** Three businesses share one address |

### On scenario 2, and why a checkout would have proven nothing

EventLinqs runs a funds-holding model. The buyer is charged on the PLATFORM account
with no `transfer_data`, no `on_behalf_of` and no `application_fee_amount`
(`create-platform-charge.ts:14-19`). **At charge time there is no destination at
all.** The destination is chosen later, in `event-transfer.ts:389`, through
`events -> organisations!inner(stripe_account_id)`. So the money question is settled
at the transfer, and that is what was exercised: two real Stripe test-mode transfers,
of deliberately different amounts, then each connected account's balance read back.

```
Harbour Nights Presents  tr_1U2Nzw... -> acct_1U2NOpGTgPP2EN9E   balance 15 AUD
Northside Comedy Room    tr_1U2Nzz... -> acct_1U2NOwKH9wJ7una3   balance 22 AUD
```

Two destinations, two balances, two bank accounts (`ba_1U2NOt...`, `ba_1U2NOz...`).
Stated precisely: the bank objects are distinct and attached to distinct accounts,
but both were created with the same documented AU test account number, so the
`last4` matches on both. The separation is in the accounts, not in the digits.

**Not proven by me:** a buyer completing a card checkout on each business. What that
would add over the above is the charge leg, which by design has no per-business
destination.

### On scenario 4, stated plainly

`disconnectConnectedAccount` writes every column of `DISCONNECTED_STATE` in ONE
update scoped to `.eq('id', organisationId)`, so it cannot reach a second business by
construction. But it writes `payout_status = 'unset'`, which the database currently
refuses, so **the scenario cannot be completed until you apply the migration.** What
IS proven is that the refusal is clean: the write failed with 23514 and the other
business was left byte-for-byte unchanged. Re-run
`scripts/verify/multi-org-scenarios.mjs` after `supabase db push --linked` and it
completes itself.

---

## Every single-organisation assumption found and fixed

`maybeSingle()` and `single()` do not return the first row when several match. Run
against TEST for an owner holding 26 organisations
(`maybe-single-behaviour.txt`):

```
.maybeSingle()  ->  406, PGRST116, data: null
                    "Results contain 26 rows, ... requires 1 row"
.single()       ->  406, PGRST116, data: null
                    "Cannot coerce the result to a single JSON object"
```

Every call site read that `null` as "this person has no organisation".

| Surface | Was | Now |
|---|---|---|
| `dashboard/events` | "Set up your organisation first" | lists the active business, with a switcher |
| `dashboard/events/create` | showed the CREATE AN ORGANISATION form | creates under the chosen business |
| `dashboard/organisation` | "No Organisation Yet" | the business, plus **Add another business** |
| `dashboard/organisation/create` | **redirected away at exactly one business** | always available |
| `dashboard` home | every KPI blank | scoped to the active business |
| `dashboard/venues` + actions | "Organisation not found" on every action | scoped |
| `dashboard/invites` + actions | "Organisation not found" | scoped |
| `api/ai/chat` | told a 26-business owner they had none | counts all of them |
| order confirmation | sent organisers to the public events list | counts |
| seating (`resolveSeatingOrganisation`) | resolved null, builder unreachable | gate reversed: venue -> its organisation -> may this caller manage it |
| `dashboard/gigs`, `actions/gigs` | `.limit(1)` with no `.order()` | oldest-first, deterministic |
| `artists/[slug]` | trap-shaped `.limit(1).maybeSingle()` | a count |

The create-a-business page deserves its own line, because the old behaviour was
absurd in a way worth remembering: with exactly ONE organisation it redirected away,
so a second business was impossible; with TWO or more the `single()` error made the
redirect not fire, so the third was permitted. The product blocked the second
business and allowed the fourth, purely as a side effect of a postgrest error shape.

**On `.limit(1)` without `.order()`:** it does not error, so it looked safe. It is
not deterministic. Two runs of the probe returned the same 26 rows in two different
orders. Ten consecutive `limit(1)` calls did return the same row, so this is a latent
defect demonstrated at the ordering level rather than an observed flip.

---

## Founder-reviewed deferrals, recorded so they are not reopened as questions

**`on_hold` stays as it is.** An admin `payout_status = 'on_hold'` does not block
publishing a paid event; `checkPublishGate` only ever refused on `'restricted'`.
Left unchanged by founder ruling. The reasoning: an admin hold is a deliberate act by
EventLinqs and belongs to a separate decision from a Stripe restriction, and silently
tightening a working surface is its own defect. The reconciler preserves an existing
`'on_hold'` rather than overwriting it with Stripe's opinion, and the divergence
guard treats a held organisation with a healthy Stripe account as CORRECT rather than
divergent, so a deliberately withheld organisation is never silently released and
never shows up as a false alarm.

**`'unset'` over nullable is accepted and the reasoning stands.** The platform
filters on this column with expressions of the form `payout_status <> 'restricted'`,
and `NULL <> 'restricted'` evaluates to NULL rather than TRUE, so a nullable column
would silently DROP disconnected organisations out of result sets instead of
including them. Every read site would need an `IS NULL` branch, and forgetting one is
an invisible omission of exactly the shape being fixed.

---

## The payment path: what moved

**Charge, payout, fee and refund logic: nothing.** No file under `src/lib/payments/`
was modified. Verify with `git diff --stat a787a26..HEAD -- src/lib/payments/`, which
is empty.

What this branch writes to the database is the seven derived Stripe-state columns on
`organisations`, and nothing else. No amount, no row in `orders`, `payments`,
`payouts`, `pricing_rules` or `organiser_balance_ledger` is read for a decision or
written at all by the reconciler, the divergence guard, the switcher or the resolver.

The one payment-adjacent behaviour change is a widening, not a movement: a business
that Stripe says is healthy is no longer refused publishing because of a stale
column. That is the defect being fixed.

The divergence guard is read-only by contract, and the contract is asserted rather
than described: `connect-divergence.test.ts` counts update calls and requires zero,
and the live run against 42 TEST organisations returned `"wrote": false`.

---

## Verification actually run

All from `node_modules/` directly, exit codes captured directly, never through a
pipe. `tsc` was calibrated against a deliberate error first and returned exit 2 on
it, so the exit 0 below is a real pass rather than an instrument that never ran.

```
tsc --noEmit        exit 0
eslint              exit 0, 0 errors, 43 warnings (was 45; two dead imports removed)
vitest              1564 passed, 140 files (was 1534 / 138)
run-guards.mjs      exit 0, all 14 PASS
next build          exit 0  (was FAILING before this work, see above)
```

Browser proofs, against a real server on the TEST database with real Stripe test
accounts: 17/17, 12/12 with 3 honest notes, 9/9, 4/4.

Screenshots at 1440 and 390, before and after, in the evidence folder.

## Known and stated

- **Disk was at 4.0 GB free** during the build. Above the constitution's 1.5 GB
  floor, below the 5 GB the project notes treat as the practical floor.
- The `connect/return` redirects resolve through `getAppUrl()`, which with no
  `NEXT_PUBLIC_SITE_URL` or `VERCEL_URL` set falls back to the production origin.
  That is deliberate (HARD-07: no deployed environment may emit a localhost redirect
  into Stripe) and shows up in the local proof as a production hostname in the
  redirect. The reconcile and the `org` parameter were verified regardless.
- The TEST database currently shows **33 organisations whose rows claim they can be
  paid out while Stripe says the account is restricted.** They are seed fixtures
  sharing three connected accounts, not a production incident, but it is exactly the
  divergence the guard exists to surface and it is left visible rather than quietly
  reconciled, because sweeping the reconcile cron across shared TEST data would
  rewrite other people's fixtures.
