# Confirmation Email Research: Per-Competitor Raw Findings

Research date: 2026-05-17. Researcher: Claude Code (Session 3, admin/marketing worktree).

## Evidence labels

- **[HIGH]** = verbatim vendor help-doc text, or captured public screenshot of the email/ticket itself.
- **[MED]** = vendor feature / marketing / blog / API doc, paraphrased (vendor-authored, but describes rather than shows the sent email).
- **[LOW]** = third-party / review / inferred from related behaviour.
- **[UNVERIFIED]** = could not confirm; reason stated.

Hard constraint honoured: post-purchase confirmation emails are behind purchase walls. No real sent email was obtained for any competitor. Every screenshot saved is a PUBLIC vendor help-doc asset, not a private inbox capture. Where a competitor's email could not be seen, this is stated as "UNVERIFIED - purchase-walled" with the source actually used.

Screenshots saved under `screenshots/`:

- `eventbrite-confirmation-email.png` - Eventbrite's own help-doc image of an order confirmation email (public asset from help article 583361).
- `eventbrite-mobile-ticket.png` - Eventbrite's own help-doc image of a ticket in the mobile app (public asset, article 583361).
- `humanitix-confirmation-view-tickets.png` - Humanitix help-doc image of the "view tickets" button on the confirmation email (public asset, article 8924058).
- `tickettailor-pdf-tickets.png` - Ticket Tailor help-doc image of example PDF tickets with QR codes (public asset, article 2455133).

---

## 1. Eventbrite

Sources:

- Help: https://www.eventbrite.com/help/en-us/articles/583361/what-do-eventbrite-tickets-look-like/
- Help: https://www.eventbrite.com/help/en-us/articles/748624/what-emails-will-attendees-automatically-receive/
- Help: https://www.eventbrite.com/help/en-us/articles/319355/where-are-my-tickets/
- Vendor blog: https://www.eventbrite.com/blog/confirmation-email-template/

### A. Subject line

- **[MED]** Eventbrite's own blog prescribes the subject formula and gives a good/bad example pair (vendor-authored guidance, not the literal system subject): GOOD = "Your tickets for the House Of Sin 11 Edition After-Hours Event"; BAD = "Here are your event tickets for our upcoming event". Quoted rules (verbatim from the blog): subject should "Start the sentence with a personal pronoun like 'you' or 'your'", "Specify the event name", "Be shorter than 60 characters", "Avoid writing in all caps or including exclamation marks", "Include an emoji to increase the chances of people clicking on it."
- **[LOW]** Account-activation email subject is quoted verbatim in help doc 319355: "Activate your Eventbrite account" (sent from `noreply@event.eventbrite.com`). This confirms the sender domain pattern but is the activation email, not the order confirmation.
- System order-confirmation subject exact wording: **UNVERIFIED - purchase-walled.** Used vendor blog guidance + help screenshot instead.

### B. Email structure

