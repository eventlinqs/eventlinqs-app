# Payments re-platform: platform-held funds (merchant of record)

Status: DESIGN, AWAITING FOUNDER SIGN-OFF. No money code is written until this
doc is approved and the founder rules on the merchant-of-record and GST question
in section 11. Branch: `feat/funds-holding-payments` (off `release/launch-line`).
Stripe TEST mode only through the whole build. Migrations are file-only; the
founder runs `supabase db push` against TEST/staging, never production.

This doc inherits from the existing system (the single-source fee law in
`docs/FEE-SYSTEM.md`, the `organiser_balance_ledger` / `payout_holds` schema, the
webhook idempotency patterns) and from Stripe documentation verified live on
2026-06-21 (section 2). It invents nothing the code or the evidence does not
support.

---

## 1. Current model vs target model (in plain words)

### Current model (what the live code does today)

- **Charge type: destination charge with `on_behalf_of`.** Checkout creates a
  PaymentIntent with `transfer_data.destination`, `on_behalf_of`, and
  `application_fee_amount`, all pointing at the organiser's connected account
  (`src/lib/payments/stripe-adapter.ts:50-56`, `src/lib/payments/create-destination-charge.ts:72-81`).
- **Merchant of record: the ORGANISER.** `on_behalf_of` makes the connected
  account the settlement merchant. The code relies on this for GST
  (`src/lib/payments/payment-calculator.ts:168-172`: "the organiser is merchant
  of record under destination charges and remits GST on the ticket").
- **Where the money lands: the organiser's connected account, at sale time.**
  The full organiser share (ticket face value) settles straight into the
  connected account; only the platform fee reaches the platform balance.
- **Payout timing: Stripe-automatic DAILY.** Connected accounts are created on a
  daily automatic payout schedule (`src/lib/stripe/connect.ts:154-160`), so
  Stripe sweeps the connected balance to the organiser's bank on a rolling
  `delay_days` buffer, irrespective of event completion.
- **The ledger / holds system is accounting that does NOT control the money.**
  `organiser_balance_ledger`, `payout_holds`, and the operator "Disburse" tool
  exist and are correct as bookkeeping, but the migration and `payout.ts`
  assume connected accounts are on a MANUAL schedule
  (`payout.ts:11-15`, `20260531000003_m6_payout_disbursement.sql:9-16`). They are
  not. So the reserve "held" in the ledger has, in reality, already been swept to
  the organiser by Stripe's daily schedule. This is the known launch blocker.
- **Refunds: cost shared via clawback.** `refundOrder` uses
  `reverse_transfer: true` + `refund_application_fee: true`
  (`src/lib/payments/refund.ts:121-136`), pulling the organiser's share back from
  the connected account and the fee back from the platform.
- **Disputes: not implemented.** `handleConnectDisputeEvent` is a log-only stub
  (`src/app/api/webhooks/stripe/route.ts:1882-1898`).

### Target model (what we are building)

- **Charge type: separate charges and transfers.** The buyer pays EventLinqs.
  The PaymentIntent is created on the PLATFORM account with NO `transfer_data`,
  NO `on_behalf_of`, NO `application_fee_amount`. Funds settle into the platform
  balance and stay there.
- **Merchant of record: the PLATFORM** (in the payments sense). EventLinqs is the
  settlement merchant and the party liable for refunds and chargebacks. (The
  separate TAX question of who is the seller of record for GST is section 11, and
  is the one decision that blocks this build.)
- **Where the money lands: the platform balance, held.** All ticket funds sit in
  the EventLinqs platform balance from sale until disbursement.
- **Payout timing: after the event, controlled by us.** The organiser is paid by
  an explicit platform-to-organiser **Transfer**, fired only after
  `event.end_date + buffer`, net of the platform fee, with a reserve retained
  across the refund window. The organiser's connected account is set to a
  platform-controlled payout schedule so Stripe never front-runs us.
- **Refunds: from the platform balance.** Because we hold the funds, a refund
  before disbursement is just a refund of our own charge plus a reduction of the
  liability we owe the organiser, with no clawback. A refund after disbursement
  reverses the transfer first, then refunds the buyer.
- **Disputes: platform is liable and handles them.** The dispute handler freezes
  the organiser's reserve, the platform balance absorbs the debit (Stripe does
  this automatically under separate charges and transfers), and the organiser
  share is withheld until the dispute resolves.

