# Founder decision: two stored figures stay as they are

**Date:** 25 August 2026
**Ruled by:** Lawal Adams
**Status:** A DECISION, not a gap. Both are visible in the daily reconciliation.

---

## The ruling, verbatim

> `ticket_tiers.sold_count` and `discount_codes.current_uses` stay as they are,
> because both are money paths under a row lock and rewriting them belongs in its
> own pass, not an audit. Record that as a decision with a date, not a gap. But
> include them in the reconciliation above so a drift is visible even while
> unfixed.

---

## What each one is, and how it drifts

### `ticket_tiers.sold_count`

The oversell figure. `confirm_order` increments it under a row lock;
`reconcile_refund` decrements it.

**Driven against TEST, 25 August 2026:**

| | before | after | truth |
|---|---|---|---|
| POSITIVE CONTROL: 3 tickets refunded through `reconcile_refund` | 8 | 5 | 5 (FOLLOWS) |
| DRIVE: 2 valid tickets DELETED from the table it counts | 5 | 5 | 3 (DRIFTS) |

Nothing in the product deletes a ticket row; a refund sets a status. The drift is
reachable by a script or by a hand at the database, which is exactly what the
demo purge was.

**Why rewriting it is its own pass:** it is the number that stops two buyers being
sold one seat. It is maintained inside a row-locked capacity decision, and for a
RESERVED-SEATING event the truth lives in `public.seats` rather than in
`tickets`, so a recompute needs two definitions and a way to choose between them.
That is a change to the money path, and it does not belong inside an audit.

### `discount_codes.current_uses`

Incremented inside `confirm_order`. Decremented by nothing, anywhere.

**Driven against TEST, 25 August 2026:** deleting the order that consumed a code
left `current_uses` at 1 against a truth of 0, so a code capped at `max_uses` 3
read 2 uses left when 3 were left.

**Why rewriting it is its own pass:** when a discount is CONSUMED is a checkout
decision. Making it a recompute from `discount_code_usages` would change when a
code is considered spent, which changes what a buyer at the till is told.

---

## What "accepted" does NOT mean

It does not mean invisible. Both are in
`public.stored_aggregate_drift` and therefore in both reconciliation callers:

- `node --env-file=.env.test scripts/verify/aggregate-reconcile.mjs`
- the daily `/api/cron/aggregate-reconcile`, 04:40 UTC

**Measured on TEST at the time of the decision:**

```
ticket_tiers.sold_count        176 rows, 89 disagree
discount_codes.current_uses      0 rows,  0 disagree   (no codes on TEST)
```

The 89 are dominated by seeded demo tiers carrying a `sold_count` with no tickets
behind them by construction, and by seated tiers whose truth is in `seats`. Both
are recorded as caveats beside the figure, so a disagreement is not read as a
defect when it is a definition. Rows reading `stored 0, truth 1` are the other
direction and are the ones worth looking at.

## Where the authoritative record lives

`scripts/lib/stored-aggregates.mjs`, one entry per column, carrying the
maintenance verdict, the caveat and this decision with its date. The build guard
reads it, the reconciliation reads it, and it is the file to edit when either of
these is finally rewritten.
