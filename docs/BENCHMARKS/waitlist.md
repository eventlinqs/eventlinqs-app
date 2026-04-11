# Benchmark: Waitlist

## Overview

A waitlist is the difference between a dead-end "Sold Out" page and a continued relationship with a buyer who still wants to attend. Ticketmaster, Eventbrite, and DICE each handle sold-out states differently — ranging from sophisticated FIFO notification systems to near-non-existent fallback flows. EventLinqs must take the strongest elements from each and address the gaps all three share.

---

## Ticketmaster Waitlist

### Trigger and Presentation

Ticketmaster does not run a traditional waitlist in the sense of FIFO queue with guaranteed position. Instead, they operate two distinct mechanisms depending on the event type:

1. **Verified Fan Waitlist** — for high-demand pre-sales (Taylor Swift Eras Tour 2023, Beyoncé Renaissance Tour 2023, etc.), fans register in advance via Ticketmaster's Verified Fan program. Ticketmaster sends registration codes to a subset of verified fans before the general sale. This is less a waitlist and more a lottery combined with anti-bot verification.

2. **Interest Registration / Alerts** — for general sold-out events, Ticketmaster shows a "Get notified if tickets become available" button. This is an alert, not a queue — there is no position, no FIFO, no time-limited offer. It is purely opt-in email marketing.

### Fields Collected

- Verified Fan registration: email, phone number, Ticketmaster account required
- Alert registration: email only (no account required for the basic alert)
- No quantity field on the alert registration — it is generic notification only

### Position Assignment

Ticketmaster does **not** show position for standard waitlist/alert registrations. The Verified Fan system uses an opaque lottery-style selection rather than strict FIFO. This opacity frustrates fans — they have no idea of their relative chances.

### Notification Mechanism

- Email notification when tickets become available (primary)
- SMS for Verified Fan code delivery
- Push notification via Ticketmaster iOS/Android app
- No in-app position display between registration and notification

### Promotion Window

Ticketmaster Verified Fan codes have a **defined redemption window** specified in the initial notification email — typically **24–48 hours** for code-based redemption. For general resale availability alerts, there is no exclusive window — the alert is sent simultaneously to all who opted in, and it is first-come-first-served once the page opens.

### Conversion Checkout Flow

Verified Fan: code is entered at checkout to unlock access. Once code is used, the buyer proceeds through the standard Ticketmaster checkout. No special queue at this stage — the code itself was the access gate.

Alert-based: buyer receives email with a link back to the event page. No reserved inventory — they are competing with the general public.

### Multi-Tier Handling

Ticketmaster's Verified Fan system is typically at the event level, not per tier. Standard alert registrations are also event-level. No per-tier waitlist granularity in the standard product.

### Organiser Visibility

Organiser portal shows waitlist/interest registration counts. No breakdown by tier. Organisers can export the list but have limited control over notification timing.

### Mobile UX

- "Notify Me" button visible on sold-out event pages in the Ticketmaster app
- Notification delivery via push on iOS/Android is reliable and fast
- The registration form is minimal (email only) — mobile UX is acceptable but not optimised
- No live position display or in-app waitlist management dashboard for buyers

---

## Eventbrite Waitlist

### Trigger and Presentation

Eventbrite has a **native waitlist feature** that organisers can enable per event and per ticket tier. When enabled and a tier sells out, the tier row changes from a quantity selector to a "Join Waitlist" button. This is more structured than Ticketmaster's approach.

Trigger: the "Join Waitlist" button appears as soon as `available_quantity` hits 0 for a tier. The organiser must explicitly enable the waitlist — it does not auto-activate.

If the organiser has not enabled the waitlist, sold-out tiers simply show "Sold Out" with no further action available.

### Fields Collected

- Email address (required)
- First name, last name (required)
- Number of tickets requested (required — dropdown, typically 1–4 depending on event limits)
- Custom attendee questions, if the organiser has configured them (e.g., dietary needs, accessibility requirements)
- No explicit accessibility-specific waitlist field by default — accessibility requests must be handled via custom questions

### Position Assignment

