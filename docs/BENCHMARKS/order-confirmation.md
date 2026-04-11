# Benchmark: Order Confirmation

## Overview

The order confirmation page is the most-viewed page in any ticketing flow — every successful buyer sees it. It is also one of the highest-leverage moments for retention, social sharing, and upsell. Platforms that treat it as a static "thank you" page leave enormous value on the table. This document captures how Ticketmaster, Eventbrite, and DICE use this moment.

---

## Ticketmaster Order Confirmation

### On-Screen Confirmation Page

Immediately after payment:

**Header section:**
- Green checkmark icon (large, 64px)
- "You're going!" or "Order confirmed" headline
- Order number prominently displayed: "Order #TM-2847394"
- Email confirmation notice: "A confirmation has been sent to j***@gmail.com"

**Ticket display:**
- Barcode or QR code shown inline on desktop (not mobile — security concern with screenshotting)
- On mobile: "Your tickets are in the Ticketmaster app" — CTA to download/open app
- Ticket details: Event name, venue, date, time, seat(s), section, row, seat number(s)

**Delivery options section:**
- "Mobile Ticket" (default for most events) — QR shown in Ticketmaster app
- "Print at Home" option (PDF download) — some events only
- "Transfer Tickets" link — sends tickets to another email
- "Add to Wallet" — Apple Wallet or Google Wallet pass download

**Calendar integration:**
- "Add to Calendar" button (single button, opens dropdown)
  - Google Calendar
  - Apple Calendar (.ics download)
  - Outlook (.ics download)
- No Outlook Online option shown (TBD — verify with Playwright MCP)

**Insurance section (if purchased):**
- Policy number and coverage summary
- Link to view full policy

### Post-Confirmation Email

Sent within 30–60 seconds of payment:

**Subject:** "Your tickets for [Event Name] — Order #[number]"

**Content:**
- Order summary table: Event, date, venue, seat(s), ticket type, quantity, prices
- QR code(s) embedded as image (one per ticket)
- "Add to Wallet" button (links to app or direct wallet pass URL)
- Event details: doors time, show time, parking info (if venue-supplied)
- Venue directions and map link (Google Maps deeplink)
- FAQs: "What do I do if I lose this email?" / "Can I transfer my tickets?"
- Refund/exchange policy (event-specific, pulled from event settings)
- Link to view order in Ticketmaster account

### Mobile App Deep-link

On mobile, Ticketmaster sends a push notification (if app installed): "Your tickets for [Event Name] are ready in the app." Tap to open directly to the tickets view.

---

## Eventbrite Order Confirmation

### On-Screen Confirmation Page

**Header:**
- Eventbrite orange checkmark or event hero image at top
- "You're registered!" or "Order confirmed!" headline
- Order number displayed

**Ticket display:**
- PDF ticket download button (primary CTA — Eventbrite is PDF-first unlike Ticketmaster)
- "View Your Tickets" button → goes to attendee account
- Each ticket has unique QR code

**Add to Calendar:**
- Prominent inline "Add to Calendar" row with three buttons side-by-side:
  - Google Calendar
  - Apple Calendar
  - Outlook
- This is one of Eventbrite's strongest confirmation page patterns — always above the fold

**Share this event:**
- Social share buttons: Facebook, Twitter/X, WhatsApp, copy link
- Pre-filled share text: "I'm going to [Event Name]! Get tickets at [link]"

**Organiser contact:**
- "Contact the organiser" link if attendee has a question

**Upsell section:**
- "Other events you might like" — 3 event cards based on category and location
- Same organiser's upcoming events shown if organiser has other events

### Post-Confirmation Email

**Subject:** "Your ticket for [Event Name]"

