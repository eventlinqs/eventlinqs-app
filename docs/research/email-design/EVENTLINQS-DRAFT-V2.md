# EventLinqs Confirmation Email: Draft V2 (evidence-grounded)

Research date: 2026-05-17. Grounds every choice in COMPETITORS-RAW.md / COMPARISON-MATRIX.md / INDUSTRY-PATTERNS.md.

Evidence labels: [HIGH] verbatim vendor doc/screenshot · [MED] vendor blog/structure doc · [LOW] third-party/inferred · [UNV] unverified.

## Real EventLinqs context this is grounded in

Source file: `src/app/api/webhooks/stripe/route.ts`, `buildConfirmationEmailHtml` (~L725-798), called from the order-confirmation send (~L714-722).

- Transport: Resend, `from: 'EventLinqs <noreply@eventlinqs.com>'`.
- Current subject: `Order Confirmed: ${event.title} (${order.order_number})`.
- Current body: heading "You're in", order number, event title, tz-aware `en-AU` date (`Intl` with `timeZoneName: 'short'`), location (venue/city/country), ticket line items (names only, no QR), `Total paid: {CCY} {amount}`, optional Stripe `receipt_url` link, "View your order" button to `/orders/{order_number}/confirmation`, **and the placeholder line that must be removed**: "Your tickets will be available in your EventLinqs account once our ticketing system is fully activated.", footer "The EventLinqs team. The ticketing platform built for every culture."
- Already-shipped building blocks: hosted QR PNG `GET /api/tickets/[code]/qr?k=<secret>`; bearer ticket page `/t/[code]?k=<secret>`; logged-in `/tickets` dashboard; tickets carry `EL-XXXX-XXXX` code + secret + holder + status (`valid`/`scanned`/`refunded`/`void`/`transferred`).
- Brand rules (hard): AU English; NO em-dashes; NO exclamation marks; community-first warm tone (matches `/about`); no "diaspora"; mobile-first.

The draft below assumes the webhook can resolve per-ticket rows (code, secret, holder, status) for the order. If the current handler only has `order_items` aggregate lines, the per-ticket block is the target state and the data fetch must be extended (flagged as an implementation note, not a copy decision).

---

## Element-by-element: validate or revise the proposed draft

### 1. Subject line

