# Confirmation Email Comparison Matrix

Research date: 2026-05-17. 8 competitors x dimensions A-J. Each cell carries an evidence label.

Labels: **[HIGH]** verbatim help doc / captured public screenshot · **[MED]** vendor blog/marketing/API/structure doc, paraphrased · **[LOW]** third-party/inferred · **[UNV]** UNVERIFIED, purchase-walled (sent email not obtainable).

Dimensions: A subject · B structure · C ticket delivery · D info completeness · E payment/receipt · F trust/help · G mobile · H accessibility · I voice · J edge cases.

## Matrix

| Competitor | A Subject | B Structure | C Ticket delivery | D Info complete | E Payment/receipt | F Trust/help | G Mobile | H A11y | I Voice | J Edge cases |
|---|---|---|---|---|---|---|---|---|---|---|
| **Eventbrite** | "Your tickets for {Event}" formula, <60 chars, pronoun-led, no caps/!, emoji ok [MED]; system string [UNV] | Receipt + "Go to my tickets" CTA + optional organiser msg [HIGH]; vendor screenshot saved [HIGH] | Web/app login is primary; tax invoice = separate PDF attach; scannable code not guaranteed [HIGH]; in-email QR/PDF only if organiser adds [MED] | Start time, venue, qty, total incl tax, order #, attendee name, validity (blog-prescribed) [MED]; live format [UNV] | Framed as "receipt of purchase"; tax invoice separate PDF [HIGH] | Routes to organiser; account-login recovery + "Find my tickets"; Apple Hide-My-Email handled [HIGH] | Dedicated app, deep-link CTA [HIGH] | [UNV] | Warm, personalised, first name, short [MED] | Refund/cancel/decline = separate emails; claim-ticket email [HIGH] |
| **Humanitix** (AU) | [UNV]; inbox-search keywords "Humanitix/tickets/confirmation" [LOW] | "view tickets" button (not attached) + "contact host" button; PDF invoice attached [HIGH]; help screenshot saved [HIGH] | Hybrid: web view-tickets + attached PDF tax invoice; Apple/Google/Samsung wallet; no account needed [HIGH]; per-ticket QR [UNV] | [UNV]; sender order@humanitix.com [HIGH] | PDF tax invoice/receipt attached (AU GST) [HIGH] | "contact host" in email → organiser; documented resend + alt-email recovery (proof + last4) [HIGH] | Tri-wallet support [MED] | [UNV] | Plain, helpful, AU English [LOW] | Resend flow documented; organiser can disable digital tickets; custom msgs/attachments [HIGH] |
| **Ticket Tailor** | [UNV]; two emails ⇒ two subjects | TWO emails: Order confirmation (receipt/summary) + Event confirmation (tickets/codes) [HIGH] | Event-confirm carries codes (web); PDF = opt-in toggle "Attach ticket vouchers as a PDF"; per-ticket QR in PDF [HIGH]; PDF screenshot saved [HIGH] | Buyer answers mergeable; PDF shows per-ticket detail+QR [MED]; live format [UNV] | Order confirmation carries summary/receipt; invoice option [HIGH] | Self-serve portal: view/print/resend/reschedule/cancel+refund; email-link recovery; always-on "lost your tickets?" link [HIGH] | PDF pitched for phone print/share/download [MED] | [UNV] | Plain UK English (help) [LOW] | "Void" label on voided items; pending-payment handling; edited confirmations re-served [HIGH] |
| **DICE.fm** | [UNV] | App-first; email secondary/informational [UNV] | App-locked QR bound to phone number; offline after first view; NO emailable/printable QR; venue door-list+ID fallback [HIGH] | [UNV] | [UNV] | Support via app; door-list by account name [HIGH] | App-only by design [HIGH] | [UNV] | [UNV] | In-app activation near event time [LOW]; anti-resale by design [HIGH] |
| **Ticketmaster** | [UNV]; "You're in" + details [LOW] | Email = gateway: "View/Claim Your Tickets" buttons [HIGH] | Mobile barcode withheld until 3-7 days pre-event; "cannot be printed, emailed or screenshot"; print-at-home path = PDF attach; transfer = "Accept Tickets" email [HIGH] | Order confirmation # first-class; delivery method in ticket details [HIGH]; live email [UNV] | Receipt/order # concept documented [HIGH]; live detail [UNV] | Help-center routed; email→account claim; transfer email-match [HIGH] | Mobile-only default, "easiest and safest" [HIGH] | [UNV] | [UNV] | Barcode-withholding; resale 24h appear delay; transfer accept [HIGH] |
| **AXS** | [UNV] | Email = proof-of-purchase + app-direction (not the ticket) [HIGH] | Rotating 60s QR (Mobile ID), app-only, NOT emailable, NOT screenshottable [HIGH] | [UNV] | [UNV]; email is box-office proof-of-purchase [HIGH] | Phone-dead fallback = ID+card+confirmation email at box office; account=purchase email [HIGH] | App-only [HIGH] | [UNV] | [UNV] | Transfer-confirmation email for non-account recipients; recall unclaimed [HIGH] |
| **SeatGeek** | [UNV]; transfer subjects "Your Ticket Transfer Offer"/"Sent you tickets" [MED] | Order confirmation distinct from ticket-delivery email; delivery link one-time-use [HIGH] | Mobile-transfer via link to 3rd-party platform; tickets do NOT enter SeatGeek acct; delivery lag to ~24h pre-event [HIGH] | [UNV] | Buyer Guarantee surfaced as trust device [HIGH] | Support from order details; resend documented [HIGH] | Wallet (Apple/Google) referenced [MED] | [UNV] | [UNV] | Multi-ticket: single Mobile ID vs split emails; hidden barcodes until event day [HIGH] |
| **Universe** | Organiser-customisable, **70-char cap**, text+emoji [HIGH] | Documented component model: Header/Title/Content/Event Details Card(social)/Additional Info/Have Questions [HIGH] | Embedded digital ticket + QR in email; per-ticket QR (add-on QR optional) [HIGH] | Event name in digital-ticket header; order detail via Additional Info section [HIGH]; live format [UNV] | Order detail via Additional Info section [HIGH] | "Have Questions?" section default→help center, organiser-replaceable [HIGH] | [MED] reminder re-sends QR 24h pre-event | [UNV] | [UNV] | 24h reminder re-sends confirmation+QR; per-ticket-type templates [HIGH] |