**Content:**
- Event hero image
- Order summary (ticket type, quantity, total paid)
- PDF tickets attached directly to email (Eventbrite's strongest feature — no login required to access tickets)
- QR codes printed in email body as well
- Google Maps link to venue
- "Add to Google Calendar" link (single link, not all three — only Google by default in email body)
- Refund policy summary
- Eventbrite app download CTA

**PDF Ticket:**
- Full-page PDF with event branding, QR code, attendee name, event name, date, venue, ticket type
- Organiser logo if uploaded

---

## DICE Order Confirmation

DICE is app-first. The confirmation experience is primarily in-app.

### In-App Confirmation

- "You're on the list" full-screen animation (confetti or pulsing circle)
- Ticket displayed as a "flip card" — front shows event art, back shows barcode
- Ticket is animated and slightly 3D — distinctive, premium feel
- Brightness auto-increases when ticket QR is displayed (to ensure scanner can read it)
- "Save to Apple Wallet" / "Save to Google Wallet" — prominent buttons

### Anti-Scalping Features Visible on Confirmation

- Ticket is "locked" to buyer's name and phone number
- "Transfer to a friend" available (friend must have DICE app)
- Resale through DICE's official marketplace (face value only) shown as option
- "Unlock ticket" available 24 hours before event — barcode revealed only then (anti-screenshot scalping)

### Post-Confirmation Email

- Minimal email — directs to app for ticket display
- Subject: "You're going to [Event Name]"
- Event details, date, venue
- App download CTA (primary)
- No PDF attachment (intentional — app-only for security)

---

## EventLinqs Order Confirmation — Target

Based on the above analysis, EventLinqs must offer:

### On-Screen (immediately after payment)

1. **Green checkmark + "You're confirmed!" headline** — unambiguous success state
2. **Order number** prominently displayed
3. **Email confirmation notice** with masked email shown
4. **QR code** displayed inline on desktop; bottom sheet / app-style on mobile
5. **Add to Calendar** — three buttons, always above the fold: Google, Apple, Outlook
6. **Share buttons** — WhatsApp (primary for Africa/mobile), Facebook, Twitter, copy link
7. **Download ticket(s)** — PDF option
8. **Transfer tickets** — link to transfer flow (when M6 is built)
9. **Similar events upsell** — 3 cards from same category/city (drives organic discovery)
10. **Organiser's other events** — if organiser has future events

### Post-Confirmation Email (target: sent within 15 seconds of payment)

**Subject:** `Your ticket for [Event Name] — [Date]`

**Content order:**
1. Event hero image (full width)
2. "Order Confirmed" badge with order number
3. Event name, date, time, venue name and address
4. Ticket details table: type, quantity, price per ticket, total paid
5. QR code(s) — one per ticket, embedded as image
6. "Add to Calendar" buttons — Google, Apple, Outlook (inline buttons)
7. "Get Directions" — Google Maps link with venue address
8. Ticket PDF attached (if PDF tickets enabled for event)
9. Refund policy (one sentence: "Tickets are non-refundable" or "Refunds available up to X days before event")
10. "View your order" link to EventLinqs account
11. "Questions? Contact the organiser" link

### Mobile App Confirmation (PWA — when M10 PWA is built)

- Push notification: "You're going to [Event Name]! Tap to view your ticket."
- Full-screen ticket card with flip animation
- "Add to Wallet" — Apple Wallet and Google Wallet pass generation

---

## Add to Calendar — Implementation Detail

**Google Calendar link format:**
```
https://calendar.google.com/calendar/render?action=TEMPLATE
  &text=[Event+Name]
  &dates=[YYYYMMDDTHHMMSSZ]/[YYYYMMDDTHHMMSSZ]
  &details=[Description+with+link]
  &location=[Venue+Name+Address]
```

**Apple Calendar / Outlook (.ics file):**
```
BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:20261015T190000Z
DTEND:20261015T230000Z
SUMMARY:Event Name
LOCATION:Venue Name, Address, City
DESCRIPTION:Your ticket: https://eventlinqs.com/orders/[order-id]
END:VEVENT
END:VCALENDAR
```

EventLinqs must generate the .ics file server-side and serve it with `Content-Type: text/calendar; charset=utf-8` and `Content-Disposition: attachment; filename="event.ics"`.

---

## Refund Policy Display

**Ticketmaster:** Shows refund policy in a collapsible accordion on confirmation page. Policy is event-specific (set by promoter). Default: "All sales final."

**Eventbrite:** Shows in email footer and on "My Tickets" page. Can be up to 30 days before event for organisers who enable it.

**EventLinqs target:** Display refund policy as a single sentence on confirmation page and in email. Pull from `events.refund_policy` field. Default: "All sales final unless the event is cancelled."

---

## Upsell Performance Notes

- Eventbrite reports that "similar events" on confirmation pages drive 8–12% of total ticket sales (attributed to confirmation page referral)
- The best-performing upsell cards are events within the same category AND within 30 days AND same city
- Cards must load asynchronously — do not block confirmation page render waiting for recommendations
- Maximum 3 cards — more than 3 creates decision fatigue