- **Proposed:** `Your tickets for {Event} ({order})`
- **Decision: ADOPT, with order number moved out of the subject.**
- **Final:** `Your tickets for {Event}` (order number stays in the body, not the subject).
- **Why:** Eventbrite's own blog prescribes exactly this shape - pronoun-led, event-named, no caps, no exclamation, < 60 chars, and gives the verbatim good example "Your tickets for the House Of Sin 11 Edition After-Hours Event" [MED, Eventbrite blog]. Universe enforces a 70-char subject cap [HIGH] - dropping `({order})` keeps us comfortably under 60 even for long culture-event titles, and `({order})` adds noise without buyer value (the order number's job is in-body reference + support, per Ticketmaster's first-class order-number model [HIGH]).
- **Alternatives considered + rejected:**
  - Keep current `Order Confirmed: {Event} ({order})` - rejected: "Order Confirmed" is not pronoun-led and reads transactional/cold; matches Eventbrite's documented BAD pattern [MED]. Current EventLinqs `(${order.order_number})` in subject duplicated in body.
  - Ticketmaster-style "You're in" [LOW, community] - rejected: does not name the event, fails the "always name the event" rule (Eventbrite blog), and the buyer scanning their inbox later cannot tell which event.
  - Add emoji - rejected: Eventbrite blog says emoji can lift open rate [MED], but EventLinqs brand voice is warm-not-gimmicky and an emoji in a transactional/legal-receipt email risks spam classification (Eventbrite blog's own spam caution) and clashes with the no-exclamation restraint. Trade-off accepted: marginally lower open rate for brand consistency and deliverability.

### 2. Pre-header (NEW - not in current code, not in proposed draft)

- **Decision: ADD.**
- **Final pre-header text:** `Your EventLinqs order is confirmed. Your QR is in this email and at your ticket link.`
- **Why:** Every well-documented competitor email leads with a scannable summary; the pre-header is the first thing shown in mobile inbox previews and is currently empty (the HTML starts straight into a `<div>`). It reinforces "this is the real ticket, no waiting" - the direct antidote to the placeholder line we are removing. Mobile-first is industry-standard (all 8) and the pre-header is pure mobile real estate. [MED, inferred from universal mobile-first + Eventbrite peace-of-mind framing]
- **Alternative rejected:** no pre-header (current state) - rejected: wastes the highest-visibility text slot on a mobile lock screen.

### 3. Header / branding

- **Decision: KEEP minimal text wordmark, ADD nothing heavy.**
- **Final:** `EVENTLINQS` text wordmark (per CLAUDE.md: logo does not exist yet, text placeholder), brand navy `#1A1A2E`. No hero image (email LCP/media rules + no logo asset).
- **Why:** Universe documents a logo header [HIGH] and Eventbrite uses a branded header [HIGH], so a clear brand header is standard. EventLinqs has no logo asset yet (CLAUDE.md hard rule), so the text wordmark is correct and consistent with the rest of the product.

### 4. Opening line

- **Proposed:** "You are going to {Event}"
- **Decision: ADOPT (revised slightly for warmth + AU voice).**
- **Final:** `You are going to {Event}.` as the H1, then one warm line: `Your order is confirmed and your ticket is ready below. No app needed.`
- **Why:** Eventbrite blog prescribes a warm, personalised 2-3 line intro and explicitly contrasts a good excited intro vs a bland "Thanks for buying tickets" [MED]. "You are going to {Event}" is second-person, present, warm, and event-specific - exactly the documented good pattern, and stronger than the current cold "You're in". Adding "No app needed" is a deliberate jab at the DICE/AXS app-lock model [HIGH] and reinforces EventLinqs's no-account/low-friction position (matches Humanitix's no-account strength [HIGH]).
- **Personalisation note:** Eventbrite blog recommends the attendee first name in line 1 [MED]. EventLinqs has `order.guest_name` / profile. Use it if reliably present: `You are going to {Event}, {firstName}.` - but degrade gracefully (no dangling comma) when name is absent. Trade-off: name boosts warmth but a malformed greeting is worse than none, so name is conditional.
- **Alternative rejected:** "You're in" (current) - rejected: generic, used near-verbatim by Ticketmaster [LOW], not event-specific, weaker than the documented good pattern.

### 5. Per-ticket block (the core change)

- **Proposed:** per-ticket block with inline QR (hosted PNG), `EL-XXXX-XXXX` code, "Open ticket" link to `/t/[code]?k=`, copy "Show the QR at the entry, one QR admits one person"; refunded ticket shows a not-valid panel instead of a QR.
- **Decision: ADOPT in full. This is the strongest evidence-backed upgrade.**
- **Final per valid ticket:**
  - Holder name (e.g. `Adunni Okafor`) - Eventbrite blog explicitly recommends the attendee name on the ticket "to prevent unauthorized reselling" [MED].
  - Inline QR image via `https://eventlinqs.com/api/tickets/{code}/qr?k={secret}` rendered as the ticket visual. Universe ships an inline embedded QR by default [HIGH]; Ticket Tailor's PDF shows one QR per ticket [HIGH, screenshot]. Inline QR is the fastest entry path and works for no-account/low-bandwidth buyers - an opportunity Eventbrite/Ticketmaster's link-only default misses (INDUSTRY-PATTERNS opportunity 2).
  - Code `EL-XXXX-XXXX` shown as text under the QR - human-readable fallback / support reference (parallels Ticketmaster's first-class order/confirmation number [HIGH] and Ticket Tailor's "ticket codes" [HIGH]).
  - `Open ticket` link to `/t/{code}?k={secret}` - the gateway CTA every competitor has (Eventbrite "Go to my tickets" [HIGH], Humanitix "view tickets" [HIGH]).
  - One-line instruction: `Show this QR at entry. One QR admits one person.` - revised from proposed for AU/no-em-dash/no-exclamation compliance and clarity. Per-ticket clarity addresses the group-buyer gate-confusion gap (INDUSTRY-PATTERNS opportunity 3); culture events skew to family/friend-group buys.