- **[HIGH]** Verbatim (help 583361): "When attendees purchase tickets on Eventbrite they receive a confirmation email as a receipt of purchase. Tickets can be accessed by logging in to the Eventbrite website or mobile app using the email address associated with their order."
- **[HIGH]** Verbatim (help 583361, "Things to keep in mind"): "The confirmation email includes the receipt of purchase and may also include a message from the organizer." and "Some events will issue tax invoices. If included, they will be attached to the confirmation email as a separate PDF file." and "Some events don't have scannable codes included with their tickets."
- **[HIGH]** Help-doc screenshot of the actual email saved as `screenshots/eventbrite-confirmation-email.png` (Eventbrite's own published image; tall single-column receipt layout, orange brand header).
- **[HIGH]** Verbatim (help 319355): the email CTA is "Go to my tickets" ("Open the email from Eventbrite. Select Go to my tickets.").
- **[MED]** Blog-prescribed structure: clear subject; personalised intro using attendee first name, 2-3 lines, warm/appreciative; order summary + event details (start time, venue location, ticket quantity, total cost including tax, special notes); PDF/QR evidence block; refund/cancellation policy.

### C. Ticket delivery

- **[HIGH]** Primary delivery is web/app-link, NOT inline QR. Verbatim (583361): tickets "can be accessed by logging in to the Eventbrite website or mobile app." Email's job is receipt + "Go to my tickets" link.
- **[HIGH]** Tax invoice (when issued) is a separate PDF attachment (583361, quoted above). Scannable code is not guaranteed on all events (583361).
- **[MED]** Blog explicitly recommends organisers also include a PDF/QR in-email as a fallback "even if you have a separate app or website for ticket access ... so even if attendees lose their password, they always have an alternative ticket."
- Per-ticket vs per-order QR, code format: **UNVERIFIED - purchase-walled.**

### D. Info completeness

- **[MED]** Blog "order summary and event details" must include: event start time, venue location, quantity of tickets purchased, total cost (incl. tax), special notes. Holder-name on ticket recommended by blog ("The name of attendees on the ticket to prevent unauthorized reselling") plus "When the ticket valid is for use" and the order confirmation number.
- Exact date/time format and timezone handling in the live email: **UNVERIFIED - purchase-walled.**

### E. Payment / receipt

- **[HIGH]** Email is explicitly framed as "a receipt of purchase" (583361). Tax invoice as separate PDF when applicable.
- **[HIGH]** Refund/cancellation are separate dedicated emails, not the order confirmation (748624): "Refund confirmation email: sent when a refund is issued for a paid order", "Order cancelation email: sent when the attendee or the organizer cancels a free order", "Refund request declined email".

### F. Trust / help

- **[HIGH]** 748624 verbatim: the welcome email "differentiates between Eventbrite and the event organizer". Eventbrite routes buyer questions to the organiser ("Contact the event organizer" link).
- **[HIGH]** Lost-ticket recovery is account-login-based (319355): log in with order email, or "Find my tickets" by purchase details; covers the Apple Hide-My-Email edge case explicitly.

### G. Mobile

- **[HIGH]** Mobile-first by design: a dedicated app, and the email's main action is "Go to my tickets" deep-linking to web/app. Help screenshot of mobile ticket saved.

### H. Accessibility

- Alt text / plain-text alternative in the live email: **UNVERIFIED - purchase-walled.**

### I. Brand voice

- **[MED]** Blog voice guidance: warm, appreciative, personalised with first name, "short and punchy"; explicitly anti-jargon and anti-exclamation in subjects.

### J. Edge cases

- **[HIGH]** Refunded / cancelled / declined are all separate emails (748624), not states inside the confirmation email. 48-hour reminder is also a separate automated email. Claim-ticket email sent when buyer email differs from attendee email.

---

## 2. Humanitix (AU-headquartered, primary AU competitor)

Sources:

- Help: https://help.humanitix.com/en/articles/8924058-how-do-i-access-my-digital-ticket
- Help collection: https://help.humanitix.com/en/collections/16601617-tickets-and-email-delivery
- Help: https://help.humanitix.com/en/articles/10068288-resend-an-order-confirmation-email-and-tickets
- Help: https://help.humanitix.com/en/articles/8897172-add-custom-messages-to-the-order-confirmation-email-post-checkout-page

### A. Subject line

- Exact subject: **UNVERIFIED - purchase-walled.** Help-search keyword guidance (8924058) tells buyers to "Search your inbox using keywords. Look for words like 'Humanitix,' 'tickets,' or 'confirmation.'" - implying the subject/sender contains "Humanitix" and likely "tickets"/"confirmation". [LOW]

### B. Email structure

- **[HIGH]** Verbatim (8924058): "You will receive your digital tickets and PDF tax invoice/receipt in an order confirmation email sent to the email address entered during your purchase. You should typically receive this email within a few minutes."
- **[HIGH]** Verbatim (8924058): "Click the view tickets button on your order confirmation email to view your digital tickets. These are not attached separately. You can choose to also save your digital tickets to your Apple, Google, or Samsung Wallet."
- **[HIGH]** Email contains a "contact host" button (8924058: "get in touch with the event host directly by sending them a message using the contact host button on your order confirmation email").
- **[HIGH]** Help-doc screenshot of the email's "view tickets" UI saved as `screenshots/humanitix-confirmation-view-tickets.png` (Humanitix's own published asset).

### C. Ticket delivery