Eventbrite assigns positions **strictly by timestamp** (FIFO). The position number is assigned server-side at submission time. Position is visible to the buyer in the confirmation view and email: "You are #12 on the waitlist for General Admission."

### User-Facing Position Display

Eventbrite shows the position clearly:
- On the post-registration confirmation page: "You are #12 on the waitlist"
- In the confirmation email: same number included
- In the buyer's Eventbrite dashboard: waitlist entries listed with event, tier, position, and status
- Position is **not updated in real-time** — it reflects position at time of joining and is not dynamically refreshed as others convert or drop off

**This is a weakness:** buyers have no live visibility into how the queue is moving.

### Notification Mechanism

- Email notification when promoted (primary channel)
- No SMS by default — relies entirely on email
- No push notification unless the buyer has the Eventbrite app and has enabled push
- DICE is better here — see below

### Promotion Window

Eventbrite gives a **time-limited checkout window** when a buyer is promoted — the default in their system is **24 hours**, but organisers can configure this. The promotion email contains a direct link that bypasses the sold-out state for that buyer's session.

If the buyer does not purchase within the window, the offer expires and the next person in line is notified.

### Conversion Checkout Flow

The promotion email links to a session-specific URL that temporarily unlocks the checkout for the buyer's quantity. The checkout flow is the standard Eventbrite 3-step checkout (see checkout-flow.md). No special UI — just the normal checkout with inventory pre-reserved for them.

### Multi-Tier Handling

Eventbrite waitlists are **per tier** — a buyer joins the waitlist for "VIP" specifically, not for the event generally. If VIP sells out but General Admission is available, GA remains purchasable and only VIP shows "Join Waitlist." This is the correct model.

### Organiser Visibility

Organisers see the full waitlist in their Eventbrite Manage dashboard: list of names, email addresses, quantity requested, timestamp, current status (waiting/notified/expired/converted). Exportable to CSV. Organisers can manually notify or skip entries.

### Mobile UX

- "Join Waitlist" button renders correctly on mobile — full width, 44px height
- Registration form is a modal overlay on mobile — two text fields, quantity dropdown, submit
- Mobile keyboard appears over the modal — Eventbrite does not always scroll the active field above the keyboard on older Android (minor but notable bug)
- Post-registration confirmation is a clean inline message — no separate page

---

## DICE Waitlist

### Trigger and Presentation

DICE calls their version a **"waiting list"** (British English) and it is a first-class feature in their app. For sold-out events on DICE, the "Buy" button is replaced by "Join Waiting List" — prominent, same visual weight as the buy button. This is not hidden or secondary.

DICE's waiting list is deeply integrated into their anti-touting model: tickets released from the waiting list are always face-value, named, and non-transferable unless the transfer is initiated by the original buyer through DICE's controlled transfer system.

### Fields Collected

- Account required — DICE does not allow guest waitlist registration. This is intentional: their anti-touting model requires a verified identity attached to every ticket.
- Quantity (1 or 2 — DICE enforces a hard 2-ticket maximum per account per event, including on the waiting list)
- No separate form fields — account identity is the form

### Position Assignment

DICE assigns FIFO position based on timestamp. **DICE does not show the numeric position to the buyer.** Instead, the DICE app shows the waiting list entry as active, with a label indicating "You're on the waiting list" and no number. This is a deliberate design choice to reduce anxiety and prevent position-gaming.

### Notification Mechanism

DICE is the strongest of the three platforms here:
- Push notification (primary — most DICE users have the app installed)
- Email notification as backup
- In-app banner on next app open
- The DICE app's notification delivery is near-instant — push latency is typically under 5 seconds

### Promotion Window