- **Final per refunded / void / transferred ticket:** NO QR. A muted panel: `This ticket was refunded and is no longer valid.` (or `transferred` / `cancelled` wording per status). Mirrors Ticket Tailor's "Void" label on voided items [HIGH] and is gentler/more honest than the industry's separate cold "refund declined" email (Eventbrite [HIGH]) - INDUSTRY-PATTERNS opportunity 4. A `scanned` ticket should still render but with a `Already scanned` note (defensive; not a hard requirement for V1 but recommended).
- **Multi-ticket display:** stack one block per ticket vertically (SeatGeek documents per-ticket-split vs single-Mobile-ID confusion [HIGH]; per-ticket blocks are unambiguous for groups). Render the buyer's own tickets only; do not expose other holders' secrets.
- **Alternatives considered + rejected:**
  - PDF attachment of tickets (Ticketmaster print-at-home [HIGH], Ticket Tailor opt-in [HIGH], Humanitix invoice [HIGH]) - rejected for the ticket itself: attachments hurt deliverability, are not mobile-friendly to open, and EventLinqs already has a superior hosted-PNG + bearer-link stack. (Keep PDF only for the tax invoice/receipt - see element 7.)
  - Link-only, no inline QR (Eventbrite/Ticketmaster default [HIGH]) - rejected: misses the no-account/low-bandwidth/WhatsApp-share opportunity that EventLinqs is uniquely positioned for (INDUSTRY-PATTERNS opportunity 2). Trade-off accepted: inline static QR is more screenshot/forward-able (weaker anti-resale than AXS/DICE [HIGH]) - acceptable for community events where friction and accessibility matter more than resale lockdown, and the bearer secret + status check still gates validity server-side.
  - Per-order single QR (AXS Mobile ID model [HIGH]) - rejected: group buyers at culture events need to split entry; per-ticket is clearer.

### 6. Order / event facts block

- **Decision: KEEP current strong parts, REORDER for hierarchy.**
- **Final order, top to bottom:** event title → date/time (tz-aware, existing `Intl en-AU` formatter with `timeZoneName: 'short'` - this is already correct and better than most; keep) → venue name, city, country → order number (label it `Order {order_number}`, this is the support reference, keep from current code) → ticket count.
- **Why:** Eventbrite blog mandates start time, venue location, ticket quantity [MED]; Universe headers the event name [HIGH]; Ticketmaster makes the order number first-class for support [HIGH]. EventLinqs's existing tz-aware AU date format is already a quiet strength (many competitors' formats are UNV; doing tz-correct by default is "table-stakes done better", INDUSTRY-PATTERNS opportunity 5). Keep it verbatim.
- **Gap to consider (open question):** venue street address + a maps link are recommended by Eventbrite blog ("venue location") [MED] but current code only has venue_name/city/country, no street/lat-long. If address data exists on the event, add it and a maps URL; if not, this is a data gap to flag, not a copy decision.

### 7. Payment / receipt

- **Decision: KEEP total + Stripe receipt link; ADD explicit AUD/currency clarity; FLAG tax invoice.**
- **Final:** `Total paid: {CURRENCY} {amount}` (keep current, currency uppercased - already done). If `receipt_url` present: `View your Stripe receipt` link (keep). Add a one-liner only if a fee breakdown is available; do not fabricate line items.
- **Why:** Eventbrite frames the email itself as "a receipt of purchase" [HIGH]; Humanitix attaches a PDF tax invoice [HIGH]; the platform philosophy in CLAUDE.md is all-in transparent pricing. The Stripe receipt link satisfies the receipt expectation without us re-implementing a receipt.
- **Open question for founder (AU GST):** Humanitix attaches a GST-compliant PDF tax invoice by default [HIGH]; for an AU sole-trader (ABN 30 837 447 587) selling to AU buyers, a compliant tax invoice may be a legal expectation above a threshold. The Stripe receipt may or may not satisfy AU tax-invoice requirements. Recommend: confirm whether the Stripe receipt is treated as the tax invoice, or whether EventLinqs must attach/link a GST tax invoice. Flagged, not assumed.

