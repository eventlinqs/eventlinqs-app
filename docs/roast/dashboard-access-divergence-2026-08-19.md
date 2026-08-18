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

## 2. RECORD, DO NOT FIX: `refund.updated` is unsubscribed

**The exposure.** The refund reconcile runs only from `charge.refunded`. Verified
against the live Stripe test-mode configuration
(`scripts/probe/webhook-subscription-check.mjs`): the enabled platform endpoint
`we_1Tx1ZdGqHIQtgS8tngtwQU7m` subscribes to `charge.refunded` and
`payment_intent.succeeded`, and to no refund lifecycle event.

A Stripe refund is not always terminal at creation. A refund to a card can be
created `pending`, and can later transition to `failed` or `canceled` (for example
the issuing bank rejects it). Stripe reports that transition on `refund.updated`
and `refund.failed`. Nothing on this platform listens.

**What that means concretely.** `charge.refunded` fires, `reconcile_refund` runs,
and the platform does everything a completed refund implies: the ticket is voided,
`sold_count` is decremented so **the seat goes back on sale**, the ledger is
reversed and the order is marked refunded. If the refund later fails at the bank,
the buyer keeps the money owed to them unpaid AND the seat has already been given
away. The platform believes the refund happened.

**Blast radius today: small.** Every refund observed in this session settled
`succeeded` immediately (`re_3U5mGQ...`, `re_3U5mL8...`), which is the normal case
for the card refunds this platform makes. Production has zero refunds so far.

**The trigger for fixing it.** Any one of:

1. the first refund seen with `status = 'pending'` rather than `succeeded`;
2. the first non-card payment method (BECS direct debit, bank transfer), where a
   delayed and reversible refund is normal rather than exceptional;
3. any refund dispute where a buyer says the money never arrived.

**The fix, when triggered.** Subscribe the platform endpoint to `refund.updated`,
handle `failed`/`canceled` by re-selling nothing: reverse the reconcile (re-issue
the ticket or mark the refund failed and re-increment `sold_count`), and notify the
organiser that the refund did not complete. It needs a designed decision about what
happens when the seat has already been resold in the interim, which is why it is
not a five-minute change and is recorded rather than rushed.

## 3. RECORD, DO NOT FIX: `publish-gate` diverges from the sale gate, unsafely

Surfaced by an existing guard's own output (`one-sellability-source`), which lists
it as a KNOWN DIVERGENCE rather than hiding it.

`src/lib/events/publish-gate.ts:162` admits `payout_status <> 'restricted'`, where
the sale gate (`isOrganiserSellable`) requires `payout_status = 'active'`, and the
publish gate ignores `stripe_payouts_enabled` and the supported-country map
entirely.

**The consequence, in the unsafe direction.** An organiser whose payout status is
anything other than the single value `restricted` (for example `unset`, or a
pending state) can PUBLISH a paid event. That event then renders to buyers with no
working purchase path, because the sale gate refuses it. The organiser has
announced and promoted an event that cannot take money, and the refusal they see is
the designed "this organiser is still finishing their payment setup" state, which
reads as a platform fault rather than an incomplete setup.

The correct end state is one predicate: publishing a PAID event should require
exactly what selling a ticket requires, no more and no less. That is a founder
decision because tightening it will stop some currently publishable events from
publishing, and it is your call whether that lands before or after launch.

## 4. RECORD: four of thirty-three guard drills do not fire

`node scripts/verify/guard-failure-drills.mjs` reports **29 of 33 firing**. The
four that do not are all pre-existing and none is mine:

| Drill | Problem |
|---|---|
| `globSync` imported from `node:fs` (the 2026-08-05 CI failure) | guard PASSED on a violating tree |
| a global static added after Node 20 (`Promise.withResolvers`) | guard PASSED on a violating tree |
| a prototype method added after Node 20 (`Set.isSubsetOf`) | guard PASSED on a violating tree |
| a workflow pinned BELOW the `.nvmrc` contract | anchor text not found in `.github/workflows/lighthouse.yml`; the drill is stale |

The first three all belong to `scripts/guards/node-version-contract.mjs`. A guard
that passes on a tree that violates it is not guarding: the Node-version contract
is currently unenforced in those three respects, which is exactly the class Law 9
exists to catch. The fourth is a stale anchor and is a five-minute fix, but fixing
the anchor without fixing the three real ones would leave the worse problem behind
a greener number.

Not touched this session because they are unrelated to the refund, oversell and
privilege work, and because changing a guard is its own change with its own proof.
Recorded so the 29/33 is not mistaken for noise.