The good news inherited from the current system: the **fee math, the
single-source `pricing_rules` resolver, the append-only ledger, the `payout_holds`
reserve concept, and the webhook idempotency machinery are all reusable**. What
changes is the charge topology, the direction and timing of money movement, and
the meaning of "held".

---

## 2. Verified Stripe mechanics (research, 2026-06-21)

Confirmed live against `docs.stripe.com`. Two of these corrected prior
assumptions and materially shape the design; they are flagged.

1. **Separate charges and transfers** — create the PaymentIntent on the platform
   with no `transfer_data`/`on_behalf_of`; funds land in the platform balance;
   the platform is merchant of record; a later `POST /v1/transfers` with
   `destination = {connected_account_id}` moves the organiser's net share.
   (`/connect/charges`, `/connect/separate-charges-and-transfers`)
2. **`source_transaction` on a transfer** ties it to a specific charge so the
   transfer can be created before the platform balance shows the funds as
   available; the amount must not exceed the source charge; currency must match;
   it cannot be set after creation. (`/api/transfers/create`)
3. **CORRECTION — the "90-day source_transaction deadline" is a myth.** Current
   docs impose NO time limit on the source_transaction linkage. The real 90-day
   number is a **funds-holding ceiling**: for an Australian business, money may
   not sit on a Stripe balance (platform OR connected) longer than **90 days**
   before payout ("All other countries: 90 days", `/connect/manual-payouts`).
   This is the binding constraint for tickets sold far in advance and drives the
   design in section 6.2.
4. **Transfer vs payout are opposite legs.** A **Transfer** = platform balance ->
   connected account balance. A **Payout** = a Stripe balance -> external bank.
   The connected account's payout schedule (`manual` | `daily` | ... with
   `delay_days`) controls the connected->bank leg; the platform controls the
   platform->connected leg by choosing when to call `transfers.create`.
   (`/connect/manage-payout-schedule`, `/api/payouts/create`)
5. **Transfer reversals** — `POST /v1/transfers/{id}/reversals` claws an
   organiser's share back (adds to platform balance, subtracts from connected);
   `refunds.create` supports `reverse_transfer` + `refund_application_fee`. A
   reversal exceeding the connected balance creates a negative balance;
   `debit_negative_balances=true` lets Stripe debit the organiser's bank, "even
   when on manual payouts". (`/api/transfer_reversals/create`, `/connect/account-balances`)
6. **CORRECTION — funds segregation / "allocated balances" is NOT usable for us.**
   The feature that would hold marketplace funds segregated from platform
   operating funds exists ("Funds segregation", `allocated_funds`) but is
   **private preview, sandbox-only, access-gated by a Stripe account manager, and
   its country list does NOT include Australia.** We cannot rely on it at launch.
   We use standard separate charges and transfers: funds are held in the platform
   balance but **commingled** with operating funds. (`/connect/funds-segregation`)
7. **Australia is fully supported** for separate charges and transfers, platform
   as merchant of record, and same-region AU->AU AUD transfers with no
   `on_behalf_of` needed. (`/connect/accounts`, `/connect/charges`)
8. **Dispute liability falls on the platform** under separate charges and
   transfers: "your platform balance is automatically debited for the disputed
   amount and fee". Stripe also ships **connected-account reserves** (a fixed
   `ReserveHold` that can "release the day after the event", 180-day max) as the
   named ticketing pattern. (`/connect/charges`, `/connect/connected-account-reserves`)
9. **GST / agent context (general, not tax advice):** Eventbrite, Humanitix and
   TryBooking all operate as a **limited payment collection agent**, NOT tax
   merchant of record: the organiser stays the seller and is liable for GST on
   the ticket; the platform is liable for GST only on its own fee. Detail and the
   decision in section 11.