### 8. Trust / help

- **Proposed closing:** "Any questions, just reply to this email and a person will help"
- **Decision: ADOPT (revised for AU comma style, no em-dash, no exclamation - already compliant).**
- **Final:** `Any questions, just reply to this email and a real person will help you.`
- **Why:** This is EventLinqs's single biggest brand differentiator in this category. Every competitor routes to a help-center or organiser form (Eventbrite "Contact the event organizer" [HIGH], Universe "Have Questions?" → help center [HIGH], Humanitix "contact host" [HIGH]); none documents a "reply to a human" promise. Warm human tone in a transactional email is the top opportunity competitors miss (INDUSTRY-PATTERNS opportunity 1).
- **Hard implementation dependency:** `from:` is currently `noreply@eventlinqs.com`. A "reply to this email" promise with a `noreply` address is a broken promise and worse than no promise. **The email must set a monitored `reply_to` (e.g. `Reply-To: help@eventlinqs.com`) for this line to be honest.** This is a Session-1-owned file (`src/app/api/webhooks/stripe/**`) change and an infra/inbox dependency - flag to project manager; do not ship the copy without the reply path.
- **Also add:** lost-ticket reassurance line: `Lost this email? Your tickets are always at eventlinqs.com/tickets when you are signed in, or use the ticket link above.` Mirrors the universal account/secure-link recovery pattern (Eventbrite [HIGH], Ticket Tailor [HIGH], Humanitix [HIGH]) and uses EventLinqs's existing `/tickets` dashboard + bearer link.

### 9. Footer

- **Proposed:** "The EventLinqs team. The ticketing platform built for every culture."
- **Decision: KEEP (already in current code, on-brand, matches sub-tagline in CLAUDE.md).**
- **Final:** `The EventLinqs team. The ticketing platform built for every culture.` plus a minimal legal/identity line: `EventLinqs, Geelong, Australia. You received this because you bought tickets on EventLinqs.` (single-sentence CAN-SPAM/transactional-context line; no marketing, no unsubscribe needed for a transactional receipt). No em-dash, no exclamation - compliant.
- **Why:** The sub-tagline is the canonical EventLinqs sign-off (CLAUDE.md). A minimal sender-identity line is standard transactional hygiene; competitors all identify the sender (Humanitix sender `order@humanitix.com` [HIGH]).

### 10. Accessibility / plain-text

- **Decision: ADD (currently absent in code).**
- **Final requirements:**
  - Every QR `<img>` must carry `alt` text: `alt="QR code for {Event} ticket {EL-XXXX-XXXX}, holder {name}"` - so a screen-reader user (or a blocked-image client) still knows what it is and has the code in text. No competitor's a11y is verified [UNV] - doing this is a low-cost lead, not just parity.
  - Provide a `text` body to Resend alongside `html` (Resend supports both). Plain-text must include: event, date/time, venue, order number, each ticket code + its `/t/{code}?k=` URL, total, the reply-for-help line. This guarantees the ticket is recoverable even if HTML/images are stripped (Gmail clipping, corporate filters - Humanitix documents heavy filtering issues [HIGH]).
  - Keep the existing inline-style, single-column, max-width 600px, sans-serif approach (already in current code) - this is correct mobile-first email practice (mobile-first is industry-standard, all 8).
- **Why:** Humanitix's own help doc is dominated by deliverability/filtering guidance [HIGH]; a robust plain-text alternative directly de-risks the "I never got my ticket" support load.

---

## Final recommended email

### Subject
`Your tickets for {Event}`

### Pre-header (hidden preview text)
`Your EventLinqs order is confirmed. Your QR is in this email and at your ticket link.`

### Body (HTML, single column, max-width 600px, inline styles, brand navy #1A1A2E / accent #4A90D9; text wordmark, no hero image)

