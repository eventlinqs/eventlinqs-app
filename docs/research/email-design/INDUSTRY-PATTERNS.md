# Industry Patterns: Ticketing Confirmation Emails

Research date: 2026-05-17. Synthesised from 8 competitors (see COMPETITORS-RAW.md, COMPARISON-MATRIX.md).

Labels: [HIGH] verbatim vendor doc / captured public screenshot · [MED] vendor blog/structure doc, paraphrased · [LOW] third-party/inferred · [UNV] unverified.

---

## Table-stakes patterns (most competitors do these)

1. **Send a confirmation email within minutes of purchase, framed as proof of purchase.** Humanitix "within a few minutes" [HIGH]; Eventbrite "a receipt of purchase" [HIGH]. The email's primary psychological job is trust/peace-of-mind (Eventbrite blog: "the ultimate peace of mind ... proof of purchase") [MED]. 8/8.

2. **The email is a gateway, not always the scannable ticket.** A prominent primary CTA ("Go to my tickets" Eventbrite [HIGH]; "view tickets" Humanitix [HIGH]; "View/Claim Your Tickets" Ticketmaster [HIGH]). 7/8 (DICE app-only). EventLinqs's `/t/[code]?k=` bearer page is the right primitive for this.

3. **Surface the order/confirmation number prominently as the reference key.** Ticketmaster treats it as first-class (dedicated help article) [HIGH]; Eventbrite blog lists "the order confirmation number" as required [MED]. Universally used for support/recovery.

4. **Restate the core event facts: title, date/time, venue.** Eventbrite blog mandates start time + venue location + ticket quantity + total incl. tax [MED]. Universe embeds event name as the digital-ticket header [HIGH]. The email must stand alone as the reference until the event.

5. **Receipt / payment summary in the email; tax invoice handled deliberately.** Eventbrite = email IS the receipt, tax invoice separate PDF [HIGH]; Humanitix = PDF tax invoice attached [HIGH]; Ticket Tailor = order confirmation carries summary, invoice optional [HIGH]. For AU, a GST-compliant tax invoice is expected (Humanitix attaches one) [HIGH].

6. **Lost-ticket recovery path that does not require the original email.** Account-login (Eventbrite [HIGH], Ticketmaster [HIGH], AXS [HIGH]); email-secure-link (Ticket Tailor [HIGH]); organiser resend with proof-of-purchase + last-4-card (Humanitix [HIGH]). EventLinqs has `/tickets` dashboard + the resend primitive available.

7. **Route buyer questions to a human/organiser, with the platform disclaiming event ownership.** Humanitix "contact host" button [HIGH]; Eventbrite "Contact the event organizer" [HIGH]; Universe "Have Questions?" section [HIGH]. EventLinqs's reply-to-a-person model is a competitive upgrade on this (most route to a help-center, not a reply).

8. **Refund / cancellation / transfer are separate dedicated emails, not states crammed into the confirmation.** Eventbrite has explicitly separate refund-confirmation, order-cancelation, refund-declined emails [HIGH]. The original confirmation stays a clean artefact.

9. **Mobile-first; wallet pass is an increasingly standard add-on.** Humanitix Apple/Google/Samsung [HIGH]; SeatGeek wallet [MED]; everyone deep-links to an app/web ticket. No competitor relies on a desktop-only layout.

10. **A pre-event reminder re-delivers the ticket/QR.** Universe re-sends confirmation info + QR 24h before [HIGH]; Eventbrite 48-hour reminder [HIGH]; SeatGeek/Ticketmaster release barcodes 1-7 days before [HIGH]. Redundancy is expected, not optional.

---

## Differentiators (unique or rare; potential edge)

1. **Anti-fraud ticket binding (premium tier).** AXS rotating-60s QR, not emailable/screenshottable [HIGH]; DICE QR bound to phone number, app-locked [HIGH]; Ticketmaster withholds barcode until 3-7 days pre-event [HIGH]. Strong anti-resale, but at a real UX cost (no offline-static ticket, app dependency). EventLinqs's static hosted-PNG-with-secret model trades some resale resistance for far better UX and accessibility - a deliberate, defensible position for community events.

2. **No-account ticket access.** Humanitix: "does not require an account ... You can always access your digital tickets through your confirmation email" [HIGH]. Strong for low-friction, community/first-time buyers. EventLinqs already supports this via the bearer `?k=` secret link - matches Humanitix, beats Eventbrite/TM/AXS (which force accounts).

