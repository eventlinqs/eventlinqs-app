# Seated checkout user attachment - root-cause fix and verification (2026-07-11)

Production database never touched (TEST `vkapkibzokmfaxqogypq` only). The
funds-holding payment engine is unmodified: the change is order-attribution
only, at the order INSERT inside the checkout server action. All evidence below
is real: live staging (`eventlinqs-staging.vercel.app`, deployment of
`feat/launch-kit` `fd9d744`), real card-4242 orders, real UI drives.

## Root cause

Both checkout paths live in `src/app/actions/checkout.ts` and create the order
with their own insert. The general-admission insert attaches the session:
`user_id: user?.id ?? null` with the guest fields only set when no user. The
seated insert (inside `processSeatCheckout`) hardcoded `user_id: null` and
always wrote `guest_email` / `guest_name`, so every seated purchase was
recorded as a guest order even when the buyer was signed in. The helper already
received the authenticated `userId` (it used it for marketing consent), so the
session was available at the insert and simply never applied. Because My
Tickets visibility (RLS: `orders.user_id = auth.uid()`) and ticket-transfer
ownership both key off `orders.user_id`, the symptom was an invisible,
owner-untransferable ticket, while payment, seat, ticket and email all
worked (they resolve the buyer via COALESCE of profile and guest fields).

## Fix (root, no workaround)

`fd9d744 fix(checkout): seated orders attach the authenticated buyer user_id`
applies the identical attachment rule to the seated insert: `user_id: userId`,
guest fields only when no session. Guest checkout is byte-for-byte unchanged.
Unit tests (`tests/unit/payments/seated-checkout-user-attachment.test.ts`)
cover logged-in seated (failed before the fix, passes after), guest seated,
and the logged-in GA control.

## Backfill audit (TEST, read-only; NOT run)

Of 10 seated orders on TEST, 8 have `user_id` null; 3 of those carry a
`guest_email` matching a registered account:

| Order | Guest email | Matched profile |
|---|---|---|
| EL-EJEHVWY3 | test-user@eventlinqs.com | 57101100-eec8-4e72-a464-97e11e66bea1 |
| EL-GMGX737Q | launchkit.tester@eventlinqs.com | b567c880-a59a-42d8-815d-247b7fef63e9 |
| EL-PDQNWV4N | elqs-smoke-2607@mailinator.com | 123747ee-82e9-4eb5-96c9-2ea94a608bad |

Proposed additive backfill (pending founder approval, would ship as a
migration file for `supabase db push --linked`, never run directly):

```sql
UPDATE public.orders o
   SET user_id = p.id
  FROM public.profiles p
 WHERE o.user_id IS NULL
   AND o.guest_email IS NOT NULL
   AND lower(p.email) = lower(o.guest_email)
   AND EXISTS (SELECT 1 FROM public.tickets t
                WHERE t.order_id = o.id AND t.seat_id IS NOT NULL);
```

Additive only (fills a null, changes nothing else); `guest_email` is left in
place as the historical contact record, which the email resolvers already
prefer, so no behaviour changes for these orders beyond visibility in the
buyer's account.

## Staging proofs (see proofs.json + screenshots)

| Proof | Result |
|---|---|
| (a) Logged-in seated purchase | PASS. Order EL-8QMW9WF4 confirmed, AUD 27.50, `user_id = 57101100-...bea1`, guest fields null; ticket EL-E9UG-YNFP (Main room, Row B, Seat 1) visible in My Tickets through the real UI. |
| (b) Guest seated purchase | PASS. Order EL-AZ2Z6S7R confirmed, `user_id` null, `guest_email = guest-attach-proof@mailinator.com`, ticket minted. |
| (c) Logged-in GA purchase | PASS. Order EL-MCKPKUEC confirmed, `user_id` attached identically. |
| (d) Transfer of the newly attached seated ticket | PASS. Real /tickets UI: holder reassigned to transfer-attach-proof@mailinator.com, secret rotated, `ticket_transfers` row logged with `from_user_id` = the buyer. |

## Regression gates

| Gate | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `eslint .` | 0 errors (37 pre-existing warnings) |
| `vitest` | 701 / 701 passing (85 files; +3 new attachment tests) |
| Seated same-seat concurrency (`scripts/seating-db-proofs.mjs`) | ALL_GREEN: exactly one winner, adversarial ghost and taken-seat rejected, hold expiry released |

Reusable proof harness: `scripts/verify/seated-attachment-e2e.mjs <baseUrl>`
(STAGES=c,d re-drives selected stages).