Full citations live in the research record attached to this branch's planning
notes. Two practical flags carried into the design: **(a) for events sold >~75
days before they run, we must act before the 90-day ceiling (section 6.2); (b)
we cannot segregate funds at the Stripe level, so the ledger is the only record
of "whose money is whose" inside the commingled platform balance — its integrity
is load-bearing.**

---

## 3. The new charge flow (where funds sit at each step)

```
Step                         Money location                 Ledger / DB
---------------------------- ------------------------------ ----------------------------------
1. Buyer checks out          (none yet)                     order=pending, payment=processing
   PaymentIntent created on
   PLATFORM (no transfer_data,
   no on_behalf_of, no app fee)
   transfer_group = order id

2. payment_intent.succeeded  PLATFORM BALANCE (held)        confirm_order, issue tickets,
   (webhook)                 full buyer total               ledger: +order_confirmed (organiser
                                                            share = total - fee, a platform-held
                                                            LIABILITY), +reserve_hold bookkeeping

3. Hold window               PLATFORM BALANCE (held)        liability sits in ledger; nothing
   until event_end + buffer  EventLinqs owes organiser      transferred; reserve earmarked
   and refund window closed   the share, holds the fee

4. Disbursement (cron)       PLATFORM -> CONNECTED account  transfers.create(amount = share -
   event ended + buffer +    via Transfer; reserve may      reserve, destination=connected,
   refund window passed       transfer in same or 2nd stage  source_transaction=charge*);
                                                            ledger: -payout (transfer)

5. Connected -> organiser    CONNECTED account -> bank      Stripe payout on the connected
   bank                      (organiser receives money)     account's schedule; payout.* webhooks
```

\* `source_transaction` is used only when the charge is < ~75 days old at
disbursement; older charges transfer from the platform's available balance
without it (section 6.2). The platform fee is NEVER transferred: the platform
keeps `total - share` simply by transferring `share`, not by `application_fee_amount`.

Key invariant of the new model: **between step 2 and step 4 the organiser has
received nothing; the money is provably in the EventLinqs platform balance.**
That is precisely what STEP FINAL must prove.

---

## 4. Disbursement trigger (event end + configurable buffer)

- A new cron route `src/app/api/cron/event-disbursement/route.ts` (CRON_SECRET
  gated, same pattern as the existing `payout-holds-release` cron) runs on a
  schedule (Vercel cron, e.g. hourly).
- For each event where `end_date + payout_buffer_days <= now()`, the organiser is
  payout-active, and the buyer refund window has closed, it computes the
  disbursable amount from the **ledger** (organiser share for that org/event,
  minus any still-earmarked reserve and minus any open chargeback hold) and fires
  one platform->connected **Transfer**.
- `payout_buffer_days` is a new `pricing_rules` rule type, resolved through the
  same single-source resolver and scopes (event > organiser > region) as every
  other fee value. It defaults to a region value the founder sets in `/admin`.
  The existing `refund_window_days` (on `organisations`, max 7) and the existing
  `reserve_percentage` rule continue to govern the refund window and reserve size.
- The trigger condition is `event_ended AND buffer_passed AND refund_window_passed
  AND no_open_chargeback_hold AND org_payout_active`. Disbursement is idempotent
  per (org, event): the claim is recorded in the ledger under a row lock before
  the Stripe call, mirroring today's `disburse_payout` discipline, so a re-run or
  a concurrent admin action can never double-transfer.
- Manual override remains: the admin "Disburse" tool stays, but now it is gated
  on the same event-ended condition (today it lets an operator pay out an org's
  balance at any time, which the target model forbids before event end).

There is no `events.status = 'ended'` flag today; "ended" is derived from
`end_date` passing. The cron keys on `end_date`, which is sufficient and is
already how `release_holds` computes reserve maturity (`connect-ledger.ts:309-314`).

---

## 5. Reserve and refund window