- **[HIGH]** Hybrid: web "view tickets" button (tickets are NOT a separate attachment) + a PDF tax invoice/receipt that IS attached. Wallet passes supported (Apple, Google, Samsung). Verbatim quotes above.
- **[HIGH]** No account required: "Humanitix does not require an account to purchase/access digital tickets. You can always access your digital tickets through your confirmation email." (8924058) - the email is the canonical ticket vehicle.
- **[HIGH]** Organiser can disable the view-tickets button (8924058: "If there is no 'view tickets' button ... the event host has disabled access to digital tickets").
- Per-ticket vs per-order QR, code format: **UNVERIFIED - purchase-walled.**

### D. Info completeness

- Event title/date/time/venue/address/holder/seat detail in the live email: **UNVERIFIED - purchase-walled.** Sender address is `order@humanitix.com` (8924058, verbatim) and campaigns from `campaigns@humanitix.com`.

### E. Payment / receipt

- **[HIGH]** PDF tax invoice / receipt is attached to the confirmation email (8924058, quoted). AU GST tax-invoice expectation met by attachment.

### F. Trust / help

- **[HIGH]** "contact host" button in the email routes buyer questions to the organiser (Humanitix positions itself as platform, not host: "Humanitix does not manage the events hosted on our platform").
- **[HIGH]** Lost-ticket recovery: buyer support page → search event → "contact host" form → select "Can't find my ticket/invoice"; host can resend; alternate-email recovery requires proof of purchase + last 4 card digits (8924058, all verbatim-sourced). Resend by organiser documented in 10068288.
- **[HIGH]** Extensive deliverability guidance: whitelist `order@humanitix.com`, check spam, mailbox quota, org firewalls (8924058).

### G. Mobile

- **[MED]** Wallet-pass support (Apple/Google/Samsung) is the strongest mobile signal; tickets are web-rendered, mobile-first.

### H. Accessibility

- Alt text / plain-text: **UNVERIFIED - purchase-walled.**

### I. Brand voice

- **[LOW]** Help-centre voice is plain, helpful, AU English ("organisation", "whitelisting"). Confirmation-email tone itself UNVERIFIED.

### J. Edge cases

- **[HIGH]** Resend flow for lost/wrong-email orders is fully documented (8924058, 10068288). Organiser can disable digital tickets entirely (separate-email-closer-to-event pattern). Custom organiser messages + attachments can be appended to the confirmation (8897172).

---

## 3. Ticket Tailor

Sources:

- Help: https://help.tickettailor.com/en/articles/8015413-how-to-edit-your-order-confirmation-email
- Help: https://help.tickettailor.com/en/articles/2455133-how-do-i-send-tickets-as-a-pdf
- Help: https://help.tickettailor.com/en/articles/8975333-how-can-i-enable-self-serve-order-management-for-my-ticket-buyers

### A. Subject line

- Exact subject: **UNVERIFIED - purchase-walled.** Two distinct emails exist (see B), implying two distinct subjects.

### B. Email structure (KEY: two separate emails)

- **[HIGH]** Verbatim (8015413): "An Order confirmation email is sent every time someone places an order in your box office" (a summary of their order: receipt, T&Cs, invoice). Separately: "An Event confirmation email contains the tickets or online event link for attendees of your event. An event confirmation email is sent automatically every time someone buys a ticket."
- **[HIGH]** Verbatim (8015413): "Anyone who makes an order through your Ticket Tailor Box Office will receive this email containing a summary of their order."
- Templates use placeholders for buyer/order details (8015413, paraphrased). Branded with box-office logo.

### C. Ticket delivery