3. **Two-email split (Ticket Tailor): order receipt vs ticket delivery as distinct emails** [HIGH]. Cleaner separation but doubles inbox volume and risks the ticket email being missed. Most others fold both into one. EventLinqs's single combined email is the more common and lower-friction choice.

4. **Documented, componentised, organiser-themeable email (Universe)** [HIGH] with explicit social-links card and replaceable "Have Questions?" block. Most sophisticated structure publicly documented; 70-char subject cap is a concrete constraint worth matching.

5. **Vendor-prescribed subject science (Eventbrite blog)** [MED]: pronoun-led, event-named, <60 chars, no caps/exclamation, optional emoji. Rare to see a competitor publish the exact formula - it is effectively free competitive intelligence and aligns with EventLinqs brand rules (no exclamation marks already mandated).

6. **Embedded inline QR in the email body (Universe, default)** [HIGH] vs the majority "link out" model. Fastest path to entry (no extra tap, works offline once email is open) but weaker anti-resale. EventLinqs's hosted QR PNG endpoint enables exactly this - a differentiator vs Eventbrite/Ticketmaster's link-only default.

7. **Buyer Guarantee surfaced inside the flow (SeatGeek)** [HIGH] - an explicit trust device naming the protection. EventLinqs equivalent would be the warm "a person will help" promise plus a clear refund line.

---

## Competitor mistakes to avoid

1. **Placeholder / "coming soon" language in a transactional email.** This is EventLinqs's current self-inflicted wound (`"Your tickets will be available ... once our ticketing system is fully activated"`). No competitor ships this; it actively destroys the trust the email exists to create (cf. Eventbrite blog on confirmation = peace of mind). **Remove unconditionally.**

2. **Barcode-withholding with weak explanation (Ticketmaster).** Buyers report confusion ("tickets will appear closer to the date") and spam-folder anxiety [LOW]. If EventLinqs ever delays QR, it must say exactly when and why in plain language.

3. **App-only lock-out (DICE/AXS) without a graceful degraded path.** Powerful anti-resale, but excludes low-end devices, hurts accessibility, and creates door-list dependency. Avoid for a culture-first, low-bandwidth-aware platform.

4. **Routing all help to a help-center, never a human.** Eventbrite/Universe default to help-center links. EventLinqs's "just reply to this email and a person will help" is a genuine differentiator - keep it, and make the reply-to actually monitored.

5. **Two emails that fragment the order (Ticket Tailor).** Higher chance the ticket email is lost. Keep EventLinqs single-email.

6. **Subject lines that bury the event name** (Eventbrite's documented bad example: "Here are your event tickets for our upcoming event"). Always name the event.

7. **Relying on the buyer still having the original email for recovery.** Everyone who does recovery well has an account or secure-link fallback. EventLinqs has `/tickets` + bearer link - use both in the email.

---

## Opportunities competitors miss

1. **A genuinely warm, human, reply-to-a-real-person tone in a transactional email.** Every competitor's confirmation is functional/corporate. EventLinqs's brand voice (community-first, AU English, no exclamation, "a person will help") is a real differentiator in a category that is uniformly cold. Evidence: no competitor help doc describes a warm voice; Eventbrite blog only recommends it generically [MED].

2. **Inline QR that also works for the no-account, low-bandwidth, WhatsApp-share buyer.** Humanitix gets no-account; Universe gets inline QR; nobody publicly combines no-account + inline QR + warm copy. EventLinqs's hosted-PNG + bearer-link + dashboard stack can do all three. This is the single biggest open opportunity.

3. **Per-ticket holder name + per-ticket QR with a clear "one QR admits one person" instruction in the email body.** Eventbrite blog recommends holder name [MED] but most emails are per-order. Per-ticket clarity reduces gate confusion for group buyers (a common culture-event scenario: families, friend groups).

4. **Explicit, gentle refunded-ticket state inside a re-opened email/ticket page** rather than a separate cold "refund declined" email. EventLinqs's plan to show a not-valid panel (no QR) on a refunded ticket is more honest and less jarring than the industry's separate-email pattern - keep it.

5. **AU-correct tax invoice + AUD formatting + tz-aware date as a baseline, not an organiser afterthought.** Humanitix attaches a PDF tax invoice [HIGH]; others make it optional/organiser-dependent. For an AU-first platform, doing GST-correct receipts by default is table-stakes done better.
