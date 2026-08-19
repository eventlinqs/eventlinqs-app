# Dashboard access divergence, and three items recorded for a founder ruling

Date: 2026-08-19. Branch `integration/launch`.

## 1. The manager gap: what was wrong, what is fixed, what needs your ruling

Founder ruling 2026-08-19: **any organiser can refund.**

Three things decide whether that is true. Until this session they disagreed:

| | Admits |
|---|---|
| `resolveRefundScope` (`src/lib/payments/refund-scope.ts:22`) | owner **or** `organisation_members` role owner/admin/manager |
| `create_refund_request` (SQL re-check, `20260531000001`) | the same set |
| the dashboard order route | **owner only** |

So a manager passed both authorisation checks and still never saw the refund
button: the page called `notFound()` first. Not a security hole (it was stricter,
not looser) but the ruling was unreachable for any venue with staff.

### Fixed

One shared definition, `src/lib/organisations/event-access.ts`
(`resolveEventAccess`), admitting owner/admin/manager, now used by:

- `src/app/(dashboard)/dashboard/events/[id]/orders/[orderId]/page.tsx` (the page
  that hosts the refund control)
- `src/app/(dashboard)/dashboard/events/[id]/orders/page.tsx`
- `getOrganiserEvent` (`src/lib/reporting/attendees.ts`), which gates attendee
  lists, the door list and the orders report

`tests/unit/payments/event-access-matches-refund-scope.test.ts` (6 tests) pins the
gate's role list to `ORG_MEMBER_ROLES` **and** to the SQL role list, and fails if
either order route goes back to filtering `organisations` by `owner_id`. The
divergence was never a logic bug, it was two lists of roles in two files that
nothing compared, so the test compares them.

### NOT changed, and this needs your ruling

`src/lib/organisations/scope.ts:199` is the canonical resolver for roughly thirty
dashboard surfaces, and it lists organisations by `owner_id` alone. Widening it
would, in one edit, hand every manager:

| Surface | What a manager would gain |
|---|---|
| `/dashboard/payouts` | the payout destination, the bank account, Connect onboarding |
| `/dashboard/organisation` | the organisation's identity, contact details, settings |
| `/dashboard/venues` | venue records and their Stripe posture |
| `/dashboard/invites` | the ability to invite further members |
| `/dashboard/gigs`, `/dashboard/events` | the events list and creation |

"Any organiser can refund" does not imply "any manager can change the bank
account", so I stopped rather than infer it. **The event-scoped surfaces are
aligned; the money and identity surfaces remain owner-only pending your decision.**

The specific question: should a `manager` reach `/dashboard/payouts` and
`/dashboard/organisation`, or should those stay owner-only and perhaps admit
`admin` but not `manager`? A three-way split (owner / admin / manager) is
supportable in the schema today, because `organisation_members.role` already
carries it.

Other owner-only sites found in the same sweep, for completeness:
`events/[id]/page.tsx:90`, `events/[id]/edit/page.tsx:34`,
`events/[id]/discounts/page.tsx:33`, `events/[id]/pricing/page.tsx:31`,
`events/actions.ts:348`, `gigs/page.tsx:41`, `gigs/[id]/page.tsx:59`,
`actions/discount-codes.ts:127,188,221`, `actions/dynamic-pricing.ts:71`,
`actions/gigs.ts:57`. These are event-scoped and are the natural next batch once
you rule, but each one edits event configuration rather than reading it, so they
are a deliberately separate decision from "can see the orders and refund".

## 2. FIXED 19 August 2026: a failed refund is no longer silent

Was recorded here as an open exposure. Founder ruling: subscribe and handle it. Done,
with one correction to how I had framed it.