## Industry-standard vs divergent (6+ competitors = standard)

| Pattern | Status | Who | Evidence |
|---|---|---|---|
| Confirmation email exists and is sent within minutes | **STANDARD** (8/8) | All | [HIGH] Humanitix/Eventbrite verbatim; others by delivery docs |
| Email is a receipt + gateway, NOT necessarily the scannable ticket | **STANDARD** (7/8: EB, HX, TT, TM, AXS, SG, Uni; DICE app-only) | 7 | [HIGH] across vendor docs |
| Tickets accessed via web/app link OR wallet, not raw inline QR by default | **STANDARD** (6/8) | EB, HX, TM, AXS, SG, DICE | [HIGH] |
| Inline/attached QR or PDF actually in the email | **DIVERGENT/SPLIT** | Universe (embedded QR, default) [HIGH]; Humanitix (PDF invoice attach, ticket via button) [HIGH]; Ticket Tailor (PDF opt-in) [HIGH]; Eventbrite (only if organiser adds) [MED]. TM/AXS/DICE: deliberately NEVER. | mixed |
| Per-ticket QR (vs per-order) | **DIVERGENT** | Universe per-ticket [HIGH]; Ticket Tailor per-ticket in PDF [HIGH]; AXS single Mobile ID per group (per-order) [HIGH via SeatGeek doc]; others [UNV] | mixed |
| Wallet passes (Apple/Google) | **STANDARD-ish** (4/8 explicit) | Humanitix (3 wallets) [HIGH], SeatGeek [MED], TM/AXS via app [LOW] | mixed |
| Separate refund/cancel/transfer emails (not states in confirmation) | **STANDARD** (Eventbrite explicit; TM, AXS, SG, TT transfer/void) | 6+ | [HIGH] Eventbrite 748624 |
| Buyer questions routed to organiser/host (platform disclaims) | **STANDARD** (EB, HX, TT, Universe) | 4+ | [HIGH] |
| Lost-ticket recovery is account/email-based | **STANDARD** (EB, HX, TT, TM, AXS) | 5+ | [HIGH] |
| Subject: pronoun-led, event name, no caps/!, short | **DIVERGENT (Eventbrite-prescribed)**; supported by Uni 70-char cap | EB [MED], Uni cap [HIGH] | mixed |
| Anti-screenshot / rotating / phone-bound QR | **DIVERGENT (premium-tier only)** | AXS (60s rotate), DICE (phone-bound), TM (withheld) | [HIGH] |
| Tax invoice as separate PDF (AU/receipt) | **DIVERGENT but key for AU** | Humanitix [HIGH], Eventbrite (when issued) [HIGH], Ticket Tailor (option) [HIGH] | [HIGH] |
| 24-48h pre-event reminder re-sends ticket/QR | **DIVERGENT (good practice)** | Universe [HIGH], Eventbrite 48h reminder [HIGH], SeatGeek/TM delivery timing [HIGH] | [HIGH] |

## Hard numbers captured

| Number | Value | Source/label |
|---|---|---|
| Eventbrite prescribed subject length | < 60 characters | [MED] EB blog |
| Universe subject hard cap | 70 characters (text + emoji) | [HIGH] Universe help |
| Ticketmaster mobile barcode release window | 3-7 days before event | [HIGH] TM help |
| SeatGeek mobile-transfer delivery | often within 24h of event (24-48h release) | [HIGH] SG help |
| AXS Mobile ID QR refresh | every 60 seconds | [HIGH] AXS FAQ |
| Humanitix confirmation delivery time | "within a few minutes" | [HIGH] HX help |
| Humanitix wallet targets | Apple, Google, Samsung (3) | [HIGH] HX help |
| Eventbrite intro length guidance | 2-3 lines, first name in line 1 | [MED] EB blog |
| QR granularity | Universe + Ticket Tailor = per-ticket; AXS = per-order (single Mobile ID/group) | [HIGH] |