- The **reserve** (a configurable `reserve_percentage` of the organiser share) is
  retained to cover refunds and chargebacks after the event. In the new model the
  reserve simply stays in the **platform balance** (it was, wrongly, meant to sit
  in the connected account before). It is tracked in `payout_holds`
  (`hold_type='reserve'`) exactly as today.
- **Two-stage disbursement (recommended):** at `event_end + buffer`, transfer
  `share - reserve` to the organiser. At `reserve release_at` (end of the refund
  window), transfer the reserve. This pays organisers most of their money
  promptly while keeping a cushion for late refunds/disputes. The existing
  `release_holds()` cron already matures reserves; it is repointed to *enqueue the
  reserve transfer* instead of merely crediting the ledger.
- **Single-stage simplification (launch option):** set the buffer so that
  `event_end + buffer` already exceeds the refund window, then transfer the full
  share once. Simpler, slightly slower for organisers. The founder picks the
  default buffer; the schema supports both.

Hard limits inherited from Stripe (section 2): a connected-account `ReserveHold`
cannot exceed 180 days, and funds cannot sit on a balance beyond 90 days (AU).
The refund window (<=7 days post-event) and buffer sit comfortably inside both
for events sold close to their date; the >90-day advance-sale case is section 6.2.

---

## 6. Refund and chargeback flows

### 6.1 Refunds

- **Refund before any transfer (the common case).** The buyer is refunded from
  the platform balance with `stripe.refunds.create({ payment_intent })` and **no
  `reverse_transfer`** (there is nothing to reverse). The ledger reconcile simply
  reduces the platform-held liability owed to the organiser. No connected account
  is touched; no negative balance is possible.
- **Refund after the transfer (post-disbursement, rarer).** First reverse the
  proportional organiser share with `transfers.createReversal` (or
  `refunds.create({ reverse_transfer: true })`), then refund the buyer. If the
  connected account lacks balance, `debit_negative_balances` governs recovery.
- The DB stays the source of truth via the existing idempotent `reconcile_refund`
  RPC, **adapted**: it currently assumes the organiser share lives in the
  connected account and may drive a negative there. The adapted version checks
  whether a transfer has been made (a `transfers`/disbursement row exists for the
  order) and routes the reversal accordingly: pre-transfer = reduce liability;
  post-transfer = record the reversal. The ledger reasons already exist
  (`refund_from_balance`, `refund_from_reserve`, `reserve_release`).

### 6.2 The >90-day advance-sale edge (must be designed, not ignored)

For a ticket bought far before its event (e.g. 6 months out), holding that
charge's funds in the platform balance until the event would breach Stripe's
90-day AU funds-holding ceiling. Three Stripe-sanctioned options, with a
recommendation:

- **Option A (recommended for launch): transfer without `source_transaction`,
  from available balance, gated on event end.** Because we disburse after the
  event, the charge has long since settled, so `source_transaction` (whose only
  job is transferring before settlement) is unnecessary. We transfer from the
  platform's available balance and rely on the ledger for charge<->transfer
  linkage. A background monitor flags any unpaid charge approaching 90 days so it
  never silently breaches. Simple, and correct for the overwhelming majority of
  sales (which occur < 90 days before the event).
- **Option B: `source_transaction` per charge when safe.** Use it when the charge
  is recent (< ~75 days at disbursement) for tight Stripe-side reconciliation,
  and fall back to Option A for older charges. More precise, more code.
- **Option C: early sweep with a connected-account `ReserveHold`.** If a charge
  approaches 90 days before its event, transfer it to the connected account early
  but apply a fixed `ReserveHold` releasing the day after the event, so the money
  is still withheld from the organiser's bank until post-event. Most Stripe-native
  for true long holds, but it moves funds out of the platform balance early
  (closer to the old model) and adds the most complexity.

STEP 4 of the mission names `source_transaction` explicitly. The honest
engineering position is: **`source_transaction` is the right tool only for the
< 90-day window; for genuine long holds the 90-day ceiling forces Option A or C.**
Recommendation: **build Option A as the launch default, structure the transfer
service so `source_transaction` (Option B) is a config flag, and defer Option C
to a fast-follow** that we only need once we actually list events selling >75 days
out. This is called out as a founder-visible choice in section 11.