DICE gives promoted buyers a **short, clearly communicated window** — typically **1–2 hours** for high-demand events (much shorter than Eventbrite's 24-hour default). The short window is intentional: DICE keeps the queue moving fast for popular events, and buyers who genuinely want the ticket are expected to be monitoring. The countdown timer is shown prominently in the app when a buyer is promoted.

TBD — verify exact window duration with Playwright MCP visit to dice.fm

### Conversion Checkout Flow

When promoted, the DICE app navigates the buyer directly to a pre-filled checkout for their waiting list quantity. The checkout is DICE's standard in-app flow: confirm ticket count → confirm attendee details → pay with saved payment method (or add card). The entire conversion flow is 2–3 taps if a payment method is saved.

### Multi-Tier Handling

DICE waiting lists are event-level for most events. Some events with explicit tier configurations have per-tier waiting lists, but this is less common. TBD — verify with Playwright MCP.

### Organiser Visibility

DICE is a curated platform — organisers are vetted partners, not self-serve. Waiting list size and demand data is visible in the DICE partner portal. Organisers have limited ability to manually intervene in waiting list order, which is by design (anti-manipulation).

### Mobile UX

DICE is mobile-app-first and the waiting list UX is polished:
- "Join Waiting List" button — same size, colour, and prominence as the buy button
- One tap to join (already logged in, no form to fill)
- Waiting list entries appear in "My Tickets" tab under "Waiting"
- Promotion notification triggers phone vibration + push + audio alert (if enabled)
- In-app countdown timer is large, high-contrast, and unmissable

---

## Cross-Platform Comparison

| Feature | Ticketmaster | Eventbrite | DICE | EventLinqs Target |
|---------|-------------|------------|------|-------------------|
| Waitlist type | Alert/lottery | FIFO queue | FIFO queue | FIFO queue |
| Account required | No (alert) / Yes (VF) | No | Yes | No — guest allowed |
| Shows position to buyer | No | Yes (at join time) | No | Yes, live-updating |
| Quantity field | No | Yes | 1–2 max | Yes, with tier limits |
| Notification channels | Email, push, SMS (VF) | Email only | Push + email | Push + email + SMS |
| Promotion window | 24–48 hrs (VF) | 24 hrs default | 1–2 hrs | 15–30 min configurable |
| Per-tier waitlist | No | Yes | Partial | Yes, per tier |
| Live position refresh | No | No | No | Yes, real-time |
| Guest allowed | Yes (alert) | Yes | No | Yes |
| Organiser visibility | Count only | Full list + export | Partner portal | Full list + analytics |

---

## What EventLinqs Should Do Better

1. **Live position updates via Supabase Realtime** — none of the three platforms show a dynamically updating position counter. Eventbrite shows position at join time and never refreshes it. EventLinqs should display "You are #47 in line" and update it in real time as people ahead convert or drop off. This gives buyers transparency that no competitor offers.

2. **Configurable promotion window per event** — Eventbrite defaults to 24 hours; DICE uses 1–2 hours. Neither lets the organiser choose at event-creation time. EventLinqs should expose a "Waitlist offer window" setting per tier (e.g., 15 minutes, 1 hour, 24 hours) so organisers have control appropriate to their demand level. High-demand events should use short windows to keep the queue moving.

3. **Multi-channel notification on promotion** — Eventbrite only sends email. DICE only works if you have the app. EventLinqs should send email + SMS (where a phone number is on the account) + in-app push simultaneously on promotion, and let buyers set their preference at join time. Missing a promotion because an email went to spam is an unacceptable failure mode.

4. **Accessibility waitlist fields** — none of the three platforms have an explicit "I require accessible seating" checkbox on the waitlist form. EventLinqs should include an optional accessibility needs field at waitlist join time so that when an accessible seat is released, the buyer can be promoted and their needs are already known at checkout.

5. **Guest-friendly without sacrificing queue integrity** — DICE requires an account (anti-touting rationale), Eventbrite allows guests but loses them after one email. EventLinqs should allow guests to join the waitlist with an email address only, but generate a session token so the buyer can check their position from the same device without an account. For the promotion checkout, the guest token is the access credential — no login required.

6. **Organiser replenishment tools** — none of the three platforms make it easy for organisers to deliberately release a batch of held tickets to the waitlist (e.g., "I'm releasing 50 VIP tickets from a sponsor hold"). EventLinqs should include a "Release to Waitlist" button in the organiser dashboard that triggers `promote_waitlist` immediately for a specified quantity, with confirmation of how many people will be notified.
