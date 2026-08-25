# The eight unchecked parity rows, checked

Checked 23 August 2026. These were marked NOT CHECKED in the competitor-parity
audit rather than assumed either way, which was the right call: two of the eight
turned out to be defects and one of those is invisible from the outside.

Verdicts are against Eventbrite, Humanitix and TryBooking. Evidence is a file
path in this repo, or a cited page from the competitor's own documentation.
**Nothing was built.** Where a gap needs a decision, the effort and the customer
impact are stated so the decision is yours.

| # | Row | Verdict | Reaches a customer? |
|---|---|---|---|
| 1 | Waitlists | **PARITY** | — |
| 2 | Discount codes | **PARITY**, arguably better | — |
| 3 | Group / squad bookings | **BETTER** | — |
| 4 | Tax invoice and ABN | **GAP** | **Yes, and it blocks sales** |
| 5 | Receipts and order history | **PARITY** | — |
| 6 | Guest checkout | **BETTER** | — |
| 7 | Multi-currency | **PARITY** | — |
| 8 | Refund timeframes | **GAP**, small but real | **Yes** |

---

## 1. Waitlists: PARITY

Built. `public.waitlist` and `public.waitlist_notifications` tables, a
`promote_waitlist` RPC, and `src/lib/waitlist/promote.ts` which promotes entries
and emails everyone whose status just changed to `notified`. A refund releasing
inventory promotes from the queue, which is the behaviour that matters.

Note this is the EVENT waitlist (the sold-out queue) and is a different thing
from the city waitlist in the same folder. Both exist; only this one is the
parity row.

## 2. Discount codes: PARITY, arguably better

Built, end to end, not just in the schema. Organiser UI at
`/dashboard/events/[id]/discounts` with server actions in
`src/app/actions/discount-codes.ts`, and checkout resolves the code
(`src/app/actions/checkout.ts`).

`public.discount_codes` carries: percentage OR fixed amount, currency, `max_uses`,
`max_uses_per_user`, `current_uses`, `min_order_amount_cents`, and tier
restrictions. That is a deeper model than a flat percentage-off code and is at or
above what the incumbents expose.

## 3. Group and squad bookings: BETTER

Built. Per-event `squad_booking_enabled`, a `squad_timeout_hours` window, and the
`/squad/[token]` flow with `/squad/[token]/pay/[member_id]` so each member pays
their own share.

**Split payment per member is not something the incumbents do natively.** A group
booking on Eventbrite is one buyer paying for several tickets. Ours lets a group
each pay their own way, which is the actual behaviour of a group of friends going
to a night out, and it is the row where we are clearly ahead rather than level.

## 4. Tax invoice and ABN: GAP, and this one costs sales

**We generate no tax invoice at all.** There is no invoice PDF, no organiser tax
settings, and no GST fields on any receipt. The only ABN in the codebase is
EventLinqs' own, in the legal pages.

Both competitors do this, from their own documentation (fetched 2026-08-23):

- **Humanitix**: "Humanitix sends an order confirmation email to buyers with an
  attached **PDF tax invoice/receipt**", organisers can "change your event's tax
  settings and add tax details to receipts/invoices", and can resend or download
  an order tax invoice.
  <https://help.humanitix.com/en/articles/8905558-how-to-change-your-event-s-tax-settings-and-add-tax-details-to-receipts-invoices>
- **Eventbrite**: "If tax invoices are enabled, you'll find them attached to your
  order confirmation email."
  <https://www.eventbrite.com/help/en-us/articles/123856/get-a-receipt-for-your-tickets/>

**Why it reaches a customer, and why it is worse for us than for them.** Business
& Networking is one of our nine categories. A business buyer at a conference or
a corporate event needs a tax invoice to claim the GST credit, and today the
organiser has to write one by hand from data only we hold. Worse, an organiser
registered for GST is the SELLER under our own fee doctrine (`CLAUDE.md`: the
organiser remits GST on the ticket price, EventLinqs is a limited collection
agent), so the invoice obligation is theirs and we are the ones withholding the
means to meet it. That is the exact shape of the data-ownership complaint our
whole wedge is built on, pointed back at us.

**Effort:** medium and well bounded. Four pieces: organiser tax settings (ABN,
GST-registered flag, trading name), a PDF invoice renderer, attachment to the
order-confirmation email, and a download/resend surface. The PDF capability
already exists in the repo (`src/lib/broadcast/poster.ts`), so this is
composition rather than new ground.

**Do NOT let this become a GST-on-our-fee change.** The locked fee doctrine says
no GST is added to the EventLinqs fee until we are registered. The invoice is
about the ORGANISER's supply to the buyer, which is a separate question and is
the one the competitors answer.

## 5. Receipts and order history: PARITY

Built. `src/lib/email/order-confirmation.ts` is explicitly "the buyer's
self-contained ticket and receipt", carries per-ticket QR and the event's own
refund policy, and is sent on both the paid and the zero-price path. Order
history is at `/account/tickets`.

This is parity on the RECEIPT. It is not a tax invoice, which is row 4.

## 6. Guest checkout: BETTER

Built and genuine. `src/app/actions/checkout.ts` writes `guest_email` when there
is no signed-in user, so a buyer completes a purchase without an account and the
order is still addressable afterwards. That is a real guest path rather than an
account created quietly behind the buyer's back.

## 7. Multi-currency: PARITY

Built at the Connect layer. `CONNECT_CURRENCY_MAP` in
`src/lib/payments/application-fee.ts` covers AUD, GBP, USD, CAD, NZD and the EUR
zone, and `createDestinationCharge` refuses outright with
`org_country_unsupported` rather than guessing a currency for a country outside
the map. Refusing loudly is the right behaviour on the money path.

## 8. Refund timeframes: GAP, small, real, and worth ten minutes

Built, but **three surfaces tell the buyer two different numbers**:

- `src/lib/refunds/notify.ts:138` — "Most banks show it within **5 to 10**
  business days."
- `src/lib/refunds/request-service.ts:451` — "It usually lands within **5 to 10**
  business days."
- `src/lib/email/templates/refund-confirmation.ts:62` — "will appear on your
  statement within **3 to 5** business days. Some banks may take up to 10 days."

A buyer who is refused, then approved, then confirmed is told 5-10, then 5-10,
then 3-5. The one they will hold us to is the shortest, and it is the one in the
email they keep.

**Why it reaches a customer:** it is the sentence a buyer measures us against
while waiting for their money, and a timeframe stated three ways in a refund flow
is the kind of thing the ACL treats as misleading conduct rather than as sloppy
copy.

**Effort:** trivial. One exported constant, three call sites, one test. It is
exactly the shape of the one-source problems already solved for the fee and for
the postponement ladder.

---

## What I would do, in order

1. **Row 8 first.** Ten minutes, removes a misleading-conduct surface, and is a
   pure one-source fix of the kind this codebase already has a pattern for.
2. **Row 4 next, but only on your say-so.** It is the only row that loses a sale,
   and it is the only one where a competitor visibly does something we do not.
   It is also the row where the organiser cannot route around us.
3. Nothing else. Rows 1, 2, 3, 5, 6, 7 are at parity or ahead and need no work.