### 6.3 Chargebacks / disputes

- `handleConnectDisputeEvent` is implemented (today a stub). On
  `charge.dispute.created`: Stripe auto-debits the platform balance (we are
  liable as MoR). We **freeze the organiser's share** by writing a
  `payout_holds` row `hold_type='chargeback'` for the order/event (which the
  disbursement cron and `release_holds` already treat as a block), and reverse the
  transfer if one was already made.
- On `charge.dispute.closed`: if won, release the chargeback hold (the share
  becomes disbursable again); if lost, the loss is already out of the platform
  balance, so we debit the organiser ledger (`chargeback` + `chargeback_fee`
  reasons already exist) to forfeit/withhold the organiser share, net of policy.
- An evidence-submission path (uploading proof to Stripe) is built behind the
  admin dispute view. Money state is driven only by the webhook, idempotently,
  consistent with the refund pattern.

---

## 7. Fee mechanism (expressed as a transfer amount)

The single-source fee law and the formula DO NOT change. `PaymentCalculator`
(`payment-calculator.ts`) still computes the buyer total from `pricing_rules`
through the one resolver; displayed == charged is preserved.

What changes is mechanism, not math:

- Today: the platform keeps its fee via `application_fee_amount` on the
  destination charge; the organiser receives `total - application_fee`.
- New: the platform keeps its fee by **transferring less**. The organiser
  transfer amount = the same `organiser share` the code already computes
  (`computeOrganiserShareCents` = `total_cents - applicationFee`, where
  applicationFee mode 1 = `platform_fee + processing_fee`). The platform retains
  `total - share` simply by never transferring it.
