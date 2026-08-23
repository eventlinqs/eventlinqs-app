# Ticket resale in Australia: the law in all eight jurisdictions, and my recommendation

Researched 23 August 2026 against primary and regulator sources, cited beside
every claim. Nothing here is from memory (Law 7). Where I could not find a
source, I say so rather than filling the gap.

**Short answer: do not build resale. Build nothing.** The reasoning is below, and
the alternative that gives buyers what they actually want, with none of the
exposure, is already in the codebase.

---

## 1. The law, jurisdiction by jurisdiction

All six states and both mainland territories, none omitted. Where a jurisdiction
has nothing specific, it is listed and said so.

| Jurisdiction | Instrument | The cap | What triggers it |
|---|---|---|---|
| **NSW** | Fair Trading Act 1987 (NSW), Part 4A, **s 58F** | Resale advertisement must not specify **more than 110%** of original supply cost | Tickets whose terms restrict resale |
| **VIC** | **Major Events Act 2009 (Vic)** | Offence to resell or advertise **more than 10% above face value** | **Only for events the Minister DECLARES** |
| **QLD** | Major-venue scalping rules + **Electronic ticket resale service information standard 2022** | Illegal to resell **or buy** at more than **10% above** original price | Events at **major Queensland venues** |
| **WA** | **Ticket Scalping Act 2021 (WA)** | Advertisement must not seek **more than 10% above** original price | Tickets **with a resale restriction** in the terms |
| **SA** | Fair Trading Act 1987 (SA), from **10 Dec 2018** | Offence to sell above **110%** of original supply cost | Tickets **subject to a re-sale restriction**. **No ministerial declaration needed** |
| **TAS** | **None found** | — | Australian Consumer Law only |
| **ACT** | **None found** | — | Australian Consumer Law only |
| **NT** | **None found** | — | Australian Consumer Law only |

### The obligations that fall on the PLATFORM, not the seller

This is the part that matters for us, and it is not the price cap.

- **SA makes HOSTING the offence.** Consumer and Business Services SA states it
  is illegal for anyone to "**host a ticket scalping advertisement**"
  (<https://cbs.sa.gov.au/campaigns/ticket-scalping-laws-are-changing>, fetched
  2026-08-23). If EventLinqs displayed a listing above 110%, EventLinqs would be
  the host. That is direct platform liability, not seller liability.
- **QLD regulates resale services by name.** Ticket resellers "must follow the
  same laws as other businesses, but also specific rules set out in the
  *Electronic ticket resale service information standard 2022*", including
  telling consumers "about any difference between the original ticket price and
  the resale price"
  (<https://www.qld.gov.au/law/your-rights/consumer-rights-complaints-and-scams/buying-products-and-services/ticketed-events>,
  fetched 2026-08-23).
- **NSW prescribes the advertisement's contents.** s 58F(3) requires the ad to
  state the original supply cost **and** the viewing location, "including, for
  example, any bay number, row number and seat number"
  (<https://www8.austlii.edu.au/cgi-bin/viewdoc/au/legis/nsw/consol_act/fta1987117/s58f.html>,
  fetched 2026-08-23).
- **WA prescribes the same shape.** The advertisement "must display the original
  ticket price" and "specify all location details (e.g. section/bay, row, seat
  and any restricted views)"
  (<https://www.consumerprotection.wa.gov.au/events-tickets-and-ticket-scalping>,
  fetched 2026-08-23).
- **VIC prescribes contents and staffs enforcement.** 2022 amendments require
  seating details, face value and intended resale price in the advertisement.
  Authorised Ticketing Officers have "enforcement powers equivalent to those of
  police officers under the Act" and issue infringements "ranging from $1,018 to
  $610,530" (<https://djsir.vic.gov.au/ticket-scalping/about/legislation>,
  fetched 2026-08-23).

### Penalties, for scale

WA: infringements $2,000 per offence; court fines to **$20,000 (individual) /
$100,000 (corporation)** (Consumer Protection WA, above). VIC: infringements to
**$610,530** (DJSIR, above).

### Two things I could NOT source, marked rather than guessed