```
EVENTLINQS                                         [text wordmark, navy]

You are going to {Event}{, firstName if present}.
Your order is confirmed and your ticket is ready below. No app needed.

----------------------------------------------------------------------

{Event title}                                                  [H2]
{Saturday, 14 June 2026, 7:00 pm AEST}        [existing Intl en-AU fmt]
{Venue name}, {City}, {Country}
Order {ORDER_NUMBER}
{N} ticket(s)

----------------------------------------------------------------------

YOUR TICKET(S)

  For each VALID ticket:
    {Holder name}
    [ inline QR image  src=.../api/tickets/{code}/qr?k={secret}
      alt="QR code for {Event} ticket {EL-XXXX-XXXX}, holder {name}" ]
    {EL-XXXX-XXXX}
    Open ticket  ->  /t/{code}?k={secret}          [button, accent]
    Show this QR at entry. One QR admits one person.

  For each REFUNDED / VOID / TRANSFERRED ticket (no QR):
    {Holder name}
    [muted panel] This ticket was {refunded|cancelled|transferred}
    and is no longer valid.

----------------------------------------------------------------------

Total paid: {CURRENCY} {amount}
View your Stripe receipt  ->  {receipt_url}        [only if present]

----------------------------------------------------------------------

Any questions, just reply to this email and a real person will help you.
Lost this email? Your tickets are always at eventlinqs.com/tickets when
you are signed in, or use the ticket link above.

----------------------------------------------------------------------

The EventLinqs team. The ticketing platform built for every culture.
EventLinqs, Geelong, Australia. You received this because you bought
tickets on EventLinqs.
```

### Plain-text alternative (sent via Resend `text:`)
Same content, no markup: event, date/time (tz), venue, `Order {ORDER_NUMBER}`, then per ticket `{Holder} - {EL-XXXX-XXXX} - https://eventlinqs.com/t/{code}?k={secret}` (or the not-valid line), `Total paid: {CCY} {amount}`, receipt URL if present, the reply-for-help line and `/tickets` line, footer.

---

## Implementation notes / dependencies (NOT copy decisions - flag to PM)

1. **Remove the placeholder line unconditionally** (`route.ts` ~L791-793). This is the explicit goal and the worst current trust leak (no competitor ships placeholder copy - INDUSTRY-PATTERNS mistake 1).
2. **`reply_to` must be set to a monitored mailbox** for element 8's promise to be honest. `from` stays `noreply@eventlinqs.com`; add `reply_to`. This is a Session-1-owned file change (`src/app/api/webhooks/stripe/**`) - coordinate via project manager. Without a monitored reply mailbox, soften the copy to the `/tickets` + ticket-link recovery line only.
3. **Per-ticket data:** the per-ticket block needs each ticket's `code`, `secret`, `holder`, `status`. Current `buildConfirmationEmailHtml` only receives aggregate `order_items`. The send path / query must be extended to fetch ticket rows. Target state, flagged.
4. **Add Resend `text:`** alongside `html:` in the `resend.emails.send(...)` call (~L714-719).
5. **AU GST tax invoice** (element 7 open question) - founder decision required.
6. **Address/maps** (element 6 gap) - depends on whether event street address exists in the schema.

## Open questions for the founder

1. Is the Stripe receipt accepted as the AU GST tax invoice, or must EventLinqs attach/link a separate compliant tax invoice (Humanitix attaches one by default [HIGH])?
2. Will a monitored `reply_to` mailbox (e.g. `help@eventlinqs.com`) exist at launch? The warm "reply and a real person will help" line depends on it being real.
3. Should the buyer's first name be used in the opening line when available, accepting it must degrade cleanly when absent (guest checkout with no name)?
4. Do events carry a street address / coordinates for a venue + maps link, or is venue name/city/country the ceiling for V1?
5. Per-ticket QR confirmed acceptable vs per-order single QR? Recommended per-ticket (group culture-event buyers) but it is a product/anti-resale trade-off worth an explicit founder call.
