# Fee system: one source, full control, zero collisions

The platform fee is a single authoritative value the founder controls from the
admin panel. It propagates identically to checkout (what the buyer is charged),
payout (what the organiser receives), and every display (what the buyer and
organiser see), with per-scope overrides. This document is the durable
explanation: read it before changing anything fee-related.

## 1. One source of truth

`public.pricing_rules` is the ONLY place a fee value lives. Every code path that
charges, pays out, or displays a fee reads it through ONE resolver:
`getPricingRule` in `src/lib/payments/pricing-rules.ts`.

| Consumer | Entry point | Reads via |
|---|---|---|
| Charge (buyer total) | `PaymentCalculator.calculate` (`src/lib/payments/payment-calculator.ts`) | `getPlatformFeePercentage` / `getPlatformFeeFixedCents` / processing helpers -> `getPricingRule` |
| Payout (organiser share, reserve) | `computeApplicationFeeCents` / `computeOrganiserShareCents` / `computeReserveCents` (`src/lib/payments/application-fee.ts`), `createDestinationCharge` | `getApplicationFeeCompositionMode` / `getReservePercentage` -> `getPricingRule` |
| Display (public + organiser) | `getLivePublicFee` (`src/lib/pricing/live-fee.ts`), used by `/pricing`, `/organisers` | `getPricingRule` (anon client) |
| Charged line items shown back | `checkout-summary`, order/confirmation, reporting | the order's stored `platform_fee_cents` (the value that was charged) |

Because charge, payout, and display all call the same resolver with the same
scope inputs, the displayed fee can never drift from the charged fee.

### The fallback constant (last resort only)

`PUBLIC_PLATFORM_FEE` in `src/lib/pricing/public-fee.ts` is NOT a second source.
It is used solely inside `getLivePublicFee`'s catch path, so a public marketing
page never 500s if the pricing-rules lookup itself fails (DB unreachable). No
surface reads it as the fee in normal operation. Keep it in sync with the AU/AUD
launch baseline so a lookup failure degrades to the right number.

There are no other hardcoded fee numbers in the codebase. Marketing, legal, and
help copy use neutral phrasing ("service fees", "see our pricing page for
current rates", "zero platform fees on free events") so nothing can drift.

## 2. Scope control: precedence

A fee can be set at three scopes. The resolver applies the MOST SPECIFIC matching
rule, and the SAME resolver drives the display, so an organiser or event with an
override sees its real fee everywhere.

```
0. per-EVENT      (pricing_rules.event_id = E)                 highest precedence
1. per-ORGANISER  (organisation_id = X, event_id IS NULL)
2. region default (country+currency, org IS NULL, event IS NULL)
3. GLOBAL/currency default
4. GLOBAL wildcard
   -> else PricingRuleNotFoundError
```

- A per-event override is **absolute** for that event: it is matched on
  `(rule_type, event_id)` alone and ignores country/currency (an event_id is
  globally unique and an event has one organiser/currency).
- The org, region, and global levels are all guarded with `event_id IS NULL`, so
  an event-scoped row can never leak into a broader lookup. No collisions.
- Both **percentage and fixed** amounts are independently scoped and editable.
- Every write is **versioned** (append-only: a change inserts a new
  highest-version row, past orders keep their historical fee) and
  **audit-logged** with who and when (`admin.pricing.updated`, with old -> new,
  scope, and version in the metadata).

## 3. How to change a fee safely

All changes are made in the admin panel at `/admin/pricing` (capability
`admin.pricing.manage`). No code deploy is needed: the resolver reads the live
table and the 60-second cache is invalidated on every write.

- **Change the default fee for a region:** edit the region row (e.g. Australia)
  in the top table. Set percentage and/or fixed, Save (a confirm step gates it).
- **Override one organiser:** in the Overrides section, choose scope
  "Organisation", paste the organisation UUID, pick the currency, set the
  percentage and fixed, Save.
- **Override one event:** choose scope "Event", paste the event UUID, set the
  percentage and fixed, Save. This wins over the organiser and region.

Each save takes effect for NEW transactions immediately (within the 60s cache
TTL at worst; the write invalidates the cache so it is usually instant). Past
orders are never retroactively changed.

### Changing the baseline via migration

The launch default is written by migration
`20260608000003_platform_fee_au_launch_default.sql` (AU = 2% + AUD 0.50). To set
a baseline by migration instead of the admin panel, follow the same append-only
pattern: insert a new highest-version row for the scope with `effective_from =
now()`. Per the constitution, write the migration file only; the founder applies
it with `supabase db push --linked` and verifies with a direct DB query.

## 4. Caching and invalidation

The resolver caches each resolved value for 60 seconds (Upstash Redis when
configured; direct DB reads otherwise). Cache keys:

- region/org scope: `pr:v2:<rule>:<country>:<currency>:<org|null>`
- event scope: `pr:v2:<rule>:event:<eventId>`

Admin writes call `invalidatePricingRule` for the exact scope edited, so the
change lands on the next read. A change to a broader scope (e.g. the region
default) self-heals event/org-keyed entries that resolved via fall-through within
the 60s TTL.

## 5. End-to-end proof

`tests/unit/payments/fee-scope-e2e.test.ts` drives one in-memory `pricing_rules`
table through all three consumers and asserts, to the cent, that the displayed
fee equals the charged fee equals the payout share, across all three scopes, and
that changing the region fee moves a normal event while an override event holds
its own fee. The captured numbers (AUD 100.00 ticket, pass-to-buyer):

| Scope | Fee | platform_fee | total | app fee (payout) | organiser share | displayed |
|---|---|---|---|---|---|---|
| Region default | 2% + AUD 0.50 | 250c | 10,570c | 570c | 10,000c | "2% + AUD 0.50" |
| Organiser override | 1% + AUD 0.00 | 100c | 10,420c | 420c | 10,000c | "1% + AUD 0.00" |
| Event override | 5% + AUD 1.00 | 600c | 10,920c | 920c | 10,000c | "5% + AUD 1.00" |

After raising the AU region fee to 3%: the plain event moves to 350c, the event
override holds at 600c, and the organiser override holds at 100c.

## 6. Live launch value

The founder's launch fee is AU = 2% + AUD 0.50. The migration above sets the live
`pricing_rules` AU/AUD baseline to match the documented value, so displayed ==
charged at launch. Changing it later is a single edit in `/admin/pricing`.