- **TAS, ACT and NT.** I found no ticket-resale statute for any of the three, and
  a Law Society Journal article states that the states have acted "with the
  exception of the Northern Territory and Tasmania, which have no specific laws"
  (<https://lsj.com.au/articles/ticket-scalpers-in-the-hot-seat-globally-as-technology-outpaces-legislation/>).
  That is a secondary source and it does not mention the ACT either way.
  **Proving a statute does not exist is harder than proving one does**, so treat
  this as "none found by this search", not as a settled legal opinion. It does
  not change the recommendation, because the recommendation is driven by the
  five jurisdictions that certainly do regulate.
- A Consumer Affairs Forum agreement of October 2018 (online resellers to
  disclose face value and disclose they are not the primary seller) is reported
  in the same LSJ article. I did not find the primary instrument. **UNSOURCED.**

### The floor everywhere, including the three with no specific statute

The Australian Consumer Law applies nationally. The ACCC states that where an
event "is cancelled or significantly changed, consumers may have a right to a
refund", and that misleading conduct in ticket selling is enforceable
(<https://www.accc.gov.au/consumers/buying-products-and-services/buying-tickets-to-events>,
fetched 2026-08-23). So a resale marketplace is never unregulated, even in
Tasmania.

---

## 2. My recommendation: do not build it

You asked for the judgement rather than the feature. Here it is.

**1. There is no single Australian rule to implement.** Five regimes with five
different triggers: NSW, WA and SA turn on **what the ticket's terms say**;
Victoria turns on **whether a Minister has declared the event**; Queensland turns
on **whether the venue is a major venue**. A compliant platform must decide,
per listing, which regime governs, from facts we do not control and cannot
reliably observe. A national platform cannot apply one cap and be done.

**2. In South Australia the platform is the offender.** Hosting is the prohibited
act. Every other risk here is a matter of degree; that one is categorical, and it
lands on us rather than on the reseller.

**3. The compliance burden is recurring, not one-off.** Victoria's declared-event
list and Queensland's major-venue list change over time. A feature whose legality
depends on tracking two government lists is a feature that needs an owner
forever. You are one person.

**4. The economics do not justify it at our size.** Resale exists to solve
scarcity. Production currently carries 36 published events. Resale is a feature
for a platform with sold-out inventory, and building it now spends the scarcest
thing we have on a market we do not yet have.

**5. The upside is small and the downside is asymmetric.** A resale take-rate on
a thin catalogue is a rounding error. A corporate-scale penalty, or an ACCC
matter, against a sole-trader business at launch, is not.

I would rather hand you this than a feature.

---

## 3. What to do instead, which is already built

**The user need behind "resale" is almost never "let me profit".** It is "I have
paid for a ticket I can no longer use, and I do not want to eat the cost". That
need is met by **transfer**, and EventLinqs already has it:
`src/app/actions/transfer-ticket.ts`.

I checked it against the money path specifically: it contains **no price, amount,
payment, fee or Stripe reference at all**. It reassigns the holder by email,
rotates the ticket secret so the old QR dies, and logs the transfer.

**That is why it sits outside every regime above.** Each one triggers on a resale
*price* above the cap, or on an *advertisement specifying* such a price. A
transfer that sets no price is neither. There is no cap to breach, no
advertisement to prescribe the contents of, and nothing for SA to make us the
host of.

**And our own terms already do the other half of the work.** `/legal/terms`
prohibits reselling "above the total amount you paid, or ... for commercial gain
in breach of Australian ticket resale laws". That restriction is exactly the
condition that **activates** the NSW, WA and SA protections for tickets sold
through EventLinqs. It is worth saying to organisers in plain words during
concierge onboarding: *list with us and your tickets are covered by the
anti-scalping regime in NSW, WA and SA, because our terms restrict resale.*

That is a wedge line we already own, and it costs nothing.

### If you ever do want resale

Revisit when events routinely sell out, and then build it **face-value only**
(cap at 100%, not 110%). A face-value-only marketplace is under every cap in the
country simultaneously, needs no per-jurisdiction logic, and cannot make us the
host of a scalping advertisement anywhere. Take the ceiling the law allows and
you inherit all five regimes; take face value and you inherit none.