**The event is `refund.failed`, not `refund.updated`.** Stripe: *"In the rare instance
that a refund fails, we notify you using the `refund.failed` event"*
(<https://docs.stripe.com/refunds>, fetched 19 August 2026). `refund.updated` carries
ordinary changes such as metadata and the ARN arriving. Both are now subscribed and
handled, because a CANCELLED refund arrives as a status change rather than as
`refund.failed`, and Stripe records that *"cancellations are a type of refund
failure"*.

**My earlier framing of the harm was wrong in emphasis.** I wrote that the danger was
"the seat has already been given away". It is not. The refund was REQUESTED, so the
buyer is not attending, releasing their seat was correct, and it may legitimately have
been resold. Restoring a ticket would hand a seat to somebody who asked for their
money back, and re-taking inventory could oversell the room, which is the one failure
that cannot be undone at the door.

The real harm is narrower and completely invisible: Stripe *"add[s] it back to your
Stripe account balance"*, so the money sits with the PLATFORM, the buyer has nothing,
and nothing anywhere says so. Stripe's instruction is *"you need to arrange an
alternative way to provide your customer with a refund"*, which needs a person.

**So the handler marks the refund `failed` with Stripe's own `failure_reason` and
ALERTS**, and deliberately does not touch tickets or inventory. Proven end to end by
`scripts/verify/refund-failed-drill.mjs` through the real signed route: the refund row
moves to `failed`, the ticket stays refunded, `sold_count` is untouched, a redelivery
changes nothing, an ordinary `refund.updated` on a succeeding refund is a silent
no-op, and the alert email was **delivered** (`[STAGING] Refund did not complete:
EL-RFMSZKS1 owes 27.49 AUD`).

The TEST/staging endpoint `we_1Tx1ZdGqHIQtgS8tngtwQU7m` has been subscribed (10 events
to 12).

### FOUNDER STEP: subscribe the LIVE endpoint

The handler ships with the code, but Stripe will not send an event an endpoint has not
subscribed to. In the **live** Stripe dashboard, Developers then Webhooks, open the
platform endpoint for `https://www.eventlinqs.com/api/webhooks/stripe` and add:

```
refund.failed
refund.updated
```

Verify with `node scripts/probe/webhook-subscription-check.mjs --env <live env file>`,
which now checks all four required events and prints a verdict per endpoint. Until
that is done, a failed refund on production is still silent.

## 3. FIXED 19 August 2026: publish-gate now agrees with the sale gate

Founder ruling: align it. Done.

It used to admit `stripe_charges_enabled && payout_status !== 'restricted'`, two loose
checks where `isOrganiserSellable` makes five strict ones. It also requires
`stripe_account_id`, `stripe_payouts_enabled === true`, `payout_status === 'active'`
exactly rather than merely not-restricted, and a country whose currency is supported.
So an organiser on hold, or with payouts not yet enabled, or in an unsupported country,
could publish a paid event the sale gate then refused to sell.

The gate now selects `ORG_SALE_FIELDS_SELECT` and calls `isOrganiserSellable` through
`verifyOrgSaleFields`, so it DELEGATES rather than keeping a second copy. The old
select read three columns, which is how the divergence arose: it could not test what it
had not read.

It is not a silent tightening. Failing the fast path does not refuse; it falls through
to the slow path, which asks Stripe what is actually true and only refuses if Stripe
agrees, so an organisation whose columns have drifted still publishes.

Pinned by `tests/unit/events/publish-gate-matches-sale-gate.test.ts`, a PROPERTY test
over all 96 combinations of the five columns asserting `publish.ok ===
isOrganiserSellable`, plus a free event publishing on the worst possible posture and a
paid event with no cover still refused first. The `one-sellability-source` guard
baseline now records the resolution instead of the divergence.

## 4. FIXED 19 August 2026: 36 of 36 guard drills fire

Founder ruling: fix them. Done, and none was a guard defect.

Three were built on FUTURE Node APIs and the future arrived: `globSync`,
`Promise.withResolvers` and `Set.isSubsetOf` are Node 22 additions, chosen as
violations when `.nvmrc` pinned 20. The contract moved to 24, Node 24 ships all three,
the guard correctly stopped objecting, and the drills quietly stopped testing anything.
Replaced with drills built on REMOVALS (`fs.F_OK`, `util.isDate`), which cannot rot
because a deleted export does not come back.

The prototype-method drill is deleted rather than fixed:
`POST_CONTRACT_PROTOTYPE_METHODS` is deliberately empty on Node 24, so no drill can
make it fire without first adding a fake entry to the guard and failing the build for
everyone. That check is genuinely unexercised until Node 26 adds a prototype method.

The fourth was a stale anchor in the lighthouse workflow drill (`node-version: 20` when
every pin moved to 24). Retargeted.