- **[HIGH]** Default is the Event confirmation email containing tickets / ticket codes (web). PDF attachment is an OPT-IN toggle: verbatim (2455133) "Tick the box at the bottom that says 'Attach ticket vouchers as a PDF' ... Your ticket buyers will now receive a PDF attached to their order confirmation email."
- **[HIGH]** Help-doc screenshot of example PDF tickets "with the ticket details and QR codes for scanning" saved as `screenshots/tickettailor-pdf-tickets.png` (Ticket Tailor's own published asset; shows multiple tickets each with its own QR = per-ticket QR).
- Code format: **UNVERIFIED - purchase-walled** (visible QR in PDF screenshot but underlying code string not legible).

### D. Info completeness

- **[MED]** Buyer answers / custom fields can be merged into confirmations and invoices (article 10185454, referenced). PDF shows ticket details + QR per ticket (screenshot).

### E. Payment / receipt

- **[HIGH]** Order confirmation email explicitly carries the order summary/receipt and can carry an invoice (8015413). Self-serve refund/cancel supported with configurable fee retention (8975333).

### F. Trust / help

- **[HIGH]** Self-serve order management (8975333, verbatim highlights): buyers "can view and resend their tickets from your event page, or a URL"; "can view, print and resend their event/order confirmation and ticket codes"; reschedule; "cancel and (optionally) refund their order"; widget always shows a "Need help, or lost your tickets?" link to self-serve. Recovery is email-based: "field for the ticket buyer to enter the email address they used to make the booking ... 'Get a secure login link' button, and a 'Contact the event organiser' link".

### G. Mobile

- **[MED]** PDF is pitched for phone use: 2455133 verbatim "useful to send tickets out as a PDF to make it easier for ticket buyers to print, share and download tickets to their phone."

### H. Accessibility

- Plain-text / alt text: **UNVERIFIED - purchase-walled.**

### I. Brand voice

- **[LOW]** Help-centre voice is plain UK English; email voice UNVERIFIED.

### J. Edge cases

- **[HIGH]** Voided items show a "Void" label in buyer order details (8975333, verbatim). Pending-payment orders: buyer can resend event confirmation but not manage order. Edited confirmations are re-served (buyers see the updated event confirmation, not the original).

---

## 4. DICE.fm

Sources:

- Help: https://dicefm.zendesk.com/hc/en-gb/articles/19414143889169-How-to-access-your-tickets-if-you-can-t-get-on-the-app
- Help: https://dice.fm/help/article?id=19413725197713 (activation - referenced)

### A. Subject line

- Exact subject: **UNVERIFIED - purchase-walled.** DICE is app-first; email is secondary.

### B. Email structure

- App-centric; the email is not the primary ticket vehicle. **UNVERIFIED - purchase-walled** for layout. Used the help doc describing the app model instead.

### C. Ticket delivery (KEY: app-locked, phone-bound QR)

- **[HIGH]** Verbatim (19414143889169): "When you buy a ticket on DICE, it's stored securely in the app with a unique QR code linked to your phone number. This helps keep tickets off the secondary market."
- **[HIGH]** Verbatim: "As long as you've viewed your tickets at least once since purchase, they'll be available offline." and "if you accidentally delete the DICE app, your tickets won't be lost - simply re-download the app and log in."
- **[HIGH]** No-smartphone fallback is a venue door-list keyed to DICE account name + ID, NOT an emailed QR (verbatim: "Most venues maintain a DICE door list, allowing entry by showing a valid ID that matches your DICE account name"). Tickets are deliberately NOT deliverable as a printable/emailable QR.
- **[LOW]** Activation: tickets often require in-app "Activate QR Code" near event time (dice.fm/help article 19413725197713).

### D-J

- Info completeness, payment, voice, edge cases in any email: **UNVERIFIED - purchase-walled.** The defensible finding is the delivery model: anti-screenshot, app-and-phone-number-bound, offline-after-first-view, no email-as-ticket.

---

## 5. Ticketmaster

Sources:

- Help: https://help.ticketmaster.com/hc/en-us/articles/9641645631889-What-ticket-delivery-options-does-Ticketmaster-offer
- Help: https://help.ticketmaster.com/hc/en-us/articles/9606198059409 (claim tickets from confirmation email - referenced)
- https://www.ticketmaster.com/mobile-tickets

### A. Subject line

- **[LOW]** Third-party (Reddit r/Concerts, and a Facebook group) consistently report the confirmation email reads / starts with "You're in" plus purchase details (event, city, date, price). Treated as LOW (community report, not vendor doc). Exact subject: **UNVERIFIED - purchase-walled.**

### B. Email structure

- **[HIGH]** The confirmation email contains "View Your Tickets" or "Claim Your Tickets" buttons (help 9606198059409, verbatim: "From your confirmation email, click the View Your Tickets or Claim Your Tickets button"). The email is a gateway to the account, not the ticket itself.

### C. Ticket delivery (KEY: barcode withheld until 3-7 days before)

- **[HIGH]** Verbatim (9641645631889): "Mobile tickets cannot be printed, emailed or presented as a screenshot." and "You'll be able to access the ticket barcodes 3-7 days before your event."
- **[HIGH]** Print-at-Home path: verbatim "If you choose to have your tickets emailed to you, they'll be in your inbox as a PDF attachment." So emailed PDF exists only for the print-at-home delivery method, not mobile.
- **[HIGH]** Transfer flow: recipient gets an email with an "Accept Tickets" button; email address must match the account (9641645631889, verbatim).

### D-F

- **[HIGH]** Order confirmation number is a first-class concept (dedicated help: "How do I find my receipt or order confirmation number"). Delivery method shown in ticket details. Resale orders may take 24h to appear.
- Live email layout / receipt detail: **UNVERIFIED - purchase-walled.**

### G-J

- **[HIGH]** Mobile-only is the default and "easiest and safest" path (9641645631889). Barcode-withholding is the headline edge case: the confirmation email cannot contain a usable code for mobile-entry events.

---

## 6. AXS

Sources:

- https://www.axs.com/faq
- Help: https://support.axs.com/hc/en-us/articles/200747175 (resend confirmation - referenced)

### A. Subject line

- Exact subject: **UNVERIFIED - purchase-walled.**

### B-C. Email structure / delivery (KEY: app-only rotating QR, NOT emailable)

- **[HIGH]** Verbatim (axs.com/faq): "AXS Mobile ID is a digital ticket you use with your phone. This revolving QR code resets every 60 seconds." and "the AXS Mobile ID cannot be sent through a standard email, so we use the AXS App to host this technology."
- **[HIGH]** Verbatim: "Can I share screenshots of digital tickets to friends? No - AXS Mobile ID tickets include a mechanism that ensures the tickets cannot be copied or screenshot."
- **[HIGH]** The confirmation email's role is informational, pointing to the app: verbatim "After you purchased tickets, you'll be sent a confirmation email which will have additional information on when you can expect your tickets to arrive in your account."

### D-F. Trust / recovery

- **[HIGH]** Phone-lost/dead fallback explicitly involves the email: verbatim "If your phone is lost or dead at the event ... bring your ID, the credit card you used for the ticket purchase, and a copy of the confirmation email to the Box Office staff." (The confirmation email is the human-readable proof of purchase even though it is not the scannable ticket.)
- **[HIGH]** Account is keyed to the purchase email (where the confirmation was sent): "your account will be under the email address you used to complete the purchase (this is also where your confirmation email was sent)."
- **[HIGH]** Transfer recipient with no account "will receive a transfer confirmation email to the email address ... follow the steps to create an account."

### G-J

- Live email layout, voice: **UNVERIFIED - purchase-walled.** Defensible findings: email is proof-of-purchase + app-direction, never the QR; rotating-barcode anti-fraud model.

---

## 7. SeatGeek

Sources:

- Help: https://support.seatgeek.com/hc/en-us/articles/360018039394-What-is-mobile-transfer-ticket-delivery
- Help: https://seatgeek.com/help/articles/5531072769171 (captcha-blocked on scrape - see note)

### Note on scrape failure

- `seatgeek.com/help/articles/5531072769171` ("Where are my tickets?") was **CAPTCHA-blocked** on scrape (DataDome bot wall returned). Recorded honestly. Fell back to the support.seatgeek.com mobile-transfer article, which scraped cleanly.

### A. Subject line

- **[MED]** SeatGeek's own help doc tells buyers what subject lines to search for on transfer-delivered tickets (verbatim 360018039394): "an email with a subject like 'Your Ticket Transfer Offer,' 'Sent you tickets,' or the name of the team, performer, or venue." These are transfer-delivery subjects, not SeatGeek's own first-party order confirmation. First-party order-confirmation subject: **UNVERIFIED - purchase-walled.**

### B-C. Email structure / delivery (KEY: confirmation != tickets; delivery lag)

- **[HIGH]** Verbatim (5531072769171, captured before captcha wall on the search result + reproduced in 360018039394): "there may be a period of time between your order confirmation and when you receive the tickets. You may not receive mobile transfer tickets until within 24 hours of the event."
- **[HIGH]** Verbatim (360018039394): "Mobile transfer tickets are delivered through an email containing a link or button that takes you to the venue or team's ticketing platform." and "Tickets delivered by mobile transfer do not move into your SeatGeek account."
- **[HIGH]** Multi-ticket display note (verbatim): "Some platforms (such as AXS) use a single Mobile ID - one QR code that contains all tickets for your group" vs others where "tickets may be split across more than one message."
- **[HIGH]** Delivery links are one-time-use (verbatim: "Delivery links are one-time-use and meant only to give you ownership of your tickets - not to navigate you to your tickets after").

### D-J

- **[HIGH]** Buyer guarantee is surfaced as a trust device ("your tickets are covered by the SeatGeek Buyer Guarantee"). Wallet (Apple/Google) referenced as a place tickets may land.
- First-party live email layout / voice: **UNVERIFIED - purchase-walled.** SeatGeek is largely a resale marketplace, so the "confirmation email" is often a confirmation of purchase distinct from the venue/Ticketmaster ticket-delivery email - an important structural finding.

---

## 8. Universe (Ticketmaster-owned)

Sources:

- Help: https://support.universe.com/hc/en-us/articles/33507825921677-Customize-Your-Confirmation-Emails
- Help: https://support.universe.com/hc/en-us/articles/33503838442765-Event-Editor-Advanced-Settings
- Help: https://support.universe.com/hc/en-us/articles/39945990893197-Managing-QR-Codes-for-Add-Ons

### A. Subject line

- **[HIGH]** Verbatim (33507825921677): subject is organiser-customisable, "You can include text and emojis (up to 70 characters)." This is a hard number: 70-char subject cap exposed to organisers.

### B. Email structure (well-documented component model)

- **[HIGH]** Verbatim component sections (33507825921677): "Email Header Section" (logo), "Email Title Section", "Email Content Section", "Event Details Card Section" (with social links: Homepage, Facebook, YouTube, Instagram, Spotify, X, Apple Music, iTunes, SoundCloud, Tidal), "Additional Info Section" (default title "Additional Info", can rename to e.g. "About Your Order"), "Have Questions? Section" (default links to Universe help center; organiser can replace).
- **[HIGH]** Verbatim: "the digital ticket header, which displays your event's name" - the email embeds a digital ticket with the event name as header. Colour theme adjusts "hyperlink colors as well as the digital ticket header."

### C. Ticket delivery

- **[HIGH]** Email contains an embedded digital ticket with QR. Verbatim (33503838442765): "Email reminders are automatically sent to customers 24 hours before the event, containing the confirmation email information and the ticket QR code." Per-ticket QR with optional add-on QR control: verbatim (39945990893197) "Attendees will only receive QR codes for their tickets. No separate QR codes will be generated for add-ons" (organiser can hide add-on QR) - implies per-ticket QR codes by default.

### D-F

- **[HIGH]** "Have Questions?" section default-links to help center, organiser-replaceable. "Event Details Card" includes social links. Order details surfaced via "Additional Info" section pulling from the Additional Details page.
- Exact date/time/venue formatting in live email: **UNVERIFIED - purchase-walled.**

### G-J

- **[MED]** Reminder email 24h before re-sends the confirmation info + QR (good redundancy pattern). Per-ticket-type templates supported (different email per ticket type). Live email voice: **UNVERIFIED - purchase-walled.**

---

## Cross-cutting sources

- Eventbrite vendor blog "The Only Confirmation Email Templates Event Organizers Need" (https://www.eventbrite.com/blog/confirmation-email-template/) - the single richest public source on prescribed structure, subject rules, intro, order summary, refund-policy placement, PDF/QR fallback rationale. Vendor-authored = [MED].
- Eventbrite help 748624 - definitive list of which emails are separate vs combined = [HIGH].

## Honest gaps (all "UNVERIFIED - purchase-walled" unless noted)

- No literal sent confirmation email obtained for ANY of the 8 (purchase wall). Eventbrite is the best-evidenced (vendor screenshot + blog + 4 help docs). Humanitix and Ticket Tailor next (multiple help docs + help screenshots). DICE/AXS/Ticketmaster/SeatGeek delivery models are HIGH but their email bodies/subjects/voice are UNVERIFIED. Universe email structure is unusually well-documented (component model + 70-char subject cap) but the rendered output is UNVERIFIED.
- SeatGeek primary "Where are my tickets?" article was CAPTCHA-blocked; mitigated with the mobile-transfer article.
- No exact subject-line string is HIGH-verified for any competitor's first-party order confirmation. Eventbrite blog example and Ticketmaster community report are the closest (MED / LOW).