- Net economics are identical to the intended fee law: **the organiser receives
  the ticket face value; the platform keeps its percentage + flat fee** (plus the
  processing slice that covers Stripe's cost). The fee-scope e2e test
  (`tests/unit/payments/fee-scope-e2e.test.ts`) is updated to assert this as a
  transfer amount rather than an application fee, with the same to-the-cent
  numbers.

`computeApplicationFeeCents` / `composeApplicationFee` in `application-fee.ts` are
renamed/re-expressed as `computeOrganiserTransferCents` (the amount to transfer)
without changing the underlying pricing_rules reads or the composition modes.

---

## 8. Ledger and schema changes

Guiding rule: **preserve and re-anchor the ledger invariant.** Today the ledger
tries to mirror the connected account balance. In the new model the invariant is:

> For every organisation, `available_balance(org) = SUM(ledger.delta_cents)` is
> the amount EventLinqs holds in the PLATFORM balance earmarked for that org and
> not yet transferred. The platform's real available balance must always be
> `>= SUM over all orgs of their positive earmarked liabilities` (we can never owe
> more than we hold). The disbursement claim is computed under a row lock and
> capped at both the ledger figure and the platform's real Stripe available
> balance, mirroring today's `disburse_payout` double-cap.

Changes:

- **`payouts` table -> distinguish the two legs.** Add `kind TEXT CHECK (kind IN
  ('transfer','payout'))`, `stripe_transfer_id TEXT`, `event_id UUID`, and
  `source_transaction_id TEXT`. A platform->connected disbursement is a
  `kind='transfer'` row carrying `stripe_transfer_id`; the connected->bank leg
  (Stripe-driven) stays `kind='payout'`. `stripe_payout_id` stays nullable+unique
  (already done in `20260531000003`).
- **`disburse_payout` RPC -> `disburse_transfer`** (or a parameter): same atomic
  claim (lock org, compute available, refuse overpay, write the negative `payout`
  ledger entry before the Stripe call), but it now reserves funds for a transfer
  and records `event_id`. `void_payout` is reused for a failed transfer
  (reversal). `release_holds` is repointed to enqueue the reserve transfer.
- **`reconcile_refund` RPC -> adapted** for pre- vs post-transfer refunds
  (section 6.1): pre-transfer reduces the liability without a connected-account
  clawback.
- **New `pricing_rules` rule type `payout_buffer_days`** (section 4), seeded by a
  migration following the append-only pattern in `docs/FEE-SYSTEM.md`.
- **Remove the false manual-schedule assumption** in the migration comments and
  `payout.ts`; replace with the controlled-schedule reality. The connected
  payout schedule is set explicitly in `connect.ts` (section 9).
- **No change to** `organisations` reserve/hold columns, the `payout_holds`
  table shape, the ledger `reason`/`reference_type` enums (they already include
  `payout`, `reserve_hold`, `reserve_release`, `refund_*`, `chargeback`,
  `chargeback_fee`, `adjustment`), or `pricing_rules` storage.

Any migration is delivered as a file only. The founder runs, against TEST/staging:

```
supabase db push --linked
```

(exact command and verification query provided with the migration in STEP 2),
never against production, per the constitution.

---

## 9. Connect and payouts configuration

- **Keep Express accounts** (`connect.ts:146-153`), capabilities `card_payments`
  + `transfers` unchanged.
- **Set a platform-controlled payout schedule on the connected account** so
  Stripe never front-runs disbursement. Options confirmed in research: `manual`
  (platform triggers connected->bank explicitly) or a scheduled interval with
  `delay_days` under platform control (valid because, as MoR under separate
  charges and transfers, we own fraud/dispute liability). Recommendation: a
  controlled schedule (e.g. `daily` with a short `delay_days`) so that once we
  TRANSFER to the connected account post-event, it flows to the organiser's bank
  promptly, while the platform-side Transfer remains the real gate. The exact
  interval is a founder setting; `setPlatformPayoutSchedule` already exists and is
  repurposed.
- **Implement the `transfer.created` handler** (today a stub at `route.ts:1869`):
  record/confirm the disbursement transfer row and surface it in the admin payout
  view and the organiser dashboard.
- **Implement the automated post-event disbursement trigger** (the cron, section
  4).

---

## 10. Exact list of files to change

Charge + fee:
- `src/lib/payments/stripe-adapter.ts` — drop the connect fields from charge
  creation; add `createTransfer`, `reverseTransfer`.
- `src/lib/payments/gateway.ts` — extend the `PaymentGateway` interface
  (`createTransfer`, `reverseTransfer`); the charge params lose the connect trio.
- `src/lib/payments/create-destination-charge.ts` — replace with
  `create-platform-charge.ts` (platform charge, no `on_behalf_of`/`transfer_data`).
- `src/app/actions/checkout.ts` and `src/app/actions/squad-checkout.ts` — call the
  platform charge; no other checkout logic changes.
- `src/lib/payments/application-fee.ts` — re-express fee as the transfer amount
  (`computeOrganiserTransferCents`), same pricing_rules reads/composition modes.
- `src/lib/payments/payment-calculator.ts` — unchanged math; comment fix only
  (the "organiser is merchant of record" note becomes accurate to the new model
  and to the section 11 GST ruling).

Transfers, payouts, disbursement:
- `src/lib/payments/payout.ts` — becomes the transfer service (platform->connected
  via `transfers.create`, optional `source_transaction`), plus the reversal path.
- `src/lib/stripe/connect.ts` — controlled payout schedule; correct the
  manual-schedule comments.
- `src/app/api/cron/event-disbursement/route.ts` — NEW post-event disbursement cron.
- `src/app/api/cron/payout-holds-release/route.ts` — reserve maturity now enqueues
  the reserve transfer.
- `vercel.ts` / cron config — register the new cron.

Webhook:
- `src/app/api/webhooks/stripe/route.ts` — new ledger semantics on
  `payment_intent.succeeded` (share = liability); implement `transfer.created`,
  `charge.dispute.created`/`closed`; adapt `charge.refunded` reconcile.

Refund + dispute:
- `src/lib/payments/refund.ts` — conditional `reverse_transfer` (only post-transfer).
- `src/lib/payments/refund-service.ts` — unchanged orchestration, adapted reasons.
- `src/lib/stripe/connect-handlers.ts` — dispute freeze/evidence helpers.

Admin + ledger:
- `src/lib/admin/payouts.ts` and `src/app/admin/(authed)/payouts/**` — show
  transfers/disbursements and dispute holds; event-gate the manual disburse.
- `src/lib/payments/connect-ledger.ts` — organiser share recorded as held
  liability; reserve stays platform-side.

Schema (migration file only):
- New migration: `payouts.kind`/`stripe_transfer_id`/`event_id`/
  `source_transaction_id`; `disburse_transfer` RPC; adapted `reconcile_refund`;
  dispute-hold helper; new `pricing_rules` `payout_buffer_days` seed.

Tests (rewritten to the new model):
- `tests/unit/payments/create-destination-charge.test.ts`,
  `destination-charge-flow.test.ts`, `application-fee.test.ts`, `payout.test.ts`,
  `connect-ledger.test.ts`, `refund.test.ts`, `fee-scope-e2e.test.ts`,
  `tests/unit/cron/payout-holds-release.test.ts`, `tests/unit/admin/payouts.test.ts`,
  and the connect/webhook handler tests.

---

## 11. FOUNDER DECISION REQUIRED — merchant of record and GST (STOP)

This is the one decision that blocks all money code. Making the platform the
payments merchant of record does NOT by itself decide who is the **tax seller of
record** for GST. The two are separable, and the current code conflates them
(`payment-calculator.ts:168-172` assumes the organiser remits GST on the ticket).

General, non-authoritative context (confirm with the ATO / a registered tax
adviser before relying on it):

- **Today's assumption:** organiser = seller, remits GST on the ticket;
  EventLinqs remits GST only on its fee.
- **Competitor norm (Eventbrite, Humanitix, TryBooking):** they are payments
  merchant of record but operate as a **limited payment collection agent** for
  tax. The organiser stays the seller of record and is liable for GST on the
  ticket; the platform is liable for GST only on its booking/service fee. This
  lets them hold funds and be the payments MoR **without** becoming the taxable
  seller of the ticket.

The options:

- **Option 1 (recommended): platform is payments merchant of record, but a
  limited payment collection agent for tax.** We hold funds and run the whole
  funds-holding flow in this doc, while the organiser remains the GST seller of
  the ticket and EventLinqs remits GST only on its fee. This matches the
  competitor norm, keeps the existing fee/GST math essentially intact, and is the
  least disruptive to tax posture. Requires the buyer-facing and organiser-facing
  terms to state the limited-agent relationship.
- **Option 2: platform is the full seller of record (tax MoR too).** EventLinqs
  becomes the seller of the ticket and is liable for GST on the whole sale. This
  changes the fee/GST math (the platform would account for GST on the full ticket
  price and likely issue tax invoices as principal), changes organiser
  agreements, and has real accounting/registration consequences. Heaviest lift,
  not the competitor norm.
- **Option 3: stay as-is on tax (organiser remits ticket GST) and DO NOT change
  the payments MoR.** This abandons the funds-holding mission. Listed only for
  completeness.

A second, lighter founder choice nested in the build (section 6.2): the
**advance-sale strategy** — Option A (transfer without `source_transaction`,
recommended launch default) vs building Option B/C now for events that sell
>75 days ahead.

**Do not proceed to STEP 2 until the founder approves this design and rules on
Option 1 / 2 / 3 above (and ideally the 6.2 advance-sale default).**

---

## 12. How this will be proven (STEP FINAL, restated)

In Stripe TEST mode against a local/staging DB, with evidence per item, anything
short of 100% reported as NOT DONE:

1. Paid purchase -> funds in the PLATFORM balance, organiser received nothing.
2. Event marked ended -> transfer fires, organiser receives ticket price net of fee.
3. Full refund before payout -> buyer refunded, no transfer made.
4. Refund after payout -> transfer reversed, buyer refunded, balances correct.
5. Simulated chargeback -> dispute handler fires, reserve frozen, platform balance debited.
6. Ledger reconciles exactly with real Stripe balances.
7. `tsc`, lint, build green; every payments test rewritten to the new model and passing.
```
